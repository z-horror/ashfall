import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFiles(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '.env')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadEnvFiles();

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num('PORT', 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://ashfall:ashfall@127.0.0.1:5433/ashfall',
  worldSeed: process.env.WORLD_SEED ?? 'greywater-01',
  tickHz: num('TICK_HZ', 20),
  snapshotHz: num('SNAPSHOT_HZ', 12),
  aoiRadius: num('AOI_RADIUS', 28),
  chunkRadius: Math.floor(num('CHUNK_RADIUS', 1)),
  sessionTtlHours: num('SESSION_TTL_HOURS', 168),
  maxMessageBytes: num('MAX_MESSAGE_BYTES', 16384),
  maxMessagesPerSec: num('MAX_MESSAGES_PER_SEC', 90),
  migrateOnStart: (process.env.MIGRATE_ON_START ?? 'true') !== 'false',
  testCombatBuffs: (process.env.TEST_COMBAT_BUFFS ?? 'true') !== 'false',
  saveIntervalMs: 8000,
  disconnectGraceMs: 25000,
};
