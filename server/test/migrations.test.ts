import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = 'memory';
process.env.NODE_ENV = 'test';

const { runMigrations } = await import('../src/persistence/migrate.js');
const { pool } = await import('../src/persistence/db.js');

async function migrationDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ashfall-migrations-'));
  for (const [name, sql] of Object.entries(files)) {
    await writeFile(join(dir, name), sql, 'utf8');
  }
  return dir;
}

async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

test('repeated runs apply each migration exactly once', async () => {
  const dir = await migrationDir({
    '001_repeated.sql': 'CREATE TABLE mig_repeated (id INTEGER PRIMARY KEY);',
  });
  try {
    const first = await runMigrations({ dir });
    assert.deepEqual(first.applied, ['001_repeated.sql']);
    assert.deepEqual(first.skipped, []);

    const second = await runMigrations({ dir });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, ['001_repeated.sql']);

    const rows = await pool.query<{ name: string }>('SELECT name FROM schema_migrations WHERE name = $1', [
      '001_repeated.sql',
    ]);
    assert.equal(rows.rowCount, 1);
  } finally {
    await removeDir(dir);
  }
});

test('concurrent runs serialize and never apply a migration twice', async () => {
  const dir = await migrationDir({
    '010_concurrent_a.sql': 'CREATE TABLE mig_concurrent_a (id INTEGER PRIMARY KEY);',
    '011_concurrent_b.sql': 'CREATE TABLE mig_concurrent_b (id INTEGER PRIMARY KEY);',
  });
  try {
    const results = await Promise.all([runMigrations({ dir }), runMigrations({ dir })]);
    const applied = results.flatMap((r) => r.applied).sort();
    assert.deepEqual(applied, ['010_concurrent_a.sql', '011_concurrent_b.sql']);

    const rows = await pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name IN ('010_concurrent_a.sql', '011_concurrent_b.sql')",
    );
    assert.equal(rows.rowCount, 2);

    await pool.query('SELECT * FROM mig_concurrent_a');
    await pool.query('SELECT * FROM mig_concurrent_b');
  } finally {
    await removeDir(dir);
  }
});

test('a failed migration is rolled back and not registered', async () => {
  const dir = await migrationDir({
    '020_before_failure.sql': 'CREATE TABLE mig_before_failure (id INTEGER PRIMARY KEY);',
    '021_broken.sql': [
      'CREATE TABLE mig_partial_failure (id INTEGER PRIMARY KEY);',
      'SELECT * FROM table_that_does_not_exist;',
    ].join('\n'),
  });
  try {
    await assert.rejects(() => runMigrations({ dir }), /021_broken\.sql failed/);

    const rows = await pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name IN ('020_before_failure.sql', '021_broken.sql') ORDER BY name",
    );
    assert.deepEqual(
      rows.rows.map((r) => r.name),
      ['020_before_failure.sql'],
    );

    await pool.query('SELECT * FROM mig_before_failure');
  } finally {
    await removeDir(dir);
  }
});

test('runMigrations leaves the shared pool open', async () => {
  const dir = await migrationDir({
    '030_pool_alive.sql': 'CREATE TABLE mig_pool_alive (id INTEGER PRIMARY KEY);',
  });
  try {
    await runMigrations({ dir });
    const result = await pool.query<{ ok: number }>('SELECT 1 AS ok');
    assert.equal(result.rows[0]?.ok, 1);
  } finally {
    await removeDir(dir);
  }
});
