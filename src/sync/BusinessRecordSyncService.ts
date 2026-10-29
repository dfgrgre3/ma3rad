import { DatabaseManager } from '../database/db.ts';
import { InboxRepository } from './InboxRepository.ts';
import { OutboxRepository } from './OutboxRepository.ts';
import { SyncPolicyService } from './SyncPolicyService.ts';
import type { SyncEvent, SyncOperation } from './types.ts';
import type { EventDispatcher } from './PullChangesService.ts';

type BusinessRecordType =
  | 'sales_invoice'
  | 'sales_return'
  | 'purchase_invoice'
  | 'purchase_return'
  | 'customer_payment'
  | 'supplier_payment'
  | 'stock_transfer';

type RecordSpec = {
  table: string;
  headerColumns: string[];
  lineTable: string;
  lineForeignKey: string;
  lineColumns: string[];
};

const RECORD_SPECS: Record<BusinessRecordType, RecordSpec> = {
  sales_invoice: {
    table: 'sales_invoices',
    headerColumns: [
      'id', 'invoice_number', 'date', 'due_date', 'customer_id', 'warehouse_id',
      'branch_id', 'company_id', 'subtotal', 'discount_amount', 'tax_amount',
      'shipping_cost', 'total_amount', 'paid_amount', 'remaining_amount',
      'payment_type', 'payment_status', 'invoice_status', 'total_cost',
      'gross_profit', 'returned_amount', 'notes', 'created_at', 'updated_at',
    ],
    lineTable: 'sales_invoice_items',
    lineForeignKey: 'invoice_id',
    lineColumns: [
      'id', 'product_id', 'product_name', 'product_sku', 'product_grade', 'size',
      'sold_by', 'quantity_m2', 'boxes_count', 'pieces_count', 'unit_price',
      'original_unit_price', 'unit_cost', 'discount_amount', 'total_price',
      'total_cost', 'profit',
    ],
  },
  sales_return: {
    table: 'sales_returns',
    headerColumns: [
      'id', 'return_number', 'original_invoice_id', 'original_invoice_number',
      'customer_id', 'warehouse_id', 'date', 'total_amount', 'refunded_amount',
      'remaining_to_balance', 'reason', 'created_at', 'refund_method',
    ],
    lineTable: 'sales_return_items',
    lineForeignKey: 'return_id',
    lineColumns: [
      'id', 'product_id', 'product_name', 'grade', 'quantity_m2', 'boxes_count',
      'unit_price', 'unit_cost', 'total_refund',
    ],
  },
  purchase_invoice: {
    table: 'purchase_invoices',
    headerColumns: [
      'id', 'invoice_number', 'supplier_invoice_number', 'date', 'due_date', 'supplier_id',
      'warehouse_id', 'subtotal', 'discount_amount', 'tax_amount', 'shipping_cost',
      'total_amount', 'paid_amount', 'remaining_amount', 'payment_type', 'payment_status',
      'grn_id', 'purchase_order_id', 'landed_freight', 'landed_loading', 'landed_customs_taxes',
      'landed_insurance', 'landed_other', 'landed_allocation_method', 'is_no_number_supplier',
      'matching_status', 'price_variance_amount', 'qty_variance_amount', 'notes', 'created_by', 'created_at',
    ],
    lineTable: 'purchase_invoice_items',
    lineForeignKey: 'purchase_id',
    lineColumns: [
      'id', 'product_id', 'product_name', 'grade', 'quantity_m2', 'boxes_count', 'unit_cost',
      'total_cost', 'meters_per_box', 'pieces_per_box', 'landed_cost_share', 'effective_unit_cost',
      'ordered_unit_cost', 'grn_accepted_qty',
    ],
  },
  purchase_return: {
    table: 'purchase_returns',
    headerColumns: [
      'id', 'return_number', 'original_purchase_id', 'original_invoice_number', 'supplier_id',
      'warehouse_id', 'date', 'total_amount', 'refunded_amount', 'remaining_to_balance',
      'reason', 'created_by', 'created_at',
    ],
    lineTable: 'purchase_return_items',
    lineForeignKey: 'return_id',
    lineColumns: [
      'id', 'product_id', 'product_name', 'grade', 'quantity_m2', 'boxes_count', 'unit_cost',
      'total_refund',
    ],
  },
  customer_payment: {
    table: 'customer_payments',
    headerColumns: [
      'id', 'receipt_number', 'customer_id', 'invoice_id', 'amount', 'payment_group_id',
      'payment_type', 'date', 'register_id', 'shift_id', 'branch_id', 'notes', 'performed_by', 'created_at',
    ],
    lineTable: 'customer_payment_allocations',
    lineForeignKey: 'payment_id',
    lineColumns: [
      'id', 'sales_invoice_id', 'amount',
    ],
  },
  supplier_payment: {
    table: 'supplier_payments',
    headerColumns: [
      'id', 'receipt_number', 'supplier_id', 'amount', 'idempotency_key', 'payment_type',
      'date', 'register_id', 'branch_id', 'notes', 'performed_by', 'created_at',
    ],
    lineTable: 'supplier_payment_allocations',
    lineForeignKey: 'payment_id',
    lineColumns: [
      'id', 'purchase_invoice_id', 'amount',
    ],
  },
  stock_transfer: {
    table: 'stock_transfers',
    headerColumns: [
      'id', 'transfer_number', 'date', 'from_warehouse_id', 'to_warehouse_id', 'status',
      'total_quantity_m2', 'total_cost', 'total_shipped_m2', 'total_received_m2',
      'total_lost_m2', 'shipped_at', 'received_at', 'received_by', 'notes',
      'created_by', 'created_at',
    ],
    lineTable: 'stock_transfer_items',
    lineForeignKey: 'transfer_id',
    lineColumns: [
      'id', 'product_id', 'product_name', 'quantity_m2', 'boxes_count', 'received_m2',
      'shipped_m2', 'lost_m2', 'damaged_m2', 'unit_cost', 'total_cost', 'item_notes',
    ],
  },
};

