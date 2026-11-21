'use strict';

process.env.NODE_ENV = 'test';
process.env.CENTRAL_DISABLE_STARTUP_CHECK = '1';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { createApp } = require('../app');
const { initDatabase, getDb, bootstrapDefaults, seedPlatformRBAC } = require('../lib/db');
const { initSigningKeys } = require('../lib/signing');
const { invalidatePermissionsCache } = require('../identity');
const { tempDbPath, removeDbFiles, startTestServer, api } = require('./helpers.cjs');

const dbPath = tempDbPath('usershub');
let server;
let token;
let tenantId;
let tenantUserId;
let staffId;

async function login() {
  const response = await api(server.base, '/api/v1/admin/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin-test-pass' },
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data.token;
}

before(async () => {
  await initDatabase({ filename: dbPath });
  await initSigningKeys();
  await bootstrapDefaults({ initialPassword: 'admin-test-pass' });
  await seedPlatformRBAC();
  invalidatePermissionsCache();
  server = await startTestServer(createApp());
  token = await login();

  const db = getDb();
  const now = new Date().toISOString();
  tenantId = `tnt_${crypto.randomUUID().slice(0, 8)}`;
  await db.run(
    `INSERT INTO platform_tenants (id, code, name, status, created_at, updated_at) VALUES (?, 'HUB', 'Hub Tenant', 'ACTIVE', ?, ?)`,
    [tenantId, now, now]
  );
});

after(async () => {
  await server?.close();
  await getDb().close();
  removeDbFiles(dbPath);
});

test('admin-control staff lifecycle runs on platform_users', async () => {
  // Create without a password → server generates a temporary one.
  const created = await api(server.base, '/api/v1/admin/admin-control/staff', {
    method: 'POST',
    token,
    body: { fullName: 'Hub Staff Member', email: 'hub.staff@example.com', role: 'SUPPORT_AGENT' },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  staffId = created.body.data.id;
  assert.ok(created.body.data.username, 'username should be generated from email');
  assert.ok(created.body.data.temporaryPassword, 'temporary password should be returned');
  assert.equal(created.body.data.fullName, 'Hub Staff Member');
  assert.equal(created.body.data.isActive, true);

  // Row really lives in platform_users with a password hash + must_change flag.
  const row = await getDb().get('SELECT * FROM platform_users WHERE id = ?', [staffId]);
  assert.ok(row?.password_hash, 'platform_users row must carry a password hash');
  assert.equal(row.must_change_password, 1);

  // A second owner can never be minted.
  const secondOwner = await api(server.base, '/api/v1/admin/admin-control/staff', {
    method: 'POST',
    token,
    body: { fullName: 'Second Owner', email: 'owner2@example.com', role: 'SUPER_ADMIN' },
  });
  assert.equal(secondOwner.status, 409);

  // List returns camelCase rows including the new staff member.
  const list = await api(server.base, '/api/v1/admin/admin-control/staff?search=hub.staff', { token });
  assert.equal(list.status, 200);
  const found = list.body.data.find((s) => s.id === staffId);
  assert.ok(found, 'staff list should include the created member');
  assert.equal(found.email, 'hub.staff@example.com');

  // Deactivate then delete.
  const off = await api(server.base, `/api/v1/admin/admin-control/staff/${staffId}`, {
    method: 'PUT', token, body: { isActive: false },
  });
  assert.equal(off.status, 200);
  assert.equal(off.body.data.isActive, false);

  const del = await api(server.base, `/api/v1/admin/admin-control/staff/${staffId}`, {
    method: 'DELETE', token,
  });
  assert.equal(del.status, 200);
  const gone = await getDb().get('SELECT deleted_at FROM platform_users WHERE id = ?', [staffId]);
  assert.ok(gone?.deleted_at, 'staff delete must soft-delete platform_users');
});

test('unified users overview aggregates staff and tenant users', async () => {
  // Seed one tenant directory user through the tenants API.
  const created = await api(server.base, `/api/v1/admin/tenants/${tenantId}/users`, {
    method: 'POST',
    token,
    body: { fullName: 'Hub Tenant User', provisioningMode: 'DIRECT_CREATE' },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  tenantUserId = created.body.data.user.id;

  const res = await api(server.base, '/api/v1/admin/admin-control/users/overview', { token });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const data = res.body.data;
  assert.ok(data.staff.total >= 1, 'staff total should count platform_users');
  assert.ok(data.tenantUsers.total >= 1, 'tenantUsers total should count directory users');
  assert.ok(data.tenantUsers.byStatus.ACTIVE >= 1);
  assert.ok(Array.isArray(data.recentEvents));
});

test('unified search finds both staff and tenant users', async () => {
  const staffSearch = await api(server.base, '/api/v1/admin/admin-control/users/search?q=admin', { token });
  assert.equal(staffSearch.status, 200);
  assert.ok(staffSearch.body.data.staff.length >= 1, 'should find the owner account');

  const tenantSearch = await api(server.base, '/api/v1/admin/admin-control/users/search?q=Hub%20Tenant%20User', { token });
  assert.equal(tenantSearch.status, 200);
  const hit = tenantSearch.body.data.tenantUsers.find((u) => u.id === tenantUserId);
  assert.ok(hit, 'search should find the tenant directory user');
  assert.equal(hit.tenantName, 'Hub Tenant');
});

test('tenant user detail returns provisioning jobs and audit events', async () => {
  const res = await api(server.base, `/api/v1/admin/admin-control/users/tenant/${tenantUserId}`, { token });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const data = res.body.data;
  assert.equal(data.user.id, tenantUserId);
  assert.equal(data.tenant.id, tenantId);
  assert.ok(Array.isArray(data.jobs));
  assert.ok(Array.isArray(data.events));
});

test('staff detail returns roles, grants and login attempts', async () => {
  const res = await api(server.base, '/api/v1/admin/admin-control/users/staff/usr_admin', { token });
  // The seeded owner id may differ — resolve it dynamically if 404.
  if (res.status === 404) {
    const list = await api(server.base, '/api/v1/admin/admin-control/staff', { token });
    const owner = list.body.data.find((s) => s.role === 'SUPER_ADMIN');
    assert.ok(owner, 'expected an owner staff row');
    const retry = await api(server.base, `/api/v1/admin/admin-control/users/staff/${owner.id}`, { token });
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.ok(Array.isArray(retry.body.data.roles));
    assert.ok(Array.isArray(retry.body.data.recentLogins));
    return;
  }
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body.data.roles));
  assert.ok(Array.isArray(res.body.data.recentLogins));
});
