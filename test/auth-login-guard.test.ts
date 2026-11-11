import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { MIGRATION_PART_52 } from '../src/database/migrations/part52.ts';
import { MIGRATION_PART_65 } from '../src/database/migrations/part65.ts';
import { AuthService, SECURITY_KEY_LOGIN_GUARD_KEY } from '../src/services/domains/auth/AuthService.ts';
import { SecurityService } from '../src/services/domains/security/SecurityService.ts';

test('security migration: existing login history receives request metadata columns', async () => {
  const initializeSqlJs = (globalThis as typeof globalThis & {
    initSqlJs: () => Promise<import('sql.js').SqlJsStatic>;
  }).initSqlJs;
  const SQL = await initializeSqlJs();
  const legacyDb = new SQL.Database();
  try {
    legacyDb.run(`
      CREATE TABLE login_history (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        username_attempted TEXT NOT NULL,
        succeeded INTEGER NOT NULL DEFAULT 0,
        failure_reason TEXT,
        device_label TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    MIGRATION_PART_52[0].up(legacyDb);
    const columnNames = (legacyDb.exec('PRAGMA table_info(login_history)')[0]?.values ?? [])
      .map((column) => String(column[1]));
    assert.ok(columnNames.includes('ip_address'));
    assert.ok(columnNames.includes('user_agent'));
  } finally {
    legacyDb.close();
  }
});

test('security-key login stores only a hash, supports key-only login, rejects bad/ambiguous keys, and respects lockout', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const admin = db.query<{ id: string; passwordHash: string; fullName: string; securityKeyHash: string | null }>(
    `SELECT id, password_hash AS passwordHash, full_name AS fullName, security_key_hash AS securityKeyHash
     FROM users WHERE username = 'admin'`
  )[0];
  assert.ok(admin, 'admin fixture exists');
  const previousMaxAttempts = db.query<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'maxFailedLoginAttempts'`
  )[0]?.value || '5';
  const key = 'FirstRunKey8';
  let testUserId: string | undefined;

  AuthService.logout();
  db.run(`UPDATE users SET password_hash = ?, security_key_hash = NULL WHERE id = ?`, [
    bcrypt.hashSync('TemporarySecurePass123!', 10),
    admin.id,
  ]);
  db.run(`UPDATE system_settings SET value = '0' WHERE key = 'maxFailedLoginAttempts'`);
  db.run(`DELETE FROM login_history WHERE username_attempted IN (?, ?)`, [
    'admin',
    SECURITY_KEY_LOGIN_GUARD_KEY,
  ]);

  try {
    const auth = new AuthService();
    const loggedInUser = AuthService.login('admin', 'TemporarySecurePass123!');
    const setupUser = { ...loggedInUser, mustChangePassword: true };
    AuthService.setCurrentUser(setupUser);
    await auth.changeOwnPasswordAsync(
      setupUser.id,
      'TemporarySecurePass123!',
      'ChangedSecurePass456!',
      'Administrator setup test',
      true
    );
    assert.equal(AuthService.getCurrentUser()?.mustChangePassword, true, 'forced setup remains gated until key creation');
    AuthService.logout();
    const resumedSetupUser = AuthService.login('admin', 'ChangedSecurePass456!');
    assert.equal(resumedSetupUser.mustChangePassword, false);
    assert.equal(resumedSetupUser.securityKeySetupRequired, true, 'a resumed login stays on the required key setup step');
    await assert.rejects(auth.setOwnSecurityKeyAsync(resumedSetupUser.id, 'short'), /8 إلى 12/);
    await auth.setOwnSecurityKeyAsync(resumedSetupUser.id, key);
    const saved = db.query<{ securityKeyHash: string }>(
      `SELECT security_key_hash AS securityKeyHash FROM users WHERE id = ?`,
      [admin.id]
    )[0]?.securityKeyHash;
    assert.ok(saved && saved !== key && saved.startsWith('$2'), 'only the salted password hash is persisted');

    const other = auth.createUser({
      username: 'security_key_duplicate_test',
      password: 'TestPass123!',
      fullName: 'Security key duplicate test',
      role: 'CASHIER',
    });
    testUserId = other.id;
    AuthService.setCurrentUser(other);
    await assert.rejects(auth.setOwnSecurityKeyAsync(other.id, key), /مستخدم بالفعل/);
    AuthService.setCurrentUser(resumedSetupUser);

    AuthService.logout();
    const keyLogin = AuthService.loginBySecurityKey(key);
    assert.equal(keyLogin.username, 'admin');
    assert.equal(keyLogin.securityKeySetupRequired, false);
    AuthService.logout();
    assert.throws(() => AuthService.loginBySecurityKey('WrongKey01'), /مفتاح الأمان غير صحيح/);

    const duplicateHash = bcrypt.hashSync(key, 10);
    db.run(`UPDATE users SET security_key_hash = ? WHERE id = ?`, [duplicateHash, other.id]);
    assert.throws(() => AuthService.loginBySecurityKey(key), /مفتاح الأمان غير صحيح/);

    db.run(`UPDATE users SET security_key_hash = NULL WHERE id = ?`, [other.id]);
    db.run(`UPDATE system_settings SET value = '2' WHERE key = 'maxFailedLoginAttempts'`);
    db.run(`DELETE FROM login_history WHERE username_attempted = ?`, [SECURITY_KEY_LOGIN_GUARD_KEY]);
    assert.throws(() => AuthService.loginBySecurityKey('WrongKey01'), /المحاولات المتبقية.*1/);
    assert.throws(() => AuthService.loginBySecurityKey('WrongKey01'), /إيقاف المحاولات/);
    assert.throws(() => AuthService.loginBySecurityKey(key), /إيقاف المحاولات/);

    db.run(`DELETE FROM login_history WHERE username_attempted IN (?, ?)`, [
      'admin',
      SECURITY_KEY_LOGIN_GUARD_KEY,
    ]);
    assert.throws(() => AuthService.login('admin', 'wrong-password'), /المحاولات المتبقية قبل الإيقاف المؤقت: 1/);
    assert.throws(() => AuthService.login('admin', 'wrong-password'), /غير صحيحة/);
    assert.throws(() => AuthService.loginBySecurityKey(key), /إيقاف المحاولات/);
  } finally {
    AuthService.logout();
    if (testUserId) {
      db.run(`DELETE FROM users_branches WHERE user_id = ?`, [testUserId]);
      db.run(`DELETE FROM user_permissions WHERE user_id = ?`, [testUserId]);
      db.run(`DELETE FROM users WHERE id = ?`, [testUserId]);
    }
    db.run(`UPDATE users SET password_hash = ?, full_name = ?, security_key_hash = ? WHERE id = ?`, [
      admin.passwordHash,
      admin.fullName,
      admin.securityKeyHash,
      admin.id,
    ]);
    db.run(`DELETE FROM login_history WHERE username_attempted IN (?, ?)`, [
      'admin',
      SECURITY_KEY_LOGIN_GUARD_KEY,
    ]);
    db.run(`UPDATE system_settings SET value = ? WHERE key = 'maxFailedLoginAttempts'`, [previousMaxAttempts]);
  }
});

test('security-key migration adds a nullable hash column for existing users', async () => {
  const initializeSqlJs = (globalThis as typeof globalThis & {
    initSqlJs: () => Promise<import('sql.js').SqlJsStatic>;
  }).initSqlJs;
  const SQL = await initializeSqlJs();
  const legacyDb = new SQL.Database();
  try {
    legacyDb.run('CREATE TABLE users (id TEXT PRIMARY KEY)');
    MIGRATION_PART_65[0].up(legacyDb);
    const columns = (legacyDb.exec('PRAGMA table_info(users)')[0]?.values ?? [])
      .map((column) => String(column[1]));
    assert.ok(columns.includes('security_key_hash'));
  } finally {
    legacyDb.close();
  }
});

test('auth guard: remaining attempts are reported before lockout and the lock lifts after the window', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();

  db.run(`UPDATE system_settings SET value = '3' WHERE key = 'maxFailedLoginAttempts'`);
  db.run(`DELETE FROM login_history WHERE username_attempted = 'admin'`);

  try {
    const initial = AuthService.getLoginGuardStatus('admin');
    assert.equal(initial.maxAttempts, 3);
    assert.equal(initial.failedAttempts, 0);
    assert.equal(initial.remainingAttempts, 3);
    assert.equal(initial.isLocked, false);
    assert.equal(initial.lockedUntil, null);

    assert.throws(() => AuthService.login('admin', 'wrong-pass'), /المحاولات المتبقية قبل الإيقاف المؤقت: 2/);
    assert.equal(AuthService.getLoginGuardStatus('admin').remainingAttempts, 2);

    assert.throws(() => AuthService.login('admin', 'wrong-pass'), /المحاولات المتبقية قبل الإيقاف المؤقت: 1/);
    assert.throws(() => AuthService.login('admin', 'wrong-pass'), /غير صحيحة/);

    const locked = AuthService.getLoginGuardStatus('admin');
    assert.equal(locked.isLocked, true);
    assert.equal(locked.remainingAttempts, 0);
    assert.ok(locked.lockedUntil, 'locked accounts expose an unlock timestamp');
    assert.ok(new Date(locked.lockedUntil!).getTime() > Date.now(), 'unlock timestamp is in the future');

    // Even the correct password is refused while the account is locked.
    assert.throws(() => AuthService.login('admin', 'admin123'), /إيقاف المحاولات/);

    // A successful login after the failures clears the counter for the new window.
    db.run(`UPDATE system_settings SET value = '0' WHERE key = 'maxFailedLoginAttempts'`);
    const user = AuthService.login('admin', 'admin123');
    assert.equal(user.username, 'admin');
    db.run(`UPDATE system_settings SET value = '3' WHERE key = 'maxFailedLoginAttempts'`);
    const afterSuccess = AuthService.getLoginGuardStatus('admin');
    assert.equal(afterSuccess.failedAttempts, 0);
    assert.equal(afterSuccess.remainingAttempts, 3);
    AuthService.logout();
  } finally {
    db.run(`DELETE FROM login_history WHERE username_attempted = 'admin'`);
    db.run(`UPDATE system_settings SET value = '5' WHERE key = 'maxFailedLoginAttempts'`);
  }
});

