import test from 'node:test';
import assert from 'node:assert/strict';
import { pool, withTransaction, waitForDatabase } from '../src/persistence/db.js';
import * as repo from '../src/persistence/repo.js';
import { hashPassword, verifyPassword } from '../src/auth.js';

test('Invites & Admin: code generation, consumption, and status lifecycle', async () => {
  await waitForDatabase();
  // 1. Create invite code
  const inv = await repo.createInviteCode(null, 'test invite', 1, 7);
  assert.match(inv.code, /^ASH-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(inv.max_uses, 1);

  // 2. Create user and consume invite
  const testUsername = `inv_test_${Date.now().toString(36)}`;
  const user = await repo.createUser(testUsername, hashPassword('testpass123'));
  assert.ok(user.id > 0);

  const res1 = await repo.validateAndConsumeInvite(inv.code, user.id, '127.0.0.1');
  assert.equal(res1.ok, true);

  // Check user has registered_with_invite
  const dbUser = await repo.getUserByUsername(testUsername);
  assert.equal(dbUser?.registered_with_invite, inv.code);

  // 3. Try to consume same single-use invite again -> should fail
  const user2 = await repo.createUser(`${testUsername}_2`, hashPassword('testpass123'));
  const res2 = await repo.validateAndConsumeInvite(inv.code, user2.id, '127.0.0.1');
  assert.equal(res2.ok, false);
  assert.match(res2.reason || '', /исчерпан|недействителен/);

  // 4. Test code revocation
  const inv2 = await repo.createInviteCode(null, 'revocable', 5, 7);
  const revoked = await repo.revokeInviteCode(inv2.code);
  assert.equal(revoked, true);

  const res3 = await repo.validateAndConsumeInvite(inv2.code, user2.id, '127.0.0.1');
  assert.equal(res3.ok, false);
  assert.match(res3.reason || '', /недействителен|revoked/);

  // 5. Test user banning
  assert.equal(dbUser?.is_banned, false);
  await repo.setUserBan(user.id, true, 'Cheating test');
  const bannedUser = await repo.getUserByUsername(testUsername);
  assert.equal(bannedUser?.is_banned, true);
  assert.equal(bannedUser?.ban_reason, 'Cheating test');

  // Unban
  await repo.setUserBan(user.id, false);
  const unbannedUser = await repo.getUserByUsername(testUsername);
  assert.equal(unbannedUser?.is_banned, false);

  // Cleanup test users
  await repo.deleteUser(user.id);
  await repo.deleteUser(user2.id);
});