function isRecordType(value: string): value is BusinessRecordType {
  return Object.prototype.hasOwnProperty.call(RECORD_SPECS, value);
}

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value));
}

export class BusinessRecordSyncService {
  private readonly db: DatabaseManager;
  private readonly outbox: OutboxRepository;
  private readonly inbox: InboxRepository;
  private readonly policies: SyncPolicyService;

  constructor(db: DatabaseManager = DatabaseManager.getInstance()) {
    this.db = db;
    this.outbox = new OutboxRepository(db);
    this.inbox = new InboxRepository(db);
    this.policies = new SyncPolicyService(db);
  }

  capture(
    transaction: DatabaseManager,
    entityType: BusinessRecordType,
    entityId: string,
    operationType: SyncOperation = 'UPSERT'
  ): string | null {
    const identity = SyncPolicyService.currentIdentity();
    if (!identity || !this.policies.canSend(entityType)) return null;
    if (operationType !== 'CREATE' && operationType !== 'UPDATE' && operationType !== 'UPSERT') {
      throw new Error('Business record synchronization only supports immutable upsert snapshots');
    }

    const record = this.readSnapshot(transaction, entityType, entityId);
    if (!record) throw new Error(`Cannot synchronize missing ${entityType}: ${entityId}`);
    const version = transaction.query<{ entityVersion: number }>(
      `SELECT entity_version AS entityVersion FROM sync_entity_versions
       WHERE tenant_id=? AND entity_type=? AND entity_id=?`,
      [identity.tenantId, entityType, entityId]
    )[0]?.entityVersion ?? 0;
    const entityVersion = version + 1;
    transaction.run(
      `INSERT INTO sync_entity_versions
        (tenant_id, entity_type, entity_id, entity_version, source_branch_id, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(tenant_id, entity_type, entity_id) DO UPDATE SET
         entity_version=excluded.entity_version,
         source_branch_id=excluded.source_branch_id,
         updated_at=CURRENT_TIMESTAMP`,
      [identity.tenantId, entityType, entityId, entityVersion, identity.branchId]
    );
    return this.outbox.enqueue({
      tenantId: identity.tenantId,
      branchId: identity.branchId,
      deviceId: identity.deviceId,
      entityType,
      entityId,
      operationType,
      entityVersion,
      schemaVersion: 1,
      dataScope: this.policies.get(entityType).dataScope,
      payload: { record },
    });
  }

  registerHandler(dispatcher: EventDispatcher): void {
    for (const entityType of Object.keys(RECORD_SPECS)) {
      dispatcher.register(entityType, (event) => this.applyIncoming(event));
    }
  }

