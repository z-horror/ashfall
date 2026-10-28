import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, hashToken } from '../src/auth.js';
import { applyAdminRole, parseAdminRoleArgs } from '../src/cli/admin-role.js';
import { waitForDatabase } from '../src/persistence/db.js';
import * as repo from '../src/persistence/repo.js';

test('admin role CLI validates exactly one existing-user selector', () => {
  assert.deepEqual(parseAdminRoleArgs(['--id', '42']), { revoke: false, help: false, id: 42 });
  assert.deepEqual(parseAdminRoleArgs(['--username=Survivor_ABC', '--revoke']), {
    revoke: true,
    help: false,
    username: 'Survivor_ABC',
  });
  assert.equal(parseAdminRoleArgs(['--help']).help, true);

  assert.throws(() => parseAdminRoleArgs([]), /exactly one/);
  assert.throws(() => parseAdminRoleArgs(['--id', '42', '--username', 'Survivor_ABC']), /exactly one/);
  assert.throws(() => parseAdminRoleArgs(['--id', '0']), /positive integer/);
  assert.throws(() => parseAdminRoleArgs(['--id', 'abc']), /positive integer/);
  assert.throws(() => parseAdminRoleArgs(['--id', '42', '--extra']), /Unknown argument/);
});

test('admin role grant/revoke updates an existing user and is visible in a new session', async () => {
  await waitForDatabase();
  const username = `AdminTest_${Date.now().toString(36)}`;
  const user = await repo.createUser(username, hashPassword('test-password-123'));

  const granted = await applyAdminRole({ id: user.id, revoke: false, help: false });
  assert.equal(granted.id, user.id);
  assert.equal(granted.username, username);
  assert.equal(granted.isAdmin, true);

  const token = `test-token-${user.id}-${Date.now()}`;
  await repo.createSession(user.id, hashToken(token), new Date(Date.now() + 60_000));
  const session = await repo.getSession(hashToken(token));
  assert.equal(session?.isAdmin, true, 'a new authenticated session must receive is_admin');

  const revoked = await applyAdminRole({ username, revoke: true, help: false });
  assert.equal(revoked.isAdmin, false);

  await assert.rejects(
    applyAdminRole({ id: 2_000_000_000, revoke: false, help: false }),
    /not found/,
  );
});
