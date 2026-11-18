'use strict';

process.env.NODE_ENV = 'test';
process.env.CENTRAL_DISABLE_STARTUP_CHECK = '1';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

const backupRoot = path.join(os.tmpdir(), `ceramisys-backups-${process.pid}-${randomUUID().slice(0, 8)}`);
process.env.CENTRAL_BACKUP_DIR = backupRoot;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../app');
const { initDatabase, getDb, bootstrapDefaults, seedPlatformRBAC } = require('../lib/db');
const { initSigningKeys } = require('../lib/signing');
const { invalidatePermissionsCache } = require('../identity');
const { processDueJobs } = require('../lib/opsWorker');
const { tempDbPath, removeDbFiles, startTestServer, api } = require('./helpers.cjs');

const dbPath = tempDbPath('opsworker');
let server;
let token;
let tenantId;

async function login() {
  const response = await api(server.base, '/api/v1/admin/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin-test-pass' },
  });
  return response.body.data.token;
}

before(async () => {
  fs.mkdirSync(backupRoot, { recursive: true });
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
  fs.rmSync(backupRoot, { recursive: true, force: true });
});

test('BACKUP_CREATE job produces a verified artifact and completes the backup', async () => {
  const tenant = await api(server.base, '/api/v1/admin/tenants', {
    method: 'POST', token,
    body: { name: 'Backup Tenant', code: 'BKPT' },
  });
  assert.equal(tenant.status, 201);
  tenantId = tenant.body.data.id;

  const backup = await api(server.base, '/api/v1/admin/backups', {
    method: 'POST', token,
    body: { tenantId, name: 'نسخة تجريبية', type: 'FULL', triggerSource: 'MANUAL' },
  });
  assert.equal(backup.status, 201);
  const backupId = backup.body.data.id;

  const outcomes = await processDueJobs();
  const outcome = outcomes.find((o) => o.type === 'BACKUP_CREATE');
  assert.ok(outcome, 'backup job was processed');
  assert.equal(outcome.status, 'COMPLETED');

  const row = await getDb().get('SELECT * FROM platform_backups WHERE id = ?', [backupId]);
  assert.equal(row.status, 'COMPLETED');
  assert.ok(row.size_bytes > 0);
  assert.ok(row.checksum);
  assert.ok(row.completed_at);

  const artifactPath = path.join(backupRoot, row.storage_uri);
  assert.ok(fs.existsSync(artifactPath), 'artifact file exists');
  const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  assert.equal(parsed.tenantId, tenantId);
  assert.ok(parsed.tables.platform_tenants.length === 1);
});

test('BACKUP_RESTORE verifies the artifact checksum and completes', async () => {
  const backups = await api(server.base, `/api/v1/admin/backups?tenantId=${tenantId}&status=COMPLETED`, { token });
  const backupId = backups.body.data[0].id;

  // Mutate tenant state AFTER the backup: rename the tenant and open a ticket.
  const rename = await api(server.base, `/api/v1/admin/tenants/${tenantId}`, {
    method: 'PUT', token, body: { name: 'Backup Tenant RENAMED' },
  });
  assert.equal(rename.status, 200);
  const ticket = await api(server.base, '/api/v1/admin/support', {
    method: 'POST', token,
    body: { tenantId, subject: 'تذكرة بعد النسخة', category: 'GENERAL', priority: 'LOW' },
  });
  assert.equal(ticket.status, 201);

  const restore = await api(server.base, `/api/v1/admin/backups/${backupId}/restore`, {
    method: 'POST', token, body: { notes: 'اختبار استعادة' },
  });
  assert.equal(restore.status, 201);
  const restoreId = restore.body.data.id;

  const outcomes = await processDueJobs();
  const outcome = outcomes.find((o) => o.type === 'BACKUP_RESTORE');
  assert.ok(outcome, 'restore job was processed');
  assert.equal(outcome.status, 'COMPLETED', JSON.stringify(outcome));

  const restoreRow = await getDb().get('SELECT * FROM platform_backup_restores WHERE id = ?', [restoreId]);
  assert.equal(restoreRow.status, 'COMPLETED');
  assert.ok(restoreRow.completed_at);

  const backupRow = await getDb().get('SELECT * FROM platform_backups WHERE id = ?', [backupId]);
  assert.equal(backupRow.status, 'COMPLETED');

  // The restore actually rolled the tenant back to the snapshot state.
  const tenant = await getDb().get('SELECT name FROM platform_tenants WHERE id = ?', [tenantId]);
  assert.equal(tenant.name, 'Backup Tenant');

  const tickets = await getDb().all('SELECT id FROM platform_support_tickets WHERE tenant_id = ?', [tenantId]);
  assert.equal(tickets.length, 0, 'post-backup ticket was rolled back');
});

