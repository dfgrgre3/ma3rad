import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  PlatformOpsJob,
  PlatformMaintenanceWindow,
  PlatformOpApproval,
  PlatformSyncLogEntry,
} from './platformTypes';

test('should correctly model a PlatformOpsJob structure', () => {
  const job: PlatformOpsJob = {
    id: 'job-123',
    type: 'SCHEMA_MIGRATE',
    tenantId: 'tenant-456',
    payload: { targetVersion: 155 },
    status: 'PENDING',
    priority: 3,
    retries: 0,
    maxRetries: 3,
    scheduledAt: '2026-11-15T02:00:00Z',
    createdBy: 'admin',
    createdAt: '2026-11-14T20:00:00Z',
  };

  assert.strictEqual(job.status, 'PENDING');
  assert.strictEqual(job.priority, 3);
  assert.strictEqual(job.type, 'SCHEMA_MIGRATE');
});

test('should model maintenance windows with affected services', () => {
  const mw: PlatformMaintenanceWindow = {
    id: 'mw-001',
    title: 'Database upgrade',
    description: 'Scheduled maintenance for platform cluster',
    startsAt: '2026-11-20T01:00:00Z',
    endsAt: '2026-11-20T03:00:00Z',
    affectedServices: ['api', 'sync', 'web'],
    status: 'SCHEDULED',
    createdBy: 'super_admin',
    createdAt: '2026-11-14T20:00:00Z',
  };

  assert.strictEqual(mw.affectedServices.length, 3);
  assert.strictEqual(mw.status, 'SCHEDULED');
});

test('should model sensitive op approvals with state transitions', () => {
  const approval: PlatformOpApproval = {
    id: 'appr-001',
    opType: 'TENANT_DATA_PURGE',
    opPayload: { tenantId: 'tenant-del-1' },
    requestedBy: 'operator-1',
    status: 'PENDING',
    createdAt: '2026-11-14T10:00:00Z',
    updatedAt: '2026-11-14T10:00:00Z',
  };

  assert.strictEqual(approval.status, 'PENDING');
  assert.strictEqual(approval.approvedBy, undefined);

  const approved: PlatformOpApproval = {
    ...approval,
    status: 'APPROVED',
    approvedBy: 'super-admin-root',
    notes: 'Verified compliance requirements.',
    updatedAt: '2026-11-14T10:15:00Z',
  };

  assert.strictEqual(approved.status, 'APPROVED');
  assert.strictEqual(approved.approvedBy, 'super-admin-root');
});

test('should model device sync log entries', () => {
  const syncLog: PlatformSyncLogEntry = {
    id: 'sync-999',
    tenantId: 'tenant-1',
    deviceId: 'pos-terminal-03',
    syncType: 'OFFLINE_OUTBOX_FLUSH',
    status: 'SUCCESS',
    recordsSynced: 42,
    createdAt: '2026-11-14T19:55:00Z',
  };

  assert.strictEqual(syncLog.recordsSynced, 42);
  assert.strictEqual(syncLog.status, 'SUCCESS');
});
