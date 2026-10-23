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
  if (!USERNAME_RE.test(username)) return send(res, 400, { error: 'Имя: 3–20 букв, цифр, _ или -' });
  if (password.length < 6 || password.length > 72) return send(res, 400, { error: 'Пароль: от 6 до 72 символов' });
  try {
    const user = await repo.createUser(username, hashPassword(password));
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
  const session = await issueSession(user.id, user.username);
  return send(res, 200, session);
}

export async function handleGuest(
  req: IncomingMessage,
  res: ServerResponse,
  spawn: { x: number; y: number },
): Promise<void> {
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
  const character = await repo.loadCharacter(session.userId);
  return send(res, 200, {
    user: { id: session.userId, name: session.username },
    character: character
      ? { id: character.id, name: character.name, x: character.x, y: character.y, hp: character.hp, status: character.status }
      : null,
  });
}