test('completed backups expose a downloadable verified artifact', async () => {
  const backups = await api(server.base, `/api/v1/admin/backups?tenantId=${tenantId}&status=COMPLETED`, { token });
  assert.ok(backups.body.data.length >= 1);
  const backupId = backups.body.data[0].id;

  const download = await api(server.base, `/api/v1/admin/backups/${backupId}/download`, { token });
  assert.equal(download.status, 200);
  assert.equal(download.body.tenantId, tenantId);
  assert.ok(download.body.tables);

  // Non-completed backups cannot be downloaded.
  const pending = await api(server.base, '/api/v1/admin/backups', {
    method: 'POST', token,
    body: { tenantId, name: 'نسخة معلقة', type: 'INCREMENTAL' },
  });
  assert.equal(pending.status, 201);
  const blocked = await api(server.base, `/api/v1/admin/backups/${pending.body.data.id}/download`, { token });
  assert.equal(blocked.status, 409);
});

test('jobs without an executor fail honestly instead of hanging', async () => {
  const created = await api(server.base, '/api/v1/admin/operations/jobs', {
    method: 'POST', token,
    body: { type: 'CUSTOM', payload: { originalType: 'DATA_EXPORT' } },
  });
  assert.equal(created.status, 201);

  const outcomes = await processDueJobs();
  const outcome = outcomes.find((o) => o.id === created.body.data.id);
  assert.ok(outcome);
  assert.equal(outcome.status, 'FAILED');
  assert.match(outcome.error, /No executor/);

  const row = await getDb().get('SELECT * FROM platform_ops_jobs WHERE id = ?', [created.body.data.id]);
  assert.equal(row.status, 'FAILED');
  assert.ok(row.error);
  assert.equal(row.attempts, 1);
});

test('FAILED jobs can be retried back to PENDING and re-executed', async () => {
  const created = await api(server.base, '/api/v1/admin/operations/jobs', {
    method: 'POST', token,
    body: { type: 'CUSTOM', payload: { originalType: 'DATA_EXPORT' } },
  });
  assert.equal(created.status, 201);
  const jobId = created.body.data.id;

  await processDueJobs();
  let row = await getDb().get('SELECT status, attempts FROM platform_ops_jobs WHERE id = ?', [jobId]);
  assert.equal(row.status, 'FAILED');
  assert.equal(row.attempts, 1);

  // Cannot retry a job that is not FAILED/CANCELLED.
  const running = await api(server.base, '/api/v1/admin/operations/jobs', {
    method: 'POST', token, body: { type: 'CUSTOM', payload: {} },
  });
  const blocked = await api(server.base, `/api/v1/admin/operations/jobs/${running.body.data.id}/retry`, {
    method: 'POST', token,
  });
  assert.equal(blocked.status, 409);

  const retry = await api(server.base, `/api/v1/admin/operations/jobs/${jobId}/retry`, {
    method: 'POST', token,
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.status, 'PENDING');

  row = await getDb().get('SELECT status, attempts, error FROM platform_ops_jobs WHERE id = ?', [jobId]);
  assert.equal(row.status, 'PENDING');
  assert.equal(row.attempts, 0);
  assert.equal(row.error, null);

  await processDueJobs();
  row = await getDb().get('SELECT status, attempts FROM platform_ops_jobs WHERE id = ?', [jobId]);
  assert.equal(row.status, 'FAILED');
  assert.equal(row.attempts, 1);
});
