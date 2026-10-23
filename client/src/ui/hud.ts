import {
  ITEMS,
  PLAYER_MAX_HP,
  PLAYER_MAX_STAMINA,
  type ContainerView,
  type InventoryView,
  type ItemView,
  type SelfSnapshot,
} from '@ashfall/shared';
import { getItemIconUrl } from '../art/textures.js';
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
  private inventoryOpen = false;
  private chatOpen = false;
  private deathOpen = false;
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
  private invList = el('inv-list');
  private containerCol = el('container-col');
  private containerTitle = el('container-title');
  private containerList = el('container-list');
  private invWeight = el('inv-weight');
  private invCount = el('inv-count');
  private detail = el('inv-detail');
  private death = el('death-overlay');
  private deathCause = el('death-cause');
  private respawnTimer = el('respawn-timer');
  private chatLog = el('chat-log');
  private chatInput = el('chat-input') as HTMLInputElement;
  private toastEl = el('toast');
  private crosshair = el('crosshair');
  private soundBtn = el('sound-toggle');
  private hud = el('hud');

  constructor(actions: HudActions) {
    this.actions = actions;
    el('inv-close').addEventListener('click', () => this.closeInventory(true));
    this.soundBtn.addEventListener('click', () => this.actions.toggleSound());
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
    setInterval(() => this.pruneTransient(), 2000);
  }

  get isInventoryOpen(): boolean {
    return this.inventoryOpen;
  }

  get isChatOpen(): boolean {
    return this.chatOpen;
  }

  get blocksInput(): boolean {
    return this.inventoryOpen || this.chatOpen;
  }

  setVisible(visible: boolean): void {
    this.hud.classList.toggle('hidden', !visible);
  }

  setConnection(status: NetStatus, detail?: string): void {
    const labels: Record<NetStatus, string> = {
      connecting: 'ПОДКЛЮЧЕНИЕ...',
      online: 'СЕТЬ: ОНЛАЙН',
      reconnecting: 'ПЕРЕПОДКЛЮЧЕНИЕ...',
      offline: 'НЕ В СЕТИ',
      failed: 'ОШИБКА СЕТИ',
    };
    this.net.textContent = detail ? `${labels[status]} · ${detail}` : labels[status];
    this.net.classList.toggle('bad', status === 'reconnecting' || status === 'failed' || status === 'offline');
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
    this.container = container ?? null;
    if (this.selectedId && !inv.items.some((i) => i.id === this.selectedId)) this.selectedId = null;
    this.renderQuickbar();
    this.renderInventory();
  }

  setContainer(container: ContainerView | null): void {
    if (container) {
      if (this.container?.id !== container.id) this.selectedId = null;
      this.container = container;
    } else {
      this.container = null;
    }
    if (!this.container) this.selectedId = null;
    this.renderInventory();
  }

  openInventory(): void {
    this.inventoryOpen = true;
    this.panel.classList.remove('hidden');
    this.renderInventory();
  }

  closeInventory(sendContainerClose = false): void {
    if (sendContainerClose && this.container) this.actions.closeContainer();
    this.inventoryOpen = false;
    this.panel.classList.add('hidden');
    this.container = null;
    this.selectedId = null;
  }

  toggleInventory(): void {
    if (this.inventoryOpen) this.closeInventory(true);
    else this.openInventory();
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
    this.soundBtn.textContent = on ? 'ЗВУК: ВКЛ' : 'ЗВУК: ВЫКЛ';
  }

  private renderQuickbar(): void {
    if (!this.inv) return;
    this.quickbar.replaceChildren();
    const items = this.inv.items.slice(0, 5);
    for (let i = 0; i < 5; i++) {
      const slot = document.createElement('div');
      slot.className = 'quick-slot';
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = String(i + 1);
      slot.appendChild(key);
      const item = items[i];
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
        slot.title = def?.name ?? item.key;
        slot.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.quickUse(i);
        });
      } else {
        slot.classList.add('empty');
      }
      this.quickbar.appendChild(slot);
    }
  }

  quickUse(index: number): void {
    const item = this.inv?.items[index];
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
      this.containerCol.classList.remove('hidden');
      this.containerTitle.textContent = this.container.label.toUpperCase();
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
      this.containerCol.classList.add('hidden');
      this.containerList.replaceChildren();
    }

    this.renderDetail();
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
    const name = document.createElement('div');
    name.className = 'iname';
    name.textContent = def?.name ?? item.key;
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
    row.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.selectedId = item.id;
      this.renderInventory();
    });
    row.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      this.selectedId = item.id;
      if (source === 'container') this.actions.transfer(item.id, item.qty, 'take');
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
      if (this.container) addBtn('ПОЛОЖИТЬ', () => this.actions.transfer(item.id, item.qty, 'put'));
      if (!item.equipped) addBtn('ВЫБРОСИТЬ', () => this.actions.dropItem(item.id, item.qty > 1 ? 1 : item.qty));
    }
    if (inContainer) {
      addBtn('ВЗЯТЬ', () => this.actions.transfer(item.id, item.qty, 'take'));
    }
    this.detail.append(info, actionsWrap);
  }
}
