import { SyncEngine } from './SyncEngine.ts';
import type { SyncEvent, SyncOperation } from '../types/sync/index.ts';
import { DatabaseManager } from '../database/repositories/databaseManager.ts';

const SALES_INVOICE_MONEY_COLS = new Set([
  'subtotal', 'discount_amount', 'tax_amount', 'shipping_cost', 'extra_fees',
  'total_amount', 'paid_amount', 'remaining_amount', 'total_cost', 'gross_profit', 'returned_amount',
]);
const SALES_RETURN_MONEY_COLS = new Set([
  'total_amount', 'return_tax_amount', 'refunded_amount', 'remaining_to_balance',
]);

export class SalesSyncService {
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
    dispatcher.register('sales_invoice', (event) => this.applySalesInvoice(event));
    dispatcher.register('sales_return', (event) => this.applySalesReturn(event));
    dispatcher.register('customer_payment', (event) => this.applyCustomerPayment(event));
    dispatcher.register('sales_order', (event) => this.applySalesOrder(event));
    dispatcher.register('sales_quotation', (event) => this.applySalesQuotation(event));
    dispatcher.register('held_order', (event) => this.applyHeldOrder(event));
  }

  public enqueueInvoice(input: {
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
      entityType: 'sales_invoice',
      entityId: input.invoiceId,
      operationType: input.operation,
      entityVersion: input.entityVersion ?? 1,
      schemaVersion: 1,
      dataScope: 'BRANCH',
      payload: input.payload,
    });
  }

  public enqueueReturn(input: {
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
      entityType: 'sales_return',
      entityId: input.returnId,
      operationType: input.operation,
      entityVersion: input.entityVersion ?? 1,
      schemaVersion: 1,
      dataScope: 'BRANCH',
      payload: input.payload,
    });
  }

  public enqueueCustomerPayment(input: {
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
      entityType: 'customer_payment',
      entityId: input.paymentId,
      operationType: input.operation,
      entityVersion: input.entityVersion ?? 1,
      schemaVersion: 1,
      dataScope: 'BRANCH',
      payload: input.payload,
    });
  }

  public enqueueSalesOrder(input: {
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
      entityType: 'sales_order',
      entityId: input.orderId,
      operationType: input.operation,
      entityVersion: input.entityVersion ?? 1,
      schemaVersion: 1,
      dataScope: 'BRANCH',
      payload: input.payload,
    });
  }

  private applySalesInvoice(event: SyncEvent): void | 'DEFERRED' {
    const payload = event.payload as Record<string, unknown>;
      if (payload.branch_id == null) delete payload.branch_id;
      if (payload.company_id == null) delete payload.company_id;
    const invoiceId = event.entityId;
    const branchId = event.branchId;
    const tenantId = event.tenantId ?? null;

    this.db.executeTransaction((tx) => {
      const existing = tx.query<{ id: string }>(
        `SELECT id FROM sales_invoices WHERE id = ?`,
        [invoiceId]
      )[0];

      const cols = Object.keys(payload);
      const placeholders = cols.map(() => '?').join(',');
      const assignments = cols.map((c) => `${c} = excluded.${c}`).join(',');
      const values = cols.map((c) => SALES_INVOICE_MONEY_COLS.has(c) && payload[c] != null
        ? Math.round(Number(payload[c]) * 100) : payload[c]);

      if (existing) {
        tx.run(
          `INSERT INTO sales_invoices (${cols.join(',')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${assignments}, updated_at = CURRENT_TIMESTAMP`,
          values
        );
      } else {
        tx.run(
          `INSERT INTO sales_invoices (${cols.join(',')}) VALUES (${placeholders})`,
          values
        );
      }

      tx.run(
        `INSERT INTO sync_applied_events (event_id, entity_type, entity_id, branch_id, tenant_id, applied_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(event_id) DO NOTHING`,
        [event.eventId, 'sales_invoice', invoiceId, branchId, tenantId]
      );
    });
  }

  private applySalesReturn(event: SyncEvent): void | 'DEFERRED' {
    const payload = event.payload as Record<string, unknown>;
      if (payload.branch_id == null) delete payload.branch_id;
      if (payload.company_id == null) delete payload.company_id;
    const returnId = event.entityId;
    const branchId = event.branchId;
    const tenantId = event.tenantId ?? null;

    this.db.executeTransaction((tx) => {
      const existing = tx.query<{ id: string }>(
        `SELECT id FROM sales_returns WHERE id = ?`,
        [returnId]
      )[0];

      const cols = Object.keys(payload);
      const placeholders = cols.map(() => '?').join(',');
      const assignments = cols.map((c) => `${c} = excluded.${c}`).join(',');
      const values = cols.map((c) => SALES_RETURN_MONEY_COLS.has(c) && payload[c] != null
        ? Math.round(Number(payload[c]) * 100) : payload[c]);

      if (existing) {
        tx.run(
          `INSERT INTO sales_returns (${cols.join(',')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${assignments}, updated_at = CURRENT_TIMESTAMP`,
          values
        );
      } else {
        tx.run(
          `INSERT INTO sales_returns (${cols.join(',')}) VALUES (${placeholders})`,
          values
        );
      }

      tx.run(
        `INSERT INTO sync_applied_events (event_id, entity_type, entity_id, branch_id, tenant_id, applied_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(event_id) DO NOTHING`,
        [event.eventId, 'sales_return', returnId, branchId, tenantId]
      );
    });
  }

  private applyCustomerPayment(event: SyncEvent): void | 'DEFERRED' {
    const payload = event.payload as Record<string, unknown>;
      if (payload.branch_id == null) delete payload.branch_id;
      if (payload.company_id == null) delete payload.company_id;
    const paymentId = event.entityId;
    const branchId = event.branchId;
    const tenantId = event.tenantId ?? null;

    this.db.executeTransaction((tx) => {
      const existing = tx.query<{ id: string }>(
        `SELECT id FROM customer_payments WHERE id = ?`,
        [paymentId]
      )[0];

      const cols = Object.keys(payload);
      const placeholders = cols.map(() => '?').join(',');
      const assignments = cols.map((c) => `${c} = excluded.${c}`).join(',');

      if (existing) {
        tx.run(
          `INSERT INTO customer_payments (${cols.join(',')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${assignments}, updated_at = CURRENT_TIMESTAMP`,
          cols.map((c) => payload[c])
        );
      } else {
        tx.run(
          `INSERT INTO customer_payments (${cols.join(',')}) VALUES (${placeholders})`,
          cols.map((c) => payload[c])
        );
      }

      tx.run(
        `INSERT INTO sync_applied_events (event_id, entity_type, entity_id, branch_id, tenant_id, applied_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(event_id) DO NOTHING`,
        [event.eventId, 'customer_payment', paymentId, branchId, tenantId]
      );
    });
  }

  private applySalesOrder(event: SyncEvent): void | 'DEFERRED' {
    const payload = event.payload as Record<string, unknown>;
      if (payload.branch_id == null) delete payload.branch_id;
      if (payload.company_id == null) delete payload.company_id;
    const orderId = event.entityId;
    const branchId = event.branchId;
    const tenantId = event.tenantId ?? null;

    this.db.executeTransaction((tx) => {
      const existing = tx.query<{ id: string }>(
        `SELECT id FROM sales_orders WHERE id = ?`,
        [orderId]
      )[0];

      const cols = Object.keys(payload);
      const placeholders = cols.map(() => '?').join(',');
      const assignments = cols.map((c) => `${c} = excluded.${c}`).join(',');

      if (existing) {
        tx.run(
          `INSERT INTO sales_orders (${cols.join(',')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${assignments}, updated_at = CURRENT_TIMESTAMP`,
          cols.map((c) => payload[c])
        );
      } else {
        tx.run(
          `INSERT INTO sales_orders (${cols.join(',')}) VALUES (${placeholders})`,
          cols.map((c) => payload[c])
        );
      }

      tx.run(
        `INSERT INTO sync_applied_events (event_id, entity_type, entity_id, branch_id, tenant_id, applied_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(event_id) DO NOTHING`,
        [event.eventId, 'sales_order', orderId, branchId, tenantId]
      );
    });
  }

  private applySalesQuotation(event: SyncEvent): void | 'DEFERRED' {
    const payload = event.payload as Record<string, unknown>;
      if (payload.branch_id == null) delete payload.branch_id;
      if (payload.company_id == null) delete payload.company_id;
    const quotationId = event.entityId;
    const branchId = event.branchId;
    const tenantId = event.tenantId ?? null;

    this.db.executeTransaction((tx) => {
      const existing = tx.query<{ id: string }>(
        `SELECT id FROM sales_quotations WHERE id = ?`,
        [quotationId]
      )[0];

      const cols = Object.keys(payload);
      const placeholders = cols.map(() => '?').join(',');
      const assignments = cols.map((c) => `${c} = excluded.${c}`).join(',');

      if (existing) {
        tx.run(
          `INSERT INTO sales_quotations (${cols.join(',')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${assignments}, updated_at = CURRENT_TIMESTAMP`,
          cols.map((c) => payload[c])
        );
      } else {
        tx.run(
          `INSERT INTO sales_quotations (${cols.join(',')}) VALUES (${placeholders})`,
          cols.map((c) => payload[c])
        );
      }

      tx.run(
        `INSERT INTO sync_applied_events (event_id, entity_type, entity_id, branch_id, tenant_id, applied_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(event_id) DO NOTHING`,
        [event.eventId, 'sales_quotation', quotationId, branchId, tenantId]
      );
    });
  }

  private applyHeldOrder(event: SyncEvent): void | 'DEFERRED' {
    const payload = event.payload as Record<string, unknown>;
      if (payload.branch_id == null) delete payload.branch_id;
      if (payload.company_id == null) delete payload.company_id;
    const orderId = event.entityId;
    const branchId = event.branchId;
    const tenantId = event.tenantId ?? null;

    this.db.executeTransaction((tx) => {
      const existing = tx.query<{ id: string }>(
        `SELECT id FROM held_orders WHERE id = ?`,
        [orderId]
      )[0];

      const cols = Object.keys(payload);
      const placeholders = cols.map(() => '?').join(',');
      const assignments = cols.map((c) => `${c} = excluded.${c}`).join(',');

      if (existing) {
        tx.run(
          `INSERT INTO held_orders (${cols.join(',')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${assignments}, updated_at = CURRENT_TIMESTAMP`,
          cols.map((c) => payload[c])
        );
      } else {
        tx.run(
          `INSERT INTO held_orders (${cols.join(',')}) VALUES (${placeholders})`,
          cols.map((c) => payload[c])
        );
      }

      tx.run(
        `INSERT INTO sync_applied_events (event_id, entity_type, entity_id, branch_id, tenant_id, applied_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(event_id) DO NOTHING`,
        [event.eventId, 'held_order', orderId, branchId, tenantId]
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

export const salesSyncService = new SalesSyncService();