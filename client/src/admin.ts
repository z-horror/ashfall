import { API_BASE } from './net/api.js';

interface AdminInvite {
  id: number;
  code: string;
  note: string | null;
  max_uses: number;
  uses_count: number;
  status: string;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
  uses: Array<{ username: string; used_at: string; ip_address: string | null }>;
}

interface AdminUser {
  id: number;
  username: string;
  is_admin: boolean;
  is_banned: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  registered_with_invite: string | null;
  created_at: string;
  character_name: string | null;
  character_hp: number | null;
  character_status: string | null;
}

const TOKEN_KEY = 'ashfall.admin_token';

let adminToken = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
let cachedUsers: AdminUser[] = [];

// DOM Elements
const loginView = document.getElementById('login-view') as HTMLElement;
const dashboardView = document.getElementById('dashboard-view') as HTMLElement;
const loginForm = document.getElementById('admin-login-form') as HTMLFormElement;
const adminPwdInput = document.getElementById('admin-pwd') as HTMLInputElement;
const loginError = document.getElementById('login-error') as HTMLElement;
const logoutBtn = document.getElementById('btn-logout') as HTMLButtonElement;

// Tab elements
const tabInvites = document.getElementById('tab-invites') as HTMLButtonElement;
const tabUsers = document.getElementById('tab-users') as HTMLButtonElement;
const tabStats = document.getElementById('tab-stats') as HTMLButtonElement;
const panelInvites = document.getElementById('panel-invites') as HTMLElement;
const panelUsers = document.getElementById('panel-users') as HTMLElement;
const panelStats = document.getElementById('panel-stats') as HTMLElement;

// Form & Tables
const createInviteForm = document.getElementById('create-invite-form') as HTMLFormElement;
const invNoteInput = document.getElementById('inv-note') as HTMLInputElement;
const invUsesInput = document.getElementById('inv-uses') as HTMLInputElement;
const invDaysInput = document.getElementById('inv-days') as HTMLInputElement;
const invitesTableBody = document.getElementById('invites-table-body') as HTMLElement;
const invitesCountEl = document.getElementById('invites-count') as HTMLElement;
const usersTableBody = document.getElementById('users-table-body') as HTMLElement;
const usersCountEl = document.getElementById('users-count') as HTMLElement;
const userSearchInput = document.getElementById('user-search') as HTMLInputElement;

// Stats
const statOnline = document.getElementById('stat-online') as HTMLElement;
const statUsers = document.getElementById('stat-users') as HTMLElement;
const statInvites = document.getElementById('stat-invites') as HTMLElement;
const statUptime = document.getElementById('stat-uptime') as HTMLElement;
const statSeed = document.getElementById('stat-seed') as HTMLElement;
const statZombies = document.getElementById('stat-zombies') as HTMLElement;
const statChunks = document.getElementById('stat-chunks') as HTMLElement;

// Toast
const toastEl = document.getElementById('toast') as HTMLElement;
let toastTimer: number | null = null;

function showToast(message: string, duration = 3000): void {
  if (toastTimer) clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  toastTimer = window.setTimeout(() => {
    toastEl.classList.add('hidden');
  }, duration);
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Код скопирован: ${text}`);
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast(`Код скопирован: ${text}`);
  }
}

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('authorization', `Bearer ${adminToken}`);
  if (options.body && typeof options.body === 'string') {
    headers.set('content-type', 'application/json');
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    adminToken = '';
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    showLogin();
    throw new Error('Сессия администратора истекла');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Ошибка сервера (${res.status})`);
  }
  return data as T;
}

function showLogin(err = ''): void {
  loginView.classList.remove('hidden');
  dashboardView.classList.add('hidden');
  logoutBtn.classList.add('hidden');
  if (err) {
    loginError.textContent = err;
    loginError.classList.remove('hidden');
  } else {
    loginError.classList.add('hidden');
  }
}

function showDashboard(): void {
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
  loadAll();
}

function switchTab(activeBtn: HTMLButtonElement, activePanel: HTMLElement): void {
  [tabInvites, tabUsers, tabStats].forEach((b) => b.classList.remove('active'));
  [panelInvites, panelUsers, panelStats].forEach((p) => p.classList.add('hidden'));
  activeBtn.classList.add('active');
  activePanel.classList.remove('hidden');
}

