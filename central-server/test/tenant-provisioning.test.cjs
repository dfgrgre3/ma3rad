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

const dbPath = tempDbPath('tenantprov');
let server;
let token;
let tenantA;
let tenantB;
let deviceA;
let deviceB;

const CREDENTIAL = 'test-device-credential';
const credentialHash = crypto.createHash('sha256').update(CREDENTIAL).digest('hex');

function deviceHeaders(device, extra = {}) {
  return {
    'X-Device-Id': device.hardware_id,
    'X-Device-Credential': CREDENTIAL,
    ...extra,
  };
}

async function login() {
  const response = await api(server.base, '/api/v1/admin/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin-test-pass' },
  });
  return response.body.data.token;
}

async function createTenantUser(tenantId, fullName) {
  const res = await api(server.base, `/api/v1/admin/tenants/${tenantId}/users`, {
    method: 'POST',
    token,
    body: { fullName, provisioningMode: 'DIRECT_CREATE' },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.user;
}

async function pendingJobs(device) {
  const res = await api(server.base, '/api/v1/device/provisioning/pending', {
    headers: deviceHeaders(device),
  });
  assert.equal(res.status, 200);
  return res.body.data;
}

async function reportResult(device, jobId, payload) {
  return api(server.base, `/api/v1/device/provisioning/${jobId}/result`, {
    method: 'POST',
    headers: deviceHeaders(device, { 'Content-Type': 'application/json' }),
    body: payload,
  });
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
  tenantA = `tnt_${crypto.randomUUID().slice(0, 8)}`;
  tenantB = `tnt_${crypto.randomUUID().slice(0, 8)}`;
  for (const [id, code] of [[tenantA, 'TPA'], [tenantB, 'TPB']]) {
    await db.run(
      `INSERT INTO platform_tenants (id, code, name, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)`,
      [id, code, `Tenant ${code}`, now, now]
    );
  }
  deviceA = { id: 'dev_ta', hardware_id: 'hw-ta' };
  deviceB = { id: 'dev_tb', hardware_id: 'hw-tb' };
  await db.run(
    `INSERT INTO platform_devices (id, tenant_id, hardware_id, name, status, credential_hash, created_at, updated_at)
     VALUES (?, ?, ?, 'Device A', 'ACTIVE', ?, ?, ?)`,
    [deviceA.id, tenantA, deviceA.hardware_id, credentialHash, now, now]
  );
  await db.run(
    `INSERT INTO platform_devices (id, tenant_id, hardware_id, name, status, credential_hash, created_at, updated_at)
     VALUES (?, ?, ?, 'Device B', 'ACTIVE', ?, ?, ?)`,
    [deviceB.id, tenantB, deviceB.hardware_id, credentialHash, now, now]
  );
});

after(async () => {
  await server?.close();
  await getDb().close();
  removeDbFiles(dbPath);
});

test('admin-created tenant user is delivered to the device and marked PROVISIONED', async () => {
  const db = getDb();
  const user = await createTenantUser(tenantA, 'Provisioned Tenant User');
  assert.equal(user.provisioningStatus, 'PENDING');

  // A different tenant's device sees nothing.
  assert.equal((await pendingJobs(deviceB)).length, 0);

  const jobs = await pendingJobs(deviceA);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].event, 'PROVISION');
  assert.equal(jobs[0].tenantUserId, user.id);
  assert.equal(jobs[0].payload.username, user.username);
  assert.ok(jobs[0].payload.temporaryPassword, 'payload must carry the one-time password');

  // Claimed jobs are not re-delivered.
  assert.equal((await pendingJobs(deviceA)).length, 0);

  // Another device cannot report on tenant A's job.
  const foreign = await reportResult(deviceB, jobs[0].id, { ok: true, identityUserId: 'usr_x' });
  assert.equal(foreign.status, 404);

  const done = await reportResult(deviceA, jobs[0].id, { ok: true, identityUserId: 'usr_local_9' });
  assert.equal(done.status, 200);
  assert.equal(done.body.data.status, 'DONE');

  const row = await db.get('SELECT * FROM platform_tenant_users WHERE id = ?', [user.id]);
  assert.equal(row.provisioning_status, 'PROVISIONED');
  assert.equal(row.identity_user_id, 'usr_local_9');
  assert.ok(row.provisioned_at);

  const job = await db.get('SELECT * FROM platform_tenant_provisioning_jobs WHERE id = ?', [jobs[0].id]);
  assert.equal(job.status, 'DONE');
  assert.equal(job.payload, '{}', 'payload must be wiped once terminal');
});

