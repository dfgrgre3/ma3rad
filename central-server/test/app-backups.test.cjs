'use strict';

process.env.NODE_ENV = 'test';
process.env.CENTRAL_DISABLE_STARTUP_CHECK = '1';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { createApp } = require('../app');
const { initDatabase, getDb, bootstrapDefaults, seedPlatformRBAC } = require('../lib/db');
const { initSigningKeys } = require('../lib/signing');
const { invalidatePermissionsCache } = require('../identity');
const { cleanupAppBackups } = require('../lib/opsWorker');
const { tempDbPath, removeDbFiles, startTestServer, api } = require('./helpers.cjs');

const dbPath = tempDbPath('appbackups');
const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-appbackups-'));
process.env.CENTRAL_APP_BACKUP_DIR = artifactDir;

let server;
let token;
let tenantA;
let tenantB;
let deviceA;
let deviceB;
let uploadedId;

const ARTIFACT = crypto.randomBytes(4096);
const ARTIFACT_SHA = crypto.createHash('sha256').update(ARTIFACT).digest('hex');

async function login() {
  const response = await api(server.base, '/api/v1/admin/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin-test-pass' },
  });
  return response.body.data.token;
}

function deviceHeaders(device, extra = {}) {
  return {
    'X-Device-Id': device.hardware_id,
    'X-Device-Credential': 'test-device-credential',
    ...extra,
  };
}

async function uploadArtifact(headers, body = ARTIFACT, checksum = ARTIFACT_SHA) {
  return fetch(`${server.base}/api/v1/device/backups/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Backup-Name': 'ceramisys_manual_test.sqlite.enc',
      'X-Backup-Type': 'MANUAL',
      'X-Backup-Checksum': checksum,
      'X-Backup-Size': String(body.length),
      ...headers,
    },
    body,
  }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) }));
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
  for (const [id, code] of [[tenantA, 'APA'], [tenantB, 'APB']]) {
    await db.run(
      `INSERT INTO platform_tenants (id, code, name, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)`,
      [id, code, `Tenant ${code}`, now, now]
    );
  }
  deviceA = { id: 'dev_a', hardware_id: 'hw-a' };
  deviceB = { id: 'dev_b', hardware_id: 'hw-b' };
  const credentialHash = crypto.createHash('sha256').update('test-device-credential').digest('hex');
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
  fs.rmSync(artifactDir, { recursive: true, force: true });
});

test('device upload requires device authentication and a valid checksum', async () => {
  const noAuth = await uploadArtifact({});
  assert.equal(noAuth.status, 401);

  const badChecksum = await uploadArtifact(deviceHeaders(deviceA), ARTIFACT, '0'.repeat(64));
  assert.equal(badChecksum.status, 400);

  const wrongSize = await fetch(`${server.base}/api/v1/device/backups/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Backup-Checksum': ARTIFACT_SHA,
      'X-Backup-Size': '999999',
      ...deviceHeaders(deviceA),
    },
    body: ARTIFACT,
  });
  assert.equal(wrongSize.status, 400);
});

test('device credential is verified and can be rotated by an admin', async () => {
  // A wrong credential is rejected even though the device id is valid.
  const wrongCred = await api(server.base, '/api/v1/device/backups', {
    headers: { 'X-Device-Id': deviceA.hardware_id, 'X-Device-Credential': 'not-the-credential' },
  });
  assert.equal(wrongCred.status, 401);

  // Admin rotates the enrolled credential; the old one stops working.
  const rotate = await api(server.base, `/api/v1/admin/devices/${deviceA.id}/credential`, {
    method: 'PUT',
    token,
    body: { credential: 'rotated-device-credential-123' },
  });
  assert.equal(rotate.status, 200);
  assert.equal(rotate.body.data.credentialEnrolled, true);

  const oldCred = await api(server.base, '/api/v1/device/backups', { headers: deviceHeaders(deviceA) });
  assert.equal(oldCred.status, 401);
  const newCred = await api(server.base, '/api/v1/device/backups', {
    headers: { 'X-Device-Id': deviceA.hardware_id, 'X-Device-Credential': 'rotated-device-credential-123' },
  });
  assert.equal(newCred.status, 200);

  // Restore the shared fixture credential for the remaining tests.
  await api(server.base, `/api/v1/admin/devices/${deviceA.id}/credential`, {
    method: 'PUT',
    token,
    body: { credential: 'test-device-credential' },
  });

  // The stored hash — not the raw credential — is what the admin API returns.
  const adminDevices = await api(server.base, '/api/v1/admin/devices', { token });
  assert.equal(adminDevices.status, 200);
  const row = (adminDevices.body.data || []).find((d) => d.id === deviceA.id);
  assert.ok(row);
  assert.equal('credential_hash' in row, false);
  assert.equal('credentialHash' in row, false);
});

