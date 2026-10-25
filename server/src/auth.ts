import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config.js';
import * as repo from './persistence/repo.js';

const USERNAME_RE = /^[\p{L}\p{N}_-]{3,20}$/u;
const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 32;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: 8, p: 1 });
  return `s1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [version, saltB64, hashB64] = stored.split('$');
    if (version !== 's1' || !saltB64 || !hashB64) return false;
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(hashB64, 'base64url');
    const actual = scryptSync(password, salt, expected.length, { N: SCRYPT_N, r: 8, p: 1 });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const authAttempts = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, max = 12, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = authAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    authAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

function ipOf(req: IncomingMessage): string {
  return (req.socket.remoteAddress ?? 'unknown').replace('::ffff:', '');
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(data);
}

export async function readJson(req: IncomingMessage, limit = 16_384): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

async function issueSession(userId: number, username: string): Promise<{ token: string; user: { id: number; name: string } }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600_000);
  await repo.createSession(userId, hashToken(token), expiresAt);
  return { token, user: { id: userId, name: username } };
}

export async function handleRegister(
  req: IncomingMessage,
  res: ServerResponse,
  spawn: { x: number; y: number },
): Promise<void> {
  if (!rateLimit(`register:${ipOf(req)}`, 8)) return send(res, 429, { error: 'Слишком много попыток. Подождите минуту.' });
  const body = await readJson(req);
  if (!body) return send(res, 400, { error: 'Некорректный запрос' });
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const inviteCode = String(body.inviteCode ?? '').trim();

  if (config.requireInvites && !inviteCode) {
    return send(res, 400, { error: 'Для регистрации требуется инвайт-код закрытого тестирования' });
  }

  if (!USERNAME_RE.test(username)) return send(res, 400, { error: 'Имя: 3–20 букв, цифр, _ или -' });
  if (password.length < 6 || password.length > 72) return send(res, 400, { error: 'Пароль: от 6 до 72 символов' });
  try {
    const user = await repo.createUser(username, hashPassword(password));
    if (inviteCode) {
      const inviteResult = await repo.validateAndConsumeInvite(inviteCode, user.id, ipOf(req));
      if (!inviteResult.ok) {
        await repo.deleteUser(user.id);
        return send(res, 400, { error: inviteResult.reason || 'Недействительный инвайт-код' });
      }
    }
    await repo.getOrCreateCharacter(user.id, username, spawn);
    const session = await issueSession(user.id, username);
    return send(res, 200, session);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return send(res, 409, { error: 'Это имя уже занято' });
    console.error('[auth] register failed', err);
    return send(res, 500, { error: 'Не удалось создать аккаунт' });
  }
}

export async function handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!rateLimit(`login:${ipOf(req)}`, 12)) return send(res, 429, { error: 'Слишком много попыток. Подождите минуту.' });
  const body = await readJson(req);
  if (!body) return send(res, 400, { error: 'Некорректный запрос' });
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  if (!username || !password) return send(res, 400, { error: 'Введите имя и пароль' });
  const user = await repo.getUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    await new Promise((r) => setTimeout(r, 250));
    return send(res, 401, { error: 'Неверное имя или пароль' });
  }
  if (user.is_banned) {
    return send(res, 403, { error: `Ваш аккаунт заблокирован: ${user.ban_reason || 'Нарушение правил'}` });
  }
  const session = await issueSession(user.id, user.username);
  return send(res, 200, session);
}

export async function handleGuest(
  req: IncomingMessage,
  res: ServerResponse,
  spawn: { x: number; y: number },
): Promise<void> {
  if (config.requireInvites && !config.allowGuestLogin) {
    return send(res, 403, { error: 'Гостевой доступ отключён. Для участия в закрытом тесте зарегистрируйтесь с инвайт-кодом.' });
  }
  if (!rateLimit(`guest:${ipOf(req)}`, 20)) return send(res, 429, { error: 'Слишком много попыток. Подождите минуту.' });
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  const username = `Survivor_${suffix}`;
  const password = randomBytes(18).toString('base64url');
  try {
    const user = await repo.createUser(username, hashPassword(password));
    await repo.getOrCreateCharacter(user.id, username, spawn);
    const session = await issueSession(user.id, username);
    return send(res, 200, session);
  } catch (err) {
    console.error('[auth] guest failed', err);
    return send(res, 500, { error: 'Не удалось создать гостевой аккаунт' });
  }
}

export async function handleMe(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return send(res, 401, { error: 'Нет сессии' });
  const session = await repo.getSession(hashToken(token));
  if (!session) return send(res, 401, { error: 'Сессия истекла' });
  if (session.isBanned) return send(res, 403, { error: 'Аккаунт заблокирован' });
  const character = await repo.loadCharacter(session.userId);
  return send(res, 200, {
    user: { id: session.userId, name: session.username },
    character: character
      ? { id: character.id, name: character.name, x: character.x, y: character.y, hp: character.hp, status: character.status }
      : null,
  });
}

const adminTokens = new Map<string, { createdAt: number; expiresAt: number }>();

export function verifyAdminToken(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return false;
  const entry = adminTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    if (entry) adminTokens.delete(token);
    return false;
  }
  return true;
}

export async function handleAdminLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!rateLimit(`admin-login:${ipOf(req)}`, 6, 60_000)) {
    return send(res, 429, { error: 'Слишком много попыток входа в админ-панель. Подождите минуту.' });
  }
  const body = await readJson(req);
  if (!body) return send(res, 400, { error: 'Некорректный запрос' });
  const password = String(body.password ?? '');
  if (!config.adminPassword || password !== config.adminPassword) {
    await new Promise((r) => setTimeout(r, 400));
    return send(res, 401, { error: 'Неверный пароль администратора' });
  }
  const token = randomBytes(32).toString('base64url');
  adminTokens.set(token, { createdAt: Date.now(), expiresAt: Date.now() + 24 * 3600_000 });
  return send(res, 200, { ok: true, token });
}

export async function handleAdminMe(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!verifyAdminToken(req)) return send(res, 401, { error: 'Требуется авторизация администратора' });
  return send(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
}

export async function handleAdminListUsers(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!verifyAdminToken(req)) return send(res, 401, { error: 'Требуется авторизация администратора' });
  const users = await repo.listUsers();
  return send(res, 200, { users });
}

export async function handleAdminSetBan(
  req: IncomingMessage,
  res: ServerResponse,
  kickUser?: (userId: number, reason?: string) => boolean,
): Promise<void> {
  if (!verifyAdminToken(req)) return send(res, 401, { error: 'Требуется авторизация администратора' });
  const body = await readJson(req);
  if (!body || typeof body.userId !== 'number') return send(res, 400, { error: 'Некорректные параметры' });
  const banned = Boolean(body.banned);
  const reason = String(body.reason ?? '').trim();
  const ok = await repo.setUserBan(body.userId, banned, reason);
  if (ok && banned && kickUser) {
    kickUser(body.userId, reason || 'Блокировка аккаунта администратором');
  }
  return send(res, 200, { ok, banned });
}

export async function handleAdminListInvites(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!verifyAdminToken(req)) return send(res, 401, { error: 'Требуется авторизация администратора' });
  const invites = await repo.listInviteCodes();
  return send(res, 200, { invites });
}

export async function handleAdminCreateInvite(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!verifyAdminToken(req)) return send(res, 401, { error: 'Требуется авторизация администратора' });
  const body = await readJson(req);
  const note = String(body?.note ?? '').trim();
  const maxUses = typeof body?.maxUses === 'number' ? body.maxUses : 1;
  const expiresDays = typeof body?.expiresDays === 'number' ? body.expiresDays : 30;
  const invite = await repo.createInviteCode(null, note, maxUses, expiresDays);
  return send(res, 200, { ok: true, invite });
}

export async function handleAdminRevokeInvite(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!verifyAdminToken(req)) return send(res, 401, { error: 'Требуется авторизация администратора' });
  const body = await readJson(req);
  const code = String(body?.code ?? '').trim();
  if (!code) return send(res, 400, { error: 'Код не указан' });
  const ok = await repo.revokeInviteCode(code);
  return send(res, 200, { ok });
}
