'use strict';

process.env.NODE_ENV = 'test';
process.env.CENTRAL_DISABLE_STARTUP_CHECK = '1';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../app');
const { initDatabase, getDb, bootstrapDefaults, seedPlatformRBAC } = require('../lib/db');
const { initSigningKeys } = require('../lib/signing');
const { invalidatePermissionsCache } = require('../identity');
const { tempDbPath, removeDbFiles, startTestServer, api } = require('./helpers.cjs');

const dbPath = tempDbPath('license-admin');
let server;
let token;
let tenantId;
let planId;
let licenseId;

async function login(username, password) {
  const response = await api(server.base, '/api/v1/admin/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  assert.equal(response.status, 200, response.text);
  return response.body.data.token;
}

before(async () => {
  await initDatabase({ filename: dbPath });
  await initSigningKeys();
  await bootstrapDefaults({ initialPassword: 'admin-test-pass' });
  await seedPlatformRBAC();
  invalidatePermissionsCache();
  server = await startTestServer(createApp());
  token = await login('admin', 'admin-test-pass');

  const plans = await api(server.base, '/api/v1/admin/plans', { token });
  planId = plans.body.data?.[0]?.id ?? plans.body[0]?.id;
  assert.ok(planId, 'expected a seeded plan');

  const tenant = await api(server.base, '/api/v1/admin/tenants', {
    method: 'POST', token,
    body: { name: 'License Admin Tenant', code: `LAT${Date.now().toString(36).toUpperCase()}` },
  });
  assert.equal(tenant.status, 201, tenant.text);
  tenantId = tenant.body.data.id;
});

after(async () => {
  await server?.close();
  await getDb().close();
  removeDbFiles(dbPath);
});

test('issue license records an ISSUE change entry', async () => {
  const res = await api(server.base, '/api/v1/admin/licenses/issue', {
    method: 'POST', token,
    body: { tenantId, planId, months: 12, seats: 5, hardwareId: 'HW-ADMIN-1' },
  });
  assert.equal(res.status, 201, res.text);
  licenseId = res.body.data.license.id;
  assert.ok(licenseId);

  const changes = await api(server.base, `/api/v1/admin/licenses/${licenseId}/changes`, { token });
  assert.equal(changes.status, 200, changes.text);
  assert.ok(Array.isArray(changes.body.data ?? changes.body));
  const rows = changes.body.data ?? changes.body;
  assert.ok(rows.some((row) => row.change_type === 'ISSUE' || row.changeType === 'ISSUE'));
});

test('PATCH license succeeds and records UPDATE change (CHECK regression)', async () => {
  const res = await api(server.base, `/api/v1/admin/licenses/${licenseId}`, {
    method: 'PATCH', token,
    body: { seats: 8, notes: 'updated via admin' },
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data?.license?.seats ?? res.body.license?.seats, 8);

  const changes = await api(server.base, `/api/v1/admin/licenses/${licenseId}/changes`, { token });
  const rows = changes.body.data ?? changes.body;
  assert.ok(rows.some((row) => (row.change_type ?? row.changeType) === 'UPDATE'));
});

test('suspend and reactivate record STATUS changes without 500', async () => {
  const suspended = await api(server.base, `/api/v1/admin/licenses/${licenseId}/suspend`, {
    method: 'POST', token, body: { reason: 'test suspend' },
  });
  assert.equal(suspended.status, 200, suspended.text);

  const reactivated = await api(server.base, `/api/v1/admin/licenses/${licenseId}/reactivate`, {
    method: 'POST', token, body: {},
  });
  assert.equal(reactivated.status, 200, reactivated.text);

  const changes = await api(server.base, `/api/v1/admin/licenses/${licenseId}/changes`, { token });
  const types = (changes.body.data ?? changes.body).map((row) => row.change_type ?? row.changeType);
  assert.ok(types.includes('SUSPEND'));
  assert.ok(types.includes('REACTIVATE'));
});

test('transfer unbind and rebind record TRANSFER/UNBIND changes', async () => {
  const unbind = await api(server.base, `/api/v1/admin/licenses/${licenseId}/transfer`, {
    method: 'POST', token,
    body: { newHardwareId: '', reason: 'unbind test' },
  });
  assert.equal(unbind.status, 200, unbind.text);
  assert.equal(unbind.body.data?.unbound ?? unbind.body.unbound, true);

  const rebind = await api(server.base, `/api/v1/admin/licenses/${licenseId}/transfer`, {
    method: 'POST', token,
    body: { newHardwareId: 'HW-ADMIN-2', reason: 'rebind test' },
  });
  assert.equal(rebind.status, 200, rebind.text);

  const changes = await api(server.base, `/api/v1/admin/licenses/${licenseId}/changes`, { token });
  const rows = changes.body.data ?? changes.body;
  const types = rows.map((row) => row.change_type ?? row.changeType);
  assert.ok(types.includes('UNBIND'));
  assert.ok(types.includes('TRANSFER'));
});

test('device activate endpoint reactivates a suspended device', async () => {
  const devices = await api(server.base, `/api/v1/admin/devices?tenantId=${tenantId}`, { token });
  assert.equal(devices.status, 200, devices.text);
  const rows = devices.body.data ?? devices.body;
  const device = rows.find((d) => d.hardware_id === 'HW-ADMIN-2' || d.hardwareId === 'HW-ADMIN-2');
  assert.ok(device, 'expected a device row created by the license transfer');

  const suspended = await api(server.base, `/api/v1/admin/devices/${device.id}/suspend`, {
    method: 'POST', token, body: { reason: 'test' },
  });
  assert.equal(suspended.status, 200, suspended.text);

  const activated = await api(server.base, `/api/v1/admin/devices/${device.id}/activate`, {
    method: 'POST', token, body: { reason: 'test activate' },
  });
  assert.equal(activated.status, 200, activated.text);
  assert.equal((activated.body.data?.device ?? activated.body.device)?.status, 'ACTIVE');

  const again = await api(server.base, `/api/v1/admin/devices/${device.id}/activate`, {
    method: 'POST', token, body: {},
  });
  assert.equal(again.status, 400);
});

test('device credential enrollment stores only a hash', async () => {
  const devices = await api(server.base, `/api/v1/admin/devices?tenantId=${tenantId}`, { token });
  const rows = devices.body.data ?? devices.body;
  const device = rows.find((d) => (d.hardware_id ?? d.hardwareId) === 'HW-ADMIN-2');
  assert.ok(device);

  const enrolled = await api(server.base, `/api/v1/admin/devices/${device.id}/credential`, {
    method: 'PUT', token,
    body: { credential: 'super-secret-device-credential-123' },
  });
  assert.equal(enrolled.status, 200, enrolled.text);
  assert.equal(enrolled.body.data?.credentialEnrolled ?? enrolled.body.credentialEnrolled, true);

  const db = getDb();
  const row = await db.get('SELECT credential_hash FROM platform_devices WHERE id = ?', [device.id]);
  assert.ok(row.credential_hash);
  assert.notEqual(row.credential_hash, 'super-secret-device-credential-123');
});
