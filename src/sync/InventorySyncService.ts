import { SyncEngine } from './SyncEngine.ts';
import type { SyncEvent, SyncOperation } from '../types/sync/index.ts';
import { DatabaseManager } from '../database/repositories/databaseManager.ts';

export class InventorySyncService {
  private db = DatabaseManager.getInstance();
  private engine: SyncEngine;
  private initialized = false;

  constructor(engine?: SyncEngine) {
    this.engine = engine || new SyncEngine();
  }

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;
    const dispatcher = this.engine.dispatcher;
    dispatcher.register('stock_transfer', (event) => this.applyStockTransfer(event));
    dispatcher.register('inventory_transaction', (event) => this.applyInventoryTransaction(event));
    dispatcher.register('stock_adjustment', (event) => this.applyStockAdjustment(event));
  }

  public enqueueStockTransfer(input: {
    branchId: string;
    tenantId?: string | null;
    deviceId?: string | null;
    transferId: string;
    operation: SyncOperation;
    payload: Record<string, unknown>;
    entityVersion?: number;
  }): string {
    return this.engine.enqueueChange({
      tenantId: input.tenantId ?? null,
      branchId: input.branchId,
      deviceId: input.deviceId ?? null,
      entityType: 'stock_transfer',
      entityId: input.transferId,
      operationType: input.operation,
      entityVersion: input.entityVersion ?? 1,
      schemaVersion: 1,
      dataScope: 'BRANCH',
      payload: input.payload,
    });
  }

  public enqueueInventoryTransaction(input: {
    branchId: string;
    tenantId?: string | null;
    deviceId?: string | null;
    transactionId: string;
    operation: SyncOperation;
    payload: Record<string, unknown>;
    entityVersion?: number;
  }): string {
    return this.engine.enqueueChange({
      tenantId: input.tenantId ?? null,
      branchId: input.branchId,
      deviceId: input.deviceId ?? null,
      entityType: 'inventory_transaction',
      entityId: input.transactionId,
      operationType: input.operation,
      entityVersion: input.entityVersion ?? 1,
      schemaVersion: 1,
      dataScope: 'BRANCH',
      payload: input.payload,
    });
  }

  public enqueueStockAdjustment(input: {
    branchId: string;
    tenantId?: string | null;
    deviceId?: string | null;
    adjustmentId: string;
    operation: SyncOperation;
    payload: Record<string, unknown>;
    entityVersion?: number;
  }): string {
    return this.engine.enqueueChange({
      tenantId: input.tenantId ?? null,
      branchId: input.branchId,
      deviceId: input.deviceId ?? null,
      entityType: 'stock_adjustment',
      entityId: input.adjustmentId,
      operationType: input.operation,
      entityVersion: input.entityVersion ?? 1,
      schemaVersion: 1,
      dataScope: 'BRANCH',
      payload: input.payload,
    });
  }

  private applyStockTransfer(event: SyncEvent): void | 'DEFERRED' {
    const payload = event.payload as Record<string, unknown>;
    const transferId = event.entityId;
    const branchId = event.branchId;
    const tenantId = event.tenantId ?? null;

    this.db.executeTransaction((tx) => {
      const existing = tx.query<{ id: string }>(
        `SELECT id FROM stock_transfers WHERE id = ?`,
        [transferId]
      )[0];

      const cols = Object.keys(payload);
      const placeholders = cols.map(() => '?').join(',');
      const assignments = cols.map((c) => `${c} = excluded.${c}`).join(',');

      if (existing) {
        tx.run(
          `INSERT INTO stock_transfers (${cols.join(',')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${assignments}, updated_at = CURRENT_TIMESTAMP`,
          cols.map((c) => payload[c])
        );
      } else {
        tx.run(
          `INSERT INTO stock_transfers (${cols.join(',')}) VALUES (${placeholders})`,
          cols.map((c) => payload[c])
        );
      }

      tx.run(
        `INSERT INTO sync_applied_events (event_id, entity_type, entity_id, branch_id, tenant_id, applied_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(event_id) DO NOTHING`,
        [event.eventId, 'stock_transfer', transferId, branchId, tenantId]
      );
    });
  }

  private applyInventoryTransaction(event: SyncEvent): void | 'DEFERRED' {
    const payload = event.payload as Record<string, unknown>;
    const transactionId = event.entityId;
    const branchId = event.branchId;
    const tenantId = event.tenantId ?? null;

    this.db.executeTransaction((tx) => {
      const existing = tx.query<{ id: string }>(
        `SELECT id FROM inventory_transactions WHERE id = ?`,
        [transactionId]
      )[0];

      const cols = Object.keys(payload);
      const placeholders = cols.map(() => '?').join(',');
      const assignments = cols.map((c) => `${c} = excluded.${c}`).join(',');

      if (existing) {
        tx.run(
          `INSERT INTO inventory_transactions (${cols.join(',')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${assignments}, updated_at = CURRENT_TIMESTAMP`,
          cols.map((c) => payload[c])
        );
      } else {
        tx.run(
          `INSERT INTO inventory_transactions (${cols.join(',')}) VALUES (${placeholders})`,
          cols.map((c) => payload[c])
        );
      }

      tx.run(
        `INSERT INTO sync_applied_events (event_id, entity_type, entity_id, branch_id, tenant_id, applied_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(event_id) DO NOTHING`,
        [event.eventId, 'inventory_transaction', transactionId, branchId, tenantId]
      );
    });
  }

  private applyStockAdjustment(event: SyncEvent): void | 'DEFERRED' {
    const payload = event.payload as Record<string, unknown>;
    const adjustmentId = event.entityId;
    const branchId = event.branchId;
    const tenantId = event.tenantId ?? null;

    this.db.executeTransaction((tx) => {
      const existing = tx.query<{ id: string }>(
        `SELECT id FROM stock_adjustments WHERE id = ?`,
        [adjustmentId]
      )[0];

      const cols = Object.keys(payload);
      const placeholders = cols.map(() => '?').join(',');
      const assignments = cols.map((c) => `${c} = excluded.${c}`).join(',');

      if (existing) {
        tx.run(
          `INSERT INTO stock_adjustments (${cols.join(',')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${assignments}, updated_at = CURRENT_TIMESTAMP`,
          cols.map((c) => payload[c])
        );
      } else {
        tx.run(
          `INSERT INTO stock_adjustments (${cols.join(',')}) VALUES (${placeholders})`,
          cols.map((c) => payload[c])
        );
      }

      tx.run(
        `INSERT INTO sync_applied_events (event_id, entity_type, entity_id, branch_id, tenant_id, applied_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(event_id) DO NOTHING`,
        [event.eventId, 'stock_adjustment', adjustmentId, branchId, tenantId]
      );
    });
  }

  public getSyncStatus() {
    return this.engine.status();
  }

  public async runCycle(): Promise<void> {
    await this.engine.runCycle();
  }

  public countPending(): number {
    return this.engine.status().pendingCount;
  }
}

export const inventorySyncService = new InventorySyncService();