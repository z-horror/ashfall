import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const testUrl = process.env.ASHFALL_TEST_DATABASE_URL;
const skip = testUrl ? false : 'ASHFALL_TEST_DATABASE_URL is not set';

async function migrationDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ashfall-migrations-pg-'));
  for (const [name, sql] of Object.entries(files)) {
    await writeFile(join(dir, name), sql, 'utf8');
  }
  return dir;
}

function schemaName(): string {
  return `migtest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function createSchema(url: string, schema: string): Promise<pg.Pool> {
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  return admin;
}

function schemaPool(url: string, schema: string, max = 2): pg.Pool {
  return new pg.Pool({ connectionString: url, max, options: `-c search_path=${schema}` });
}

test(
  'real PostgreSQL: concurrent runners serialize with an advisory lock',
  { skip },
  async () => {
    const url = testUrl;
    if (!url) return;
    process.env.DATABASE_URL = url;
    process.env.NODE_ENV = 'test';
    const { runMigrations } = await import('../src/persistence/migrate.js');

    const schema = schemaName();
    const admin = await createSchema(url, schema);
    const poolA = schemaPool(url, schema);
    const poolB = schemaPool(url, schema);
    const dir = await migrationDir({
      '0001_concurrent_a.sql': 'SELECT pg_sleep(0.1);\nCREATE TABLE mig_lock_a (id INTEGER PRIMARY KEY);',
      '0002_concurrent_b.sql': 'SELECT pg_sleep(0.1);\nCREATE TABLE mig_lock_b (id INTEGER PRIMARY KEY);',
    });

    try {
      const [a, b] = await Promise.all([
        runMigrations({ dir, pool: poolA }),
        runMigrations({ dir, pool: poolB }),
      ]);
      assert.deepEqual([...a.applied, ...b.applied].sort(), ['0001_concurrent_a.sql', '0002_concurrent_b.sql']);

      const rows = await poolA.query<{ name: string }>(
        "SELECT name FROM schema_migrations WHERE name IN ('0001_concurrent_a.sql', '0002_concurrent_b.sql')",
      );
      assert.equal(rows.rowCount, 2);

      await poolA.query('SELECT * FROM mig_lock_a');
      await poolA.query('SELECT * FROM mig_lock_b');
    } finally {
      await Promise.all([poolA.end(), poolB.end()]);
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  'real PostgreSQL: failed migration changes are rolled back and not registered',
  { skip },
  async () => {
    const url = testUrl;
    if (!url) return;
    process.env.DATABASE_URL = url;
    process.env.NODE_ENV = 'test';
    const { runMigrations } = await import('../src/persistence/migrate.js');

    const schema = schemaName();
    const admin = await createSchema(url, schema);
    const dbPool = schemaPool(url, schema, 1);
    const dir = await migrationDir({
      '0003_before.sql': 'CREATE TABLE mig_before (id INTEGER PRIMARY KEY);',
      '0004_broken.sql': [
        'CREATE TABLE mig_broken_partial (id INTEGER PRIMARY KEY);',
        'SELECT * FROM missing_table;',
      ].join('\n'),
    });

    try {
      await assert.rejects(() => runMigrations({ dir, pool: dbPool }), /0004_broken\.sql failed/);

      const rows = await dbPool.query<{ name: string }>(
        "SELECT name FROM schema_migrations WHERE name IN ('0003_before.sql', '0004_broken.sql') ORDER BY name",
      );
      assert.deepEqual(
        rows.rows.map((r) => r.name),
        ['0003_before.sql'],
      );

      const partial = await dbPool.query<{ table: string | null }>(
        "SELECT to_regclass('mig_broken_partial')::text AS table",
      );
      assert.equal(partial.rows[0]?.table, null);
      await dbPool.query('SELECT * FROM mig_before');
    } finally {
      await dbPool.end();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
