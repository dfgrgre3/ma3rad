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

const dbPath = tempDbPath('plans');
let server;
let token;
let planId;
let planCode;

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
});

after(async () => {
  await server?.close();
  await getDb().close();
  removeDbFiles(dbPath);
});

test('create plan persists default flag, sort order and versioning', async () => {
  planCode = `T${Date.now().toString(36).toUpperCase()}`;
  const res = await api(server.base, '/api/v1/admin/plans', {
    method: 'POST', token,
    body: {
      code: planCode,
      name: 'خطة اختبار',
      price: 2500,
      monthlyPrice: 250,
      yearlyPrice: 2500,
      seatsLimit: 4,
      isDefault: true,
      sortOrder: 5,
      offlineGracePeriodDays: 21,
      versioned: true,
      initialChangeNote: 'الإصدار الأول',
    },
  });
  assert.equal(res.status, 201, res.text);
  const plan = res.body.data;
  planId = plan.id;
  assert.equal(plan.code, planCode);
  assert.equal(Number(plan.is_default), 1);
  assert.equal(Number(plan.sort_order), 5);
  assert.equal(Number(plan.versioned), 1);
  assert.equal(Number(plan.current_version), 1);
  assert.equal(Number(plan.offline_grace_period_days), 21);
  assert.equal(Number(plan.subscriber_count), 0);

  const versions = await api(server.base, `/api/v1/admin/plans/${planId}/versions`, { token });
  assert.equal(versions.status, 200, versions.text);
  assert.equal(versions.body.data.length, 1);
  assert.equal(versions.body.data[0].version, 1);
  assert.equal(versions.body.data[0].isCurrent, true);
});

test('setting another plan default unsets the previous one', async () => {
  const other = await api(server.base, '/api/v1/admin/plans', {
    method: 'POST', token,
    body: { code: `${planCode}B`, name: 'خطة ثانية', price: 100, isDefault: true },
  });
  assert.equal(other.status, 201, other.text);

  const first = await api(server.base, `/api/v1/admin/plans/${planId}`, { token });
  assert.equal(first.status, 200, first.text);
  assert.equal(Number(first.body.data.is_default), 0);
});

test('PUT on versioned plan snapshots a new version and records price history', async () => {
  const res = await api(server.base, `/api/v1/admin/plans/${planId}`, {
    method: 'PUT', token,
    body: { price: 3000, seatsLimit: 6, changeNote: 'رفع السعر' },
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(Number(res.body.data.current_version), 2);
  assert.equal(Number(res.body.data.price), 3000);

  const versions = await api(server.base, `/api/v1/admin/plans/${planId}/versions`, { token });
  assert.equal(versions.body.data.length, 2);
  const current = versions.body.data.find((v) => v.isCurrent);
  assert.equal(current.version, 2);
  assert.equal(current.changeNote, 'رفع السعر');

  const history = await api(server.base, `/api/v1/admin/plans/${planId}/price-history`, { token });
  assert.equal(history.status, 200, history.text);
  assert.ok(history.body.data.length >= 1);
  assert.equal(history.body.data[0].newPrice, 3000);
});

test('subscribers endpoint lists subscriptions with tenant names', async () => {
  const tenant = await api(server.base, '/api/v1/admin/tenants', {
    method: 'POST', token,
    body: { name: 'Plan Sub Tenant', code: `PST${Date.now().toString(36).toUpperCase()}` },
  });
  assert.equal(tenant.status, 201, tenant.text);
  const tenantId = tenant.body.data.id;

  const sub = await api(server.base, '/api/v1/admin/subscriptions', {
    method: 'POST', token,
    body: { tenantId, planId, seats: 2 },
  });
  assert.equal(sub.status, 201, sub.text);

  const subs = await api(server.base, `/api/v1/admin/plans/${planId}/subscribers`, { token });
  assert.equal(subs.status, 200, subs.text);
  const row = subs.body.data.find((s) => s.tenantId === tenantId);
  assert.ok(row, 'subscriber row missing');
  assert.equal(row.tenantName, 'Plan Sub Tenant');
  assert.equal(row.status, 'ACTIVE');

  const plan = await api(server.base, `/api/v1/admin/plans/${planId}`, { token });
  assert.ok(Number(plan.body.data.subscriber_count) >= 1);
});

test('deactivation-check reports active subscriptions', async () => {
  const check = await api(server.base, `/api/v1/admin/plans/${planId}/deactivation-check`, { token });
  assert.equal(check.status, 200, check.text);
  assert.equal(check.body.data.canDeactivate, false);
  assert.ok(check.body.data.activeSubscriptions >= 1);
});

test('impact-preview reports limit violations', async () => {
  const res = await api(server.base, `/api/v1/admin/plans/${planId}/impact-preview`, {
    method: 'POST', token,
    body: { seatsLimit: 1, branchesLimit: 1, devicesLimit: 1 },
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.planId, planId);
  assert.ok(res.body.data.affectedTenants >= 1);
});

test('upgrade rules upsert and list', async () => {
  const plans = await api(server.base, '/api/v1/admin/plans', { token });
  const other = plans.body.data.find((p) => p.id !== planId);
  assert.ok(other, 'need a second plan for rule test');

  const put = await api(server.base, '/api/v1/admin/plans/upgrade-rules', {
    method: 'PUT', token,
    body: { fromPlanId: planId, toPlanId: other.id, allowed: true, requiresApproval: true, upgradeFeePercent: 10, notes: 'test rule' },
  });
  assert.equal(put.status, 200, put.text);
  assert.equal(put.body.data.requiresApproval, true);
  assert.equal(put.body.data.upgradeFeePercent, 10);

  const list = await api(server.base, '/api/v1/admin/plans/upgrade-rules', { token });
  assert.equal(list.status, 200, list.text);
  assert.ok(list.body.data.some((r) => r.fromPlanId === planId && r.toPlanId === other.id));
});

test('copy plan duplicates config and upgrade rules', async () => {
  const res = await api(server.base, `/api/v1/admin/plans/${planId}/copy`, {
    method: 'POST', token,
    body: { code: `${planCode}C`, name: 'نسخة الخطة' },
  });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.body.data.plan.id);
  assert.ok(res.body.data.copiedRules >= 1);
  assert.equal(res.body.data.plan.is_default ?? res.body.data.plan.isDefault, 0);
});

test('delete is blocked while subscriptions exist, allowed after', async () => {
  const blocked = await api(server.base, `/api/v1/admin/plans/${planId}`, { method: 'DELETE', token });
  assert.equal(blocked.status, 409, blocked.text);

  const copyPlanId = (await api(server.base, '/api/v1/admin/plans', { token })).body.data
    .find((p) => p.code === `${planCode}C`)?.id;
  assert.ok(copyPlanId);
  const deleted = await api(server.base, `/api/v1/admin/plans/${copyPlanId}`, { method: 'DELETE', token });
  assert.equal(deleted.status, 200, deleted.text);

  const gone = await api(server.base, `/api/v1/admin/plans/${copyPlanId}`, { token });
  assert.equal(gone.status, 404);
});
