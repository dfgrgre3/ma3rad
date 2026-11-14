import { describe, it, expect } from 'vitest';
import type {
  PlatformOpsJob,
  PlatformMaintenanceWindow,
  PlatformOpApproval,
  PlatformSyncLogEntry,
} from './platformTypes';

describe('Operations Center Types and Workflow Mappings', () => {
  it('should correctly model a PlatformOpsJob structure', () => {
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

    expect(job.status).toBe('PENDING');
    expect(job.priority).toBe(3);
    expect(job.type).toBe('SCHEMA_MIGRATE');
  });

  it('should model maintenance windows with affected services', () => {
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

    expect(mw.affectedServices).toHaveLength(3);
    expect(mw.status).toBe('SCHEDULED');
  });

  it('should model sensitive op approvals with state transitions', () => {
    const approval: PlatformOpApproval = {
      id: 'appr-001',
      opType: 'TENANT_DATA_PURGE',
      opPayload: { tenantId: 'tenant-del-1' },
      requestedBy: 'operator-1',
      status: 'PENDING',
      createdAt: '2026-11-14T10:00:00Z',
      updatedAt: '2026-11-14T10:00:00Z',
    };

    expect(approval.status).toBe('PENDING');
    expect(approval.approvedBy).toBeUndefined();

    const approved: PlatformOpApproval = {
      ...approval,
      status: 'APPROVED',
      approvedBy: 'super-admin-root',
      notes: 'Verified compliance requirements.',
      updatedAt: '2026-11-14T10:15:00Z',
    };

    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedBy).toBe('super-admin-root');
  });

  it('should model device sync log entries', () => {
    const syncLog: PlatformSyncLogEntry = {
      id: 'sync-999',
      tenantId: 'tenant-1',
      deviceId: 'pos-terminal-03',
      syncType: 'OFFLINE_OUTBOX_FLUSH',
      status: 'SUCCESS',
      recordsSynced: 42,
      createdAt: '2026-11-14T19:55:00Z',
    };

    expect(syncLog.recordsSynced).toBe(42);
    expect(syncLog.status).toBe('SUCCESS');
  });
});
