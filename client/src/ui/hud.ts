import {
  CRAFT_RECIPES,
  ITEMS,
  PLAYER_MAX_HP,
  PLAYER_MAX_STAMINA,
  type ContainerView,
  type CraftRecipe,
  type InventoryView,
  type ItemView,
  type SelfSnapshot,
} from '@ashfall/shared';
import { getItemIconUrl } from '../art/textures.js';
import { containerSignature, selectionExists } from './lootState.js';
import type { NetStatus } from '../net/connection.js';

export interface HudActions {
  useItem: (id: string) => void;
  equipItem: (id: string) => void;
  dropItem: (id: string, qty: number) => void;
  transfer: (id: string, qty: number, dir: 'take' | 'put') => void;
  closeContainer: () => void;
  pickupItem: (id: string) => void;
  sendChat: (text: string) => void;
  toggleSound: () => void;
  respawn: () => void;
  craft: (recipeId: string) => void;
  devAction: (action: string, args?: Record<string, any>) => void;
  logout: () => void;
  setAudioVolume: (category: 'master' | 'sfx' | 'ambient', val: number) => void;
  setAudioMuted: (muted: boolean) => void;
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing DOM element #${id}`);
  return found as T;
}

export class HUD {
  private actions: HudActions;
  private inv: InventoryView | null = null;
  private container: ContainerView | null = null;
  private selectedId: string | null = null;
  private lastContainerSignature = '';
  private inventoryOpen = false;
  private chatOpen = false;
  private deathOpen = false;
  private devOpen = false;
  private settingsOpen = false;
  private godmode = false;
  private latency = 0;
  private netStatus: NetStatus = 'connecting';
  private toastTimer = 0;
  private logEntries: Array<{ node: HTMLElement; at: number }> = [];
  private chatEntries: Array<{ node: HTMLElement; at: number }> = [];

  private name = el('hud-name');
  private online = el('hud-online');
  private barHp = el('bar-hp');
  private barSt = el('bar-st');
  private barHunger = el('bar-hunger');
  private barThirst = el('bar-thirst');
  private valHp = el('val-hp');
  private valSt = el('val-st');
  private valHunger = el('val-hunger');
  private valThirst = el('val-thirst');
  private weapon = el('weapon-name');
  private coords = el('hud-coords');
  private net = el('net-status');
  private eventLog = el('event-log');
  private prompt = el('interaction-prompt');
  private quickbar = el('quickbar');
  private panel = el('inventory-panel');
  private invPanelTitle = el('inv-panel-title');
  private panelTabs = el('panel-tabs');
  private tabBtnInv = el('tab-btn-inv');
  private tabBtnCraft = el('tab-btn-craft');
  private playerInvCol = el('player-inv-col');
  private invList = el('inv-list');
  private containerCol = el('container-col');
  private containerTitle = el('container-title');
  private containerList = el('container-list');
  private btnTakeAll = el('container-take-all');
  private craftCol = el('craft-col');
  private craftList = el('craft-list');
  private invWeight = el('inv-weight');
  private invCount = el('inv-count');
  private detail = el('inv-detail');
  private activeTab: 'inv' | 'craft' = 'inv';
  private death = el('death-overlay');
  private deathCause = el('death-cause');
  private respawnTimer = el('respawn-timer');
  private chatLog = el('chat-log');
  private chatInput = el('chat-input') as HTMLInputElement;
  private toastEl = el('toast');
  private crosshair = el('crosshair');
  private soundBtn = el('sound-toggle');
  private hud = el('hud');

  // Top action buttons
  private btnDev = el('btn-dev');
  private btnSettings = el('btn-settings');

  // Settings modal
  private settingsModal = el('settings-modal');
  private settingsClose = el('settings-close');
  private volMaster = el<HTMLInputElement>('vol-master');
  private volSfx = el<HTMLInputElement>('vol-sfx');
  private volAmbient = el<HTMLInputElement>('vol-ambient');
  private valVolMaster = el('val-vol-master');
  private valVolSfx = el('val-vol-sfx');
  private valVolAmbient = el('val-vol-ambient');
  private checkMute = el<HTMLInputElement>('check-mute');
  private btnLogout = el('btn-logout');

