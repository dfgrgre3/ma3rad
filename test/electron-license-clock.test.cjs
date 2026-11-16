const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const Module = require('node:module');

// licenseGuard.js loads safeStorage from Electron at module load time. Under
// `node --test` the `electron` package resolves to its executable-path shim, so
// inject a deterministic in-memory secure storage before requiring the guard.
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`enc:${value}`, 'utf8'),
  decryptString: (buffer) => {
    const raw = buffer.toString('utf8');
    if (!raw.startsWith('enc:')) throw new Error('tampered secure storage payload');
    return raw.slice(4);
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { safeStorage: fakeSafeStorage };
  return originalLoad.call(this, request, parent, isMain);
};
const { LicenseGuard } = require('../electron/licenseGuard');
Module._load = originalLoad;

const makeGuard = async (mode = 'account') => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-license-clock-'));
  const guard = new LicenseGuard(dir, { licenseMode: mode });
  return { dir, guard };
};

const writeClockMarker = async (guard, timestamp) => {
  await fs.writeFile(
    guard.timeCheckFile,
    fakeSafeStorage.encryptString(String(timestamp)),
  );
};

test('clock guard accepts a first run and records a monotonic marker', async () => {
  const { guard } = await makeGuard();
  const before = Date.now();
  const result = await guard.verifySystemClock();
  assert.equal(result.valid, true);

  const stored = fakeSafeStorage.decryptString(await fs.readFile(guard.timeCheckFile));
  const recorded = Number(stored);
  assert.ok(Number.isFinite(recorded) && recorded >= before);
  assert.ok(recorded <= Date.now());
});

test('clock guard tolerates small drift but fails closed on a rollback beyond 15 minutes', async () => {
  const { guard } = await makeGuard();

  // A manual clock adjustment of a few minutes forward is not tampering.
  await writeClockMarker(guard, Date.now() + 5 * 60 * 1000);
  assert.equal((await guard.verifySystemClock()).valid, true);

  // Turning the clock back more than the tolerance must fail closed.
  await writeClockMarker(guard, Date.now() + 60 * 60 * 1000);
  const rollback = await guard.verifySystemClock();
  assert.deepEqual(rollback, { valid: false, reason: 'clock_rollback_detected' });
});

test('clock guard fails closed when its marker is tampered with or unreadable', async () => {
  const { guard } = await makeGuard();
  await fs.writeFile(guard.timeCheckFile, Buffer.from('not-encrypted-by-os'));
  const tampered = await guard.verifySystemClock();
  assert.equal(tampered.valid, false);
  assert.equal(tampered.reason, 'clock_check_failed');

  await writeClockMarker(guard, 0);
  const invalid = await guard.verifySystemClock();
  assert.deepEqual(invalid, { valid: false, reason: 'invalid_clock_record' });
});

test('license loading refuses to run after a detected clock rollback even with a stored license', async () => {
  const { dir, guard } = await makeGuard('account');
  await fs.writeFile(path.join(dir, 'license.dat'), fakeSafeStorage.encryptString('{}'));
  await writeClockMarker(guard, Date.now() + 24 * 60 * 60 * 1000);

  const loaded = await guard.loadLicense();
  assert.equal(loaded.active, false);
  assert.equal(loaded.reason, 'clock_rollback_detected');
});

test('license loading fails closed when OS secure storage is unavailable', async () => {
  fakeSafeStorage.isEncryptionAvailable = () => false;
  try {
    const { guard } = await makeGuard();
    const result = await guard.verifySystemClock();
    assert.deepEqual(result, { valid: false, reason: 'secure_storage_unavailable' });
  } finally {
    fakeSafeStorage.isEncryptionAvailable = () => true;
  }
});
