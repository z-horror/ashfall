import { pathToFileURL } from 'node:url';
import { closeDatabase, isMemoryDatabase, waitForDatabase } from '../persistence/db.js';
import * as repo from '../persistence/repo.js';

export interface AdminRoleOptions {
  id?: number;
  username?: string;
  revoke: boolean;
  help: boolean;
}

export class AdminRoleArgsError extends Error {}

function valueAfter(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new AdminRoleArgsError(`${flag} requires a value`);
  return value;
}

/** Strict parser: exactly one existing-user selector, no free-form arguments. */
export function parseAdminRoleArgs(argv: string[]): AdminRoleOptions {
  const options: AdminRoleOptions = { revoke: false, help: false };
  let idSeen = false;
  let usernameSeen = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--revoke') {
      options.revoke = true;
      continue;
    }
    if (arg === '--id' || arg.startsWith('--id=')) {
      if (idSeen) throw new AdminRoleArgsError('--id may only be specified once');
      const raw = arg === '--id' ? valueAfter(argv, i++, '--id') : arg.slice('--id='.length);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) <= 0) {
        throw new AdminRoleArgsError('--id must be a positive integer');
      }
      options.id = Number(raw);
      idSeen = true;
      continue;
    }
    if (arg === '--username' || arg.startsWith('--username=')) {
      if (usernameSeen) throw new AdminRoleArgsError('--username may only be specified once');
      const raw = (arg === '--username' ? valueAfter(argv, i++, '--username') : arg.slice('--username='.length)).trim();
      if (!raw || raw.length > 64) throw new AdminRoleArgsError('--username must be 1-64 characters');
      options.username = raw;
      usernameSeen = true;
      continue;
    }
    throw new AdminRoleArgsError(`Unknown argument: ${arg}`);
  }

  if (!options.help) {
    if (idSeen === usernameSeen) throw new AdminRoleArgsError('Specify exactly one of --id or --username');
  }
  return options;
}

export interface AppliedAdminRole {
  id: number;
  username: string;
  isAdmin: boolean;
}

export async function applyAdminRole(options: AdminRoleOptions): Promise<AppliedAdminRole> {
  const user = options.id
    ? await repo.getUserById(options.id)
    : await repo.getUserByUsername(options.username ?? '');
  if (!user) throw new Error(options.id ? `User with id ${options.id} not found` : `User "${options.username}" not found`);

  const updated = await repo.setUserAdmin(user.id, !options.revoke);
  if (!updated) throw new Error(`Failed to update user ${user.id}`);
  return updated;
}

function usage(): string {
  return [
    'Usage:',
    '  npm run admin:role -- --id <user-id> [--revoke]',
    '  npm run admin:role -- --username <username> [--revoke]',
    '',
    'The permission granted is users.is_admin (server-side DEV permission).',
    'The database must be the real configured PostgreSQL database, not pg-mem.',
    'After granting, the player must reconnect (or log out and back in) to receive the role.',
  ].join('\n');
}

async function main(): Promise<void> {
  let options: AdminRoleOptions;
  try {
    options = parseAdminRoleArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[admin] ${(err as Error).message}\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  try {
    await waitForDatabase();
    if (isMemoryDatabase()) {
      throw new Error(
        'Refusing to change an in-memory database. Set DATABASE_URL to the real PostgreSQL server and try again.',
      );
    }
    const result = await applyAdminRole(options);
    console.log(
      `[admin] user ${result.username} (id ${result.id}): is_admin=${result.isAdmin ? 'true' : 'false'}`,
    );
    console.log('[admin] Reconnect the player (or log out and back in) to refresh DEV permissions.');
  } catch (err) {
    console.error(`[admin] ${(err as Error).message}`);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
