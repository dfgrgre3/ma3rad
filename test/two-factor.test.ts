import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService, TwoFactorRequiredError } from '../src/services/AuthService.ts';
import {
  base32Decode,
  base32Encode,
  generateTOTP,
  twoFactorAuth,
} from '../src/services/twoFactorAuth.ts';

const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('TOTP matches the RFC 6238 SHA-1 test vectors', () => {
  const vectors: Array<[number, string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ];
  for (const [time, expected] of vectors) {
    assert.equal(generateTOTP(RFC_SECRET, time), expected, `T=${time}`);
  }
  assert.equal(generateTOTP(RFC_SECRET, 59, 30, 8), '94287082');
});

test('base32 round-trips arbitrary bytes', () => {
  const bytes = Uint8Array.from([0x00, 0x01, 0x7f, 0x80, 0xff, 0x42]);
  assert.deepEqual(Array.from(base32Decode(base32Encode(bytes))), Array.from(bytes));
});

async function adminId(db: DatabaseManager): Promise<string> {
  const row = db.query<{ id: string }>(`SELECT id FROM users WHERE username = 'admin'`)[0];
  assert.ok(row, 'admin fixture exists');
  return row.id;
}

test('2FA secrets live per user and verification rejects wrong, replayed, and reused codes', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const userId = await adminId(db);

  try {
    let setupYieldedToEventLoop = false;
    setTimeout(() => {
      setupYieldedToEventLoop = true;
    }, 0);
    const setup = await twoFactorAuth.setup2FA(userId, 'TOTP');
    assert.equal(setupYieldedToEventLoop, true, 'setup should not block the event loop while hashing recovery codes');
    assert.equal(setup.secret.length, 32);
    assert.equal(setup.recoveryCodes.length, 10);
    assert.match(setup.qrCodeImage ?? '', /^otpauth:\/\/totp\//);

    // Not enabled until the user confirms the secret.
    assert.equal(twoFactorAuth.isEnabled(userId), false);
    assert.equal((await twoFactorAuth.getStatus(userId)).enabled, false);

    assert.equal(await twoFactorAuth.verify2FA(userId, '000000'), false);

    const code = generateTOTP(setup.secret);
    assert.equal(await twoFactorAuth.verify2FA(userId, code), true);
    // The same time step cannot be replayed.
    assert.equal(await twoFactorAuth.verify2FA(userId, code), false);

    // Recovery codes are single use and stored only as hashes.
    const stored = db.query<{ recoveryCodes: string }>(
      `SELECT recovery_codes AS recoveryCodes FROM user_2fa WHERE user_id = ?`, [userId]
    )[0];
    assert.ok(!stored.recoveryCodes.includes(setup.recoveryCodes[0]), 'plaintext recovery code is not stored');
    assert.equal(await twoFactorAuth.verify2FA(userId, setup.recoveryCodes[0], 'recovery'), true);
    assert.equal(await twoFactorAuth.verify2FA(userId, setup.recoveryCodes[0], 'recovery'), false);

    await assert.rejects(twoFactorAuth.enable2FA(userId, 'TOTP'), /رمز التحقق/);
    const activationCode = twoFactorAuth.generateTestCode(userId, Math.floor(Date.now() / 30_000) + 1);
    await twoFactorAuth.enable2FA(userId, 'TOTP', activationCode);
    assert.equal(twoFactorAuth.isEnabled(userId), true);
    await twoFactorAuth.disable2FA(userId, setup.recoveryCodes[1]);
    assert.equal(twoFactorAuth.isEnabled(userId), false);
  } finally {
    db.run(`DELETE FROM user_2fa WHERE user_id = ?`, [userId]);
  }
});

test('login requires a valid second factor once 2FA is enabled', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const userId = await adminId(db);
  const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const recoveryCode = 'abcde-12345';

  db.run(`UPDATE system_settings SET value = '5' WHERE key = 'maxFailedLoginAttempts'`);
  db.run(`DELETE FROM login_history WHERE username_attempted = 'admin'`);

  try {
    db.run(
      `INSERT INTO user_2fa
         (user_id, secret, algorithm, period, counter, enabled, recovery_codes, setup_date, last_used_counter, created_at, updated_at)
       VALUES (?, ?, 'TOTP', 30, 0, 1, ?, ?, NULL, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET enabled = 1, secret = excluded.secret,
         recovery_codes = excluded.recovery_codes, last_used_counter = NULL`,
      [userId, secret, JSON.stringify([bcrypt.hashSync(recoveryCode, 10)]),
        new Date().toISOString(), new Date().toISOString(), new Date().toISOString()]
    );

    assert.throws(
      () => AuthService.login('admin', 'admin123'),
      (error: unknown) => error instanceof TwoFactorRequiredError && error.code === 'TWO_FACTOR_REQUIRED'
    );

    assert.throws(() => AuthService.login('admin', 'admin123', '000000'), /رمز التحقق الثنائي غير صحيح/);

    const user = AuthService.login('admin', 'admin123', generateTOTP(secret));
    assert.equal(user.username, 'admin');
    AuthService.logout();

    const recoveryLogin = AuthService.login('admin', 'admin123', recoveryCode);
    assert.equal(recoveryLogin.username, 'admin');
    AuthService.logout();
    assert.throws(() => AuthService.login('admin', 'admin123', recoveryCode), /رمز التحقق الثنائي غير صحيح/);
  } finally {
    db.run(`DELETE FROM user_2fa WHERE user_id = ?`, [userId]);
    db.run(`DELETE FROM login_history WHERE username_attempted = 'admin'`);
    db.run(`UPDATE system_settings SET value = '5' WHERE key = 'maxFailedLoginAttempts'`);
  }
});

