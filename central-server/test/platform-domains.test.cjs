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

const dbPath = tempDbPath('domains');
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

test('tenant branches CRUD enforces the branches limit', async () => {
  const created = await api(server.base, '/api/v1/admin/tenants', {
    method: 'POST', token,
    body: { name: 'Branch Co', code: 'BRCO' },
  });
  assert.equal(created.status, 201);
  tenantId = created.body.data.id;

  // Default branches_limit is 1 → second branch must be rejected.
  const first = await api(server.base, `/api/v1/admin/tenants/${tenantId}/branches`, {
    method: 'POST', token,
    body: { code: 'MAIN', name: 'الفرع الرئيسي', isMain: true },
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.data.isMain, true);
  const branchId = first.body.data.id;

  const second = await api(server.base, `/api/v1/admin/tenants/${tenantId}/branches`, {
    method: 'POST', token,
    body: { code: 'SECOND', name: 'فرع ثانٍ' },
  });
  assert.equal(second.status, 409);

  // Raise the limit, then the second branch succeeds.
  const raise = await api(server.base, `/api/v1/admin/tenants/${tenantId}`, {
    method: 'PUT', token, body: { branchesLimit: 3 },
  });
  assert.equal(raise.status, 200);

  const secondOk = await api(server.base, `/api/v1/admin/tenants/${tenantId}/branches`, {
    method: 'POST', token,
    body: { code: 'SECOND', name: 'فرع ثانٍ', seatsLimit: 5, devicesLimit: 2 },
  });
  assert.equal(secondOk.status, 201);

  const list = await api(server.base, `/api/v1/admin/tenants/${tenantId}/branches`, { token });
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 2);
  // Main branch sorts first.
  assert.equal(list.body.data[0].isMain, true);

  const dup = await api(server.base, `/api/v1/admin/tenants/${tenantId}/branches`, {
    method: 'POST', token,
    body: { code: 'main', name: 'Duplicate' },
  });
  assert.equal(dup.status, 400);

  const updated = await api(server.base, `/api/v1/admin/tenants/${tenantId}/branches/${branchId}`, {
    method: 'PUT', token, body: { city: 'Cairo', status: 'SUSPENDED' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.city, 'Cairo');
  assert.equal(updated.body.data.status, 'SUSPENDED');

  // Main branch cannot be closed.
  const closeMain = await api(server.base, `/api/v1/admin/tenants/${tenantId}/branches/${branchId}`, {
    method: 'DELETE', token,
  });
  assert.equal(closeMain.status, 409);

  const secondId = list.body.data.find((b) => b.code === 'SECOND').id;
  const closed = await api(server.base, `/api/v1/admin/tenants/${tenantId}/branches/${secondId}`, {
    method: 'DELETE', token,
  });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.data.status, 'CLOSED');

  // Profile reports branchesUsed excluding CLOSED.
  const profile = await api(server.base, `/api/v1/admin/tenants/${tenantId}/profile`, { token });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.data.usage.branchesUsed, 1);
  assert.equal(profile.body.data.usage.branchesLimit, 3);
});

