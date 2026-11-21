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

const dbPath = tempDbPath('tenant-api');
let server;
let token;
let tenantA;
let tenantB;
let keyA;
let keyB;

async function login(username, password) {
  const response = await api(server.base, '/api/v1/admin/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  assert.equal(response.status, 200, response.text);
  return response.body.data.token;
}

async function createTenant(name, code) {
  const response = await api(server.base, '/api/v1/admin/tenants', {
    method: 'POST', token,
    body: { name, code },
  });
  assert.equal(response.status, 201, response.text);
  return response.body.data.id;
}

async function tenantApi(pathname, key) {
  return api(server.base, pathname, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
}

before(async () => {
  await initDatabase({ filename: dbPath });
  await initSigningKeys();
  await bootstrapDefaults({ initialPassword: 'admin-test-pass' });
  await seedPlatformRBAC();
  invalidatePermissionsCache();
  server = await startTestServer(createApp());
  token = await login('admin', 'admin-test-pass');
  tenantA = await createTenant('API Tenant A', 'APITENA');
  tenantB = await createTenant('API Tenant B', 'APITENB');
});

after(async () => {
  await server?.close();
  await getDb().close();
  removeDbFiles(dbPath);
});

test('tenant API key creation returns plaintext once and lists without it', async () => {
  const created = await api(server.base, `/api/v1/admin/tenants/${tenantA}/api-keys`, {
    method: 'POST', token,
    body: { name: 'integration', scopes: ['read'], expiresInDays: 30 },
  });
  assert.equal(created.status, 201, created.text);
  const data = created.body.data ?? created.body;
  assert.match(data.key, /^pk_[a-f0-9]{32,}$/);
  assert.equal(data.tenantId, tenantA);
  keyA = data.key;

  const list = await api(server.base, `/api/v1/admin/tenants/${tenantA}/api-keys`, { token });
  assert.equal(list.status, 200, list.text);
  const rows = list.body.data ?? list.body;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'integration');
  assert.equal(rows[0].key, undefined, 'plaintext must never be listed');
  assert.equal(rows[0].keyHash, undefined);
});

test('tenant API rejects missing, malformed and platform keys', async () => {
  assert.equal((await tenantApi('/api/v1/tenant/v1/me')).status, 401);
  assert.equal((await tenantApi('/api/v1/tenant/v1/me', 'pk_deadbeef')).status, 401);

  // Platform staff key (no tenant_id) must be rejected on the tenant surface.
  const staff = await api(server.base, '/api/v1/admin/security/api-keys', {
    method: 'POST', token,
    body: { name: 'staff-key' },
  });
  assert.equal(staff.status, 201, staff.text);
  const staffKey = (staff.body.data ?? staff.body).key;
  assert.ok(staffKey);
  const denied = await tenantApi('/api/v1/tenant/v1/me', staffKey);
  assert.equal(denied.status, 403, denied.text);
});

test('tenant API serves only the key owner tenant data', async () => {
  const meA = await tenantApi('/api/v1/tenant/v1/me', keyA);
  assert.equal(meA.status, 200, meA.text);
  const payloadA = meA.body.data ?? meA.body;
  assert.equal(payloadA.tenant.id, tenantA);
  assert.equal(payloadA.apiKey.name, 'integration');

  // Second tenant gets its own key; each sees only itself.
  const createdB = await api(server.base, `/api/v1/admin/tenants/${tenantB}/api-keys`, {
    method: 'POST', token,
    body: { name: 'b-key' },
  });
  assert.equal(createdB.status, 201, createdB.text);
  keyB = (createdB.body.data ?? createdB.body).key;
  const meB = await tenantApi('/api/v1/tenant/v1/me', keyB);
  assert.equal(meB.status, 200, meB.text);
  assert.equal((meB.body.data ?? meB.body).tenant.id, tenantB);

  for (const path of ['/subscription', '/licenses', '/usage', '/devices', '/entitlements']) {
    const res = await tenantApi(`/api/v1/tenant/v1${path}`, keyA);
    assert.equal(res.status, 200, `${path}: ${res.text}`);
  }
});

test('revoked tenant API key stops working immediately', async () => {
  const list = await api(server.base, `/api/v1/admin/tenants/${tenantB}/api-keys`, { token });
  const keyId = (list.body.data ?? list.body)[0].id;
  const revoked = await api(server.base, `/api/v1/admin/tenants/${tenantB}/api-keys/${keyId}`, {
    method: 'DELETE', token,
  });
  assert.equal(revoked.status, 200, revoked.text);
  assert.equal((await tenantApi('/api/v1/tenant/v1/me', keyB)).status, 401);
});

test('tenant API key endpoints enforce tenant scoping', async () => {
  // A key id belonging to tenant A must not be revocable via tenant B's path.
  const listA = await api(server.base, `/api/v1/admin/tenants/${tenantA}/api-keys`, { token });
  const keyIdA = (listA.body.data ?? listA.body)[0].id;
  const cross = await api(server.base, `/api/v1/admin/tenants/${tenantB}/api-keys/${keyIdA}`, {
    method: 'DELETE', token,
  });
  assert.equal(cross.status, 404, cross.text);
});
