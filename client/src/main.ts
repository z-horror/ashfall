import Phaser from 'phaser';
import './styles.css';
import { GameScene } from './game/GameScene.js';
import { HUD } from './ui/hud.js';
import { NetClient } from './net/connection.js';
import { AudioEngine } from './audio.js';
import * as api from './net/api.js';

const authScreen = document.getElementById('auth-screen') as HTMLElement;
const loadingScreen = document.getElementById('loading-screen') as HTMLElement;
const loadingText = document.getElementById('loading-text') as HTMLElement;
const authError = document.getElementById('auth-error') as HTMLElement;
const usernameInput = document.getElementById('auth-username') as HTMLInputElement;
const passwordInput = document.getElementById('auth-password') as HTMLInputElement;
const submitBtn = document.getElementById('auth-submit') as HTMLButtonElement;
const registerBtn = document.getElementById('auth-register') as HTMLButtonElement;
const guestBtn = document.getElementById('auth-guest') as HTMLButtonElement;
const form = document.getElementById('auth-form') as HTMLFormElement;

// Saved session card elements
const authSavedBox = document.getElementById('auth-saved-box') as HTMLElement;
const authSavedName = document.getElementById('auth-saved-name') as HTMLElement;
const authContinueBtn = document.getElementById('auth-continue') as HTMLButtonElement;
const authNewGuestBtn = document.getElementById('auth-new-guest') as HTMLButtonElement;
const authSwitchUserBtn = document.getElementById('auth-switch-user') as HTMLButtonElement;

const audio = new AudioEngine();
let net: NetClient;
let hud: HUD;
let scene: GameScene;
let game: Phaser.Game | null = null;
let started = false;
let busy = false;

function showError(message: string): void {
  authError.textContent = message;
}

function setBusy(value: boolean): void {
  busy = value;
  for (const btn of [submitBtn, registerBtn, guestBtn, authContinueBtn, authNewGuestBtn, authSwitchUserBtn]) {
    if (btn) btn.disabled = value;
  }
}

function showAuth(message = ''): void {
  authScreen.classList.remove('hidden');
  loadingScreen.classList.add('hidden');
  showError(message);
}

function hideAuth(): void {
  authScreen.classList.add('hidden');
}

function buildServices(): void {
  net = new NetClient({
    onMessage: (msg) => scene.handleServerMessage(msg),
    onStatus: (status, detail) => {
      hud.setConnection(status, detail);
    },
    onLatency: (ms) => {
      hud.setLatency(ms);
    },
    onFatal: (message) => {
      api.clearSession();
      showAuth(message);
    },
  });

  hud = new HUD({
    useItem: (id) => net.action({ t: 'use', id }),
    equipItem: (id) => net.action({ t: 'equip', id }),
    dropItem: (id, qty) => net.action({ t: 'drop', id, qty }),
    transfer: (id, qty, dir) => net.action({ t: 'transfer', id, qty, dir }),
    closeContainer: () => net.action({ t: 'close_container' }),
    pickupItem: (id) => net.action({ t: 'pickup', id }),
    sendChat: (text) => net.action({ t: 'chat', text }),
    toggleSound: () => {
      audio.setEnabled(!audio.enabled);
      hud.setSoundLabel(audio.enabled);
    },
    respawn: () => net.action({ t: 'respawn' }),
    craft: (recipeId) => {
      net.action({ t: 'craft', recipeId });
      audio.craft();
    },
    devAction: (action, args) => {
      net.action({ t: 'dev_action', action, args });
    },
    logout: () => {
      net?.close();
      api.clearSession();
      location.reload();
    },
    setAudioVolume: (category, val) => {
      if (category === 'master') audio.setMasterVolume(val);
      else if (category === 'sfx') audio.setSfxVolume(val);
      else if (category === 'ambient') audio.setAmbientVolume(val);
    },
    setAudioMuted: (muted) => {
      audio.setMuted(muted);
    },
  });
  hud.setSoundLabel(audio.enabled);

  scene = new GameScene({ net, hud, audio });
}

function startGame(token: string): void {
  hideAuth();
  loadingScreen.classList.remove('hidden');
  loadingText.textContent = 'Пробуждаем Серый квартал...';
  if (started) {
    net.connect(token);
    return;
  }
  started = true;
  buildServices();

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    backgroundColor: '#0a0d0b',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
      powerPreference: 'high-performance',
    },
    scene: [scene],
    banner: false,
    audio: { noAudio: true },
  });
  (window as unknown as { __ashfall?: unknown }).__ashfall = { game, scene, net, hud, audio };

  void scene.ready.then(() => {
    loadingText.textContent = 'Подключаемся к постоянному миру...';
    net.connect(token);
  });
}

document.addEventListener('ashfall:loaded', () => {
  loadingScreen.classList.add('hidden');
});

async function validateSession(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${(import.meta.env.VITE_API_BASE as string | undefined) ?? ''}/api/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function enterWith(promise: Promise<api.AuthResult>): Promise<void> {
  if (busy) return;
  setBusy(true);
  showError('');
  audio.ensure();
  try {
    const result = await promise;
    api.saveSession(result.token, result.user.name);
    if (started) {
      location.reload();
      return;
    }
    startGame(result.token);
  } catch (err) {
    showError((err as Error).message || 'Не удалось войти');
    setBusy(false);
  }
}

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    showError('Введите позывной и пароль.');
    return;
  }
  void enterWith(api.login(username, password));
});

registerBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    showError('Придумайте позывной и пароль (от 6 символов).');
    return;
  }
  void enterWith(api.register(username, password));
});

guestBtn.addEventListener('click', () => {
  void enterWith(api.guest());
});

window.addEventListener('beforeunload', () => {
  net?.close();
});

async function boot(): Promise<void> {
  const saved = api.loadSession();
  if (!saved) {
    showAuth();
    return;
  }

  // Validate saved session
  loadingScreen.classList.remove('hidden');
  loadingText.textContent = 'Проверка сессии...';
  const valid = await validateSession(saved.token);
  loadingScreen.classList.add('hidden');

  if (!valid) {
    api.clearSession();
    showAuth('Предыдущая сессия истекла. Войдите снова.');
    return;
  }

  // Offer choice to continue, create new guest, or switch account
  authSavedName.textContent = saved.name || 'Survivor';
  authSavedBox.classList.remove('hidden');
  form.classList.add('hidden');
  showAuth();

  authContinueBtn.onclick = () => {
    audio.ensure();
    startGame(saved.token);
  };

  authNewGuestBtn.onclick = () => {
    void enterWith(api.guest());
  };

  authSwitchUserBtn.onclick = () => {
    api.clearSession();
    authSavedBox.classList.add('hidden');
    form.classList.remove('hidden');
    usernameInput.value = '';
    passwordInput.value = '';
    usernameInput.focus();
  };
}

void boot();
