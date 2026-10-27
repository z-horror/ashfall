import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { isMemoryPool, pool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));

const MIGRATION_LOCK_KEY = 0x41534846;

export interface MigrationRunResult {
  applied: string[];
  skipped: string[];
}

export interface MigrationOptions {
  dir?: string;
  pool?: pg.Pool;
}

function migrationsDir(): string {
  const candidates = [
    resolve(here, '../../../database/migrations'),
    resolve(process.cwd(), 'database/migrations'),
    resolve(process.cwd(), '../database/migrations'),
  ];
  for (const dir of candidates) {
    try {
      readdirSync(dir);
      return dir;
    } catch {
      /* continue */
    }
  }
  throw new Error('database/migrations directory not found');
}

let memoryLock: Promise<void> = Promise.resolve();

async function withMemoryLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const previous = memoryLock;
  memoryLock = previous.then(
    () => gate,
    () => gate,
  );
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
  try {
    await client.query('SELECT 1 FROM schema_migrations LIMIT 1');
    return;
  } catch (err) {
    const code = (err as { code?: string }).code;
    const message = (err as Error).message;
    if (code !== '42P01' && !message.includes('relation "schema_migrations" does not exist')) {
      throw err;
    }
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function withMigrationLock<T>(
  db: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if (isMemoryPool(db)) {
    return withMemoryLock(async () => {
      const client = await db.connect();
      try {
        return await fn(client);
      } finally {
        client.release();
      }
    });
  }

  const client = await db.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      return await fn(client);
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
      } catch (err) {
        console.error('[db] failed to release migration lock', (err as Error).message);
      }
    }
  } finally {
    client.release();
  }
}

export async function runMigrations(options: MigrationOptions = {}): Promise<MigrationRunResult> {
  const db = options.pool ?? pool;
  const dir = options.dir ?? migrationsDir();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return withMigrationLock(db, async (client) => {
    await ensureMigrationsTable(client);

    const appliedRows = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(appliedRows.rows.map((r) => r.name));
    const newlyApplied: string[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      if (applied.has(file)) {
        skipped.push(file);
        continue;
      }

      const sql = readFileSync(join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          console.error(`[db] rollback failed for migration ${file}`, (rollbackErr as Error).message);
        }
        throw new Error(`migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }

      newlyApplied.push(file);
      console.log(`[db] applied migration ${file}`);
    }

    return { applied: newlyApplied, skipped };
  });
}
