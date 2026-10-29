import { DatabaseManager } from '../database/db.ts';
import type { SyncDataScope, SyncEvent, SyncOperation } from './types.ts';
import { v4 as uuidv4 } from 'uuid';

interface OutboxRow {
  eventId: string;
  tenantId: string | null;
  branchId: string;
  deviceId: string | null;
  entityType: string;
  entityId: string;
  operationType: SyncOperation;
  entityVersion: number;
  schemaVersion: number;
  dataScope: SyncDataScope;
  payload: string;
  createdAt: string;
  deliveryStatus: string;
  attempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
  acknowledgedAt: string | null;
}

function rowToEvent(row: OutboxRow): SyncEvent {
  let payload: unknown = {};
  try { payload = JSON.parse(row.payload); } catch { payload = row.payload; }
  return {
    eventId: row.eventId,
    tenantId: row.tenantId,
    branchId: row.branchId,
    deviceId: row.deviceId,
    entityType: row.entityType,
    entityId: row.entityId,
    operationType: row.operationType,
    entityVersion: row.entityVersion,
    schemaVersion: row.schemaVersion,
    dataScope: row.dataScope,
    payload,
    createdAt: row.createdAt,
    deliveryStatus: row.deliveryStatus as any,
    attempts: row.attempts,
    lastError: row.lastError,
    nextRetryAt: row.nextRetryAt,
  };
}

export class OutboxRepository {
  private dbManager: DatabaseManager;
  constructor(dbManager?: DatabaseManager) { this.dbManager = dbManager || DatabaseManager.getInstance(); }

  enqueue(input: {
    tenantId?: string | null;
    branchId: string;
    deviceId?: string | null;
    entityType: string;
    entityId: string;
    operationType: SyncOperation;
    entityVersion?: number;
    schemaVersion?: number;
    dataScope?: SyncDataScope;
    payload: unknown;
  }): string {
    const eventId = uuidv4();
    const payload = JSON.stringify(input.payload ?? {});
    this.dbManager.run(
      `INSERT INTO sync_outbox
        (event_id, tenant_id, branch_id, device_id, entity_type, entity_id, operation_type,
         entity_version, schema_version, data_scope, payload, delivery_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        eventId,
        input.tenantId ?? null,
        input.branchId,
        input.deviceId ?? null,
        input.entityType,
        input.entityId,
        input.operationType,
        input.entityVersion ?? 1,
        input.schemaVersion ?? 1,
        input.dataScope ?? 'BRANCH',
        payload,
      ]
    );
    return eventId;
  }

  listPending(limit = 100, policyGate?: { configured: boolean; authority: boolean }): SyncEvent[] {
    const rows = this.dbManager.query<OutboxRow>(
      `SELECT * FROM sync_outbox
       WHERE delivery_status IN ('PENDING','FAILED')
         AND (next_retry_at IS NULL OR datetime(next_retry_at) <= CURRENT_TIMESTAMP)
         AND (? = 0 OR (
           (entity_type='sync_policy' AND ? = 1)
           OR (
             entity_type IN ('category','brand','product','customer','supplier','sales_invoice','sales_return','purchase_invoice','purchase_return')
             AND EXISTS (
               SELECT 1 FROM sync_entity_policies policy
               WHERE policy.entity_type=sync_outbox.entity_type
                 AND policy.enabled=1
                 AND policy.outbound_enabled=1
                 AND (policy.managed_by_head_office=1 OR ? = 1)
             )
           )
         ))
         AND NOT EXISTS (
           SELECT 1 FROM sync_outbox earlier
           WHERE earlier.tenant_id IS sync_outbox.tenant_id
             AND earlier.entity_type = sync_outbox.entity_type
             AND earlier.entity_id = sync_outbox.entity_id
             AND earlier.rowid < sync_outbox.rowid
             AND earlier.delivery_status != 'ACKNOWLEDGED'
         )
         AND (
           sync_outbox.entity_type != 'product'
           OR NOT EXISTS (
             SELECT 1 FROM sync_outbox parent_event
             WHERE parent_event.tenant_id IS sync_outbox.tenant_id
               AND parent_event.entity_type IN ('category','brand')
               AND parent_event.rowid < sync_outbox.rowid
               AND parent_event.delivery_status != 'ACKNOWLEDGED'
           )
         )
       ORDER BY CASE WHEN entity_type='sync_policy' THEN 0 ELSE 1 END, rowid ASC
       LIMIT ?`,
      [Number(policyGate?.configured ?? false), Number(policyGate?.authority ?? false), Number(policyGate?.authority ?? false), limit]
    );
    return rows.map(rowToEvent);
  }

  markInFlight(eventId: string): void {
    this.dbManager.run(
      `UPDATE sync_outbox SET delivery_status='IN_FLIGHT' WHERE event_id=?`,
      [eventId]
    );
  }

  recoverInFlight(): number {
    const rows = this.dbManager.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sync_outbox WHERE delivery_status='IN_FLIGHT'`
    );
    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) {
      this.dbManager.run(
        `UPDATE sync_outbox SET delivery_status='PENDING'
         WHERE delivery_status='IN_FLIGHT'`
      );
    }
    return count;
  }

  markAcknowledged(eventId: string): void {
    this.dbManager.run(
      `UPDATE sync_outbox
       SET delivery_status='ACKNOWLEDGED', acknowledged_at=CURRENT_TIMESTAMP, last_error=NULL
       WHERE event_id=?`,
      [eventId]
    );
  }

  markFailed(eventId: string, error: string, nextRetryAt: string | null): void {
    this.dbManager.run(
      `UPDATE sync_outbox
       SET delivery_status='FAILED', attempts=attempts+1, last_error=?, next_retry_at=?
       WHERE event_id=?`,
      [error, nextRetryAt, eventId]
    );
  }

  markDeadLetter(eventId: string, error: string): void {
    this.dbManager.run(
      `UPDATE sync_outbox
       SET delivery_status='DEAD_LETTER', attempts=attempts+1, last_error=?
       WHERE event_id=?`,
      [error, eventId]
    );
  }

  countPending(): number {
    const rows = this.dbManager.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM sync_outbox WHERE delivery_status IN ('PENDING','FAILED','IN_FLIGHT')`
    );
    return Number(rows[0]?.c ?? 0);
  }

  countFailed(): number {
    const rows = this.dbManager.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM sync_outbox WHERE delivery_status='FAILED'`
    );
    return Number(rows[0]?.c ?? 0);
  }

  countDeadLetter(): number {
    const rows = this.dbManager.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM sync_outbox WHERE delivery_status='DEAD_LETTER'`
    );
    return Number(rows[0]?.c ?? 0);
  }

  getById(eventId: string): SyncEvent | null {
    const rows = this.dbManager.query<OutboxRow>(
      `SELECT * FROM sync_outbox WHERE event_id=?`,
      [eventId]
    );
    return rows.length ? rowToEvent(rows[0]) : null;
  }

  purgeAcknowledged(olderThanDays = 30): void {
    this.dbManager.run(
      `DELETE FROM sync_outbox
       WHERE delivery_status='ACKNOWLEDGED'
         AND acknowledged_at < datetime('now', ?)`,
      [`-${olderThanDays} days`]
    );
  }
}