  listRemoteRecords(limit = 100): Array<{
    tenantId: string;
    sourceBranchId: string;
    entityType: BusinessRecordType;
    entityId: string;
    entityVersion: number;
    payload: string;
    updatedAt: string;
  }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError('Remote record page size must be an integer between 1 and 500');
    }
    const identity = SyncPolicyService.currentIdentity();
    if (!identity) return [];
    return this.db.query(
      `SELECT tenant_id AS tenantId, source_branch_id AS sourceBranchId,
              entity_type AS entityType, entity_id AS entityId,
              entity_version AS entityVersion, payload, updated_at AS updatedAt
       FROM sync_remote_entities WHERE tenant_id=?
       ORDER BY updated_at DESC, source_branch_id, entity_type LIMIT ?`,
      [identity.tenantId, limit]
    );
  }

  private applyIncoming(event: SyncEvent): void | 'DEFERRED' {
    const identity = SyncPolicyService.currentIdentity();
    if (!identity || !isRecordType(event.entityType) || event.tenantId !== identity.tenantId) {
      throw new Error('Incoming business document is not authorized by the active sync policy');
    }
    if (!this.policies.canReceive(event.entityType)) return 'DEFERRED';
    if (event.dataScope !== this.policies.get(event.entityType).dataScope ||
        (event.operationType !== 'CREATE' && event.operationType !== 'UPDATE' && event.operationType !== 'UPSERT')) {
      throw new Error('Incoming business document is not authorized by the active sync policy');
    }
    const envelope = event.payload as { record?: unknown };
    if (!envelope || typeof envelope !== 'object' || !envelope.record ||
        typeof envelope.record !== 'object' || Array.isArray(envelope.record) ||
        Object.keys(envelope).some((key) => key !== 'record')) {
      throw new Error('Incoming business document snapshot is invalid');
    }
    const record = envelope.record as Record<string, unknown>;
    if (record.id !== event.entityId || record.entityType !== event.entityType ||
        !record.header || typeof record.header !== 'object' || Array.isArray(record.header) ||
        (record.header as Record<string, unknown>).id !== event.entityId ||
        !Array.isArray(record.lines) ||
        Object.keys(record).some((key) => !['id', 'entityType', 'header', 'lines'].includes(key)) ||
        record.lines.length > 10000) {
      throw new Error('Incoming business document identity or structure is invalid');
    }
    const spec = RECORD_SPECS[event.entityType];
    this.assertSnapshotFields(record.header as Record<string, unknown>, spec.headerColumns, 'header');
    for (const line of record.lines) {
      if (!line || typeof line !== 'object' || Array.isArray(line)) {
        throw new Error('Incoming business document contains an invalid line');
      }
      this.assertSnapshotFields(line as Record<string, unknown>, spec.lineColumns, 'line');
    }

    this.db.executeTransaction((transaction) => {
      this.policies.recordRemote(transaction, event);
    });
  }

  private readSnapshot(
    transaction: DatabaseManager,
    entityType: BusinessRecordType,
    entityId: string
  ): Record<string, unknown> | null {
    const spec = RECORD_SPECS[entityType];
    const headerColumns = this.availableColumns(transaction, spec.table, spec.headerColumns);
    const header = transaction.query<Record<string, unknown>>(
      `SELECT ${headerColumns.map((column) => `"${column}"`).join(', ')}
       FROM "${spec.table}" WHERE id=?`,
      [entityId]
    )[0];
    if (!header) return null;
    const lineColumns = this.availableColumns(transaction, spec.lineTable, spec.lineColumns);
    const lines = transaction.query<Record<string, unknown>>(
      `SELECT ${lineColumns.map((column) => `"${column}"`).join(', ')}
       FROM "${spec.lineTable}" WHERE "${spec.lineForeignKey}"=? ORDER BY rowid`,
      [entityId]
    );
    const record = { entityType, id: entityId, header, lines };
    const serialized = JSON.stringify(record);
    if (new TextEncoder().encode(serialized).length > 1024 * 1024) {
      throw new Error(`The ${entityType} snapshot exceeds the synchronization payload limit`);
    }
    return record;
  }

  private availableColumns(transaction: DatabaseManager, table: string, allowlist: string[]): string[] {
    const existing = new Set(
      transaction.query<{ name: string }>(`PRAGMA table_info("${table}")`).map((column) => column.name)
    );
    if (!existing.has('id')) throw new Error(`Synchronized table is unavailable: ${table}`);
    return allowlist.filter((column) => existing.has(column));
  }

  private assertSnapshotFields(
    value: Record<string, unknown>,
    allowedColumns: string[],
    label: string
  ): void {
    const allowed = new Set(allowedColumns.flatMap((column) => [
      column,
      column.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
    ]));
    for (const [key, fieldValue] of Object.entries(value)) {
      if (!allowed.has(key) || !isPrimitive(fieldValue)) {
        throw new Error(`Incoming business document has an invalid ${label} field: ${key}`);
      }
    }
  }
}
