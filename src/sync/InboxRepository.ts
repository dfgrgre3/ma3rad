import { DatabaseManager } from '../database/db.ts';
import type { SyncDataScope, SyncEvent, SyncInboxStatus, SyncOperation } from './types.ts';

interface InboxRow {
  eventId: string;
  tenantId: string | null;
  sourceBranchId: string | null;
  sourceDeviceId: string | null;
  entityType: string;
  entityId: string;
  operationType: string;
  entityVersion: number;
  schemaVersion: number;
  dataScope: SyncDataScope;
  payload: string;
  receivedAt: string;
  appliedAt: string | null;
  status: string;
  error: string | null;
}

export class InboxRepository {
  private dbManager: DatabaseManager;
  constructor(dbManager?: DatabaseManager) { this.dbManager = dbManager || DatabaseManager.getInstance(); }

  recordReceived(event: SyncEvent): boolean {
    let payload: string | undefined;
    try {
      payload = JSON.stringify(event.payload ?? {});
    } catch (error) {
      throw new Error(
        `Sync event payload is not serializable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (payload === undefined) throw new TypeError('Sync event payload is not serializable');

    this.dbManager.run(
      `INSERT INTO sync_inbox
        (event_id, tenant_id, source_branch_id, source_device_id, entity_type, entity_id,
        operation_type, entity_version, schema_version, data_scope, payload, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED')
       ON CONFLICT(event_id) DO NOTHING`,
      [
        event.eventId,
        event.tenantId ?? null,
        event.branchId,
        event.deviceId ?? null,
        event.entityType,
        event.entityId,
        event.operationType,
        event.entityVersion,
        event.schemaVersion,
        event.dataScope ?? 'BRANCH',
        payload,
      ]
    );

    const changed = Number(this.dbManager.query<{ changes: number }>('SELECT changes() AS changes')[0]?.changes ?? 0);
    if (changed === 1) return true;

    const existing = this.dbManager.query<InboxRow>(
      `SELECT * FROM sync_inbox WHERE event_id=?`,
      [event.eventId]
    )[0];
    if (!existing) throw new Error('Sync inbox insert was ignored without an existing event');
    if (
      existing.tenantId !== (event.tenantId ?? null) ||
      existing.sourceBranchId !== event.branchId ||
      existing.sourceDeviceId !== (event.deviceId ?? null) ||
      existing.entityType !== event.entityType ||
      existing.entityId !== event.entityId ||
      existing.operationType !== event.operationType ||
      existing.entityVersion !== event.entityVersion ||
      existing.schemaVersion !== event.schemaVersion ||
      existing.dataScope !== (event.dataScope ?? 'BRANCH') ||
      existing.payload !== payload
    ) {
      throw new Error(`Sync event ID collision: ${event.eventId} was reused with different content`);
    }
    return false;
  }

  markApplied(eventId: string): void {
    this.dbManager.run(
      `UPDATE sync_inbox SET status='APPLIED', applied_at=CURRENT_TIMESTAMP, error=NULL
       WHERE event_id=? AND status='RECEIVED'`,
      [eventId]
    );
  }

  markDuplicate(eventId: string): void {
    this.dbManager.run(
      `UPDATE sync_inbox SET status='DUPLICATE' WHERE event_id=? AND status='RECEIVED'`,
      [eventId]
    );
  }

  markFailed(eventId: string, error: string): void {
    this.dbManager.run(
      `UPDATE sync_inbox SET status='FAILED', error=? WHERE event_id=? AND status IN ('RECEIVED','FAILED')`,
      [error, eventId]
    );
  }

  prepareForRetry(eventId: string): void {
    this.dbManager.run(
      `UPDATE sync_inbox SET status='RECEIVED', error=NULL
       WHERE event_id=? AND status IN ('RECEIVED','FAILED')`,
      [eventId]
    );
  }

  markRejected(eventId: string, error: string): void {
    this.dbManager.run(
      `UPDATE sync_inbox SET status='REJECTED', error=? WHERE event_id=? AND status IN ('RECEIVED','FAILED','REJECTED')`,
      [error, eventId]
    );
  }

  isDuplicate(eventId: string): boolean {
    const rows = this.dbManager.query<{ eventId: string }>(
      `SELECT event_id AS eventId FROM sync_inbox WHERE event_id=?`,
      [eventId]
    );
    return rows.length > 0;
  }

  getStatus(eventId: string): SyncInboxStatus | null {
    const rows = this.dbManager.query<{ status: SyncInboxStatus }>(
      `SELECT status FROM sync_inbox WHERE event_id=?`,
      [eventId]
    );
    return rows[0]?.status ?? null;
  }

  listPending(limit = 100): SyncEvent[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError('Inbox batch size must be an integer between 1 and 500');
    }
    const rows = this.dbManager.query<InboxRow>(
      `SELECT * FROM sync_inbox WHERE status='RECEIVED' ORDER BY received_at ASC LIMIT ?`,
      [limit]
    );
    return rows.map((r) => {
      let payload: unknown;
      try {
        payload = JSON.parse(r.payload);
      } catch (error) {
        throw new Error(
          `Invalid JSON payload in sync inbox event ${r.eventId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return {
        eventId: r.eventId,
        tenantId: r.tenantId,
        branchId: r.sourceBranchId ?? '',
        deviceId: r.sourceDeviceId,
        entityType: r.entityType,
        entityId: r.entityId,
        operationType: r.operationType as SyncOperation,
        entityVersion: r.entityVersion,
        schemaVersion: r.schemaVersion,
        dataScope: r.dataScope,
        payload,
        createdAt: r.receivedAt,
      };
    });
  }

  countReceived(): number {
    const rows = this.dbManager.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM sync_inbox WHERE status='RECEIVED'`
    );
    return Number(rows[0]?.c ?? 0);
  }
}
