const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registerLicenseHandlers } = require('../electron/licenseGuard');

test('license-mode IPC requires authorization before changing trusted state', async () => {
  const handlers = new Map();
  const authorizationAttempts = [];
  const guard = registerLicenseHandlers({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    validateIpcSender: (event) => {
      if (event?.trusted !== true) throw new Error('Unauthorized IPC caller');
    },
    appDataDir: 'unused-test-path',
    licenseMode: 'hardwa',
    authorizeLicenseModeChange: async (username, password) => {
      authorizationAttempts.push([username, password]);
      return username === 'admin' && password === 'current-password';
    },
  });

  guard.setLicenseMode = async (mode) => {
    guard.licenseMode = mode;
    return mode;
  };
  const setMode = handlers.get('license-mode:set');
  await assert.rejects(setMode(
    { trusted: true },
    { mode: 'account', username: 'operator', password: 'wrong-password' },
  ), /not authorized/i);
  assert.equal(guard.licenseMode, 'hardwa');

  assert.deepEqual(await setMode(
    { trusted: true },
    { mode: 'account', username: 'admin', password: 'current-password' },
  ), { ok: true, mode: 'account' });
  assert.equal(guard.licenseMode, 'account');
  assert.deepEqual(authorizationAttempts, [
    ['operator', 'wrong-password'],
    ['admin', 'current-password'],
  ]);
});
