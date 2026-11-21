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

const dbPath = tempDbPath('subscriptions');
let server;
let token;
let planId;

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

before(async () => {
  await initDatabase({ filename: dbPath });
  await initSigningKeys();
  await bootstrapDefaults({ initialPassword: 'admin-test-pass' });
  await seedPlatformRBAC();
  invalidatePermissionsCache();
  server = await startTestServer(createApp());
  token = await login('admin', 'admin-test-pass');
  const plans = await api(server.base, '/api/v1/admin/plans', { token });
  assert.equal(plans.status, 200, plans.text);
  planId = plans.body[0]?.id ?? plans.body.data?.[0]?.id;
  assert.ok(planId, 'expected at least one seeded plan');
});

after(async () => {
  await server?.close();
  await getDb().close();
  removeDbFiles(dbPath);
});

test('create subscription issues license and updates tenant', async () => {
  const tenantId = await createTenant('Sub Create', 'SUBCREATE');
  const res = await api(server.base, '/api/v1/admin/subscriptions', {
    method: 'POST', token,
    body: { tenantId, planId, seats: 7, price: 1200, autoRenew: true },
  });
  assert.equal(res.status, 201, res.text);
  const data = res.body.data;
  assert.equal(data.tenantId, tenantId);
  assert.equal(data.planId, planId);
  assert.equal(data.status, 'ACTIVE');
  assert.ok(data.subscriptionId);
  assert.ok(data.licenseId);
  assert.ok(data.endDate);

  const list = await api(server.base, '/api/v1/admin/subscriptions?search=SUBCREATE', { token });
  assert.equal(list.status, 200, list.text);
  const row = (list.body.data || []).find((s) => s.tenantId === tenantId);
  assert.ok(row, 'created subscription should appear in list');
  assert.equal(row.status, 'ACTIVE');
  assert.equal(row.seats, 7);
});

test('trial subscription is created with TRIAL status and short end date', async () => {
  const tenantId = await createTenant('Sub Trial', 'SUBTRIAL');
  const res = await api(server.base, '/api/v1/admin/subscriptions/trial', {
    method: 'POST', token,
    body: { tenantId, planId, trialDays: 14, seats: 3 },
  });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.data.status, 'TRIAL');
  const days = (new Date(res.body.data.endDate) - Date.now()) / 86400000;
  assert.ok(days > 10 && days < 20, `trial should last ~14 days, got ${days}`);
});

test('suspend and resume flip subscription and license status', async () => {
  const tenantId = await createTenant('Sub Suspend', 'SUBSUSP');
  const created = await api(server.base, '/api/v1/admin/subscriptions', {
    method: 'POST', token,
    body: { tenantId, planId },
  });
  assert.equal(created.status, 201, created.text);

  const suspended = await api(server.base, `/api/v1/admin/subscriptions/${tenantId}/suspend`, {
    method: 'POST', token,
    body: { reason: 'test suspend' },
  });
  assert.equal(suspended.status, 200, suspended.text);
  assert.equal(suspended.body.data.status, 'SUSPENDED');
  assert.equal(suspended.body.data.affectedSubscriptions, 1);

  const db = getDb();
  const lic = await db.get(`SELECT status FROM platform_licenses WHERE tenant_id = ?`, [tenantId]);
  assert.equal(lic.status, 'SUSPENDED');

  const resumed = await api(server.base, `/api/v1/admin/subscriptions/${tenantId}/resume`, {
    method: 'POST', token,
    body: {},
  });
  assert.equal(resumed.status, 200, resumed.text);
  assert.equal(resumed.body.data.status, 'ACTIVE');
});

test('PATCH updates autoRenew, seats and branchesLimit', async () => {
  const tenantId = await createTenant('Sub Patch', 'SUBPATCH');
  await api(server.base, '/api/v1/admin/subscriptions', {
    method: 'POST', token,
    body: { tenantId, planId, seats: 2 },
  });

  const res = await api(server.base, `/api/v1/admin/subscriptions/${tenantId}`, {
    method: 'PATCH', token,
    body: { autoRenew: false, seats: 9, branchesLimit: 4 },
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.updated, true);

  const list = await api(server.base, `/api/v1/admin/subscriptions?search=SUBPATCH`, { token });
  const row = (list.body.data || []).find((s) => s.tenantId === tenantId);
  assert.equal(row.autoRenew, false);
  assert.equal(row.seats, 9);
  assert.equal(row.branchesLimit, 4);
});

test('history endpoint returns recorded subscription changes', async () => {
  const tenantId = await createTenant('Sub History', 'SUBHIST');
  const created = await api(server.base, '/api/v1/admin/subscriptions', {
    method: 'POST', token,
    body: { tenantId, planId },
  });
  assert.equal(created.status, 201, created.text);

  await api(server.base, `/api/v1/admin/subscriptions/${tenantId}/suspend`, {
    method: 'POST', token, body: { reason: 'hist test' },
  });

  const hist = await api(server.base, `/api/v1/admin/subscriptions/${tenantId}/history`, { token });
  assert.equal(hist.status, 200, hist.text);
  assert.ok(Array.isArray(hist.body.data));
  assert.ok(hist.body.data.length >= 2, 'expected CREATE + SUSPEND entries');
  const types = hist.body.data.map((r) => r.changeType);
  assert.ok(types.includes('CREATE'));
  assert.ok(types.includes('SUSPEND'));
});

test('subscription endpoints reject missing tenant or plan', async () => {
  const noTenant = await api(server.base, '/api/v1/admin/subscriptions', {
    method: 'POST', token,
    body: { planId },
  });
  assert.equal(noTenant.status, 400);

  const badTenant = await api(server.base, '/api/v1/admin/subscriptions', {
    method: 'POST', token,
    body: { tenantId: 'ten_nonexistent', planId },
  });
  assert.equal(badTenant.status, 404);
});
