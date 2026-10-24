import { PROTOCOL_VERSION } from '@ashfall/shared';
import type { ClientMessage as ClientMsg } from '@ashfall/shared/protocol';
import type { ServerMessage } from '@ashfall/shared';

export type NetStatus = 'connecting' | 'online' | 'reconnecting' | 'offline' | 'failed';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type ActionMessage = DistributiveOmit<ClientMsg, 'seq'>;

export interface NetHandlers {
  onMessage: (msg: ServerMessage) => void;
  onStatus: (status: NetStatus, detail?: string) => void;
  onLatency: (ms: number) => void;
  onFatal: (message: string) => void;
}

export class NetClient {
  private ws: WebSocket | null = null;
  private token = '';
  private handlers: NetHandlers;
  private closedByUser = false;
  private attempt = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private actionSeq = 0;
  inputSeq = 0;
  latency = 0;
  status: NetStatus = 'offline';

  constructor(handlers: NetHandlers) {
    this.handlers = handlers;
  }

  private url(): string {
    const fromEnv = import.meta.env.VITE_WS_URL as string | undefined;
    if (fromEnv) return fromEnv;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  connect(token: string): void {
    this.token = token;
    this.closedByUser = false;
    this.attempt = 0;
    this.open();
  }

  private setStatus(status: NetStatus, detail?: string): void {
    this.status = status;
    this.handlers.onStatus(status, detail);
  }

  private open(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url());
    } catch (err) {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener('open', () => {
      if (!this.token) return;
      ws.send(JSON.stringify({ t: 'auth', token: this.token, v: PROTOCOL_VERSION }));
    });

    ws.addEventListener('message', (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.t === 'error') {
        if (msg.code === 'AUTH_FAILED' || msg.code === 'VERSION' || msg.code === 'AUTH_TIMEOUT') {
          this.closedByUser = true;
          this.setStatus('failed', msg.message);
          this.handlers.onFatal(msg.message);
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          return;
        }
      }
      if (msg.t === 'welcome') {
        this.attempt = 0;
        this.setStatus('online');
        this.startPing();
      }
      if (msg.t === 'pong') {
        this.latency = Math.round(performance.now() - this.lastPingAt);
        this.handlers.onLatency(this.latency);
      }
      this.handlers.onMessage(msg);
    });

    ws.addEventListener('close', () => {
      this.stopPing();
      if (this.closedByUser) {
        this.setStatus('offline');
        return;
      }
      this.setStatus('reconnecting', 'Соединение потеряно');
      this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // close handler handles reconnection
    });
  }

  private scheduleReconnect(): void {
    if (this.closedByUser) return;
    if (this.reconnectTimer !== null) return;
    this.attempt++;
    if (this.attempt > 12) {
      this.setStatus('failed', 'Не удалось восстановить соединение');
      this.handlers.onFatal('Сервер недоступен. Обновите страницу или попробуйте позже.');
      return;
    }
    const delay = Math.min(8000, 500 * Math.pow(1.5, this.attempt - 1));
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private startPing(): void {
    this.stopPing();
    this.lastPingAt = performance.now();
    this.sendRaw({ t: 'ping', ts: Date.now() });
    this.pingTimer = window.setInterval(() => {
      this.lastPingAt = performance.now();
      this.sendRaw({ t: 'ping', ts: Date.now() });
    }, 3000);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private lastPingAt = 0;

  private sendRaw(msg: ClientMsg): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }

  send(msg: ClientMsg): void {
    this.sendRaw(msg);
  }

  action(msg: ActionMessage): number {
    const seq = ++this.actionSeq;
    this.sendRaw({ ...msg, seq } as ClientMsg);
    return seq;
  }

  sendInput(mx: number, my: number, aim: number, sprint: boolean): number {
    const seq = ++this.inputSeq;
    this.sendRaw({ t: 'input', seq, mx, my, aim, sprint });
    return seq;
  }

  close(): void {
    this.closedByUser = true;
    this.stopPing();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.setStatus('offline');
  }
}