test('failed device reports retry and go terminal at the attempt cap', async () => {
  const db = getDb();
  const user = await createTenantUser(tenantB, 'Retry Tenant User');

  for (let i = 0; i < 8; i += 1) {
    const jobs = await pendingJobs(deviceB);
    assert.equal(jobs.length, 1, `expected one pending job on attempt ${i + 1}`);
    const res = await reportResult(deviceB, jobs[0].id, { ok: false, error: 'disk full' });
    assert.equal(res.status, 200);
  }

  const row = await db.get('SELECT * FROM platform_tenant_users WHERE id = ?', [user.id]);
  assert.equal(row.provisioning_status, 'FAILED');
  assert.equal(row.last_error, 'disk full');
  const jobs = await pendingJobs(deviceB);
  assert.equal(jobs.length, 0, 'terminal jobs must not be re-delivered');
});

test('tenant user delete cancels pending jobs and reports removal', async () => {
  const db = getDb();
  const user = await createTenantUser(tenantA, 'Deleted Tenant User');

  const del = await api(server.base, `/api/v1/admin/tenants/${tenantA}/users/${user.id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(del.status, 200);

  // The DELETE job itself is still deliverable (it is not "pending" anymore —
  // it was enqueued after the cancel sweep).
  const jobs = await pendingJobs(deviceA);
  const deleteJob = jobs.find((j) => j.tenantUserId === user.id && j.event === 'DELETE');
  assert.ok(deleteJob, 'a DELETE job must be enqueued for the device');
  const done = await reportResult(deviceA, deleteJob.id, { ok: true });
  assert.equal(done.status, 200);

  const remaining = await db.all(
    `SELECT COUNT(*) AS c FROM platform_tenant_provisioning_jobs
      WHERE tenant_user_id = ? AND status IN ('PENDING','CLAIMED')`,
    [user.id]
  );
  assert.equal(remaining[0].c, 0);
});

test('device reports upsert local users into the directory and delete follows origin rules', async () => {
  const db = getDb();
  const report = async (payload) => api(server.base, '/api/v1/device/tenant-users/report', {
    method: 'POST',
    headers: deviceHeaders(deviceA, { 'Content-Type': 'application/json' }),
    body: { reports: [payload] },
  });

  // New local user → new directory row owned by the device.
  const upsert = await report({
    event: 'UPSERT',
    identityUserId: 'usr_dev_1',
    username: 'erp.local1',
    fullName: 'ERP Local One',
    role: 'SALES',
    phone: '0100',
    isActive: true,
  });
  assert.equal(upsert.status, 200);
  assert.equal(upsert.body.data.results[0].matched, false);

  const created = await db.get(
    `SELECT * FROM platform_tenant_users WHERE tenant_id = ? AND identity_user_id = 'usr_dev_1'`,
    [tenantA]
  );
  assert.ok(created);
  assert.equal(created.origin, 'DEVICE');
  assert.equal(created.provisioning_status, 'PROVISIONED');
  assert.equal(created.status, 'ACTIVE');

  // Repeat upsert updates instead of duplicating.
  await report({
    event: 'UPSERT',
    identityUserId: 'usr_dev_1',
    username: 'erp.local1',
    fullName: 'ERP Local One Renamed',
    role: 'CASHIER',
    isActive: false,
  });
  const updated = await db.get('SELECT * FROM platform_tenant_users WHERE id = ?', [created.id]);
  assert.equal(updated.full_name, 'ERP Local One Renamed');
  assert.equal(updated.role, 'CASHIER');
  assert.equal(updated.status, 'SUSPENDED');
  assert.equal(updated.is_active, 0);

  // DELETE on a DEVICE-origin row removes it entirely.
  await report({ event: 'DELETE', identityUserId: 'usr_dev_1', username: 'erp.local1' });
  const gone = await db.get('SELECT * FROM platform_tenant_users WHERE id = ?', [created.id]);
  assert.equal(gone, undefined);

  // DELETE on a PLATFORM-origin row suspends instead of removing.
  const platformUser = await createTenantUser(tenantA, 'Platform Managed User');
  await report({ event: 'DELETE', username: platformUser.username });
  const suspended = await db.get('SELECT * FROM platform_tenant_users WHERE id = ?', [platformUser.id]);
  assert.ok(suspended, 'platform-managed directory row must survive a device delete');
  assert.equal(suspended.status, 'SUSPENDED');
  assert.equal(suspended.is_active, 0);
});
