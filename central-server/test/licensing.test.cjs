'use strict';

process.env.NODE_ENV = 'test';
process.env.CENTRAL_DISABLE_STARTUP_CHECK = '1';
// Pin the activation brute-force limits low so the rate-limit path is
// exercised without hundreds of requests; the IP ceiling stays high because
// every test shares 127.0.0.1.
process.env.ACTIVATION_RATE_LIMIT_USERNAME_MAX = '2';
process.env.ACTIVATION_RATE_LIMIT_IP_MAX = '100';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const { createApp } = require('../app');
const { initDatabase, getDb, bootstrapDefaults, seedPlatformRBAC } = require('../lib/db');
const { initSigningKeys } = require('../lib/signing');
const { invalidatePermissionsCache } = require('../identity');
const { tempDbPath, removeDbFiles, startTestServer, api } = require('./helpers.cjs');

const dbPath = tempDbPath('licensing');

let server;
const PASSWORD = 'client-pass-123';
const CODE = 'AAAA-BBBB-CCCC';

async function post(routePath, body) {
  return api(server.base, routePath, { method: 'POST', body });
}

before(async () => {
  await initDatabase({ filename: dbPath });
  await initSigningKeys();
  await bootstrapDefaults({ initialPassword: 'admin-test-pass' });
  await seedPlatformRBAC();
  invalidatePermissionsCache();
  server = await startTestServer(createApp());

  const db = getDb();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO platform_plans (id, code, name, devices_limit, created_at, updated_at)
     VALUES ('plan_basic', 'BASIC', 'Basic', 10, ?, ?)`,
    [now, now]
  );
  await db.run(
    `INSERT INTO platform_tenants (id, code, name, status, plan_id, devices_limit, created_at, updated_at)
     VALUES ('tnt_client', 'CLT', 'Client Co', 'ACTIVE', 'plan_basic', 10, ?, ?)`,
    [now, now]
  );
  await db.run(
    `INSERT INTO platform_tenant_accounts
       (id, tenant_id, username, full_name, password_hash, is_active, activation_code, created_at, updated_at)
     VALUES ('tacc_1', 'tnt_client', 'client.user', 'Client User', ?, 1, ?, ?, ?)`,
    [await bcrypt.hash(PASSWORD, 10), CODE, now, now]
  );
  // A suspended tenant for the negative path.
  await db.run(
    `INSERT INTO platform_tenants (id, code, name, status, plan_id, devices_limit, created_at, updated_at)
     VALUES ('tnt_susp', 'SUS', 'Suspended Co', 'SUSPENDED', 'plan_basic', 5, ?, ?)`,
    [now, now]
  );
  await db.run(
    `INSERT INTO platform_tenant_accounts
       (id, tenant_id, username, full_name, password_hash, is_active, activation_code, created_at, updated_at)
     VALUES ('tacc_2', 'tnt_susp', 'susp.user', 'Suspended', ?, 1, 'SSSS-DDDD-EEEE', ?, ?)`,
    [await bcrypt.hash(PASSWORD, 10), now, now]
  );
  // Single-device tenant for the limit path (tenant limit 1 < plan limit 10).
  await db.run(
    `INSERT INTO platform_tenants (id, code, name, status, plan_id, devices_limit, created_at, updated_at)
     VALUES ('tnt_limited', 'LIM', 'Limited Co', 'ACTIVE', 'plan_basic', 1, ?, ?)`,
    [now, now]
  );
  await db.run(
    `INSERT INTO platform_tenant_accounts
       (id, tenant_id, username, full_name, password_hash, is_active, activation_code, created_at, updated_at)
     VALUES ('tacc_3', 'tnt_limited', 'lim.user', 'Limited', ?, 1, 'L1M1-T3ST-C0DE', ?, ?)`,
    [await bcrypt.hash(PASSWORD, 10), now, now]
  );
});

after(async () => {
  if (server) await server.close();
  removeDbFiles(dbPath);
});

test('activate enrolls the device and returns a one-time credential', async () => {
  const res = await post('/api/v1/licensing/activate', {
    activationCode: CODE.toLowerCase(),
    account: 'client.user',
    password: PASSWORD,
    phone: '01000000000',
    deviceId: 'hw-device-1',
    deviceName: 'Branch PC',
    os: 'win32',
    appVersion: '1.0.0',
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.deviceCredential, 'deviceCredential must be returned once');
  assert.equal(res.body.data.tenantId, 'tnt_client');
  assert.equal(res.body.data.localAccount.username, 'client.user');

  const db = getDb();
  const device = await db.get(`SELECT * FROM platform_devices WHERE hardware_id = 'hw-device-1'`);
  assert.ok(device, 'device row must be enrolled');
  assert.equal(device.tenant_id, 'tnt_client');
  assert.equal(device.status, 'ACTIVE');
  assert.notEqual(device.credential_hash, res.body.data.deviceCredential, 'only the hash is stored');
});

test('validate accepts the issued credential and rejects wrong ones', async () => {
  const activate = await post('/api/v1/licensing/activate', {
    activationCode: CODE, account: 'client.user', password: PASSWORD,
    deviceId: 'hw-device-2',
  });
  assert.equal(activate.status, 200);
  const credential = activate.body.data.deviceCredential;

  const ok = await post('/api/v1/licensing/validate', { deviceId: 'hw-device-2', deviceCredential: credential });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.valid, true);

  const bad = await post('/api/v1/licensing/validate', { deviceId: 'hw-device-2', deviceCredential: 'forged' });
  assert.equal(bad.status, 401);

  const unknown = await post('/api/v1/licensing/validate', { deviceId: 'hw-ghost', deviceCredential: credential });
  assert.equal(unknown.status, 401);
});

test('heartbeat refreshes liveness for a valid device', async () => {
  const res = await post('/api/v1/licensing/heartbeat', {
    deviceId: 'hw-device-2', deviceCredential: 'wrong', appVersion: '9.9.9',
  });
  assert.equal(res.status, 401);

  // Re-activate to learn the current credential, then heartbeat.
  const again = await post('/api/v1/licensing/activate', {
    activationCode: CODE, account: 'client.user', password: PASSWORD,
    deviceId: 'hw-device-2', appVersion: '1.2.3',
  });
  assert.equal(again.status, 200);
  const beat = await post('/api/v1/licensing/heartbeat', {
    deviceId: 'hw-device-2', deviceCredential: again.body.data.deviceCredential, appVersion: '1.2.3',
  });
  assert.equal(beat.status, 200);
  assert.equal(beat.body.data.ok, true);
});

test('re-activation rotates the credential — the old one stops working', async () => {
  const first = await post('/api/v1/licensing/activate', {
    activationCode: CODE, account: 'client.user', password: PASSWORD, deviceId: 'hw-device-3',
  });
  const second = await post('/api/v1/licensing/activate', {
    activationCode: CODE, account: 'client.user', password: PASSWORD, deviceId: 'hw-device-3',
  });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.notEqual(first.body.data.deviceCredential, second.body.data.deviceCredential);

  const stale = await post('/api/v1/licensing/validate', {
    deviceId: 'hw-device-3', deviceCredential: first.body.data.deviceCredential,
  });
  assert.equal(stale.status, 401);
  const fresh = await post('/api/v1/licensing/validate', {
    deviceId: 'hw-device-3', deviceCredential: second.body.data.deviceCredential,
  });
  assert.equal(fresh.status, 200);
});

test('rejects bad credentials, suspended tenants and exhausted device limits', async () => {
  const badPassword = await post('/api/v1/licensing/activate', {
    activationCode: CODE, account: 'client.user', password: 'wrong', deviceId: 'hw-x',
  });
  assert.equal(badPassword.status, 401);

  const badAccount = await post('/api/v1/licensing/activate', {
    activationCode: CODE, account: 'someone.else', password: PASSWORD, deviceId: 'hw-x',
  });
  assert.equal(badAccount.status, 401);

  const badCode = await post('/api/v1/licensing/activate', {
    activationCode: 'ZZZZ-ZZZZ-ZZZZ', account: 'client.user', password: PASSWORD, deviceId: 'hw-x',
  });
  assert.equal(badCode.status, 401);

  const suspended = await post('/api/v1/licensing/activate', {
    activationCode: 'SSSS-DDDD-EEEE', account: 'susp.user', password: PASSWORD, deviceId: 'hw-susp',
  });
  assert.equal(suspended.status, 403);

  // tnt_limited allows exactly one device: the first activation succeeds and
  // any second distinct hardware id is refused.
  const first = await post('/api/v1/licensing/activate', {
    activationCode: 'L1M1-T3ST-C0DE', account: 'lim.user', password: PASSWORD, deviceId: 'hw-lim-1',
  });
  assert.equal(first.status, 200);
  const overLimit = await post('/api/v1/licensing/activate', {
    activationCode: 'L1M1-T3ST-C0DE', account: 'lim.user', password: PASSWORD, deviceId: 'hw-lim-2',
  });
  assert.equal(overLimit.status, 403);
});

test('activation credential guessing is rate limited per account', async () => {
  // 'client.user' already has 2 recorded ACTIVATION_FAILED attempts from the
  // previous test and USERNAME_MAX is pinned to 2, so the next attempt is
  // refused before the credentials are even checked.
  const res = await post('/api/v1/licensing/activate', {
    activationCode: CODE, account: 'client.user', password: PASSWORD, deviceId: 'hw-rl-1',
  });
  assert.equal(res.status, 429);
  assert.equal(res.body.code, 'USERNAME_RATE_LIMITED');
});
