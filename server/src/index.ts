import { createServer } from 'node:http';
import { PROTOCOL_VERSION } from '@ashfall/shared';
import { config } from './config.js';
import {
  handleGuest,
  handleLogin,
  handleMe,
  handleRegister,
  handleAdminLogin,
  handleAdminMe,
  handleAdminListUsers,
  handleAdminSetBan,
  handleAdminListInvites,
  handleAdminCreateInvite,
  handleAdminRevokeInvite,
  verifyAdminToken,
} from './auth.js';
import { closeDatabase, pool, waitForDatabase } from './persistence/db.js';
import { runMigrations } from './persistence/migrate.js';
import { World } from './game/world.js';
import { Simulation } from './game/simulation.js';
import { Gateway } from './net/gateway.js';

function json(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

async function main(): Promise<void> {
  await waitForDatabase();
  if (config.migrateOnStart) await runMigrations();

  const world = new World(config.worldSeed);
  const sim = new Simulation(world);
  await sim.init();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const origin = req.headers.origin;
    if (origin && config.nodeEnv !== 'production') {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-headers', 'content-type, authorization');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const path = url.pathname.replace(/\/+$/, '') || '/';
    console.log(`[http] ${req.method} ${url.pathname} (origin: ${origin ?? 'none'})`);

    try {
      if (path === '/' && req.method === 'GET') {
        res.writeHead(302, { Location: 'http://localhost:5173/' });
        res.end();
        return;
      }
      if ((path === '/api/health' || path === '/health') && req.method === 'GET') {
        let db = true;
        try {
          await pool.query('SELECT 1');
        } catch {
          db = false;
        }
        return json(res, db ? 200 : 503, {
          ok: db,
          db,
          protocol: PROTOCOL_VERSION,
          seed: world.seed,
          uptimeSec: Math.round(process.uptime()),
          ...sim.stats(),
        });
      }
      if ((path === '/api/world' || path === '/world') && req.method === 'GET') {
        return json(res, 200, {
          seed: world.seed,
          size: 128,
          chunks: 16,
          online: sim.stats().online,
          title: 'ASHFALL: Greywater District',
        });
      }
      if ((path === '/api/auth/register' || path === '/auth/register') && req.method === 'POST') {
        return await handleRegister(req, res, world.spawn);
      }
      if ((path === '/api/auth/login' || path === '/auth/login') && req.method === 'POST') {
        return await handleLogin(req, res);
      }
      if ((path === '/api/auth/guest' || path === '/auth/guest') && req.method === 'POST') {
        return await handleGuest(req, res, world.spawn);
      }
      if ((path === '/api/me' || path === '/me') && req.method === 'GET') {
        return await handleMe(req, res);
      }
      if (path === '/api/admin/login' && req.method === 'POST') {
        return await handleAdminLogin(req, res);
      }
      if (path === '/api/admin/me' && req.method === 'GET') {
        return await handleAdminMe(req, res);
      }
      if (path === '/api/admin/users' && req.method === 'GET') {
        return await handleAdminListUsers(req, res);
      }
      if (path === '/api/admin/users/ban' && req.method === 'POST') {
        return await handleAdminSetBan(req, res, (userId, reason) => sim.kickUser(userId, reason));
      }
      if (path === '/api/admin/invites' && req.method === 'GET') {
        return await handleAdminListInvites(req, res);
      }
      if (path === '/api/admin/invites' && req.method === 'POST') {
        return await handleAdminCreateInvite(req, res);
      }
      if (path === '/api/admin/invites/revoke' && req.method === 'POST') {
        return await handleAdminRevokeInvite(req, res);
      }
      if (path === '/api/admin/stats' && req.method === 'GET') {
        if (!verifyAdminToken(req)) return json(res, 401, { error: 'Unauthorized' });
        return json(res, 200, {
          uptime: Math.round(process.uptime()),
          seed: world.seed,
          ...sim.stats(),
        });
      }
      console.warn(`[http] 404 Not Found: ${req.method} ${url.pathname}`);
      return json(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error('[http] error', err);
      return json(res, 500, { error: 'Internal server error' });
    }
  });

  const gateway = new Gateway(server, sim);

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`[ashfall] server listening on :${config.port} (protocol v${PROTOCOL_VERSION})`);
    console.log(`[ashfall] world seed: ${world.seed}`);
  });
  sim.start();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[ashfall] ${signal} received, shutting down...`);
    gateway.close();
    await sim.shutdown();
    server.close();
    await closeDatabase();
    console.log('[ashfall] bye');
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[ashfall] fatal startup error', err);
  process.exit(1);
});
