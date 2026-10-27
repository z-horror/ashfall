import pg from 'pg';
import crypto from 'node:crypto';
import { newDb, DataType, type IMemoryDb } from 'pg-mem';
import { config } from '../config.js';

let memDb: IMemoryDb | null = null;
let activePool: any = null;

const MEMORY_POOL = Symbol('ashfall.memoryPool');

function createMemPool(): any {
  if (!memDb) {
    memDb = newDb();
    memDb.registerExtension('pgcrypto', (schema: any) => {
      schema.registerFunction({
        name: 'gen_random_uuid',
        returns: DataType.text,
        impure: true,
        implementation: () => crypto.randomUUID(),
      });
    });
  }
  const pgMem = memDb.adapters.createPg();
  const memoryPool = new pgMem.Pool();
  memoryPool[MEMORY_POOL] = true;
  return memoryPool;
}

const useMemoryDirectly = config.databaseUrl === 'memory' || config.databaseUrl.startsWith('memory');

if (useMemoryDirectly) {
  activePool = createMemPool();
} else {
  activePool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  });

  activePool.on('error', (err: Error) => {
    console.error('[db] idle client error', err.message);
  });
}

export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    const val = activePool[prop as keyof typeof activePool];
    if (typeof val === 'function') {
      return val.bind(activePool);
    }
    return val;
  },
});

export function isMemoryPool(db: unknown): boolean {
  return typeof db === 'object' && db !== null && (db as { [MEMORY_POOL]?: boolean })[MEMORY_POOL] === true;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  if (memDb) {
    const backup = memDb.backup();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      backup.restore();
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function waitForDatabase(attempts = 30, delayMs = 1000): Promise<void> {
  if (useMemoryDirectly) return;

  for (let i = 1; i <= attempts; i++) {
    try {
      await activePool.query('SELECT 1');
      return;
    } catch (err: any) {
      if ((err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) && config.nodeEnv !== 'production') {
        console.log('[db] PostgreSQL not reachable at host; switching to in-memory PostgreSQL (pg-mem).');
        try {
          await activePool.end();
        } catch {
          /* ignore */
        }
        activePool = createMemPool();
        // Automatically run migrations on memory DB so tables exist
        const { runMigrations } = await import('./migrate.js');
        await runMigrations();
        return;
      }
      if (i === attempts) throw err;
      console.log(`[db] waiting for PostgreSQL (${i}/${attempts})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function closeDatabase(): Promise<void> {
  await activePool.end();
}