test('PIN login never bypasses an enabled second factor', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const userId = await adminId(db);
  const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const pinHash = bcrypt.hashSync('1234', 10);

  db.run(`UPDATE users SET pin_code = ? WHERE id = ?`, [pinHash, userId]);
  db.run(
    `INSERT INTO user_2fa
       (user_id, secret, algorithm, period, counter, enabled, recovery_codes, setup_date, last_used_counter, created_at, updated_at)
     VALUES (?, ?, 'TOTP', 30, 0, 1, '[]', ?, NULL, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET enabled = 1`,
    [userId, secret, new Date().toISOString(), new Date().toISOString(), new Date().toISOString()]
  );

  try {
    assert.throws(() => AuthService.loginByPin('1234'), /محمي بالتحقق الثنائي/);
  } finally {
    db.run(`DELETE FROM user_2fa WHERE user_id = ?`, [userId]);
    db.run(`UPDATE users SET pin_code = NULL WHERE id = ?`, [userId]);
  }
});

test('login PIN changes stay pending until a manager approves them', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const previousFailedAttempts = db.query<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'maxFailedLoginAttempts'`
  )[0]?.value || '5';
  const previousPinLength = db.query<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'loginPinLength'`
  )[0]?.value || '4';
  db.run(`UPDATE system_settings SET value = '0' WHERE key = 'maxFailedLoginAttempts'`);
  db.run(`UPDATE system_settings SET value = '4' WHERE key = 'loginPinLength'`);
  const admin = AuthService.login('admin', 'admin123');
  const auth = new AuthService();
  const previousCeramisys = window.ceramisys;
  window.ceramisys = {
    ...previousCeramisys,
    security: {
      ...previousCeramisys?.security,
      encryptDatabaseSecret: async (secret) => `encrypted:${secret}`,
      decryptDatabaseSecret: async (payload) => payload.replace(/^encrypted:/, ''),
    },
  };
  const user = auth.createUser({
    username: 'pin_change_approval_test',
    password: 'Test1234!',
    fullName: 'PIN change approval test',
    role: 'CASHIER',
    pinCode: '9876',
  }, 'usr_admin', admin);

  try {
    assert.match(auth.generateUniqueLoginPin(), /^\d{4}$/);
    AuthService.setCurrentUser(user);
    await auth.requestOwnLoginPinChange('1357');
    await assert.rejects(auth.getRecoverableLoginPins(), /مدير النظام فقط/);
    const status = auth.getOwnLoginPinStatus();
    assert.equal(status.hasPin, true);
    assert.equal(status.pending, true);
    assert.equal(typeof status.requestedAt, 'string');
    assert.throws(() => auth.approveLoginPinChange('not-a-request'), /متاحة للمدير فقط/);

    AuthService.setCurrentUser(admin);
    const pending = auth.getPendingLoginPinChanges();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].userId, user.id);
    auth.approveLoginPinChange(pending[0].id);

    const storedPin = db.query<{ pinCode: string }>(
      'SELECT pin_code AS pinCode FROM users WHERE id = ?',
      [user.id]
    )[0].pinCode;
    assert.notEqual(storedPin, '1357');
    assert.equal(bcrypt.compareSync('1357', storedPin), true);
    assert.equal((await auth.getRecoverableLoginPins())[user.id], '1357');

    AuthService.logout();
    assert.equal(AuthService.loginByPin('1357').id, user.id);
  } finally {
    AuthService.logout();
    window.ceramisys = previousCeramisys;
    db.run('DELETE FROM users WHERE id = ?', [user.id]);
    db.run(`UPDATE system_settings SET value = ? WHERE key = 'maxFailedLoginAttempts'`, [previousFailedAttempts]);
    db.run(`UPDATE system_settings SET value = ? WHERE key = 'loginPinLength'`, [previousPinLength]);
  }
});

