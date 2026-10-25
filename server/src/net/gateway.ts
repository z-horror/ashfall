import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { PROTOCOL_VERSION, type ServerMessage } from '@ashfall/shared';
import { parseClientMessage } from '@ashfall/shared/protocol';
import { hashToken } from '../auth.js';
import { config } from '../config.js';
import * as repo from '../persistence/repo.js';
import type { Simulation } from '../game/simulation.js';

interface Bucket {
  tokens: number;
  updated: number;
}

interface SocketState {
  ws: WebSocket;
  playerId: number | null;
  bucket: Bucket;
  alive: boolean;
  authTimer: NodeJS.Timeout;
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function error(ws: WebSocket, code: string, message: string): void {
  send(ws, { t: 'error', code, message });
}

export class Gateway {
  private wss: WebSocketServer;
  private states = new Map<WebSocket, SocketState>();
  private heartbeat: NodeJS.Timeout;
  private sim: Simulation;

  constructor(server: Server, sim: Simulation) {
    this.sim = sim;
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: config.maxMessageBytes,
    });
    this.states = new Map();

    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', (ws) => this.onConnection(ws));
    this.heartbeat = setInterval(() => this.pingAll(), 30_000);
  }

  private onConnection(ws: WebSocket): void {
    const state: SocketState = {
      ws,
      playerId: null,
      bucket: { tokens: config.maxMessagesPerSec, updated: Date.now() },
      alive: true,
      authTimer: setTimeout(() => {
        if (state.playerId === null) {
          error(ws, 'AUTH_TIMEOUT', 'Истекло время авторизации');
          ws.close(4001, 'auth timeout');
        }
      }, 8000),
    };
    this.states.set(ws, state);

    ws.on('message', (data) => void this.onMessage(state, data));
    ws.on('pong', () => {
      state.alive = true;
    });
    ws.on('close', () => this.onClose(state));
    ws.on('error', (err) => {
      console.warn('[ws] socket error', err.message);
    });
  }

  private takeToken(state: SocketState): boolean {
    const now = Date.now();
    const elapsed = (now - state.bucket.updated) / 1000;
    state.bucket.updated = now;
    state.bucket.tokens = Math.min(config.maxMessagesPerSec, state.bucket.tokens + elapsed * config.maxMessagesPerSec);
    if (state.bucket.tokens < 1) return false;
    state.bucket.tokens -= 1;
    return true;
  }

  private async onMessage(state: SocketState, data: WebSocket.RawData): Promise<void> {
    const { ws } = state;
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (buf.length > config.maxMessageBytes) {
      error(ws, 'TOO_LARGE', 'Слишком большое сообщение');
      ws.close(4002, 'too large');
      return;
    }
    if (!this.takeToken(state)) {
      error(ws, 'RATE_LIMIT', 'Слишком много команд');
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(buf.toString());
    } catch {
      error(ws, 'BAD_JSON', 'Некорректный JSON');
      return;
    }
    const msg = parseClientMessage(raw);
    if (!msg) {
      error(ws, 'BAD_MESSAGE', 'Некорректное сообщение');
      return;
    }

    if (msg.t === 'auth') {
      if (state.playerId !== null) return;
      if (msg.v !== undefined && msg.v !== PROTOCOL_VERSION) {
        error(ws, 'VERSION', `Несовместимая версия протокола (${PROTOCOL_VERSION})`);
        ws.close(4003, 'version');
        return;
      }
      const session = await repo.getSession(hashToken(msg.token));
      if (!session) {
        error(ws, 'AUTH_FAILED', 'Сессия недействительна. Войдите заново.');
        ws.close(4004, 'auth failed');
        return;
      }
      if (session.isBanned) {
        error(ws, 'BANNED', 'Ваш аккаунт заблокирован.');
        ws.close(4003, 'banned');
        return;
      }
      clearTimeout(state.authTimer);
      try {
        const playerId = await this.sim.join(session.userId, session.username, {
          send: (m) => send(ws, m),
          close: (code, reason) => ws.close(code ?? 1000, reason),
        });
        if (playerId === null) {
          error(ws, 'JOIN_FAILED', 'Не удалось войти в мир');
          ws.close(4005, 'join failed');
          return;
        }
        state.playerId = playerId;
      } catch (err) {
        console.error('[ws] join failed', err);
        error(ws, 'JOIN_FAILED', 'Сервер не смог загрузить персонажа');
        ws.close(1011, 'join failed');
      }
      return;
    }

    if (state.playerId === null) {
      error(ws, 'NOT_AUTHENTICATED', 'Сначала авторизуйтесь');
      return;
    }
    this.sim.handleMessage(state.playerId, msg);
  }

  private onClose(state: SocketState): void {
    clearTimeout(state.authTimer);
    this.states.delete(state.ws);
    if (state.playerId !== null) {
      this.sim.disconnect(state.playerId);
    }
  }

  private pingAll(): void {
    for (const state of this.states.values()) {
      if (!state.alive) {
        state.ws.terminate();
        continue;
      }
      state.alive = false;
      try {
        state.ws.ping();
      } catch {
        /* ignore */
      }
    }
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const state of this.states.values()) {
      clearTimeout(state.authTimer);
      state.ws.close(1001, 'server shutdown');
    }
    this.wss.close();
  }
}
