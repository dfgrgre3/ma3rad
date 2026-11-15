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

const dbPath = tempDbPath('notifications');
let server;

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

test('notification send validates input and records real delivery attempts', async () => {
  const login = await api(server.base, '/api/v1/admin/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin-test-pass' },
  });
  assert.equal(login.status, 200);
  const token = login.body.data.token;

  const unauthenticated = await api(server.base, '/api/v1/admin/notifications', { method: 'POST', body: { subject: 'x', message: 'y' } });
  assert.equal(unauthenticated.status, 401);

  const invalid = await api(server.base, '/api/v1/admin/notifications', {
    method: 'POST',
    token,
    body: { subject: 'تنبيه', message: '' },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.success, false);
  assert.equal(invalid.body.code, 'VALIDATION_ERROR');

  const send = await api(server.base, '/api/v1/admin/notifications', {
    method: 'POST',
    token,
    body: { tenantId: null, audience: 'ALL', channel: 'EMAIL', subject: 'تنبيه صيانة', message: 'سيتم الصيانة غدًا.' },
  });
  assert.equal(send.status, 201);
  assert.equal(send.body.success, true);
  assert.equal(send.body.data.notification.status, 'FAILED');
  assert.equal(send.body.data.deliveries.length, 1);
  assert.equal(send.body.data.deliveries[0].status, 'FAILED');
  assert.ok(send.body.data.deliveries[0].error);

  const listed = await api(server.base, '/api/v1/admin/notifications', { token });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.notifications.length, 1);
  assert.equal(listed.body.data.deliveries.length, 1);

  const inApp = await api(server.base, '/api/v1/admin/notifications', {
    method: 'POST',
    token,
    body: { tenantId: null, audience: 'ALL', channel: 'IN_APP', subject: 'مرحبًا', message: 'أهلاً بك.' },
  });
  assert.equal(inApp.status, 201);
  assert.equal(inApp.body.data.notification.status, 'SENT');
  assert.equal(inApp.body.data.deliveries[0].status, 'SENT');
});
