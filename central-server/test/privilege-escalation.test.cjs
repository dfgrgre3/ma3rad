'use strict';

process.env.NODE_ENV = 'test';
process.env.CENTRAL_DISABLE_STARTUP_CHECK = '1';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../app');
const { initDatabase, getDb, bootstrapDefaults, seedPlatformRBAC } = require('../lib/db');
const { initSigningKeys } = require('../lib/signing');
const { invalidatePermissionsCache, invalidateScopesCache } = require('../identity');
const { tempDbPath, removeDbFiles, startTestServer, api } = require('./helpers.cjs');

const dbPath = tempDbPath('escalation');
let server;

async function login(username, password) {
  return api(server.base, '/api/v1/admin/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

async function createTenant(token, name, code) {
  const response = await api(server.base, '/api/v1/admin/tenants', {
    method: 'POST',
    token,
    body: { name, code },
  });
  assert.equal(response.status, 201);
  return response.body.data;
}

/** Create a staff account via the API, then pin it to LIMITED data scope. */
async function createLimitedStaff(adminToken, { username, role = 'PLATFORM_ADMIN' }, tenantIds) {
  const created = await api(server.base, '/api/v1/admin/staff', {
    method: 'POST',
    token: adminToken,
    body: { username, password: 'limited-staff-pass-1', fullName: username, role },
  });
  assert.equal(created.status, 201);
  const staffId = created.body.data.id;
  const db = getDb();
  await db.run('UPDATE platform_users SET data_scope = ? WHERE id = ?', ['LIMITED', staffId]);
  await db.run('DELETE FROM platform_scopes WHERE user_id = ?', [staffId]);
  for (const tenantId of tenantIds) {
    await db.run(
      `INSERT INTO platform_scopes (user_id, scope_type, scope_id) VALUES (?, 'TENANT', ?)`,
      [staffId, tenantId],
    );
  }
  invalidateScopesCache(staffId);
  invalidatePermissionsCache(staffId);
  return staffId;
}

before(async () => {
  await initDatabase({ filename: dbPath });
  await initSigningKeys();
  await bootstrapDefaults({ initialPassword: 'owner-pass-1' });
  await seedPlatformRBAC();
  invalidatePermissionsCache();

  server = await startTestServer(createApp());
});

after(async () => {
  await server?.close();
  await getDb().close();
  removeDbFiles(dbPath);
});

test('non-owner roles cannot mint SUPER_ADMIN, OWNER, or wildcard grants', async () => {
  const owner = await login('admin', 'owner-pass-1');
  assert.equal(owner.status, 200);
  const ownerToken = owner.body.data.token;

  // Promote a PLATFORM_ADMIN account so the escalation attempts run as one.
  const created = await api(server.base, '/api/v1/admin/staff', {
    method: 'POST',
    token: ownerToken,
    body: { username: 'admin2', password: 'platform-admin-pass-1', fullName: 'Second Admin', role: 'PLATFORM_ADMIN' },
  });
  assert.equal(created.status, 201);

  const platformAdmin = await login('admin2', 'platform-admin-pass-1');
  const paToken = platformAdmin.body.data.token;

  const asSuperAdmin = await api(server.base, '/api/v1/admin/staff', {
    method: 'POST',
    token: paToken,
    body: { username: 'evil-owner', password: 'evil-pass-123', fullName: 'Evil Owner', role: 'SUPER_ADMIN' },
  });
  assert.equal(asSuperAdmin.status, 403, 'PLATFORM_ADMIN must not create SUPER_ADMIN');

  const asOwner = await api(server.base, '/api/v1/admin/staff', {
    method: 'POST',
    token: paToken,
    body: { username: 'evil-owner-2', password: 'evil-pass-123', fullName: 'Evil Owner 2', role: 'OWNER' },
  });
  assert.equal(asOwner.status, 403, 'PLATFORM_ADMIN must not create OWNER');

  const asWildcard = await api(server.base, '/api/v1/admin/staff', {
    method: 'POST',
    token: paToken,
    body: { username: 'evil-wild', password: 'evil-pass-123', fullName: 'Evil Wild', role: 'SUPPORT_AGENT', permissions: ['*'] },
  });
  assert.equal(asWildcard.status, 403, 'PLATFORM_ADMIN must not grant the wildcard');

  // A regular PLATFORM_ADMIN account is still allowed to be created.
  const legit = await api(server.base, '/api/v1/admin/staff', {
    method: 'POST',
    token: paToken,
    body: { username: 'ok-support', password: 'ok-pass-1234', fullName: 'OK Support', role: 'SUPPORT_AGENT' },
  });
  assert.equal(legit.status, 201);
});

test('the API refuses to mint a second platform owner even for the owner', async () => {
  const owner = await login('admin', 'owner-pass-1');
  const second = await api(server.base, '/api/v1/admin/staff', {
    method: 'POST',
    token: owner.body.data.token,
    body: { username: 'admin3', password: 'second-owner-pass', fullName: 'Second Owner', role: 'SUPER_ADMIN' },
  });
  assert.equal(second.status, 409, 'a second platform owner must never be created');
});

test('LIMITED-scope staff only see and touch their tenants', async () => {
  const owner = await login('admin', 'owner-pass-1');
  const adminToken = owner.body.data.token;

  const tenantA = await createTenant(adminToken, 'Scope A', 'SCOPEA');
  const tenantB = await createTenant(adminToken, 'Scope B', 'SCOPEB');

  await createLimitedStaff(adminToken, { username: 'scoped-pa', role: 'PLATFORM_ADMIN' }, [tenantA.id]);
  const scopedLogin = await login('scoped-pa', 'limited-staff-pass-1');
  assert.equal(scopedLogin.status, 200);
  const scopedToken = scopedLogin.body.data.token;

  // List: only tenant A.
  const list = await api(server.base, '/api/v1/admin/tenants', { token: scopedToken });
  assert.equal(list.status, 200);
  const listedIds = list.body.data.map((tenant) => tenant.id);
  assert.ok(listedIds.includes(tenantA.id));
  assert.ok(!listedIds.includes(tenantB.id));

  // Single tenant outside scope: 403 + audit event.
  const outside = await api(server.base, `/api/v1/admin/tenants/${tenantB.id}`, { token: scopedToken });
  assert.equal(outside.status, 403);
  const inside = await api(server.base, `/api/v1/admin/tenants/${tenantA.id}`, { token: scopedToken });
  assert.equal(inside.status, 200);

  // Scoped staff cannot create tenants at all.
  const createAttempt = await api(server.base, '/api/v1/admin/tenants', {
    method: 'POST',
    token: scopedToken,
    body: { name: 'Scope C', code: 'SCOPEC' },
  });
  assert.equal(createAttempt.status, 403);

  // Invoice creation: outside scope 403, inside scope 201.
  const blockedInvoice = await api(server.base, '/api/v1/admin/billing/invoices', {
    method: 'POST',
    token: scopedToken,
    body: { tenantId: tenantB.id, number: 'INV-B-1', total: 100 },
  });
  assert.equal(blockedInvoice.status, 403);
  const allowedInvoice = await api(server.base, '/api/v1/admin/billing/invoices', {
    method: 'POST',
    token: scopedToken,
    body: { tenantId: tenantA.id, number: 'INV-A-1', total: 100 },
  });
  assert.equal(allowedInvoice.status, 201);

  // Invoice list is filtered to scope.
  const invoices = await api(server.base, '/api/v1/admin/billing/invoices', { token: scopedToken });
  assert.equal(invoices.status, 200);
  assert.ok(
    invoices.body.data.every((invoice) => invoice.tenantId === tenantA.id),
    'invoice list must not leak out-of-scope invoices',
  );

  // Feature config: outside scope denied; global config denied; verification denied.
  const outsideConfig = await api(
    server.base,
    `/api/v1/admin/config/feature-permissions?tenantId=${tenantB.id}`,
    { token: scopedToken },
  );
  assert.equal(outsideConfig.status, 403);
  const globalConfig = await api(server.base, '/api/v1/admin/config/feature-permissions', { token: scopedToken });
  assert.equal(globalConfig.status, 403);
  const verifyAudit = await api(server.base, '/api/v1/admin/audit/verify', { token: scopedToken });
  assert.equal(verifyAudit.status, 403);

  // The denial was audited.
  const denied = await getDb().get(
    `SELECT COUNT(*) AS count FROM platform_audit_events WHERE action = 'TENANT_SCOPE_DENIED'`,
  );
  assert.ok(Number(denied.count) >= 3, 'scope denials must be audited');
});

test('empty LIMITED scope sees nothing (fail closed)', async () => {
  const owner = await login('admin', 'owner-pass-1');
  const adminToken = owner.body.data.token;
  const tenantA = await createTenant(adminToken, 'Scope D', 'SCOPED');

  await createLimitedStaff(adminToken, { username: 'scoped-none', role: 'PLATFORM_ADMIN' }, []);
  const scopedLogin = await login('scoped-none', 'limited-staff-pass-1');
  const scopedToken = scopedLogin.body.data.token;

  const list = await api(server.base, '/api/v1/admin/tenants', { token: scopedToken });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data, []);

  const one = await api(server.base, `/api/v1/admin/tenants/${tenantA.id}`, { token: scopedToken });
  assert.equal(one.status, 403);

  const devices = await api(server.base, '/api/v1/admin/devices', { token: scopedToken });
  assert.equal(devices.status, 200);
  assert.deepEqual(devices.body.data, []);

  const invoices = await api(server.base, '/api/v1/admin/billing/invoices', { token: scopedToken });
  assert.equal(invoices.status, 200);
  assert.deepEqual(invoices.body.data, []);
});

test('feature-permissions PUT requires an update permission, not a view permission', async () => {
  const owner = await login('admin', 'owner-pass-1');
  const adminToken = owner.body.data.token;

  const created = await api(server.base, '/api/v1/admin/staff', {
    method: 'POST',
    token: adminToken,
    body: { username: 'support-viewonly', password: 'support-pass-123', fullName: 'View Only', role: 'SUPPORT_AGENT' },
  });
  assert.equal(created.status, 201);

  const supportLogin = await login('support-viewonly', 'support-pass-123');
  const supportToken = supportLogin.body.data.token;

  // SUPPORT_AGENT lacks platform.app-configuration.update → PUT must be denied.
  const put = await api(server.base, '/api/v1/admin/config/feature-permissions', {
    method: 'PUT',
    token: supportToken,
    body: { tenantId: null, planId: null, hiddenMenus: ['/platform/tenants'] },
  });
  assert.equal(put.status, 403);
});
