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

const dbPath = tempDbPath('auth');
let server;

async function login(username, password) {
  const response = await api(server.base, '/api/v1/admin/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  return response;
}

before(async () => {
  await initDatabase({ filename: dbPath });
  await initSigningKeys();
  await bootstrapDefaults({ initialPassword: 'admin-test-pass' });
  await seedPlatformRBAC();
  invalidatePermissionsCache();

  server = await startTestServer(createApp());
});

after(async () => {
  await server?.close();
  await getDb().close();
  removeDbFiles(dbPath);
});

test('health and public key are available without authentication', async () => {
  const health = await api(server.base, '/api/v1/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.match(health.headers.get('x-request-id') || '', /^[a-zA-Z0-9._:-]{8,120}$/);

  const publicKey = await api(server.base, '/api/v1/configuration/public-key');
  assert.equal(publicKey.status, 200);
  assert.ok(publicKey.body.publicKey);
  assert.ok(publicKey.body.keyId);
});

test('login rejects bad credentials and issues a session token', async () => {
  const wrong = await login('admin', 'definitely-wrong');
  assert.equal(wrong.status, 401);

  const ok = await login('admin', 'admin-test-pass');
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.equal(ok.body.admin.username, 'admin');
  assert.ok(ok.body.admin.permissions.includes('*'));

  const me = await api(server.base, '/api/v1/admin/auth/me', { token: ok.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.admin.username, 'admin');
});

test('protected routes require authentication and permissions', async () => {
  const anonymous = await api(server.base, '/api/v1/admin/tenants');
  assert.equal(anonymous.status, 401);

  const admin = await login('admin', 'admin-test-pass');
  const token = admin.body.token;

  const list = await api(server.base, '/api/v1/admin/tenants', { token });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body, []);

  const created = await api(server.base, '/api/v1/admin/tenants', {
    method: 'POST',
    token,
    body: { name: 'Gallery One', code: 'GALONE' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.code, 'GALONE');

  const staff = await api(server.base, '/api/v1/admin/staff', {
    method: 'POST',
    token,
    body: { username: 'support1', password: 'support-pass-1', fullName: 'Support One', role: 'SUPPORT_AGENT' },
  });
  assert.equal(staff.status, 201);

  const supportLogin = await login('support1', 'support-pass-1');
  assert.equal(supportLogin.status, 200);
  const supportToken = supportLogin.body.token;

  const allowed = await api(server.base, '/api/v1/admin/tenants', { token: supportToken });
  assert.equal(allowed.status, 200, 'support agent can view tenants');

  const forbiddenTenantWrite = await api(server.base, '/api/v1/admin/tenants', {
    method: 'POST',
    token: supportToken,
    body: { name: 'Nope', code: 'NOPE' },
  });
  assert.equal(forbiddenTenantWrite.status, 403);

  const forbiddenStaff = await api(server.base, '/api/v1/admin/staff', { token: supportToken });
  assert.equal(forbiddenStaff.status, 403);

  const forbiddenAudit = await api(server.base, '/api/v1/admin/audit', { token: supportToken });
  assert.equal(forbiddenAudit.status, 403);

  const deniedAudit = await getDb().get(
    `SELECT COUNT(*) AS count FROM platform_audit_events WHERE action = 'ACCESS_DENIED'`
  );
  assert.ok(Number(deniedAudit.count) > 0, 'denied attempts are audited');
});

test('permission catalog exposes sections, pages and roles', async () => {
  const admin = await login('admin', 'admin-test-pass');
  const catalog = await api(server.base, '/api/v1/admin/permissions/catalog', { token: admin.body.token });

  assert.equal(catalog.status, 200);
  assert.ok(catalog.body.data.permissions.length > 0);
  assert.ok(catalog.body.data.pages.some((page) => page.path === '/platform/tenants'));
  assert.ok(catalog.body.data.roles.some((role) => role.code === 'SUPPORT_AGENT'));
  assert.ok(catalog.body.requestId);
});

test('logout invalidates the session immediately', async () => {
  const admin = await login('admin', 'admin-test-pass');
  const token = admin.body.token;

  const logout = await api(server.base, '/api/v1/admin/auth/logout', { method: 'POST', token });
  assert.equal(logout.status, 200);

  const me = await api(server.base, '/api/v1/admin/auth/me', { token });
  assert.equal(me.status, 401);
});