tabInvites.addEventListener('click', () => switchTab(tabInvites, panelInvites));
tabUsers.addEventListener('click', () => switchTab(tabUsers, panelUsers));
tabStats.addEventListener('click', () => switchTab(tabStats, panelStats));

logoutBtn.addEventListener('click', () => {
  adminToken = '';
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  showLogin();
});

loginForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const password = adminPwdInput.value;
  if (!password) return;
  loginError.classList.add('hidden');
  try {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok || !data.token) {
      throw new Error(data.error || 'Неверный пароль');
    }
    adminToken = data.token;
    localStorage.setItem(TOKEN_KEY, adminToken);
    adminPwdInput.value = '';
    showDashboard();
  } catch (err) {
    loginError.textContent = (err as Error).message || 'Не удалось войти';
    loginError.classList.remove('hidden');
  }
});

async function loadInvites(): Promise<void> {
  try {
    const data = await adminFetch<{ invites: AdminInvite[] }>('/api/admin/invites');
    const invites = data.invites || [];
    invitesCountEl.textContent = String(invites.length);
    statInvites.textContent = String(invites.filter((i) => i.status === 'active').length);

    if (invites.length === 0) {
      invitesTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-sub);">Инвайт-коды пока не созданы.</td></tr>';
      return;
    }

    invitesTableBody.innerHTML = invites
      .map((inv) => {
        const statusBadge = `<span class="badge badge-${inv.status}">${inv.status}</span>`;
        const usesText = inv.max_uses > 0 ? `${inv.uses_count} / ${inv.max_uses}` : `${inv.uses_count} / ∞`;
        const dateCreated = new Date(inv.created_at).toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        const usersList = inv.uses.length > 0
          ? inv.uses.map((u) => `<b>${u.username}</b> (${new Date(u.used_at).toLocaleDateString()})`).join(', ')
          : '<span style="color: var(--text-sub);">—</span>';

        return `
          <tr>
            <td>
              <span class="badge-code">${inv.code}</span>
              <button class="btn btn-copy" data-copy="${inv.code}" title="Скопировать код">📋 Копировать</button>
            </td>
            <td>${inv.note ? escapeHtml(inv.note) : '<span style="color: var(--text-sub);">—</span>'}</td>
            <td>${usesText}</td>
            <td>${statusBadge}</td>
            <td>${dateCreated}</td>
            <td style="font-size: 0.8rem;">${usersList}</td>
            <td>
              ${
                inv.status === 'active'
                  ? `<button class="btn btn-danger" data-revoke="${inv.code}" style="padding: 4px 8px; font-size: 0.75rem;">Отозвать</button>`
                  : '<span style="color: var(--text-sub); font-size: 0.8rem;">Завершён</span>'
              }
            </td>
          </tr>
        `;
      })
      .join('');

    // Attach listeners
    invitesTableBody.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-copy');
        if (code) void copyToClipboard(code);
      });
    });

    invitesTableBody.querySelectorAll('[data-revoke]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const code = btn.getAttribute('data-revoke');
        if (!code || !confirm(`Отозвать инвайт-код ${code}?`)) return;
        try {
          await adminFetch('/api/admin/invites/revoke', {
            method: 'POST',
            body: JSON.stringify({ code }),
          });
          showToast(`Код ${code} отозван`);
          void loadInvites();
        } catch (err) {
          alert((err as Error).message);
        }
      });
    });
  } catch (err) {
    console.error('Failed to load invites', err);
  }
}

createInviteForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const note = invNoteInput.value.trim();
  const maxUses = Number(invUsesInput.value) || 1;
  const expiresDays = Number(invDaysInput.value) || 30;

  try {
    const res = await adminFetch<{ ok: boolean; invite: { code: string } }>('/api/admin/invites', {
      method: 'POST',
      body: JSON.stringify({ note, maxUses, expiresDays }),
    });
    invNoteInput.value = '';
    await copyToClipboard(res.invite.code);
    showToast(`Создан и скопирован: ${res.invite.code}`);
    void loadInvites();
  } catch (err) {
    alert((err as Error).message);
  }
});