test('auth guard: disabled lockout returns a neutral state', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  db.run(`UPDATE system_settings SET value = '0' WHERE key = 'maxFailedLoginAttempts'`);
  try {
    const status = AuthService.getLoginGuardStatus('admin');
    assert.equal(status.maxAttempts, 0);
    assert.equal(status.remainingAttempts, null);
    assert.equal(status.isLocked, false);
    assert.equal(status.lockedUntil, null);
  } finally {
    db.run(`UPDATE system_settings SET value = '5' WHERE key = 'maxFailedLoginAttempts'`);
  }
});

test('security center: login history can be read with request metadata fields', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();

  const user = AuthService.login('admin', 'admin123');
  try {
    const history = SecurityService.getInstance().getLoginHistory({ limit: 10 });
    assert.ok(history.some((record) => record.username === user.username && record.succeeded));
  } finally {
    AuthService.logout();
  }
});

test('auth guard: asynchronous login preserves password checks and records successful sessions', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  db.run(`UPDATE system_settings SET value = '5' WHERE key = 'maxFailedLoginAttempts'`);
  db.run(`DELETE FROM login_history WHERE username_attempted = 'admin'`);

  try {
    await assert.rejects(
      AuthService.loginAsync('admin', 'wrong-pass'),
      /المحاولات المتبقية قبل الإيقاف المؤقت: 4/
    );
    const user = await AuthService.loginAsync('admin', 'admin123');
    assert.equal(user.username, 'admin');
    assert.equal(AuthService.getLoginGuardStatus('admin').failedAttempts, 0);
    AuthService.logout();
  } finally {
    db.run(`DELETE FROM login_history WHERE username_attempted = 'admin'`);
    db.run(`UPDATE system_settings SET value = '5' WHERE key = 'maxFailedLoginAttempts'`);
  }
});
