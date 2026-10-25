const envBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
export const API_BASE = envBase || (
  typeof window !== 'undefined' &&
  window.location.port !== '5173' &&
  window.location.port !== '3100' &&
  window.location.protocol !== 'https:'
    ? 'http://127.0.0.1:3100'
    : ''
);

export interface AuthResult {
  token: string;
  user: { id: number; name: string };
}

async function post(path: string, body: unknown): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<AuthResult>;
  if (!res.ok || !data.token || !data.user) {
    throw new Error(data.error || `Ошибка сервера (${res.status})`);
  }
  return { token: data.token, user: data.user };
}

export function register(username: string, password: string): Promise<AuthResult> {
  return post('/api/auth/register', { username, password });
}

export function login(username: string, password: string): Promise<AuthResult> {
  return post('/api/auth/login', { username, password });
}

export function guest(): Promise<AuthResult> {
  return post('/api/auth/guest', {});
}

export function saveSession(token: string, name: string): void {
  try {
    localStorage.setItem('ashfall.session', JSON.stringify({ token, name }));
  } catch {
    /* ignore */
  }
}

export function loadSession(): { token: string; name: string } | null {
  try {
    const raw = localStorage.getItem('ashfall.session');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; name?: string };
    if (!parsed.token) return null;
    return { token: parsed.token, name: parsed.name ?? 'survivor' };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem('ashfall.session');
  } catch {
    /* ignore */
  }
}