test('upload stores the artifact under the device tenant only', async () => {
  const res = await uploadArtifact(deviceHeaders(deviceA));
  assert.equal(res.status, 201);
  uploadedId = res.body.data.id;
  assert.equal(res.body.data.tenantId, tenantA);
  assert.equal(res.body.data.deviceId, deviceA.id);
  assert.equal(res.body.data.checksum, ARTIFACT_SHA);
  assert.equal(res.body.data.sizeBytes, ARTIFACT.length);
  assert.equal(res.body.data.restoreStatus, 'NONE');

  // Artifact file exists on disk and matches byte-for-byte.
  const stored = fs.readFileSync(path.join(artifactDir, `${uploadedId}.enc`));
  assert.ok(stored.equals(ARTIFACT));

  // Device list sees only its own tenant's backups.
  const listA = await api(server.base, '/api/v1/device/backups', { headers: deviceHeaders(deviceA) });
  assert.equal(listA.status, 200);
  assert.equal(listA.body.data.length, 1);
  const listB = await api(server.base, '/api/v1/device/backups', { headers: deviceHeaders(deviceB) });
  assert.equal(listB.body.data.length, 0);
});

test('admin restore request is tenant-scoped and drives the device lifecycle', async () => {
  // Admin list shows the upload with tenant + device names.
  const adminList = await api(server.base, `/api/v1/admin/app-backups?tenantId=${tenantA}`, { token });
  assert.equal(adminList.status, 200);
  assert.equal(adminList.body.data.length, 1);
  assert.equal(adminList.body.data[0].id, uploadedId);

  // Unauthenticated admin call is rejected.
  const noAuth = await api(server.base, '/api/v1/admin/app-backups');
  assert.equal(noAuth.status, 401);

  // No restore pending yet.
  const pendingBefore = await api(server.base, '/api/v1/device/backups/pending-restore', { headers: deviceHeaders(deviceA) });
  assert.equal(pendingBefore.body.data, null);

  // Admin requests restore.
  const restore = await api(server.base, `/api/v1/admin/app-backups/${uploadedId}/restore`, { method: 'POST', token, body: {} });
  assert.equal(restore.status, 201);
  assert.equal(restore.body.data.restoreStatus, 'REQUESTED');

  // Duplicate request while pending is rejected.
  const dup = await api(server.base, `/api/v1/admin/app-backups/${uploadedId}/restore`, { method: 'POST', token, body: {} });
  assert.equal(dup.status, 409);

  // Pending endpoint now returns the backup.
  const pending = await api(server.base, '/api/v1/device/backups/pending-restore', { headers: deviceHeaders(deviceA) });
  assert.equal(pending.body.data.id, uploadedId);

  // Another tenant's device cannot download it.
  const crossDownload = await fetch(`${server.base}/api/v1/device/backups/${uploadedId}/download`, {
    headers: deviceHeaders(deviceB),
  });
  assert.equal(crossDownload.status, 404);

  // Owning device downloads the exact artifact.
  const download = await fetch(`${server.base}/api/v1/device/backups/${uploadedId}/download`, {
    headers: deviceHeaders(deviceA),
  });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('x-backup-checksum'), ARTIFACT_SHA);
  const downloaded = Buffer.from(await download.arrayBuffer());
  assert.ok(downloaded.equals(ARTIFACT));

  // Progress + terminal reports.
  const progress = await api(server.base, `/api/v1/device/backups/${uploadedId}/restore-result`, {
    method: 'POST', headers: deviceHeaders(deviceA), body: { status: 'IN_PROGRESS' },
  });
  assert.equal(progress.status, 200);
  assert.equal(progress.body.data.restoreStatus, 'IN_PROGRESS');

  const done = await api(server.base, `/api/v1/device/backups/${uploadedId}/restore-result`, {
    method: 'POST', headers: deviceHeaders(deviceA), body: { status: 'COMPLETED' },
  });
  assert.equal(done.status, 200);
  assert.equal(done.body.data.restoreStatus, 'COMPLETED');
  assert.ok(done.body.data.restoreCompletedAt);

  // Nothing pending anymore; a late FAILED report is rejected.
  const pendingAfter = await api(server.base, '/api/v1/device/backups/pending-restore', { headers: deviceHeaders(deviceA) });
  assert.equal(pendingAfter.body.data, null);
  const lateFail = await api(server.base, `/api/v1/device/backups/${uploadedId}/restore-result`, {
    method: 'POST', headers: deviceHeaders(deviceA), body: { status: 'FAILED', error: 'late' },
  });
  assert.equal(lateFail.status, 409);
});