function renderUsers(users: AdminUser[]): void {
  usersCountEl.textContent = String(users.length);
  if (users.length === 0) {
    usersTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-sub);">Игроки не найдены.</td></tr>';
    return;
  }

  usersTableBody.innerHTML = users
    .map((u) => {
      const statusBadge = u.is_banned
        ? `<span class="badge badge-revoked">Заблокирован</span><div style="font-size: 0.75rem; color: var(--danger);">${escapeHtml(u.ban_reason || '')}</div>`
        : `<span class="badge badge-active">Активен</span>`;
      const charInfo = u.character_name
        ? `${escapeHtml(u.character_name)} (${u.character_hp ?? 0} HP, ${u.character_status})`
        : '<span style="color: var(--text-sub);">Нет</span>';
      const regDate = new Date(u.created_at).toLocaleDateString('ru-RU');

      return `
        <tr>
          <td>${u.id}</td>
          <td><b>${escapeHtml(u.username)}</b> ${u.is_admin ? '<span class="badge badge-active">Admin</span>' : ''}</td>
          <td><span class="badge-code" style="font-size: 0.8rem;">${u.registered_with_invite || '—'}</span></td>
          <td>${charInfo}</td>
          <td>${regDate}</td>
          <td>${statusBadge}</td>
          <td>
            ${
              u.is_banned
                ? `<button class="btn btn-success" data-unban="${u.id}" style="padding: 4px 8px; font-size: 0.75rem;">Разблокировать</button>`
                : `<button class="btn btn-danger" data-ban="${u.id}" data-name="${escapeHtml(u.username)}" style="padding: 4px 8px; font-size: 0.75rem;">Заблокировать</button>`
            }
          </td>
        </tr>
      `;
    })
    .join('');

  usersTableBody.querySelectorAll('[data-ban]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-ban'));
      const name = btn.getAttribute('data-name');
      const reason = prompt(`Причина блокировки игрока "${name}":`, 'Нарушение правил закрытого теста');
      if (reason === null) return;
      try {
        await adminFetch('/api/admin/users/ban', {
          method: 'POST',
          body: JSON.stringify({ userId: id, banned: true, reason }),
        });
        showToast(`Игрок ${name} заблокирован`);
        void loadUsers();
      } catch (err) {
        alert((err as Error).message);
      }
    });
  });

  usersTableBody.querySelectorAll('[data-unban]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-unban'));
      try {
        await adminFetch('/api/admin/users/ban', {
          method: 'POST',
          body: JSON.stringify({ userId: id, banned: false }),
        });
        showToast('Игрок разблокирован');
        void loadUsers();
      } catch (err) {
        alert((err as Error).message);
      }
    });
  });
}

async function loadUsers(): Promise<void> {
  try {
    const data = await adminFetch<{ users: AdminUser[] }>('/api/admin/users');
    cachedUsers = data.users || [];
    statUsers.textContent = String(cachedUsers.length);
    filterAndRenderUsers();
  } catch (err) {
    console.error('Failed to load users', err);
  }
}

function filterAndRenderUsers(): void {
  const query = userSearchInput.value.trim().toLowerCase();
  if (!query) {
    renderUsers(cachedUsers);
    return;
  }
  const filtered = cachedUsers.filter((u) => u.username.toLowerCase().includes(query) || (u.character_name && u.character_name.toLowerCase().includes(query)));
  renderUsers(filtered);
}

userSearchInput.addEventListener('input', () => filterAndRenderUsers());

async function loadStats(): Promise<void> {
  try {
    const data = await adminFetch<{
      uptime: number;
      seed: string;
      online: number;
      zombies: number;
      chunks: number;
    }>('/api/admin/stats');
    statOnline.textContent = String(data.online ?? 0);
    statSeed.textContent = data.seed || '—';
    statZombies.textContent = String(data.zombies ?? 0);
    statChunks.textContent = String(data.chunks ?? 0);

    const m = Math.floor((data.uptime || 0) / 60);
    const h = Math.floor(m / 60);
    statUptime.textContent = h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
  } catch (err) {
    console.error('Failed to load stats', err);
  }
}

function loadAll(): void {
  void loadInvites();
  void loadUsers();
  void loadStats();
}

document.getElementById('btn-refresh-invites')?.addEventListener('click', () => void loadInvites());
document.getElementById('btn-refresh-users')?.addEventListener('click', () => void loadUsers());
document.getElementById('btn-refresh-stats')?.addEventListener('click', () => void loadStats());

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] || m));
}

// Initial check
if (adminToken) {
  adminFetch('/api/admin/me')
    .then(() => showDashboard())
    .catch(() => showLogin());
} else {
  showLogin();
}
