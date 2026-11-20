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

const dbPath = tempDbPath('ip-bans');
let server;
let token;

async function login() {
  const response = await api(server.base, '/api/v1/admin/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin-test-pass' },
  });
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
});

after(async () => {
  await server?.close();
  await getDb().close();
  removeDbFiles(dbPath);
});

test('ip-bans CRUD validates input and lifts bans', async () => {
  const bad = await api(server.base, '/api/v1/admin/security/ip-bans', {
    method: 'POST', token, body: { ipAddress: 'not-an-ip' },
  });
  assert.equal(bad.status, 400);

  const loopback = await api(server.base, '/api/v1/admin/security/ip-bans', {
    method: 'POST', token, body: { ipAddress: '127.0.0.1' },
  });
  assert.equal(loopback.status, 400);

  const created = await api(server.base, '/api/v1/admin/security/ip-bans', {
    method: 'POST', token,
    body: { ipAddress: '198.51.100.7', reason: 'test ban' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.ip_address, '198.51.100.7');
  const banId = created.body.data.id;

  const dup = await api(server.base, '/api/v1/admin/security/ip-bans', {
    method: 'POST', token, body: { ipAddress: '198.51.100.7' },
  });
  assert.equal(dup.status, 409);

  const cidr = await api(server.base, '/api/v1/admin/security/ip-bans', {
    method: 'POST', token, body: { ipAddress: '203.0.113.0/24' },
  });
  assert.equal(cidr.status, 201);

  const list = await api(server.base, '/api/v1/admin/security/ip-bans?active=1', { token });
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((b) => b.id === banId));

  const lifted = await api(server.base, `/api/v1/admin/security/ip-bans/${banId}/lift`, {
    method: 'POST', token,
  });
  assert.equal(lifted.status, 200);
  assert.equal(lifted.body.data.is_active, 0);

  const relift = await api(server.base, `/api/v1/admin/security/ip-bans/${banId}/lift`, {
    method: 'POST', token,
  });
  assert.equal(relift.status, 409);
});

test('active ban blocks all api requests from that IP until lifted', async () => {
  const db = getDb();
  // Insert directly: the test client always connects from 127.0.0.1, which the
  // ban route refuses to create (loopback guard).
  await db.run(
    `INSERT INTO platform_ip_bans (id, ip_address, reason, is_active, created_at, updated_at)
     VALUES ('ipban_test_local', '127.0.0.1', 'test', 1, datetime('now'), datetime('now'))`
  );

  try {
    const blocked = await api(server.base, '/api/v1/admin/security/ip-bans', { token });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'IP_BANNED');

    // /health stays reachable even for banned IPs.
    const health = await api(server.base, '/api/v1/health');
    assert.equal(health.status, 200);
  } finally {
    await db.run(`UPDATE platform_ip_bans SET is_active = 0 WHERE id = 'ipban_test_local'`);
  }

  const after = await api(server.base, '/api/v1/admin/security/ip-bans?active=1', { token });
  assert.equal(after.status, 200);
});

test('expired bans are not enforced', async () => {
  const db = getDb();
  await db.run(
    `INSERT INTO platform_ip_bans (id, ip_address, reason, is_active, expires_at, created_at, updated_at)
     VALUES ('ipban_test_expired', '127.0.0.1', 'test', 1, '2000-01-01T00:00:00.000Z', datetime('now'), datetime('now'))`
  );
  try {
    const res = await api(server.base, '/api/v1/admin/security/ip-bans?active=1', { token });
    assert.equal(res.status, 200);
  } finally {
    await db.run(`DELETE FROM platform_ip_bans WHERE id = 'ipban_test_expired'`);
  }
});