test('account switching is limited to active users selected by a manager', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const previousFailedAttempts = db.query<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'maxFailedLoginAttempts'`
  )[0]?.value || '5';
  db.run(`UPDATE system_settings SET value = '0' WHERE key = 'maxFailedLoginAttempts'`);
  const admin = AuthService.login('admin', 'admin123');
  const auth = new AuthService();
  const user = auth.createUser({
    username: 'switch_user_test',
    password: 'Test1234!',
    fullName: 'Switch user test',
    role: 'CASHIER',
  }, 'usr_admin', admin);
  const previous = db.query<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'switchableUserIds'`
  )[0]?.value || '[]';

  try {
    db.run(`UPDATE system_settings SET value = ? WHERE key = 'switchableUserIds'`, [JSON.stringify([user.id])]);
    assert.deepEqual(AuthService.getSwitchableUsers().map((entry) => entry.id), [user.id]);
    assert.equal(AuthService.switchToUser(user.id).id, user.id);
    assert.throws(() => AuthService.switchToUser(admin.id), /غير مسموح/);
  } finally {
    AuthService.logout();
    db.run(`UPDATE system_settings SET value = ? WHERE key = 'switchableUserIds'`, [previous]);
    db.run('DELETE FROM users WHERE id = ?', [user.id]);
    db.run(`UPDATE system_settings SET value = ? WHERE key = 'maxFailedLoginAttempts'`, [previousFailedAttempts]);
  }
});

test('active users cannot share a PIN', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const admin = AuthService.login('admin', 'admin123');
  const auth = new AuthService();
  const firstId = 'usr_pin_unique_a';
  const secondId = 'usr_pin_unique_b';

  try {
    db.run(`DELETE FROM users WHERE id IN (?, ?)`, [firstId, secondId]);
    auth.createUser({ username: firstId, password: 'Test1234!', fullName: 'PIN A', role: 'CASHIER', pinCode: '9876' }, 'usr_admin', admin);
    assert.throws(
      () => auth.createUser({ username: secondId, password: 'Test1234!', fullName: 'PIN B', role: 'CASHIER', pinCode: '9876' }, 'usr_admin', admin),
      /رمز PIN مخصص لمستخدم نشط آخر/
    );
  } finally {
    db.run(`DELETE FROM users WHERE id IN (?, ?)`, [firstId, secondId]);
    AuthService.logout();
  }
});

test('PIN login is rate-limited and cannot bypass a password lock or default-password change', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const adminId = (db.query<{ id: string }>(`SELECT id FROM users WHERE username = 'admin'`)[0]).id;
  const pinHash = bcrypt.hashSync('2468', 10);
  const originalLimit = db.query<{ value: string }>(`SELECT value FROM system_settings WHERE key = 'maxFailedLoginAttempts'`)[0]?.value;

  try {
    db.run(`UPDATE system_settings SET value = '2' WHERE key = 'maxFailedLoginAttempts'`);
    db.run(`DELETE FROM login_history WHERE username_attempted IN (?, ?, ?)`, ['__PIN_LOGIN__', 'PIN:admin', 'admin']);
    db.run(`UPDATE users SET pin_code = ? WHERE id = ?`, [pinHash, adminId]);

    assert.throws(() => AuthService.loginByPin('0000'), /PIN|إيقاف/);
    assert.throws(() => AuthService.loginByPin('0000'), /PIN|إيقاف/);
    assert.throws(() => AuthService.loginByPin('2468'), /إيقاف المحاولات/);

    db.run(`DELETE FROM login_history WHERE username_attempted IN (?, ?, ?)`, ['__PIN_LOGIN__', 'PIN:admin', 'admin']);
    db.run(`UPDATE system_settings SET value = '1' WHERE key = 'maxFailedLoginAttempts'`);
    assert.throws(() => AuthService.login('admin', 'wrong-password'));
    assert.throws(() => AuthService.loginByPin('2468'), /إيقاف المحاولات/);

    db.run(`DELETE FROM login_history WHERE username_attempted IN (?, ?, ?)`, ['__PIN_LOGIN__', 'PIN:admin', 'admin']);
    const user = AuthService.loginByPin('2468');
    assert.equal(user.mustChangePassword, true);
    AuthService.logout();
  } finally {
    AuthService.logout();
    db.run(`UPDATE users SET pin_code = NULL WHERE id = ?`, [adminId]);
    db.run(`DELETE FROM login_history WHERE username_attempted IN (?, ?, ?)`, ['__PIN_LOGIN__', 'PIN:admin', 'admin']);
    db.run(`UPDATE system_settings SET value = ? WHERE key = 'maxFailedLoginAttempts'`, [originalLimit ?? '5']);
  }
});
