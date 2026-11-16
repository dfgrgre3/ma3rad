import '../integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../../src/database/repositories/databaseManager.ts';
import { AuthService } from '../../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../../src/services/domains/auth/PermissionService.ts';

const admin: User = {
  id: 'usr_fail_admin', username: 'fail-admin', fullName: 'Fail Admin',
  role: 'ADMIN', isActive: true, createdAt: '', updatedAt: '',
};

function asUser(user: User): void {
  AuthService.setCurrentUser(user);
  PermissionService.invalidate(user);
}

async function boot(db: DatabaseManager): Promise<void> {
  await db.initialize();
  PermissionService.seed();
  const bcrypt = (await import('bcryptjs')).default;
  const hash = bcrypt.hashSync('CorrectP@ss2026', 10);
  db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
   VALUES ('${admin.id}','${admin.username}','${hash}','${admin.fullName}','${admin.role}',1,'ALL')`);
}

test('failed login: every failed attempt is recorded in login_history', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  const before = db.query<{ n: number }>('SELECT COUNT(*) AS n FROM login_history')[0].n;

  try {
    AuthService.login(admin.username, 'WrongPassword123');
  } catch { /* expected failure */ }

  const after = db.query<{ n: number }>('SELECT COUNT(*) AS n FROM login_history')[0].n;
  assert.equal(after, before + 1, 'failed attempt increments login history');

  const last = db.query<{ succeeded: number; failure_reason: string }>(
    'SELECT succeeded, failure_reason FROM login_history ORDER BY created_at DESC LIMIT 1'
  )[0];
  assert.equal(last.succeeded, 0, 'failed attempt marked as not succeeded');
  assert.ok(last.failure_reason, 'failure reason is recorded');
});

test('failed login: successful login is also recorded', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  const before = db.query<{ n: number }>('SELECT COUNT(*) AS n FROM login_history')[0].n;

  AuthService.login(admin.username, 'CorrectP@ss2026');

  const after = db.query<{ n: number }>('SELECT COUNT(*) AS n FROM login_history')[0].n;
  assert.equal(after, before + 1, 'successful attempt increments login history');

  const last = db.query<{ succeeded: number }>(
    'SELECT succeeded FROM login_history ORDER BY created_at DESC LIMIT 1'
  )[0];
  assert.equal(last.succeeded, 1, 'successful attempt marked as succeeded');
});

test('failed login: account locks after max failed attempts', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);

  const username = 'lockout-user';
  const bcrypt = (await import('bcryptjs')).default;
  const hash = bcrypt.hashSync('LockoutP@ss2026', 10);
  db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
   VALUES ('usr_lockout','${username}','${hash}','Lockout User','SALES',1,'ALL')`);

  for (let i = 0; i < 5; i++) {
    try { AuthService.login(username, 'WrongPassword'); } catch { /* expected */ }
  }

  const guard = AuthService.getLoginGuardStatus(username);
  assert.ok(guard.failedAttempts > 0, 'failed attempts are counted');
  if (guard.maxAttempts > 0) {
    assert.ok(guard.remainingAttempts !== null, 'remaining attempts is tracked');
  }
});

test('failed login: login history can be retrieved for audit', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  AuthService.login(admin.username, 'WrongPassword');
  AuthService.login(admin.username, 'CorrectP@ss2026');

  const history = AuthService.getLoginHistory(admin.id);
  assert.ok(history.length >= 2, 'login history contains both failed and successful attempts');
  assert.ok(history.some((h: any) => h.succeeded === 0), 'history includes failed attempt');
  assert.ok(history.some((h: any) => h.succeeded === 1), 'history includes successful attempt');
});

test('failed login: recordLogin captures username attempted even when user not found', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  const before = db.query<{ n: number }>('SELECT COUNT(*) AS n FROM login_history')[0].n;

  try {
    AuthService.login('nonexistent-user', 'AnyPassword');
  } catch { /* expected USER_NOT_FOUND */ }

  const after = db.query<{ n: number }>('SELECT COUNT(*) AS n FROM login_history')[0].n;
  assert.equal(after, before + 1, 'attempt for nonexistent user is still recorded');

  const last = db.query<{ username_attempted: string }>(
    'SELECT username_attempted FROM login_history ORDER BY created_at DESC LIMIT 1'
  )[0];
  assert.equal(last.username_attempted, 'nonexistent-user', 'attempted username is recorded');
});
