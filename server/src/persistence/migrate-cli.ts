import { closeDatabase, waitForDatabase } from './db.js';
import { runMigrations } from './migrate.js';

async function main(): Promise<void> {
  await waitForDatabase();
  const result = await runMigrations();
  if (result.applied.length === 0) {
    console.log('[db] migrations up to date');
  } else {
    console.log(`[db] applied ${result.applied.length} migration(s)`);
  }
}

main()
  .then(
    () => closeDatabase(),
    async (err) => {
      console.error('[db] migration failed', err);
      try {
        await closeDatabase();
      } catch (closeErr) {
        console.error('[db] failed to close database', (closeErr as Error).message);
      }
      process.exitCode = 1;
    },
  )
  .catch((err) => {
    console.error('[db] failed to close database', (err as Error).message);
    process.exitCode = 1;
  });
