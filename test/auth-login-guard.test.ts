import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';

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
