import { SyncEngine } from './SyncEngine.ts';
import type { SyncEvent, SyncOperation } from '../types/sync/index.ts';
import { DatabaseManager } from '../database/repositories/databaseManager.ts';

export class PurchaseSyncService {
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
    dispatcher.register('purchase_invoice', (event) => this.applyPurchaseInvoice(event));
    dispatcher.register('purchase_return', (event) => this.applyPurchaseReturn(event));
    dispatcher.register('supplier_payment', (event) => this.applySupplierPayment(event));
    dispatcher.register('purchase_order', (event) => this.applyPurchaseOrder(event));
  }

  public enqueuePurchaseInvoice(input: {
    branchId: string;
    tenantId?: string | null;
    deviceId?: string | null;
    invoiceId: string;
    operation: SyncOperation;
    payload: Record<string, unknown>;
    entityVersion?: number;
  }): string {
    return this.engine.enqueueChange({
      tenantId: input.tenantId ?? null,
      branchId: input.branchId,
      deviceId: input.deviceId ?? null,
      entityType: 'purchase_invoice',
      entityId: input.invoiceId,
      operationType: input.operation,
      entityVersion: input.entityVersion ?? 1,
      schemaVersion: 1,
      dataScope: 'BRANCH',
      payload: input.payload,
    });
  }

  public enqueuePurchaseReturn(input: {
    branchId: string;
    tenantId?: string | null;
    deviceId?: string | null;
    returnId: string;
    operation: SyncOperation;
    payload: Record<string, unknown>;
    entityVersion?: number;
  }): string {
    return this.engine.enqueueChange({
      tenantId: input.tenantId ?? null,
      branchId: input.branchId,
      deviceId: input.deviceId ?? null,
      entityType: 'purchase_return',
      entityId: input.returnId,
      operationType: input.operation,
      entityVersion: input.entityVersion ?? 1,
      schemaVersion: 1,
      dataScope: 'BRANCH',
      payload: input.payload,
    });
  }

  public enqueueSupplierPayment(input: {
    branchId: string;
    tenantId?: string | null;
    deviceId?: string | null;
    paymentId: string;
    operation: SyncOperation;
    payload: Record<string, unknown>;
    entityVersion?: number;
  }): string {
    return this.engine.enqueueChange({
      tenantId: input.tenantId ?? null,
      branchId: input.branchId,
      deviceId: input.deviceId ?? null,
      entityType: 'supplier_payment',
      entityId: input.paymentId,
      operationType: input.operation,
      entityVersion: input.entityVersion ?? 1,
      schemaVersion: 1,
      dataScope: 'BRANCH',
      payload: input.payload,
    });
  }

  public enqueuePurchaseOrder(input: {
    branchId: string;
    tenantId?: string | null;
    deviceId?: string | null;
    orderId: string;
    operation: SyncOperation;
    payload: Record<string, unknown>;
    entityVersion?: number;
  }): string {
    return this.engine.enqueueChange({
      tenantId: input.tenantId ?? null,
      branchId: input.branchId,
      deviceId: input.deviceId ?? null,
      entityType: 'purchase_order',
      entityId: input.orderId,
      operationType: input.operation,
      entityVersion: input.entityVersion ?? 1,
      schemaVersion: 1,
      dataScope: 'BRANCH',
      payload: input.payload,
    });
  }

  private applyPurchaseInvoice(event: SyncEvent): void | 'DEFERRED' {
    const payload = event.payload as Record<string, unknown>;
      if (payload.branch_id == null) delete payload.branch_id;
      if (payload.company_id == null) delete payload.company_id;
    const invoiceId = event.entityId;
    const branchId = event.branchId;
    const tenantId = event.tenantId ?? null;

    this.db.executeTransaction((tx) => {
      const existing = tx.query<{ id: string }>(
        `SELECT id FROM purchase_invoices WHERE id = ?`,
        [invoiceId]
      )[0];

      const cols = Object.keys(payload);
      const placeholders = cols.map(() => '?').join(',');
      const assignments = cols.map((c) => `${c} = excluded.${c}`).join(',');

      if (existing) {
        tx.run(
          `INSERT INTO purchase_invoices (${cols.join(',')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${assignments}, updated_at = CURRENT_TIMESTAMP`,
          cols.map((c) => payload[c])
        );
      } else {
        tx.run(
          `INSERT INTO purchase_invoices (${cols.join(',')}) VALUES (${placeholders})`,
          cols.map((c) => payload[c])
        );
      }

      tx.run(
        `INSERT INTO sync_applied_events (event_id, entity_type, entity_id, branch_id, tenant_id, applied_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(event_id) DO NOTHING`,
        [event.eventId, 'purchase_invoice', invoiceId, branchId, tenantId]
      );
    });
  }

  private applyPurchaseReturn(event: SyncEvent): void | 'DEFERRED' {
    const payload = event.payload as Record<string, unknown>;
      if (payload.branch_id == null) delete payload.branch_id;
      if (payload.company_id == null) delete payload.company_id;
    const returnId = event.entityId;
    const branchId = event.branchId;
    const tenantId = event.tenantId ?? null;

    this.db.executeTransaction((tx) => {
      const existing = tx.query<{ id: string }>(
        `SELECT id FROM purchase_returns WHERE id = ?`,
        [returnId]
      )[0];

      const cols = Object.keys(payload);
      const placeholders = cols.map(() => '?').join(',');
      const assignments = cols.map((c) => `${c} = excluded.${c}`).join(',');

      if (existing) {
        tx.run(
          `INSERT INTO purchase_returns (${cols.join(',')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${assignments}, updated_at = CURRENT_TIMESTAMP`,
          cols.map((c) => payload[c])
        );
      } else {
        tx.run(
          `INSERT INTO purchase_returns (${cols.join(',')}) VALUES (${placeholders})`,
          cols.map((c) => payload[c])
        );
      }

      tx.run(
        `INSERT INTO sync_applied_events (event_id, entity_type, entity_id, branch_id, tenant_id, applied_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(event_id) DO NOTHING`,
        [event.eventId, 'purchase_return', returnId, branchId, tenantId]
      );
    });
  }

  private applySupplierPayment(event: SyncEvent): void | 'DEFERRED' {
    const payload = event.payload as Record<string, unknown>;
      if (payload.branch_id == null) delete payload.branch_id;
      if (payload.company_id == null) delete payload.company_id;
    const paymentId = event.entityId;
    const branchId = event.branchId;
    const tenantId = event.tenantId ?? null;

    this.db.executeTransaction((tx) => {
      const existing = tx.query<{ id: string }>(
        `SELECT id FROM supplier_payments WHERE id = ?`,
        [paymentId]
      )[0];

      const cols = Object.keys(payload);
      const placeholders = cols.map(() => '?').join(',');
      const assignments = cols.map((c) => `${c} = excluded.${c}`).join(',');

      if (existing) {
        tx.run(
          `INSERT INTO supplier_payments (${cols.join(',')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${assignments}, updated_at = CURRENT_TIMESTAMP`,
          cols.map((c) => payload[c])
        );
      } else {
        tx.run(
          `INSERT INTO supplier_payments (${cols.join(',')}) VALUES (${placeholders})`,
          cols.map((c) => payload[c])
        );
      }

      tx.run(
        `INSERT INTO sync_applied_events (event_id, entity_type, entity_id, branch_id, tenant_id, applied_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(event_id) DO NOTHING`,
        [event.eventId, 'supplier_payment', paymentId, branchId, tenantId]
      );
    });
  }

  private applyPurchaseOrder(event: SyncEvent): void | 'DEFERRED' {
    const payload = event.payload as Record<string, unknown>;
      if (payload.branch_id == null) delete payload.branch_id;
      if (payload.company_id == null) delete payload.company_id;
    const orderId = event.entityId;
    const branchId = event.branchId;
    const tenantId = event.tenantId ?? null;

    this.db.executeTransaction((tx) => {
      const existing = tx.query<{ id: string }>(
        `SELECT id FROM purchase_orders WHERE id = ?`,
        [orderId]
      )[0];

      const cols = Object.keys(payload);
      const placeholders = cols.map(() => '?').join(',');
      const assignments = cols.map((c) => `${c} = excluded.${c}`).join(',');

      if (existing) {
        tx.run(
          `INSERT INTO purchase_orders (${cols.join(',')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${assignments}, updated_at = CURRENT_TIMESTAMP`,
          cols.map((c) => payload[c])
        );
      } else {
        tx.run(
          `INSERT INTO purchase_orders (${cols.join(',')}) VALUES (${placeholders})`,
          cols.map((c) => payload[c])
        );
      }

      tx.run(
        `INSERT INTO sync_applied_events (event_id, entity_type, entity_id, branch_id, tenant_id, applied_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(event_id) DO NOTHING`,
        [event.eventId, 'purchase_order', orderId, branchId, tenantId]
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

export const purchaseSyncService = new PurchaseSyncService();