import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';

function q(sql: string, params: any[] = []): any[] {
  return DatabaseManager.getInstance().query(sql, params);
}

function makeUser(db: DatabaseManager, id: string, role: string): any {
  db.run(
    'INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    [id, id, 'test-only', id, role]
  );
  return { id, username: id, fullName: id, role, phone: null, isActive: true, createdAt: '', updatedAt: '' };
}

test('permissions: admin has everything, limited role is denied, override grants and denies', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const admin = AuthService.login('admin', 'admin123');
  assert.equal(PermissionService.can(admin, 'sales.create'), true);
  assert.equal(PermissionService.can(admin, 'roles.manage'), true);
  assert.equal(PermissionService.can(null, 'sales.create'), false);

  // a custom role with a single permission
  const role = PermissionService.createRole({ code: 'test_viewer', name: 'عارض اختبار' }, admin);
  PermissionService.setRolePermissions(role.code, ['reports.view'], admin);

  const limited = makeUser(db, 'usr_limited_test', role.code);
  assert.equal(PermissionService.can(limited, 'reports.view'), true);
  assert.equal(PermissionService.can(limited, 'sales.create'), false);
  assert.throws(() => PermissionService.require(limited, 'sales.create'), /غير مصرح/);

  // wildcard: granting sales.* grants every sales permission
  PermissionService.setRolePermissions(role.code, ['sales.*'], admin);
  PermissionService.invalidate(limited);
  assert.equal(PermissionService.can(limited, 'sales.create'), true);
  assert.equal(PermissionService.can(limited, 'sales.refund'), true);

  // user-level DENY override beats the role (explicit role codes, no wildcard)
  PermissionService.setRolePermissions(role.code, ['sales.create', 'sales.refund'], admin);
  PermissionService.setUserOverride(limited.id, 'sales.refund', 'DENY', admin);
  PermissionService.invalidate(limited);
  assert.equal(PermissionService.can(limited, 'sales.refund'), false);
  assert.equal(PermissionService.can(limited, 'sales.create'), true);

  PermissionService.clearUserOverrides(limited.id, admin);
});

test('permissions: user-level DENY beats role wildcards (sales.* and *)', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');

  const role = PermissionService.createRole({ code: 'test_wildcard', name: 'اختبار wildcard' }, admin);
  const w = makeUser(db, 'usr_wildcard_test', role.code);

  // role grants sales.* — user DENY on one code must win
  PermissionService.setRolePermissions(role.code, ['sales.*'], admin);
  PermissionService.setUserOverride(w.id, 'sales.refund', 'DENY', admin);
  PermissionService.invalidate(w);
  assert.equal(PermissionService.can(w, 'sales.create'), true);
  assert.equal(PermissionService.can(w, 'sales.refund'), false);

  // module-wide DENY (sales.*) beats the role wildcard too
  PermissionService.setUserOverride(w.id, 'sales.*', 'DENY', admin);
  PermissionService.invalidate(w);
  assert.equal(PermissionService.can(w, 'sales.create'), false);
  assert.equal(PermissionService.can(w, 'sales.refund'), false);

  // global DENY (*) blocks everything the role grants
  PermissionService.setUserOverride(w.id, 'sales.*', 'GRANT', admin);
  PermissionService.setUserOverride(w.id, '*', 'DENY', admin);
  PermissionService.invalidate(w);
  assert.equal(PermissionService.can(w, 'sales.create'), false);

  PermissionService.clearUserOverrides(w.id, admin);
  db.run('DELETE FROM users WHERE id = ?', [w.id]);
  PermissionService.deleteRole(role.id, admin);
});

test('auth: wrong password fails, and repeated failures lock the account for 15 minutes', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  // wrong password
  assert.throws(() => AuthService.login('admin', 'wrong-pass'), /غير صحيحة/);

  // enable lockout at 3 attempts
  db.run(`UPDATE system_settings SET value = '3' WHERE key = 'maxFailedLoginAttempts'`);
  try {
    q(`DELETE FROM login_history WHERE username_attempted = 'admin'`);
    for (let i = 0; i < 3; i++) {
      assert.throws(() => AuthService.login('admin', 'wrong-pass'), /غير صحيحة/);
    }
    assert.throws(() => AuthService.login('admin', 'admin123'), /إيقاف المحاولات/);
  } finally {
    // reset the lockout window so other tests are not affected
    q(`DELETE FROM login_history WHERE username_attempted = 'admin'`);
    db.run(`UPDATE system_settings SET value = '0' WHERE key = 'maxFailedLoginAttempts'`);
  }
  const user = AuthService.login('admin', 'admin123');
  assert.equal(user.username, 'admin');
});