test('operations jobs can be created and cancelled', async () => {
  const created = await api(server.base, '/api/v1/admin/operations/jobs', {
    method: 'POST', token,
    body: { type: 'CUSTOM', tenantId, payload: { originalType: 'DATA_EXPORT' } },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, 'PENDING');
  const jobId = created.body.data.id;

  const badType = await api(server.base, '/api/v1/admin/operations/jobs', {
    method: 'POST', token,
    body: { type: 'NOT_A_TYPE' },
  });
  assert.equal(badType.status, 400);

  const cancelled = await api(server.base, `/api/v1/admin/operations/jobs/${jobId}/cancel`, {
    method: 'POST', token,
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.data.status, 'CANCELLED');

  const listed = await api(server.base, '/api/v1/admin/operations/jobs?status=CANCELLED', { token });
  assert.equal(listed.status, 200);
  assert.ok(listed.body.data.some((j) => j.id === jobId));
});

test('tenant usage monitoring returns per-tenant aggregates', async () => {
  const usage = await api(server.base, '/api/v1/admin/operations/usage', { token });
  assert.equal(usage.status, 200);
  const row = usage.body.data.find((u) => u.id === tenantId);
  assert.ok(row, 'tenant appears in usage list');
  assert.equal(typeof row.devices_total, 'number');
  assert.equal(typeof row.open_tickets, 'number');
});

test('support tickets support create, message and status flow', async () => {
  const created = await api(server.base, '/api/v1/admin/support', {
    method: 'POST', token,
    body: {
      tenantId, subject: 'مشكلة في الطباعة', category: 'GENERAL', priority: 'HIGH',
      requesterName: 'أحمد', body: 'لا تطبع الفاتورة.',
    },
  });
  assert.equal(created.status, 201);
  const ticketId = created.body.data.id;
  assert.equal(created.body.data.status, 'OPEN');

  const msg = await api(server.base, `/api/v1/admin/support/${ticketId}/messages`, {
    method: 'POST', token, body: { body: 'نراجع المشكلة الآن', internal: true },
  });
  assert.equal(msg.status, 201);
  assert.equal(msg.body.data.internal, true);

  const updated = await api(server.base, `/api/v1/admin/support/${ticketId}`, {
    method: 'PUT', token, body: { status: 'IN_PROGRESS', assigneeName: 'فريق الدعم' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.status, 'IN_PROGRESS');
  assert.equal(updated.body.data.assigneeName, 'فريق الدعم');

  const detail = await api(server.base, `/api/v1/admin/support/${ticketId}`, { token });
  assert.equal(detail.status, 200);
  assert.ok(detail.body.data.messages.length >= 2);

  const list = await api(server.base, `/api/v1/admin/support?tenantId=${tenantId}`, { token });
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((t) => t.id === ticketId));
});

test('remote access approval is revoked on cancel and sessions expire', async () => {
  const created = await api(server.base, '/api/v1/admin/support', {
    method: 'POST', token,
    body: {
      tenantId, subject: 'دعم عن بعد', category: 'GENERAL', priority: 'NORMAL',
      requesterName: 'سارة', body: 'أحتاج مساعدة عن بعد.',
    },
  });
  assert.equal(created.status, 201, created.text);
  const ticketId = created.body.data.id;

  // Starting without any request must fail.
  const earlyStart = await api(server.base, `/api/v1/admin/support/${ticketId}/remote-access/start`, {
    method: 'POST', token, body: { technicianName: 'tech' },
  });
  assert.equal(earlyStart.status, 400);

  // Approving without a pending request must fail.
  const earlyApprove = await api(server.base, `/api/v1/admin/support/${ticketId}/remote-access/approve`, {
    method: 'POST', token, body: { approved: true },
  });
  assert.equal(earlyApprove.status, 400);

  // Request with a duration, approve, then the customer cancels.
  const request = await api(server.base, `/api/v1/admin/support/${ticketId}/remote-access/request`, {
    method: 'POST', token, body: { requested: true, durationMinutes: 30 },
  });
  assert.equal(request.status, 200, request.text);
  assert.equal(request.body.data.remote_access_duration_minutes, 30);

  const approve = await api(server.base, `/api/v1/admin/support/${ticketId}/remote-access/approve`, {
    method: 'POST', token, body: { approved: true },
  });
  assert.equal(approve.status, 200, approve.text);
  assert.equal(approve.body.data.remote_access_approved, 1);

  const cancel = await api(server.base, `/api/v1/admin/support/${ticketId}/remote-access/request`, {
    method: 'POST', token, body: { requested: false },
  });
  assert.equal(cancel.status, 200, cancel.text);
  assert.equal(cancel.body.data.remote_access_requested, 0);
  assert.equal(cancel.body.data.remote_access_approved, 0, 'cancelling must revoke approval');

  // The stale approval must not allow a session to start.
  const staleStart = await api(server.base, `/api/v1/admin/support/${ticketId}/remote-access/start`, {
    method: 'POST', token, body: { technicianName: 'tech' },
  });
  assert.equal(staleStart.status, 400);

  // A fresh request + approval allows a session with an expiry timestamp.
  await api(server.base, `/api/v1/admin/support/${ticketId}/remote-access/request`, {
    method: 'POST', token, body: { requested: true, durationMinutes: 45 },
  });
  await api(server.base, `/api/v1/admin/support/${ticketId}/remote-access/approve`, {
    method: 'POST', token, body: { approved: true },
  });
  const start = await api(server.base, `/api/v1/admin/support/${ticketId}/remote-access/start`, {
    method: 'POST', token, body: { technicianName: 'tech-1' },
  });
  assert.equal(start.status, 201, start.text);
  assert.equal(start.body.data.status, 'ACTIVE');
  assert.equal(start.body.data.duration_minutes, 45);
  assert.ok(start.body.data.expires_at, 'session carries an expiry timestamp');
  const sessionId = start.body.data.id;

  // Force the session past its expiry; listing must mark it EXPIRED.
  const db = getDb();
  await db.run(`UPDATE platform_remote_sessions SET expires_at = ? WHERE id = ?`, ['2000-01-01T00:00:00.000Z', sessionId]);
  const sessions = await api(server.base, `/api/v1/admin/support/${ticketId}/remote-sessions`, { token });
  assert.equal(sessions.status, 200, sessions.text);
  const row = sessions.body.data.find((s) => s.id === sessionId);
  assert.equal(row.status, 'EXPIRED');

  // Audit events were recorded for the remote-access lifecycle.
  const audits = await db.all(
    `SELECT action FROM platform_audit_events WHERE resource_id IN (?, ?) ORDER BY created_at`,
    [ticketId, sessionId]
  );
  const actions = audits.map((a) => a.action);
  assert.ok(actions.includes('REMOTE_ACCESS_REQUESTED'));
  assert.ok(actions.includes('REMOTE_ACCESS_APPROVED'));
  assert.ok(actions.includes('REMOTE_ACCESS_REQUEST_CANCELLED'));
  assert.ok(actions.includes('REMOTE_SESSION_STARTED'));
});

test('signing key rotation installs a new active Ed25519 key', async () => {
  const beforeKey = await api(server.base, '/api/v1/admin/security/signing-keys', { token });
  assert.equal(beforeKey.status, 200, beforeKey.text);
  const previousKeyId = beforeKey.body.data.currentKeyId;
  assert.ok(previousKeyId);

  const publicBefore = await api(server.base, '/api/v1/configuration/public-key', { token });
  assert.equal(publicBefore.status, 200, publicBefore.text);

  const rotated = await api(server.base, '/api/v1/admin/security/signing-keys/rotate', {
    method: 'POST', token,
  });
  assert.equal(rotated.status, 200, rotated.text);
  const newKeyId = rotated.body.data.keyId;
  assert.ok(newKeyId);
  assert.notEqual(newKeyId, previousKeyId);

  const afterKey = await api(server.base, '/api/v1/admin/security/signing-keys', { token });
  assert.equal(afterKey.body.data.currentKeyId, newKeyId);
  const oldRow = afterKey.body.data.keys.find((k) => k.keyId === previousKeyId);
  const newRow = afterKey.body.data.keys.find((k) => k.keyId === newKeyId);
  assert.equal(Number(oldRow.isActive), 0);
  assert.equal(Number(newRow.isActive), 1);

  const publicAfter = await api(server.base, '/api/v1/configuration/public-key', { token });
  assert.equal(publicAfter.body.data.keyId, newKeyId);
  assert.notEqual(publicAfter.body.data.publicKey, publicBefore.body.data.publicKey);
});

test('telemetry ingest is deduplicated by fingerprint and manageable', async () => {
  const payload = {
    title: 'TypeError: cannot read property', issueType: 'error', severity: 'high',
    tenantId, appVersion: '1.2.3', os: 'windows',
  };
  const first = await api(server.base, '/api/v1/telemetry/errors', { method: 'POST', body: payload });
  assert.equal(first.status, 201);
  const second = await api(server.base, '/api/v1/telemetry/errors', { method: 'POST', body: payload });
  assert.equal(second.status, 200, 'duplicate fingerprint takes the merge path');

  const errors = await api(server.base, '/api/v1/admin/monitoring/errors?severity=high', { token });
  assert.equal(errors.status, 200);
  const report = errors.body.data.find((e) => e.title === payload.title);
  assert.ok(report, 'error report listed');
  assert.equal(report.occurrences, 2, 'duplicate ingest increments occurrences');
  assert.equal(report.tenantId, tenantId);

  const ack = await api(server.base, `/api/v1/admin/monitoring/errors/${report.id}/acknowledge`, {
    method: 'POST', token,
  });
  assert.equal(ack.status, 200);
  assert.equal(ack.body.data.status, 'ACKNOWLEDGED');

  const resolved = await api(server.base, `/api/v1/admin/monitoring/errors/${report.id}/resolve`, {
    method: 'POST', token,
  });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.data.status, 'RESOLVED');

  const summary = await api(server.base, '/api/v1/admin/monitoring/errors/summary', { token });
  assert.equal(summary.status, 200);
  assert.ok(summary.body.data.byStatus.RESOLVED >= 1);
});

test('backups can be requested per tenant and listed', async () => {
  const created = await api(server.base, '/api/v1/admin/backups', {
    method: 'POST', token,
    body: { tenantId, name: 'نسخة العميل', type: 'FULL', triggerSource: 'MANUAL' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.tenantId, tenantId);
  assert.equal(created.body.data.status, 'REQUESTED');

  // Creating a backup enqueues an ops job.
  const jobs = await api(server.base, '/api/v1/admin/operations/jobs?type=BACKUP_CREATE', { token });
  assert.equal(jobs.status, 200);
  assert.ok(jobs.body.data.some((j) => j.tenantId === tenantId));

  const list = await api(server.base, `/api/v1/admin/backups?tenantId=${tenantId}`, { token });
  assert.equal(list.status, 200);
  assert.ok(list.body.data.length >= 1);
});

test('releases support phased creation, publish and rollback', async () => {
  const badRollout = await api(server.base, '/api/v1/admin/releases', {
    method: 'POST', token,
    body: { version: '9.9.9', channel: 'STABLE', rolloutStrategy: 'PHASED', rolloutPercent: 100 },
  });
  assert.equal(badRollout.status, 400);

  const created = await api(server.base, '/api/v1/admin/releases', {
    method: 'POST', token,
    body: {
      version: '2.0.0', channel: 'STABLE', rolloutStrategy: 'PHASED', rolloutPercent: 25,
      targetTenantIds: [tenantId], releaseNotes: 'تحديث تدريجي', isMandatory: false,
    },
  });
  assert.equal(created.status, 201);
  const releaseId = created.body.data.id;
  assert.equal(created.body.data.status, 'DRAFT');
  assert.equal(created.body.data.rolloutPercent, 25);

  const dup = await api(server.base, '/api/v1/admin/releases', {
    method: 'POST', token,
    body: { version: '2.0.0', channel: 'STABLE' },
  });
  assert.equal(dup.status, 409);

  const published = await api(server.base, `/api/v1/admin/releases/${releaseId}/publish`, {
    method: 'POST', token,
  });
  assert.equal(published.status, 200);
  assert.equal(published.body.data.status, 'PUBLISHED');

  const rolledBack = await api(server.base, `/api/v1/admin/releases/${releaseId}/rollback`, {
    method: 'POST', token,
  });
  assert.equal(rolledBack.status, 200);
  assert.equal(rolledBack.body.data.status, 'ROLLED_BACK');
});