test('failed restore can be cancelled and re-requested', async () => {
  // Second artifact for tenant A.
  const second = crypto.randomBytes(1024);
  const secondSha = crypto.createHash('sha256').update(second).digest('hex');
  const up = await uploadArtifact(deviceHeaders(deviceA), second, secondSha);
  assert.equal(up.status, 201);
  const id2 = up.body.data.id;

  await api(server.base, `/api/v1/admin/app-backups/${id2}/restore`, { method: 'POST', token, body: {} });
  // Device reports failure.
  const failed = await api(server.base, `/api/v1/device/backups/${id2}/restore-result`, {
    method: 'POST', headers: deviceHeaders(deviceA), body: { status: 'FAILED', error: 'decrypt failed' },
  });
  assert.equal(failed.body.data.restoreStatus, 'FAILED');
  assert.equal(failed.body.data.restoreError, 'decrypt failed');

  // FAILED stays visible to pending-restore so the device can retry reporting,
  // and admin can re-request (FAILED is not blocked).
  const reRestore = await api(server.base, `/api/v1/admin/app-backups/${id2}/restore`, { method: 'POST', token, body: {} });
  assert.equal(reRestore.status, 201);
  assert.equal(reRestore.body.data.restoreStatus, 'REQUESTED');

  // Cancel while REQUESTED returns it to NONE.
  const cancel = await api(server.base, `/api/v1/admin/app-backups/${id2}/restore/cancel`, { method: 'POST', token, body: {} });
  assert.equal(cancel.status, 200);
  const after = await api(server.base, `/api/v1/admin/app-backups/${id2}`, { token });
  assert.equal(after.body.data.restoreStatus, 'NONE');
});

test('retention cleanup removes expired artifacts but spares in-flight restores', async () => {
  const db = getDb();
  const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(); // ~13 months ago

  // Expired row (NONE) + its file → deleted.
  const expiredId = 'appbak_expired01';
  fs.writeFileSync(path.join(artifactDir, `${expiredId}.enc`), Buffer.from('old-artifact'));
  await db.run(
    `INSERT INTO platform_app_backups (id, tenant_id, device_id, name, type, status, size_bytes, checksum, storage_uri, restore_status, created_at, completed_at)
     VALUES (?, ?, ?, 'old', 'FULL', 'COMPLETED', 12, ?, ?, 'NONE', ?, ?)`,
    [expiredId, tenantA, deviceA.id, 'a'.repeat(64), `${expiredId}.enc`, old, old]
  );

  // Expired row but restore REQUESTED → row and file preserved.
  const pendingId = 'appbak_pending001';
  fs.writeFileSync(path.join(artifactDir, `${pendingId}.enc`), Buffer.from('pending-artifact'));
  await db.run(
    `INSERT INTO platform_app_backups (id, tenant_id, device_id, name, type, status, size_bytes, checksum, storage_uri, restore_status, restore_requested_at, created_at, completed_at)
     VALUES (?, ?, ?, 'pending', 'FULL', 'COMPLETED', 16, ?, ?, 'REQUESTED', ?, ?, ?)`,
    [pendingId, tenantA, deviceA.id, 'b'.repeat(64), `${pendingId}.enc`, old, old, old]
  );

  // Orphan .enc file past cutoff → deleted.
  fs.writeFileSync(path.join(artifactDir, 'orphan_old.enc'), Buffer.from('orphan'));
  const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
  fs.utimesSync(path.join(artifactDir, 'orphan_old.enc'), oldDate, oldDate);

  const result = await cleanupAppBackups({ retentionDays: 365 });
  assert.ok(result.deleted >= 2, `expected at least 2 deletions, got ${result.deleted}`);

  assert.equal(fs.existsSync(path.join(artifactDir, `${expiredId}.enc`)), false);
  assert.equal(fs.existsSync(path.join(artifactDir, 'orphan_old.enc')), false);
  assert.equal(fs.existsSync(path.join(artifactDir, `${pendingId}.enc`)), true);
  const pendingRow = await db.get('SELECT restore_status FROM platform_app_backups WHERE id = ?', [pendingId]);
  assert.equal(pendingRow.restore_status, 'REQUESTED');
  const expiredRow = await db.get('SELECT id FROM platform_app_backups WHERE id = ?', [expiredId]);
  assert.equal(expiredRow, undefined);
});
