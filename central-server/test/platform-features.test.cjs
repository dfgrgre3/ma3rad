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

const dbPath = tempDbPath('platform-features');
let server;
let token;
let tenantA;
let tenantB;

async function login() {
  const response = await api(server.base, '/api/v1/admin/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin-test-pass' },
  });
  return response.body.data.token;
}

async function createTenant(code, name) {
  const res = await api(server.base, '/api/v1/admin/tenants', {
    method: 'POST', token,
    body: { name, code },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}

before(async () => {
  await initDatabase({ filename: dbPath });
  await initSigningKeys();
  await bootstrapDefaults({ initialPassword: 'admin-test-pass' });
  await seedPlatformRBAC();
  invalidatePermissionsCache();
  server = await startTestServer(createApp());
  token = await login();
  tenantA = await createTenant('FEATA', 'Feature Tenant A');
  tenantB = await createTenant('FEATB', 'Feature Tenant B');
});

after(async () => {
  await server?.close();
  await getDb().close();
  removeDbFiles(dbPath);
});

// ── Maintenance windows ──────────────────────────────────────────────────────

test('maintenance windows: create, list with derived status, cancel', async () => {
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const futureEnd = new Date(Date.now() + 8 * 24 * 3600 * 1000).toISOString();
  const created = await api(server.base, '/api/v1/admin/operations/maintenance-windows', {
    method: 'POST', token,
    body: {
      title: 'ترقية قاعدة البيانات',
      description: 'صيانة مجدولة',
      startsAt: future,
      endsAt: futureEnd,
      affectedServices: ['api', 'sync'],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const window = created.body.data;
  assert.equal(window.status, 'SCHEDULED');
  assert.equal(window.title, 'ترقية قاعدة البيانات');
  assert.deepEqual(window.affectedServices, ['api', 'sync']);
  assert.ok(window.createdAt);

  // Invalid window: endsAt before startsAt.
  const bad = await api(server.base, '/api/v1/admin/operations/maintenance-windows', {
    method: 'POST', token,
    body: { title: 'x', startsAt: futureEnd, endsAt: future },
  });
  assert.equal(bad.status, 400);

  const list = await api(server.base, '/api/v1/admin/operations/maintenance-windows?status=SCHEDULED', { token });
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((w) => w.id === window.id));
  assert.ok(list.body.data.every((w) => w.status === 'SCHEDULED'));

  const cancelled = await api(server.base, `/api/v1/admin/operations/maintenance-windows/${window.id}/cancel`, {
    method: 'POST', token,
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.data.status, 'CANCELLED');

  // Already cancelled -> 409.
  const again = await api(server.base, `/api/v1/admin/operations/maintenance-windows/${window.id}/cancel`, {
    method: 'POST', token,
  });
  assert.equal(again.status, 409);

  const missing = await api(server.base, '/api/v1/admin/operations/maintenance-windows/mw_nope/cancel', {
    method: 'POST', token,
  });
  assert.equal(missing.status, 404);
});

test('maintenance windows: active window derives ACTIVE status on read', async () => {
  const started = new Date(Date.now() - 3600 * 1000).toISOString();
  const ends = new Date(Date.now() + 3600 * 1000).toISOString();
  const created = await api(server.base, '/api/v1/admin/operations/maintenance-windows', {
    method: 'POST', token,
    body: { title: 'صيانة جارية', startsAt: started, endsAt: ends },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, 'ACTIVE');

  const list = await api(server.base, '/api/v1/admin/operations/maintenance-windows?status=ACTIVE', { token });
  assert.ok(list.body.data.some((w) => w.id === created.body.data.id));
});

// ── Support ticket CSAT rating ───────────────────────────────────────────────

test('support ticket rating: set and read back rating fields', async () => {
  const ticket = await api(server.base, '/api/v1/admin/support', {
    method: 'POST', token,
    body: { tenantId: tenantA, subject: 'مشكلة في الفاتورة', category: 'BILLING', priority: 'NORMAL' },
  });
  assert.equal(ticket.status, 201, JSON.stringify(ticket.body));
  const ticketId = ticket.body.data.id;

  const bad = await api(server.base, `/api/v1/admin/support/tickets/${ticketId}/rating`, {
    method: 'POST', token, body: { rating: 9 },
  });
  assert.equal(bad.status, 400);

  const rated = await api(server.base, `/api/v1/admin/support/tickets/${ticketId}/rating`, {
    method: 'POST', token, body: { rating: 5, feedback: 'خدمة ممتازة' },
  });
  assert.equal(rated.status, 200, JSON.stringify(rated.body));
  assert.equal(rated.body.data.rating, 5);
  assert.equal(rated.body.data.feedback, 'خدمة ممتازة');
  assert.ok(rated.body.data.ratedAt);

  // Rating is exposed on the ticket GET endpoints too.
  const fetched = await api(server.base, `/api/v1/admin/support/${ticketId}`, { token });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.rating, 5);
  assert.equal(fetched.body.data.feedback, 'خدمة ممتازة');
  assert.ok(fetched.body.data.ratedAt);

  const list = await api(server.base, `/api/v1/admin/support?tenantId=${tenantA}`, { token });
  const row = list.body.data.find((t) => t.id === ticketId);
  assert.equal(row.rating, 5);
});

// ── Feature flag overrides ───────────────────────────────────────────────────

test('feature flag overrides: upsert, list with targetName, delete', async () => {
  const flag = await api(server.base, '/api/v1/admin/feature-flags', {
    method: 'POST', token,
    body: { key: 'feat.beta_dashboard', name: 'Beta Dashboard' },
  });
  assert.equal(flag.status, 201, JSON.stringify(flag.body));
  const flagId = flag.body.data.id;

  // Missing flag -> 404.
  const missing = await api(server.base, '/api/v1/admin/feature-flags/ff_nope/overrides', {
    method: 'POST', token,
    body: { targetType: 'TENANT', targetId: tenantA, isEnabled: true },
  });
  assert.equal(missing.status, 404);

  // Invalid targetType -> 400.
  const badType = await api(server.base, `/api/v1/admin/feature-flags/${flagId}/overrides`, {
    method: 'POST', token,
    body: { targetType: 'ORG', targetId: tenantA, isEnabled: true },
  });
  assert.equal(badType.status, 400);

  // Invalid rollout percent -> 400.
  const badPercent = await api(server.base, `/api/v1/admin/feature-flags/${flagId}/overrides`, {
    method: 'POST', token,
    body: { targetType: 'TENANT', targetId: tenantA, isEnabled: true, customRolloutPercent: 150 },
  });
  assert.equal(badPercent.status, 400);

  const created = await api(server.base, `/api/v1/admin/feature-flags/${flagId}/overrides`, {
    method: 'POST', token,
    body: { targetType: 'TENANT', targetId: tenantA, isEnabled: false, customRolloutPercent: 25 },
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const override = created.body.data;
  assert.equal(override.featureId, flagId);
  assert.equal(override.targetType, 'TENANT');
  assert.equal(override.targetId, tenantA);
  assert.equal(override.isEnabled, false);
  assert.equal(override.customRolloutPercent, 25);

  const listed = await api(server.base, `/api/v1/admin/feature-flags/${flagId}/overrides`, { token });
  assert.equal(listed.status, 200);
  const tenantOverride = listed.body.data.find((o) => o.id === override.id);
  assert.equal(tenantOverride.targetName, 'Feature Tenant A');

  // Upsert on the unique key flips the values without duplicating.
  const updated = await api(server.base, `/api/v1/admin/feature-flags/${flagId}/overrides`, {
    method: 'POST', token,
    body: { targetType: 'TENANT', targetId: tenantA, isEnabled: true },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.id, override.id);
  assert.equal(updated.body.data.isEnabled, true);
  assert.equal(updated.body.data.customRolloutPercent, null);

  const afterUpsert = await api(server.base, `/api/v1/admin/feature-flags/${flagId}/overrides`, { token });
  assert.equal(afterUpsert.body.data.filter((o) => o.targetType === 'TENANT' && o.targetId === tenantA).length, 1);

  // PLAN + STAGING_GROUP targets resolve names.
  const plan = await api(server.base, '/api/v1/admin/plans', {
    method: 'POST', token,
    body: { name: 'Override Plan', code: 'OVRP', price: 100 },
  });
  assert.equal(plan.status, 201, JSON.stringify(plan.body));
  const planId = plan.body.data.id;

  await api(server.base, `/api/v1/admin/feature-flags/${flagId}/overrides`, {
    method: 'POST', token,
    body: { targetType: 'PLAN', targetId: planId, isEnabled: true },
  });
  await api(server.base, `/api/v1/admin/feature-flags/${flagId}/overrides`, {
    method: 'POST', token,
    body: { targetType: 'STAGING_GROUP', targetId: 'eu-west', isEnabled: false },
  });
  const all = await api(server.base, `/api/v1/admin/feature-flags/${flagId}/overrides`, { token });
  const planOverride = all.body.data.find((o) => o.targetType === 'PLAN');
  const groupOverride = all.body.data.find((o) => o.targetType === 'STAGING_GROUP');
  assert.equal(planOverride.targetName, 'Override Plan');
  assert.equal(groupOverride.targetName, 'eu-west');

  const deleted = await api(server.base, `/api/v1/admin/feature-flags/${flagId}/overrides/${override.id}`, {
    method: 'DELETE', token,
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.deleted, true);

  const gone = await api(server.base, `/api/v1/admin/feature-flags/${flagId}/overrides/${override.id}`, {
    method: 'DELETE', token,
  });
  assert.equal(gone.status, 404);
});

// ── Release targets ──────────────────────────────────────────────────────────

test('release targets: sync tenant list, status transitions, legacy JSON sync', async () => {
  const release = await api(server.base, '/api/v1/admin/releases', {
    method: 'POST', token,
    body: { version: '9.9.9', channel: 'STABLE', releaseNotes: 'target test' },
  });
  assert.equal(release.status, 201, JSON.stringify(release.body));
  const releaseId = release.body.data.id;

  const missing = await api(server.base, '/api/v1/admin/releases/rel_nope/targets', { token });
  assert.equal(missing.status, 404);

  // Unknown tenant -> 400.
  const badTenants = await api(server.base, `/api/v1/admin/releases/${releaseId}/targets`, {
    method: 'PUT', token, body: { tenantIds: [tenantA, 'tenant_ghost'] },
  });
  assert.equal(badTenants.status, 400);

  const synced = await api(server.base, `/api/v1/admin/releases/${releaseId}/targets`, {
    method: 'PUT', token, body: { tenantIds: [tenantA, tenantB] },
  });
  assert.equal(synced.status, 200, JSON.stringify(synced.body));
  assert.equal(synced.body.data.length, 2);
  assert.ok(synced.body.data.every((t) => t.status === 'PENDING' && t.attemptCount === 0));
  const names = synced.body.data.map((t) => t.tenantName).sort();
  assert.deepEqual(names, ['Feature Tenant A', 'Feature Tenant B']);

  // Legacy target_tenant_ids column stays in sync.
  const releaseRow = await getDb().get('SELECT target_tenant_ids FROM platform_releases WHERE id = ?', [releaseId]);
  assert.deepEqual(JSON.parse(releaseRow.target_tenant_ids).sort(), [tenantA, tenantB].sort());

  // Remove tenantA, keep tenantB (status untouched).
  const resynced = await api(server.base, `/api/v1/admin/releases/${releaseId}/targets`, {
    method: 'PUT', token, body: { tenantIds: [tenantB] },
  });
  assert.equal(resynced.status, 200);
  assert.equal(resynced.body.data.length, 1);
  assert.equal(resynced.body.data[0].tenantId, tenantB);

  const releaseRow2 = await getDb().get('SELECT target_tenant_ids FROM platform_releases WHERE id = ?', [releaseId]);
  assert.deepEqual(JSON.parse(releaseRow2.target_tenant_ids), [tenantB]);

  // Status update on tenantB.
  const badStatus = await api(server.base, `/api/v1/admin/releases/${releaseId}/targets/${tenantB}/status`, {
    method: 'POST', token, body: { status: 'BROKEN' },
  });
  assert.equal(badStatus.status, 400);

  const succeeded = await api(server.base, `/api/v1/admin/releases/${releaseId}/targets/${tenantB}/status`, {
    method: 'POST', token, body: { status: 'SUCCESS' },
  });
  assert.equal(succeeded.status, 200, JSON.stringify(succeeded.body));
  assert.equal(succeeded.body.data.status, 'SUCCESS');
  assert.equal(succeeded.body.data.attemptCount, 1);
  assert.ok(succeeded.body.data.appliedAt);
  assert.ok(succeeded.body.data.deployedAt);

  const failed = await api(server.base, `/api/v1/admin/releases/${releaseId}/targets/${tenantB}/status`, {
    method: 'POST', token, body: { status: 'FAILED', error: 'device offline' },
  });
  assert.equal(failed.status, 200);
  assert.equal(failed.body.data.status, 'FAILED');
  assert.equal(failed.body.data.error, 'device offline');
  assert.equal(failed.body.data.attemptCount, 2);
  // applied_at keeps the first terminal timestamp; deployed_at keeps the
  // last SUCCESS timestamp.
  assert.equal(failed.body.data.appliedAt, succeeded.body.data.appliedAt);
  assert.equal(failed.body.data.deployedAt, succeeded.body.data.deployedAt);

  // Removed tenant can no longer be updated.
  const orphan = await api(server.base, `/api/v1/admin/releases/${releaseId}/targets/${tenantA}/status`, {
    method: 'POST', token, body: { status: 'SUCCESS' },
  });
  assert.equal(orphan.status, 404);

  // GET list reflects final state.
  const listed = await api(server.base, `/api/v1/admin/releases/${releaseId}/targets`, { token });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.length, 1);
  assert.equal(listed.body.data[0].status, 'FAILED');
});