  // Dev modal
  private devModal = el('dev-modal');
  private devClose = el('dev-close');
  private devCoords = el('dev-coords');
  private devBuilding = el('dev-building');
  private devPing = el('dev-ping');
  private devFps = el('dev-fps');
  private devZombies = el('dev-zombies');
  private devPlayers = el('dev-players');
  private devGodVal = el('dev-god-val');
  private devBtnKit = el('dev-btn-kit');
  private devBtnHeal = el('dev-btn-heal');
  private devBtnGod = el('dev-btn-god');
  private devBtnSpawn = el('dev-btn-spawn');
  private devBtnNewChar = el('dev-btn-new-char');

  constructor(actions: HudActions) {
    this.actions = actions;
    el('inv-close').addEventListener('click', () => this.closeInventory(true));
    this.soundBtn.addEventListener('click', () => this.actions.toggleSound());

    this.tabBtnInv.addEventListener('click', () => {
      this.activeTab = 'inv';
      this.renderInventory();
    });
    this.tabBtnCraft.addEventListener('click', () => {
      this.activeTab = 'craft';
      this.renderInventory();
    });

    this.btnTakeAll.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!this.container || this.container.items.length === 0) return;
      for (const it of [...this.container.items]) {
        if (this.container.id === '__ground__') {
          this.actions.pickupItem(it.id);
        } else {
          this.actions.transfer(it.id, it.qty, 'take');
        }
      }
    });

    this.chatInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        const text = this.chatInput.value.trim();
        if (text) this.actions.sendChat(text);
        this.closeChat();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        this.closeChat();
      }
      ev.stopPropagation();
    });

    document.addEventListener('mousemove', (ev) => {
      this.crosshair.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
    });

    // Dev button & settings button
    this.btnDev.addEventListener('click', () => this.toggleDevPanel());
    this.btnSettings.addEventListener('click', () => this.toggleSettings());

    // Settings modal handlers
    this.settingsClose.addEventListener('click', () => this.closeSettings());
    this.volMaster.addEventListener('input', () => {
      const v = Number(this.volMaster.value) / 100;
      this.valVolMaster.textContent = `${this.volMaster.value}%`;
      this.actions.setAudioVolume('master', v);
    });
    this.volSfx.addEventListener('input', () => {
      const v = Number(this.volSfx.value) / 100;
      this.valVolSfx.textContent = `${this.volSfx.value}%`;
      this.actions.setAudioVolume('sfx', v);
    });
    this.volAmbient.addEventListener('input', () => {
      const v = Number(this.volAmbient.value) / 100;
      this.valVolAmbient.textContent = `${this.volAmbient.value}%`;
      this.actions.setAudioVolume('ambient', v);
    });
    this.checkMute.addEventListener('change', () => {
      this.actions.setAudioMuted(this.checkMute.checked);
      this.setSoundLabel(!this.checkMute.checked);
    });
    this.btnLogout.addEventListener('click', () => {
      this.actions.logout();
    });

    // Dev modal handlers
    this.devClose.addEventListener('click', () => this.closeDevPanel());
    this.devBtnKit.addEventListener('click', () => {
      this.actions.devAction('kit');
      this.toast('Боевой комплект выдан!');
    });
    this.devBtnHeal.addEventListener('click', () => {
      this.actions.devAction('heal');
      this.toast('Здоровье восстановлено!');
    });
    this.devBtnGod.addEventListener('click', () => {
      this.godmode = !this.godmode;
      this.devGodVal.textContent = this.godmode ? 'ВКЛ' : 'ВЫКЛ';
      this.devGodVal.style.color = this.godmode ? 'var(--moss)' : 'var(--amber)';
      this.actions.devAction('godmode', { enabled: this.godmode });
      this.toast(`Режим бога: ${this.godmode ? 'ВКЛ' : 'ВЫКЛ'}`);
    });
    this.devBtnSpawn.addEventListener('click', () => {
      this.actions.devAction('teleport_spawn');
      this.toast('Телепортация на спавн...');
    });
    this.devBtnNewChar.addEventListener('click', () => {
      if (confirm('Создать нового тестового персонажа? Текущий прогресс будет сохранён в базе, но сессия переключится.')) {
        this.actions.logout();
      }
    });

    setInterval(() => this.pruneTransient(), 2000);
    this.loadQuickbarBindings();
  }

  get isInventoryOpen(): boolean {
    return this.inventoryOpen;
  }

  get isChatOpen(): boolean {
    return this.chatOpen;
  }

  get isDevPanelOpen(): boolean {
    return this.devOpen;
  }

  get isSettingsOpen(): boolean {
    return this.settingsOpen;
  }

  get blocksInput(): boolean {
    return this.inventoryOpen || this.chatOpen || this.devOpen || this.settingsOpen;
  }

  setVisible(visible: boolean): void {
    this.hud.classList.toggle('hidden', !visible);
  }

  setConnection(status: NetStatus, detail?: string): void {
    this.netStatus = status;
    const labels: Record<NetStatus, string> = {
      connecting: 'ПОДКЛЮЧЕНИЕ...',
      online: 'СЕТЬ: ОНЛАЙН',
      reconnecting: 'ПЕРЕПОДКЛЮЧЕНИЕ...',
      offline: 'НЕ В СЕТИ',
      failed: 'ОШИБКА СЕТИ',
    };
    const pingPart = status === 'online' && this.latency > 0 ? ` • ${this.latency} мс` : '';
    this.net.textContent = detail ? `${labels[status]} · ${detail}` : `${labels[status]}${pingPart}`;
    this.net.classList.toggle('bad', status === 'reconnecting' || status === 'failed' || status === 'offline');
  }

  setLatency(ms: number): void {
    this.latency = ms;
    this.devPing.textContent = `${ms} мс`;
    if (this.netStatus === 'online') {
      this.net.textContent = `СЕТЬ: ОНЛАЙН • ${ms} мс`;
      this.net.classList.toggle('bad', ms > 300);
    }
  }

  updateTelemetry(x: number, y: number, building: string | null, fps: number, zombies: number, players: number): void {
    this.devCoords.textContent = `${x.toFixed(1)} / ${y.toFixed(1)}`;
    this.devBuilding.textContent = building ? building.toUpperCase() : 'Улица';
    this.devFps.textContent = String(fps);
    this.devZombies.textContent = String(zombies);
    this.devPlayers.textContent = String(players);
  }

  setName(name: string): void {
    this.name.textContent = name;
  }

  updateSelf(self: SelfSnapshot, online: number): void {
    this.online.textContent = `${online} В СЕТИ`;
    const hpPct = Math.max(0, Math.min(1, self.hp / Math.max(1, self.maxHp)));
    const stPct = Math.max(0, Math.min(1, self.stamina / PLAYER_MAX_STAMINA));
    this.barHp.style.transform = `scaleX(${hpPct})`;
    this.barSt.style.transform = `scaleX(${stPct})`;
    this.barHunger.style.transform = `scaleX(${Math.max(0, Math.min(1, self.hunger / 100))})`;
    this.barThirst.style.transform = `scaleX(${Math.max(0, Math.min(1, self.thirst / 100))})`;
    this.valHp.textContent = String(Math.ceil(self.hp));
    this.valSt.textContent = String(Math.round(self.stamina));
    this.valHunger.textContent = String(Math.round(self.hunger));
    this.valThirst.textContent = String(Math.round(self.thirst));
    this.barHp.parentElement?.parentElement?.classList.toggle('danger', self.hp < 25);
    const weaponDef = self.weapon ? ITEMS[self.weapon] : null;
    this.weapon.textContent = weaponDef ? weaponDef.name : 'Кулаки';
    this.coords.textContent = `${Math.floor(self.x)} / ${Math.floor(self.y)}`;

    if (self.status === 'dead') {
      if (!this.deathOpen) {
        this.deathOpen = true;
        this.death.classList.remove('hidden');
      }
      const sec = Math.max(0, Math.ceil((self.respawnIn ?? 0) / 1000));
      this.respawnTimer.textContent = String(sec);
      this.respawnTimer.style.opacity = sec <= 1 ? '0.35' : '0.85';
    } else if (this.deathOpen) {
      this.deathOpen = false;
      this.death.classList.add('hidden');
    }
    if (self.status !== 'dead') this.respawnTimer.textContent = '';
    if (self.weight > self.maxWeight * 0.9) {
      this.invWeight.classList.add('bad');
    } else {
      this.invWeight.classList.remove('bad');
    }
  }

  setDeathCause(text: string): void {
    this.deathCause.textContent = text;
  }

  setInventory(inv: InventoryView, container?: ContainerView | null): void {
    this.inv = inv;
    // A server inventory response for a player's backpack must not close the
    // client-side ground-loot panel; it is refreshed by the next snapshot.
    if (container === null && this.container?.id === '__ground__') {
      // keep the current ground container
    } else {
      this.container = container ?? null;
    }
    this.lastContainerSignature = containerSignature(this.container);
    if (this.selectedId && !selectionExists(this.selectedId, this.inv, this.container)) {
      this.selectedId = null;
    }
    this.renderQuickbar();
    this.renderInventory();
    this.renderCrafting();
  }

  setContainer(container: ContainerView | null): void {
    if (container) {
      const signature = containerSignature(container);
      if (this.container?.id === container.id && signature === this.lastContainerSignature) {
        // Same contents: update the reference without tearing down the DOM.
        this.container = container;
        return;
      }
      if (this.selectedId && !selectionExists(this.selectedId, this.inv, container)) this.selectedId = null;
      this.container = container;
      this.lastContainerSignature = signature;
    } else {
      this.container = null;
      this.selectedId = null;
      this.lastContainerSignature = '';
    }
    this.renderInventory();
  }

  openInventory(): void {
    this.inventoryOpen = true;
    this.panel.classList.remove('hidden');
    this.renderInventory();
  }

  openCrafting(): void {
    if (this.inventoryOpen && this.activeTab === 'craft') {
      this.closeInventory(true);
      return;
    }
    this.activeTab = 'craft';
    this.openInventory();
  }

  closeInventory(sendContainerClose = false): void {
    if (sendContainerClose && this.container) this.actions.closeContainer();
    this.inventoryOpen = false;
    this.panel.classList.add('hidden');
    this.container = null;
    this.selectedId = null;
    this.lastContainerSignature = '';
  }

  toggleInventory(): void {
    if (this.inventoryOpen) this.closeInventory(true);
    else this.openInventory();
  }

  openDevPanel(): void {
    this.devOpen = true;
    this.devModal.classList.remove('hidden');
  }

  closeDevPanel(): void {
    this.devOpen = false;
    this.devModal.classList.add('hidden');
  }

  toggleDevPanel(): void {
    if (this.devOpen) this.closeDevPanel();
    else this.openDevPanel();
  }

  openSettings(): void {
    this.settingsOpen = true;
    this.settingsModal.classList.remove('hidden');
  }

  closeSettings(): void {
    this.settingsOpen = false;
    this.settingsModal.classList.add('hidden');
  }

  toggleSettings(): void {
    if (this.settingsOpen) this.closeSettings();
    else this.openSettings();
  }

  openChat(): void {
    this.chatOpen = true;
    this.chatInput.classList.remove('hidden');
    this.chatInput.value = '';
    this.chatInput.focus();
  }

  closeChat(): void {
    this.chatOpen = false;
    this.chatInput.classList.add('hidden');
    this.chatInput.blur();
  }

  addLog(text: string, kind: 'normal' | 'good' | 'bad' = 'normal'): void {
    const line = document.createElement('div');
    line.className = `log-line ${kind === 'normal' ? '' : kind}`;
    line.textContent = text;
    this.eventLog.appendChild(line);
    this.logEntries.push({ node: line, at: Date.now() });
    while (this.logEntries.length > 7) {
      const first = this.logEntries.shift();
      first?.node.remove();
    }
  }

  addChat(name: string, text: string): void {
    const line = document.createElement('div');
    line.className = 'chat-line';
    const b = document.createElement('b');
    b.textContent = `${name}: `;
    line.appendChild(b);
    line.appendChild(document.createTextNode(text));
    this.chatLog.appendChild(line);
    this.chatEntries.push({ node: line, at: Date.now() });
    while (this.chatEntries.length > 7) {
      const first = this.chatEntries.shift();
      first?.node.remove();
    }
  }

  private pruneTransient(): void {
    const now = Date.now();
    this.logEntries = this.logEntries.filter((e) => {
      if (now - e.at > 11000) {
        e.node.remove();
        return false;
      }
      return true;
    });
    this.chatEntries = this.chatEntries.filter((e) => {
      if (now - e.at > 20000) {
        e.node.remove();
        return false;
      }
      return true;
    });
  }

  toast(text: string, ms = 2600): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  setPrompt(html: string | null): void {
    if (!html) {
      this.prompt.classList.add('hidden');
      return;
    }
    this.prompt.innerHTML = html;
    this.prompt.classList.remove('hidden');
  }

  flashHurt(): void {
    this.hud.classList.remove('hurt');
    void this.hud.offsetWidth;
    this.hud.classList.add('hurt');
    window.setTimeout(() => this.hud.classList.remove('hurt'), 500);
  }

  flashAttack(): void {
    this.crosshair.classList.add('attack');
    window.setTimeout(() => this.crosshair.classList.remove('attack'), 110);
  }

  setSoundLabel(on: boolean): void {
    this.soundBtn.textContent = on ? '🔊 ЗВУК: ВКЛ' : '🔇 ЗВУК: ВЫКЛ';
    this.checkMute.checked = !on;
  }

  private quickbarBindings: Array<string | null> = [null, null, null, null, null];

  private loadQuickbarBindings(): void {
    try {
      const raw = localStorage.getItem('ashfall_quickbar_bindings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 5) {
          this.quickbarBindings = parsed;
        }
      }
    } catch {
      /* ignore */
    }
  }

  private saveQuickbarBindings(): void {
    try {
      localStorage.setItem('ashfall_quickbar_bindings', JSON.stringify(this.quickbarBindings));
    } catch {
      /* ignore */
    }
  }

  assignToSlot(slotIndex: number, itemKeyOrId: string | null): void {
    if (slotIndex < 0 || slotIndex >= 5) return;
    this.quickbarBindings[slotIndex] = itemKeyOrId;
    this.saveQuickbarBindings();
    this.renderQuickbar();
    this.renderInventory();
  }

  getItemForSlot(index: number): ItemView | null {
    if (!this.inv || !this.inv.items) return null;
    const bound = this.quickbarBindings[index];
    if (bound) {
      const match = this.inv.items.find((it) => it.id === bound || it.key === bound);
      if (match) return match;
    }
    const allEmpty = this.quickbarBindings.every((b) => b === null);
    if (allEmpty) {
      if (index === 0) {
        return this.inv.items.find((it) => ITEMS[it.key]?.kind === 'weapon') ?? this.inv.items[0] ?? null;
      } else if (index === 1) {
        const weapons = this.inv.items.filter((it) => ITEMS[it.key]?.kind === 'weapon');
        if (weapons.length > 1) return weapons[1];
        return this.inv.items.find((it) => ITEMS[it.key]?.kind === 'med') ?? this.inv.items[1] ?? null;
      } else if (index === 2) {
        return this.inv.items.find((it) => ITEMS[it.key]?.kind === 'med') ?? this.inv.items[2] ?? null;
      } else if (index === 3) {
        return this.inv.items.find((it) => ITEMS[it.key]?.kind === 'food') ?? this.inv.items[3] ?? null;
      } else if (index === 4) {
        return this.inv.items.find((it) => ITEMS[it.key]?.kind === 'drink') ?? this.inv.items[4] ?? null;
      }
    }
    return null;
  }

  hasAmmoFor(weaponKey: string): boolean {
    if (!this.inv?.items) return false;
    const def = ITEMS[weaponKey];
    if (!def?.ammo) return true;
    return this.inv.items.some((it) => it.key === def.ammo && it.qty > 0);
  }

  getInventory(): InventoryView | null {
    return this.inv;
  }

  private renderQuickbar(): void {
    if (!this.inv) return;
    this.quickbar.replaceChildren();
    for (let i = 0; i < 5; i++) {
      const slot = document.createElement('div');
      slot.className = 'quick-slot';
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = String(i + 1);
      slot.appendChild(key);
      const item = this.getItemForSlot(i);
      if (item) {
        const def = ITEMS[item.key];
        const img = document.createElement('img');
        img.src = getItemIconUrl(item.key) ?? '';
        img.alt = def?.name ?? item.key;
        slot.appendChild(img);
        if (item.qty > 1) {
          const qty = document.createElement('span');
          qty.className = 'qty';
          qty.textContent = String(item.qty);
          slot.appendChild(qty);
        }
        if (item.equipped) slot.classList.add('equipped');
        slot.title = `[${i + 1}] ${def?.name ?? item.key}`;
        slot.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.quickUse(i);
        });
      } else {
        slot.classList.add('empty');
        slot.title = `Слот ${i + 1} (пусто — назначьте в инвентаре)`;
        slot.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (this.selectedId) {
            const sel = this.inv?.items.find((it) => it.id === this.selectedId);
            if (sel) this.assignToSlot(i, sel.key);
          }
        });
      }
      this.quickbar.appendChild(slot);
    }
  }

  quickUse(index: number): void {
    const item = this.getItemForSlot(index);
    if (!item) return;
    const def = ITEMS[item.key];
    if (!def) return;
    if (def.kind === 'weapon') this.actions.equipItem(item.id);
    else if (['food', 'drink', 'med'].includes(def.kind)) this.actions.useItem(item.id);
  }

  private renderInventory(): void {
    if (!this.inv) return;
    const inv = this.inv;
    this.invWeight.textContent = `${inv.weight.toFixed(1)} / ${inv.maxWeight} кг · ${inv.items.length}/${inv.slots} слотов`;
    this.invCount.textContent = `${inv.items.length}/${inv.slots}`;
    this.invList.replaceChildren();
    if (inv.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'subtle';
      empty.textContent = 'Рюкзак пуст.';
      this.invList.appendChild(empty);
    }
    for (const item of inv.items) {
      this.invList.appendChild(this.itemRow(item, 'player'));
    }

    if (this.container) {
      // LOOTING MODE: 2 clean columns (Backpack <---> Container). Hide Crafting and tabs!
      this.panelTabs.classList.add('hidden');
      this.playerInvCol.classList.remove('hidden');
      this.containerCol.classList.remove('hidden');
      this.craftCol.classList.add('hidden');
      const isGround = this.container.id === '__ground__';

            this.invPanelTitle.textContent = isGround ? 'ЛУТ НА ЗЕМЛЕ' : `ОБЫСК: ${this.container.label.toUpperCase()}`;

            this.containerTitle.textContent = isGround ? 'ПРЕДМЕТЫ НА ЗЕМЛЕ' : this.container.label.toUpperCase();

            this.btnTakeAll.textContent = isGround ? 'ЗАБРАТЬ ВСЁ' : 'ВЗЯТЬ ВСЁ';
      this.containerList.replaceChildren();
      if (this.container.items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'subtle';
        empty.textContent = 'Пусто.';
        this.containerList.appendChild(empty);
      }
      for (const item of this.container.items) {
        this.containerList.appendChild(this.itemRow(item, 'container'));
      }
    } else {
      // NORMAL MODE: Container hidden, show Tabs!
      this.containerCol.classList.add('hidden');
      this.containerList.replaceChildren();
      this.panelTabs.classList.remove('hidden');

      if (this.activeTab === 'inv') {
        this.playerInvCol.classList.remove('hidden');
        this.craftCol.classList.add('hidden');
        this.invPanelTitle.textContent = 'СНАРЯЖЕНИЕ И РЮКЗАК';
        this.tabBtnInv.classList.add('active');
        this.tabBtnCraft.classList.remove('active');
      } else {
        this.playerInvCol.classList.add('hidden');
        this.craftCol.classList.remove('hidden');
        this.invPanelTitle.textContent = 'СОЗДАНИЕ ПРЕДМЕТОВ';
        this.tabBtnInv.classList.remove('active');
        this.tabBtnCraft.classList.add('active');
        this.renderCrafting();
      }
    }

    this.renderDetail();
  }

  private renderCrafting(): void {
    if (!this.inv) return;
    this.craftList.replaceChildren();

    // Map current player item counts
    const counts = new Map<string, number>();
    for (const it of this.inv.items) {
      counts.set(it.key, (counts.get(it.key) ?? 0) + it.qty);
    }

    for (const recipe of CRAFT_RECIPES) {
      const card = document.createElement('div');
      card.className = 'craft-card';

      const top = document.createElement('div');
      top.className = 'craft-card-top';
      const title = document.createElement('div');
      title.className = 'craft-card-title';
      title.textContent = recipe.name;
      top.appendChild(title);
      card.appendChild(top);

      const reqsWrap = document.createElement('div');
      reqsWrap.className = 'craft-reqs';

      let canCraft = true;
      for (const req of recipe.ingredients) {
        const have = counts.get(req.key) ?? 0;
        const ok = have >= req.qty;
        if (!ok) canCraft = false;

        const tag = document.createElement('span');
        tag.className = `req-tag ${ok ? 'ready' : 'missing'}`;
        const def = ITEMS[req.key];
        tag.textContent = `${def?.name ?? req.key}: ${have}/${req.qty}`;
        reqsWrap.appendChild(tag);
      }
      card.appendChild(reqsWrap);

      const btn = document.createElement('button');
      btn.className = 'craft-btn';
      btn.textContent = 'СОЗДАТЬ';
      btn.disabled = !canCraft;
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.actions.craft(recipe.id);
      });
      card.appendChild(btn);

      this.craftList.appendChild(card);
    }
  }

  private itemRow(item: ItemView, source: 'player' | 'container'): HTMLElement {
    const def = ITEMS[item.key];
    const row = document.createElement('div');
    row.className = 'item-row';
    if (this.selectedId === item.id) row.classList.add('selected');
    const img = document.createElement('img');
    img.src = getItemIconUrl(item.key) ?? '';
    img.alt = def?.name ?? item.key;
    const info = document.createElement('div');
    info.className = 'iinfo';
    const name = document.createElement('div');
    name.className = 'iname';
    name.textContent = def?.name ?? item.key;
    if (source === 'player') {
      for (let s = 0; s < 5; s++) {
        if (this.quickbarBindings[s] === item.key || this.quickbarBindings[s] === item.id) {
          const badge = document.createElement('span');
          badge.className = 'slot-badge';
          badge.textContent = `[${s + 1}]`;
          badge.title = `На панели быстрого доступа (${s + 1})`;
          name.appendChild(badge);
        }
      }
    }
    if (item.equipped) {
      const tag = document.createElement('span');
      tag.className = 'equipped-tag';
      tag.textContent = 'В РУКАХ';
      name.appendChild(tag);
    }
    const desc = document.createElement('div');
    desc.className = 'idesc';
    desc.textContent = def?.desc ?? '';
    info.append(name, desc);
    const qty = document.createElement('div');
    qty.className = 'iqty';
    qty.textContent = item.qty > 1 ? `×${item.qty}` : '';
    row.append(img, info, qty);

    const quickBtn = document.createElement('button');
    quickBtn.className = 'row-quick-btn';
    if (source === 'container') {
      quickBtn.textContent = '⬅ ВЗЯТЬ';
      quickBtn.title = 'Переложить в рюкзак';
      quickBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.actions.transfer(item.id, item.qty, 'take');
      });
      row.appendChild(quickBtn);
    } else if (this.container) {
      quickBtn.className += ' put';
      quickBtn.textContent = 'В ЯЩИК ➡';
      quickBtn.title = 'Переложить в ящик';
      quickBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.actions.transfer(item.id, item.qty, 'put');
      });
      row.appendChild(quickBtn);
    } else {
      if (def?.kind === 'weapon') {
        quickBtn.textContent = item.equipped ? 'СНЯТЬ' : 'В РУКИ';
        quickBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.actions.equipItem(item.id);
        });
        row.appendChild(quickBtn);
      } else if (['food', 'drink', 'med'].includes(def?.kind ?? '')) {
        quickBtn.textContent = 'ИСП.';
        quickBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.actions.useItem(item.id);
        });
        row.appendChild(quickBtn);
      }
    }
    row.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.selectedId = item.id;
      this.renderInventory();
    });
    row.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      this.selectedId = item.id;
      if (source === 'container') {
        if (this.container?.id === '__ground__') this.actions.pickupItem(item.id);
        else this.actions.transfer(item.id, item.qty, 'take');
      }
      else this.primaryAction(item, def?.kind);
      this.renderDetail();
    });
    return row;
  }

  private primaryAction(item: ItemView, kind?: string): void {
    if (kind === 'weapon') this.actions.equipItem(item.id);
    else if (kind && ['food', 'drink', 'med'].includes(kind)) this.actions.useItem(item.id);
  }

  private renderDetail(): void {
    this.detail.replaceChildren();
    const info = document.createElement('p');
    info.style.margin = '0';
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'item-actions';
    const selected = this.inv?.items.find((i) => i.id === this.selectedId);
    const inContainer = this.container?.items.find((i) => i.id === this.selectedId);
    if (!selected && !inContainer) {
      info.textContent = 'ЛКМ — выбрать предмет. Двойной щелчок — использовать или надеть.';
      this.detail.append(info);
      return;
    }
    const item = selected ?? inContainer!;
    const def = ITEMS[item.key];
    info.textContent = `${def?.name ?? item.key}${item.qty > 1 ? ` ×${item.qty}` : ''} — ${def?.desc ?? ''}`;
    const addBtn = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        fn();
      });
      actionsWrap.appendChild(b);
    };
    if (selected) {
      const kind = def?.kind;
      if (kind === 'weapon') addBtn(item.equipped ? 'В РУКАХ' : 'ВЗЯТЬ В РУКИ', () => this.actions.equipItem(item.id));
      if (kind && ['food', 'drink', 'med'].includes(kind)) addBtn('ИСПОЛЬЗОВАТЬ', () => this.actions.useItem(item.id));
      if (this.container && this.container.id !== '__ground__') addBtn('ПОЛОЖИТЬ', () => this.actions.transfer(item.id, item.qty, 'put'));
      if (!item.equipped) addBtn('ВЫБРОСИТЬ', () => this.actions.dropItem(item.id, item.qty > 1 ? 1 : item.qty));

      const hotbarWrap = document.createElement('div');
      hotbarWrap.className = 'hotbar-assign-wrap';
      const hotbarLabel = document.createElement('span');
      hotbarLabel.className = 'hotbar-assign-label';
      hotbarLabel.textContent = 'НА ПАНЕЛЬ (1–5):';
      hotbarWrap.appendChild(hotbarLabel);

      const hotbarBtns = document.createElement('div');
      hotbarBtns.className = 'hotbar-assign-btns';
      for (let s = 0; s < 5; s++) {
        const slotBtn = document.createElement('button');
        slotBtn.className = 'hotbar-slot-btn';
        slotBtn.textContent = String(s + 1);
        const isBound = this.quickbarBindings[s] === item.key || this.quickbarBindings[s] === item.id;
        if (isBound) slotBtn.classList.add('active');
        slotBtn.title = isBound ? `Слот ${s + 1} (нажмите, чтобы убрать)` : `Назначить в слот ${s + 1}`;
        slotBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.assignToSlot(s, isBound ? null : item.key);
          this.renderDetail();
        });
        hotbarBtns.appendChild(slotBtn);
      }
      hotbarWrap.appendChild(hotbarBtns);
      actionsWrap.appendChild(hotbarWrap);
    }
    if (inContainer) {
      if (this.container?.id === '__ground__') {
        addBtn('ПОДОБРАТЬ', () => this.actions.pickupItem(item.id));
      } else {
        addBtn('ВЗЯТЬ', () => this.actions.transfer(item.id, item.qty, 'take'));
      }
    }
    this.detail.append(info, actionsWrap);
  }
}
