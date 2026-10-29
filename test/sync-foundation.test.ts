import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { OutboxRepository } from '../src/sync/OutboxRepository.ts';
import { InboxRepository } from '../src/sync/InboxRepository.ts';
import { CursorManager } from '../src/sync/CursorManager.ts';
import { SyncEngine } from '../src/sync/SyncEngine.ts';
import { RetryScheduler } from '../src/sync/RetryScheduler.ts';
import { ConflictResolver } from '../src/sync/ConflictResolver.ts';
import { EventValidator } from '../src/sync/EventValidator.ts';
import { PullChangesService, EventDispatcher } from '../src/sync/PullChangesService.ts';
import { PushChangesService } from '../src/sync/PushChangesService.ts';
import { SyncWorker } from '../src/sync/SyncWorker.ts';
import { MasterDataSyncService } from '../src/sync/MasterDataSyncService.ts';
import { SyncPolicyService } from '../src/sync/SyncPolicyService.ts';
import { BusinessRecordSyncService } from '../src/sync/BusinessRecordSyncService.ts';
import { MIGRATIONS } from '../src/database/migrations.ts';
import type { SyncEvent } from '../src/sync/types.ts';
import { NavigationService } from '../src/services/NavigationService.ts';
import { v4 as uuidv4 } from 'uuid';

async function boot() {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  return manager;
}

function acknowledgeTenantOutbox(manager: DatabaseManager, tenantId: string): void {
  const outbox = new OutboxRepository(manager);
  const ids = manager.query<{ eventId: string }>(
    'SELECT event_id AS eventId FROM sync_outbox WHERE tenant_id=?',
    [tenantId]
  );
  for (const { eventId } of ids) outbox.markAcknowledged(eventId);
}

test('sync foundation: tables exist after migration', async () => {
  const manager = await boot();
  for (const tbl of [
    'sync_outbox', 'sync_inbox', 'sync_cursor', 'sync_branches', 'sync_devices',
    'sync_tombstones', 'sync_audit_log', 'sync_entity_versions', 'sync_conflicts',
    'sync_bootstrap_progress', 'sync_entity_policies', 'sync_remote_records', 'sync_remote_entities',
  ]) {
    const rows = manager.query<any>(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tbl]);
    assert.equal(rows.length, 1, `${tbl} should exist`);
  }
  for (const tbl of ['sync_outbox', 'sync_inbox']) {
    const columns = manager.query<{ name: string }>(`PRAGMA table_info(${tbl})`);
    assert.ok(columns.some((column) => column.name === 'data_scope'), `${tbl} should store data scope`);
  }
});

test('sync policies: admin settings persist and gate master-data outbox capture', async () => {
  const manager = await boot();
  const identity = {
    tenantId: `policy-tenant-${uuidv4()}`,
    branchId: `policy-branch-${uuidv4()}`,
    deviceId: `policy-device-${uuidv4()}`,
    canManagePolicies: true,
  };
  MasterDataSyncService.configure(identity);
  const policyService = new SyncPolicyService(manager);
  try {
    const service = new MasterDataSyncService(manager);
    const outbox = new OutboxRepository(manager);
    const categoryId = `policy-category-${uuidv4()}`;
    manager.executeTransaction((transaction) => {
      transaction.run('INSERT INTO categories (id, name) VALUES (?, ?)', [categoryId, 'Policy test']);
    });

    policyService.update({
      entityType: 'category',
      enabled: false,
      outboundEnabled: true,
      inboundEnabled: true,
      dataScope: 'TENANT',
    });
    const initialPending = outbox.countPending();
    manager.executeTransaction((transaction) => {
      assert.equal(service.capture(transaction, 'category', categoryId, 'CREATE'), null);
    });
    assert.equal(outbox.countPending(), initialPending);

    const configured = policyService.update({
      entityType: 'category',
      enabled: true,
      outboundEnabled: true,
      inboundEnabled: true,
      dataScope: 'BRANCH',
    });
    assert.equal(configured.dataScope, 'BRANCH');
    let eventId = '';
    manager.executeTransaction((transaction) => {
      eventId = service.capture(transaction, 'category', categoryId, 'CREATE')!;
    });
    assert.equal(outbox.getById(eventId)?.dataScope, 'BRANCH');

    policyService.update({
      entityType: 'category',
      enabled: false,
      outboundEnabled: true,
      inboundEnabled: true,
      dataScope: 'BRANCH',
    });
    manager.executeTransaction((transaction) => {
      assert.equal(service.capture(transaction, 'category', categoryId, 'UPDATE'), null);
    });
    assert.throws(() => policyService.update({
      entityType: 'accounting_entry',
      enabled: true,
      outboundEnabled: true,
      inboundEnabled: true,
      dataScope: 'TENANT',
    }), /not implemented/i);
  } finally {
    policyService.update({
      entityType: 'category',
      enabled: true,
      outboundEnabled: true,
      inboundEnabled: true,
      dataScope: 'TENANT',
    });
    acknowledgeTenantOutbox(manager, identity.tenantId);
    MasterDataSyncService.configure(null);
  }
});

test('sync migrations: repairs an existing policy table and creates remote projections', async () => {
  const SQL = await (globalThis as any).initSqlJs();
  const legacyDb = new SQL.Database();
  try {
    legacyDb.run(`CREATE TABLE sync_entity_policies (
      entity_type TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0,
      outbound_enabled INTEGER NOT NULL DEFAULT 0, inbound_enabled INTEGER NOT NULL DEFAULT 0,
      data_scope TEXT NOT NULL DEFAULT 'BRANCH', updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    const migration = MIGRATIONS.find((item) => item.id === '091_sync_remote_business_records');
    assert.ok(migration);
    migration.up(legacyDb);
    const columns = legacyDb.exec('PRAGMA table_info(sync_entity_policies)')[0].values.map((row: unknown[]) => row[1]);
    assert.ok(columns.includes('managed_by_head_office'));
    assert.equal(
      legacyDb.exec("SELECT entity_type FROM sync_entity_policies WHERE entity_type='sales_invoice'")[0].values.length,
      1
    );
    assert.ok(legacyDb.exec("SELECT name FROM sqlite_master WHERE name='sync_remote_entities'").length > 0);
  } finally {
    legacyDb.close();
  }
});

test('business document sync: captures snapshots and receives them without applying local balances', async () => {
  const manager = await boot();
  const identity = {
    tenantId: `sales-sync-tenant-${uuidv4()}`,
    branchId: `sales-sync-branch-${uuidv4()}`,
    deviceId: `sales-sync-device-${uuidv4()}`,
    canManagePolicies: true,
  };
  MasterDataSyncService.configure(identity);
  const policies = new SyncPolicyService(manager);
  const outbox = new OutboxRepository(manager);
  const customerId = manager.query<{ id: string }>('SELECT id FROM customers LIMIT 1')[0]?.id;
  const warehouseId = manager.query<{ id: string }>('SELECT id FROM warehouses LIMIT 1')[0]?.id;
  assert.ok(customerId);
  assert.ok(warehouseId);
  const invoiceId = `sync-invoice-${uuidv4()}`;
  const invoiceNumber = `SYNC-${uuidv4().slice(0, 8)}`;
  const categoryId = `sync-category-${uuidv4()}`;
  const brandId = `sync-brand-${uuidv4()}`;
  const productId = `sync-product-${uuidv4()}`;
  const businessRecords = new BusinessRecordSyncService(manager);

  try {
    policies.update({
      entityType: 'sales_invoice',
      enabled: true,
      outboundEnabled: true,
      inboundEnabled: false,
      dataScope: 'TENANT',
    });
    const dispatcher = new EventDispatcher();
    new MasterDataSyncService(manager).registerHandlers(dispatcher);
    const inbox = new InboxRepository(manager);
    const pull = new PullChangesService(inbox, new EventValidator(), dispatcher);
    const deferredEvent: SyncEvent = {
      eventId: uuidv4(),
      tenantId: identity.tenantId,
      branchId: 'deferred-source',
      deviceId: 'deferred-device',
      entityType: 'sales_invoice',
      entityId: 'deferred-invoice',
      operationType: 'CREATE',
      entityVersion: 1,
      schemaVersion: 1,
      dataScope: 'TENANT',
      payload: {
        record: {
          entityType: 'sales_invoice',
          id: 'deferred-invoice',
          header: { id: 'deferred-invoice', invoiceNumber: 'DEFERRED-1' },
          lines: [],
        },
      },
      createdAt: new Date().toISOString(),
    };
    assert.deepEqual(await pull.applyIncoming([deferredEvent]), { applied: 0, duplicates: 0, failed: 0 });
    assert.equal(inbox.getStatus(deferredEvent.eventId), 'RECEIVED');
    policies.update({
      entityType: 'sales_invoice',
      enabled: true,
      outboundEnabled: true,
      inboundEnabled: true,
      dataScope: 'TENANT',
    });
    assert.deepEqual(await pull.applyIncoming([deferredEvent]), { applied: 1, duplicates: 0, failed: 0 });
    assert.equal(inbox.getStatus(deferredEvent.eventId), 'APPLIED');

    let eventId = '';
    manager.executeTransaction((transaction) => {
      transaction.run('INSERT INTO categories (id, name) VALUES (?, ?)', [categoryId, categoryId]);
      transaction.run('INSERT INTO brands (id, name) VALUES (?, ?)', [brandId, brandId]);
      transaction.run(
        `INSERT INTO products (id, sku, barcode, name, category_id, brand_id, size)
         VALUES (?, ?, ?, 'Sync item', ?, ?, '1x1')`,
        [productId, productId, productId, categoryId, brandId]
      );
      transaction.run(
        `INSERT INTO sales_invoices
          (id, invoice_number, date, customer_id, warehouse_id, subtotal, total_amount, created_by)
         VALUES (?, ?, '2026-01-02', ?, ?, 120, 120, 'usr_admin')`,
        [invoiceId, invoiceNumber, customerId, warehouseId]
      );
      transaction.run(
        `INSERT INTO sales_invoice_items
          (id, invoice_id, product_id, product_name, product_sku, product_grade, size,
           quantity_m2, boxes_count, pieces_count, unit_price, original_unit_price, unit_cost,
           total_price, total_cost, profit, meters_per_box, pieces_per_box)
         VALUES (?, ?, ?, 'Sync item', 'SYNC', 'A', '1x1', 2, 1, 0, 60, 60, 20, 120, 40, 80, 2, 0)`,
        [`sync-line-${uuidv4()}`, invoiceId, productId]
      );
      eventId = businessRecords.capture(transaction, 'sales_invoice', invoiceId, 'CREATE')!;
    });
    const captured = outbox.getById(eventId);
    assert.equal(captured?.entityType, 'sales_invoice');
    assert.equal(captured?.dataScope, 'TENANT');
    assert.equal((captured?.payload as any).record.header.invoiceNumber, invoiceNumber);
    assert.equal((captured?.payload as any).record.lines.length, 1);
    assert.equal((captured?.payload as any).record.header.paymentReference, undefined);

    let voidEventId = '';
    manager.executeTransaction((transaction) => {
      transaction.run(`UPDATE sales_invoices SET invoice_status='VOID' WHERE id=?`, [invoiceId]);
      voidEventId = businessRecords.capture(transaction, 'sales_invoice', invoiceId, 'UPDATE')!;
    });
    assert.equal(outbox.getById(voidEventId)?.entityVersion, 2);
    assert.equal((outbox.getById(voidEventId)?.payload as any).record.header.invoiceStatus, 'VOID');

    policies.update({
      entityType: 'sales_return',
      enabled: true,
      outboundEnabled: true,
      inboundEnabled: true,
      dataScope: 'TENANT',
    });
    const returnId = `sync-return-${uuidv4()}`;
    let returnEventId = '';
    manager.executeTransaction((transaction) => {
      transaction.run(
        `INSERT INTO sales_returns
          (id, return_number, original_invoice_id, original_invoice_number, customer_id,
           warehouse_id, date, total_amount, reason, created_by)
         VALUES (?, ?, ?, ?, ?, ?, '2026-01-03', 20, 'sync test', 'usr_admin')`,
        [returnId, `RETURN-${uuidv4().slice(0, 8)}`, invoiceId, invoiceNumber, customerId, warehouseId]
      );
      transaction.run(
        `INSERT INTO sales_return_items
          (id, return_id, product_id, product_name, grade, quantity_m2, boxes_count,
           unit_price, unit_cost, total_refund)
         VALUES (?, ?, ?, 'Sync item', 'A', 1, 0.5, 20, 10, 20)`,
        [`sync-return-line-${uuidv4()}`, returnId, productId]
      );
      returnEventId = businessRecords.capture(transaction, 'sales_return', returnId, 'CREATE')!;
    });
    assert.equal(outbox.getById(returnEventId)?.entityType, 'sales_return');
    assert.equal((outbox.getById(returnEventId)?.payload as any).record.lines.length, 1);
    let returnedInvoiceEventId = '';
    manager.executeTransaction((transaction) => {
      transaction.run('UPDATE sales_invoices SET returned_amount=20 WHERE id=?', [invoiceId]);
      returnedInvoiceEventId = businessRecords.capture(transaction, 'sales_invoice', invoiceId, 'UPDATE')!;
    });
    const returnedInvoiceEvent = outbox.getById(returnedInvoiceEventId);
    assert.equal(returnedInvoiceEvent?.entityVersion, 3);
    assert.equal((returnedInvoiceEvent?.payload as any).record.header.returnedAmount, 20);

    const incoming: SyncEvent = {
      eventId: uuidv4(),
      tenantId: identity.tenantId,
      branchId: 'remote-branch',
      deviceId: 'remote-device',
      entityType: 'sales_invoice',
      entityId: 'remote-invoice-1',
      operationType: 'CREATE',
      entityVersion: 1,
      schemaVersion: 1,
      dataScope: 'TENANT',
      payload: {
        record: {
          entityType: 'sales_invoice',
          id: 'remote-invoice-1',
          header: { id: 'remote-invoice-1', invoiceNumber: 'REMOTE-1', totalAmount: 55, invoiceStatus: 'COMPLETED' },
          lines: [{ id: 'remote-line-1', productName: 'Remote tile', quantityM2: 1, totalPrice: 55 }],
        },
      },
      createdAt: new Date().toISOString(),
    };
    assert.deepEqual(await pull.applyIncoming([incoming]), { applied: 1, duplicates: 0, failed: 0 });
    assert.equal(manager.query('SELECT id FROM sales_invoices WHERE id=?', [incoming.entityId]).length, 0);
    assert.equal(manager.query('SELECT event_id FROM sync_remote_records WHERE event_id=?', [incoming.eventId]).length, 1);
    assert.equal(manager.query('SELECT entity_id FROM sync_remote_entities WHERE entity_id=?', [incoming.entityId]).length, 1);
    assert.deepEqual(await pull.applyIncoming([incoming]), { applied: 0, duplicates: 1, failed: 0 });
    const newerEvent = {
      ...incoming,
      eventId: uuidv4(),
      entityVersion: 2,
      operationType: 'UPDATE' as const,
      payload: {
        record: {
          ...((incoming.payload as any).record),
          header: { id: incoming.entityId, invoiceNumber: 'REMOTE-1', totalAmount: 55, invoiceStatus: 'VOID' },
        },
      },
    };
    assert.deepEqual(await pull.applyIncoming([newerEvent]), { applied: 1, duplicates: 0, failed: 0 });
    const latest = businessRecords.listRemoteRecords().find((record) => record.entityId === incoming.entityId);
    assert.equal(JSON.parse(latest!.payload).record.header.invoiceStatus, 'VOID');
    const staleEvent = { ...incoming, eventId: uuidv4() };
    assert.deepEqual(await pull.applyIncoming([staleEvent]), { applied: 1, duplicates: 0, failed: 0 });
    const stillLatest = businessRecords.listRemoteRecords().find((record) => record.entityId === incoming.entityId);
    assert.equal(JSON.parse(stillLatest!.payload).record.header.invoiceStatus, 'VOID');
    const invalidSnapshot = {
      ...incoming,
      eventId: uuidv4(),
      entityId: 'invalid-remote-invoice',
      payload: {
        record: {
          id: 'invalid-remote-invoice',
          entityType: 'sales_invoice',
          header: { id: 'invalid-remote-invoice', unexpectedField: 'must be rejected' },
          lines: [],
        },
      },
    };
    assert.deepEqual(await pull.applyIncoming([invalidSnapshot]), { applied: 0, duplicates: 0, failed: 1 });
    assert.equal(manager.query('SELECT event_id FROM sync_remote_records WHERE event_id=?', [invalidSnapshot.eventId]).length, 0);
  } finally {
    acknowledgeTenantOutbox(manager, identity.tenantId);
    MasterDataSyncService.configure(null);
  }
});

test('business document sync: captures purchase snapshots without altering local purchase balances', async () => {
  const manager = await boot();
  const identity = {
    tenantId: `purchase-sync-tenant-${uuidv4()}`,
    branchId: `purchase-sync-branch-${uuidv4()}`,
    deviceId: `purchase-sync-device-${uuidv4()}`,
    canManagePolicies: true,
  };
  MasterDataSyncService.configure(identity);
  const policies = new SyncPolicyService(manager);
  const businessRecords = new BusinessRecordSyncService(manager);
  const outbox = new OutboxRepository(manager);
  const categoryId = `sync-purchase-category-${uuidv4()}`;
  const brandId = `sync-purchase-brand-${uuidv4()}`;
  const supplierId = `sync-purchase-supplier-${uuidv4()}`;
  const warehouseId = manager.query<{ id: string }>('SELECT id FROM warehouses LIMIT 1')[0]?.id;
  const productId = `sync-purchase-product-${uuidv4()}`;
  assert.ok(warehouseId);
  manager.executeTransaction((transaction) => {
    transaction.run('INSERT INTO categories (id, name) VALUES (?, ?)', [categoryId, 'Sync purchase category']);
    transaction.run('INSERT INTO brands (id, name) VALUES (?, ?)', [brandId, 'Sync purchase brand']);
    transaction.run(
      'INSERT INTO suppliers (id, code, name, phone, current_balance, total_purchases) VALUES (?, ?, ?, ?, 0, 0)',
      [supplierId, `SUP-${uuidv4().slice(0, 6)}`.toUpperCase(), 'Sync purchase supplier', '0500000000']
    );
    transaction.run(
      `INSERT INTO products
        (id, sku, barcode, name, category_id, brand_id, grade, size, base_unit,
         sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
         wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 10, 12, 11, 10, 0, 1)`,
      [productId, `SKU-${uuidv4().slice(0, 8)}`, `BAR-${uuidv4().slice(0, 8)}`, 'Sync purchase product', categoryId, brandId, 'GRADE_1', '1x1', 'M2', 'M2']
    );
  });

  try {
    policies.update({ entityType: 'purchase_invoice', enabled: true, outboundEnabled: true, inboundEnabled: true, dataScope: 'TENANT' });
    policies.update({ entityType: 'purchase_return', enabled: true, outboundEnabled: true, inboundEnabled: true, dataScope: 'TENANT' });

    const invoiceId = `purchase-sync-invoice-${uuidv4()}`;
    const invoiceNumber = `PUR-${uuidv4().slice(0, 8)}`;
    let invoiceEventId = '';
    manager.executeTransaction((transaction) => {
      transaction.run(
        `INSERT INTO purchase_invoices
          (id, invoice_number, supplier_id, warehouse_id, date, due_date, subtotal, total_amount,
           paid_amount, remaining_amount, payment_type, payment_status, created_by)
         VALUES (?, ?, ?, ?, '2026-01-08', '2026-01-18', 120, 120, 0, 120, 'CASH', 'UNPAID', 'usr_admin')`,
        [invoiceId, invoiceNumber, supplierId, warehouseId]
      );
      transaction.run(
        `INSERT INTO purchase_invoice_items
          (id, purchase_id, product_id, product_name, grade, quantity_m2, boxes_count,
           unit_cost, total_cost, meters_per_box, pieces_per_box)
         VALUES (?, ?, ?, 'Purchase item', 'GRADE_1', 1, 1, 120, 120, 1, 1)`,
        [`purchase-sync-item-${uuidv4()}`, invoiceId, productId]
      );
      invoiceEventId = businessRecords.capture(transaction, 'purchase_invoice', invoiceId, 'CREATE')!;
      assert.ok(invoiceEventId);
      assert.equal(outbox.getById(invoiceEventId)?.entityType, 'purchase_invoice');
    });

    const returnId = `purchase-sync-return-${uuidv4()}`;
    let returnEventId = '';
    manager.executeTransaction((transaction) => {
      transaction.run(
        `INSERT INTO purchase_returns
          (id, return_number, original_purchase_id, original_invoice_number, supplier_id,
           warehouse_id, date, total_amount, refunded_amount, remaining_to_balance, reason, created_by)
         VALUES (?, ?, ?, ?, ?, ?, '2026-01-09', 35, 35, 0, 'sync purchase return', 'usr_admin')`,
        [returnId, `PRET-${uuidv4().slice(0, 8)}`, invoiceId, invoiceNumber, supplierId, warehouseId]
      );
      transaction.run(
        `INSERT INTO purchase_return_items
          (id, return_id, product_id, product_name, grade, quantity_m2, boxes_count, unit_cost, total_refund)
         VALUES (?, ?, ?, 'Purchase item', 'GRADE_1', 1, 1, 35, 35)`,
        [`purchase-sync-return-item-${uuidv4()}`, returnId, productId]
      );
      returnEventId = businessRecords.capture(transaction, 'purchase_return', returnId, 'CREATE')!;
      assert.ok(returnEventId);
      assert.equal(outbox.getById(returnEventId)?.entityType, 'purchase_return');
    });

    const capturedInvoice = outbox.getById(invoiceEventId);
    assert.ok(capturedInvoice);
    assert.equal((capturedInvoice.payload as any).record.header.invoiceNumber, invoiceNumber);
    assert.equal((capturedInvoice.payload as any).record.header.totalAmount, 120);
    const capturedReturn = outbox.getById(returnEventId);
    assert.ok(capturedReturn);
    assert.equal((capturedReturn.payload as any).record.header.totalAmount, 35);
  } finally {
    acknowledgeTenantOutbox(manager, identity.tenantId);
    MasterDataSyncService.configure(null);
  }
});

test('business document sync: captures payment snapshots without altering local balances', async () => {
  const manager = await boot();
  const identity = {
    tenantId: `payment-sync-tenant-${uuidv4()}`,
    branchId: `payment-sync-branch-${uuidv4()}`,
    deviceId: `payment-sync-device-${uuidv4()}`,
    canManagePolicies: true,
  };
  MasterDataSyncService.configure(identity);
  const policies = new SyncPolicyService(manager);
  const businessRecords = new BusinessRecordSyncService(manager);
  const outbox = new OutboxRepository(manager);
  const customerId = `payment-customer-${uuidv4()}`;
  const supplierId = `payment-supplier-${uuidv4()}`;
  const warehouseId = manager.query<{ id: string }>('SELECT id FROM warehouses LIMIT 1')[0]?.id;
  const branchId = manager.query<{ id: string }>('SELECT id FROM branches LIMIT 1')[0]?.id;
  const registerId = manager.query<{ id: string }>('SELECT id FROM cash_registers LIMIT 1')[0]?.id || 'cr_main';
  const categoryId = `payment-category-${uuidv4()}`;
  const brandId = `payment-brand-${uuidv4()}`;
  const productId = `payment-product-${uuidv4()}`;
  assert.ok(warehouseId);
  assert.ok(branchId);
  manager.executeTransaction((transaction) => {
    transaction.run('INSERT INTO categories (id, name) VALUES (?, ?)', [categoryId, 'Payment sync category']);
    transaction.run('INSERT INTO brands (id, name) VALUES (?, ?)', [brandId, 'Payment sync brand']);
    transaction.run('INSERT INTO customers (id, code, name, phone, current_balance) VALUES (?, ?, ?, ?, 0)', [customerId, `CUST-${uuidv4().slice(0, 6)}`.toUpperCase(), 'Payment sync customer', '0500000000']);
    transaction.run('INSERT INTO suppliers (id, code, name, phone, current_balance) VALUES (?, ?, ?, ?, 0)', [supplierId, `SUP-${uuidv4().slice(0, 6)}`.toUpperCase(), 'Payment sync supplier', '0500000001']);
    transaction.run(
      `INSERT INTO products (id, sku, barcode, name, category_id, brand_id, grade, size, base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2, wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 10, 12, 11, 10, 0, 1)`,
      [productId, `SKU-${uuidv4().slice(0, 8)}`, `BAR-${uuidv4().slice(0, 8)}`, 'Payment sync product', categoryId, brandId, 'GRADE_1', '1x1', 'M2', 'M2']
    );
  });

  try {
    policies.update({ entityType: 'customer_payment', enabled: true, outboundEnabled: true, inboundEnabled: true, dataScope: 'TENANT' });
    policies.update({ entityType: 'supplier_payment', enabled: true, outboundEnabled: true, inboundEnabled: true, dataScope: 'TENANT' });

    const invoiceId = `payment-invoice-${uuidv4()}`;
    const paymentId = `payment-receipt-${uuidv4()}`;
    manager.executeTransaction((transaction) => {
      transaction.run(
        `INSERT INTO sales_invoices (id, invoice_number, date, customer_id, warehouse_id, subtotal, total_amount, paid_amount, remaining_amount, payment_status, invoice_status, created_by)
         VALUES (?, ?, '2026-01-20', ?, ?, 100, 100, 0, 100, 'UNPAID', 'OPEN', 'usr_admin')`,
        [invoiceId, `INV-${uuidv4().slice(0, 8)}`.toUpperCase(), customerId, warehouseId]
      );
      transaction.run(
        `INSERT INTO customer_payments (id, receipt_number, customer_id, invoice_id, amount, payment_type, date, branch_id, register_id, notes, performed_by)
         VALUES (?, ?, ?, ?, 25, 'CASH', '2026-01-20', ?, ?, 'sync payment', 'usr_admin')`,
        [paymentId, `REC-${uuidv4().slice(0, 8)}`.toUpperCase(), customerId, invoiceId, branchId, registerId]
      );
      transaction.run(
        `INSERT INTO customer_payment_allocations (id, payment_id, sales_invoice_id, amount) VALUES (?, ?, ?, 25)`,
        [`cpa_${uuidv4().slice(0, 8)}`, paymentId, invoiceId]
      );
      const eventId = businessRecords.capture(transaction, 'customer_payment', paymentId, 'CREATE');
      assert.ok(eventId);
      const event = outbox.getById(eventId!);
      assert.equal(event?.entityType, 'customer_payment');
      assert.equal((event?.payload as any).record.header.amount, 25);
      assert.equal((event?.payload as any).record.lines.length, 1);
    });

    const purchaseInvoiceId = `payment-purchase-${uuidv4()}`;
    const supplierPaymentId = `supplier-payment-receipt-${uuidv4()}`;
    manager.executeTransaction((transaction) => {
      transaction.run(
        `INSERT INTO purchase_invoices (id, invoice_number, supplier_id, warehouse_id, date, due_date, subtotal, total_amount, paid_amount, remaining_amount, payment_status, created_by)
         VALUES (?, ?, ?, ?, '2026-01-21', '2026-01-31', 80, 80, 0, 80, 'UNPAID', 'usr_admin')`,
        [purchaseInvoiceId, `PUR-${uuidv4().slice(0, 8)}`.toUpperCase(), supplierId, warehouseId]
      );
      transaction.run(
        `INSERT INTO supplier_payments (id, receipt_number, supplier_id, amount, payment_type, date, branch_id, register_id, notes, performed_by)
         VALUES (?, ?, ?, 30, 'CASH', '2026-01-21', ?, ?, 'sync supplier payment', 'usr_admin')`,
        [supplierPaymentId, `PAY-${uuidv4().slice(0, 8)}`.toUpperCase(), supplierId, branchId, registerId]
      );
      transaction.run(
        `INSERT INTO supplier_payment_allocations (id, payment_id, purchase_invoice_id, amount) VALUES (?, ?, ?, 30)`,
        [`spa_${uuidv4().slice(0, 8)}`, supplierPaymentId, purchaseInvoiceId]
      );
      const eventId = businessRecords.capture(transaction, 'supplier_payment', supplierPaymentId, 'CREATE');
      assert.ok(eventId);
      const event = outbox.getById(eventId!);
      assert.equal(event?.entityType, 'supplier_payment');
      assert.equal((event?.payload as any).record.header.amount, 30);
      assert.equal((event?.payload as any).record.lines.length, 1);
    });
  } finally {
    acknowledgeTenantOutbox(manager, identity.tenantId);
    MasterDataSyncService.configure(null);
  }
});

test('sync policies: inbound-disabled events are retained and applied after re-enabling', async () => {
  const manager = await boot();
  const identity = {
    tenantId: `policy-inbound-tenant-${uuidv4()}`,
    branchId: `policy-inbound-branch-${uuidv4()}`,
    deviceId: `policy-inbound-device-${uuidv4()}`,
  };
  const service = new MasterDataSyncService(manager);
  MasterDataSyncService.configure(identity);
  try {
    const entityId = `policy-inbound-category-${uuidv4()}`;
    const makePolicyEvent = (version: number, inboundEnabled: boolean): SyncEvent => ({
      eventId: uuidv4(),
      tenantId: identity.tenantId,
      branchId: 'head-office',
      deviceId: 'head-office-device',
      entityType: 'sync_policy',
      entityId: 'category',
      operationType: 'UPSERT',
      entityVersion: version,
      schemaVersion: 1,
      dataScope: 'TENANT',
      payload: {
        policy: {
          entityType: 'category',
          enabled: true,
          outboundEnabled: true,
          inboundEnabled,
          dataScope: 'TENANT',
        },
      },
      createdAt: new Date().toISOString(),
    });
    const event: SyncEvent = {
      eventId: uuidv4(),
      tenantId: identity.tenantId,
      branchId: 'source-branch',
      deviceId: 'source-device',
      entityType: 'category',
      entityId,
      operationType: 'CREATE',
      entityVersion: 1,
      schemaVersion: 1,
      dataScope: 'TENANT',
      payload: { row: { id: entityId, name: 'Deferred category' } },
      createdAt: new Date().toISOString(),
    };
    const inbox = new InboxRepository(manager);
    let pullIndex = 0;
    const engine = new SyncEngine({
      scope: identity.tenantId,
      transport: {
        pushEvents: async (events) => ({ acknowledged: events.map((item) => item.eventId), failed: [] }),
        pullEvents: async () => {
          if (pullIndex === 0) {
            pullIndex++;
            return { events: [makePolicyEvent(1, false), event], nextCursor: '2' };
          }
          if (pullIndex === 1) {
            pullIndex++;
            return { events: [makePolicyEvent(2, true)], nextCursor: '3' };
          }
          return { events: [], nextCursor: '3' };
        },
      },
    });
    service.registerHandlers(engine.dispatcher);
    await engine.runCycle();
    assert.equal(inbox.getStatus(event.eventId), 'RECEIVED');
    assert.equal(engine.cursor.getCursor(identity.tenantId), '2');
    assert.equal(manager.query('SELECT id FROM categories WHERE id=?', [entityId]).length, 0);

    await engine.runCycle();
    assert.equal(inbox.getStatus(event.eventId), 'RECEIVED');
    await engine.runCycle();
    assert.equal(inbox.getStatus(event.eventId), 'APPLIED');
    assert.equal(manager.query('SELECT id FROM categories WHERE id=?', [entityId]).length, 1);
  } finally {
    MasterDataSyncService.configure(null);
  }
});

test('sync conflict route requires administrator access', () => {
  assert.equal(NavigationService.getRequiredPermission('/admin/sync-conflicts'), 'admin.view');
});

test('master data sync: captures tombstones and applies or resolves incoming records', async () => {
  const manager = await boot();
  const identity = {
    tenantId: `tenant-${uuidv4()}`,
    branchId: `branch-${uuidv4()}`,
    deviceId: `device-${uuidv4()}`,
    canManagePolicies: true,
  };
  MasterDataSyncService.configure(identity);
  const policyService = new SyncPolicyService(manager);
  policyService.publishUnmanagedPolicies();
  acknowledgeTenantOutbox(manager, identity.tenantId);

  try {
    const service = new MasterDataSyncService(manager);
    const outbox = new OutboxRepository(manager);
    const localId = `cat-${uuidv4()}`;
    let createEventId = '';
    manager.executeTransaction((transaction) => {
      transaction.run('INSERT INTO categories (id, name) VALUES (?, ?)', [localId, `Local ${localId}`]);
      createEventId = service.capture(transaction, 'category', localId, 'CREATE')!;
    });

    const createEvent = outbox.getById(createEventId);
    assert.equal(createEvent?.dataScope, 'TENANT');
    assert.equal(createEvent?.entityVersion, 1);
    assert.equal((createEvent?.payload as { row: { name: string } }).row.name, `Local ${localId}`);

    const deletedId = `cat-${uuidv4()}`;
    let deleteEventId = '';
    manager.executeTransaction((transaction) => {
      transaction.run('INSERT INTO categories (id, name) VALUES (?, ?)', [deletedId, `Delete ${deletedId}`]);
      deleteEventId = service.capture(transaction, 'category', deletedId, 'DELETE')!;
      transaction.run('DELETE FROM categories WHERE id=?', [deletedId]);
    });
    assert.deepEqual(outbox.getById(deleteEventId)?.payload, { deleted: true });

    const dispatcher = new EventDispatcher();
    service.registerHandlers(dispatcher);
    const pull = new PullChangesService(new InboxRepository(manager), new EventValidator(), dispatcher);
    const remoteId = `cat-${uuidv4()}`;
    const remoteEvent: SyncEvent = {
      eventId: uuidv4(),
      tenantId: identity.tenantId,
      branchId: `remote-${uuidv4()}`,
      deviceId: `remote-device-${uuidv4()}`,
      entityType: 'category',
      entityId: remoteId,
      operationType: 'CREATE',
      entityVersion: 1,
      schemaVersion: 1,
      dataScope: 'TENANT',
      payload: { row: { id: remoteId, name: `Remote ${remoteId}`, parent_id: null, description: null } },
      createdAt: new Date().toISOString(),
    };
    assert.deepEqual(await pull.applyIncoming([remoteEvent]), { applied: 1, duplicates: 0, failed: 0 });
    assert.equal(manager.query<{ name: string }>('SELECT name FROM categories WHERE id=?', [remoteId])[0]?.name, `Remote ${remoteId}`);
    assert.deepEqual(await pull.applyIncoming([remoteEvent]), { applied: 0, duplicates: 1, failed: 0 });

    const invalidDelete = {
      ...remoteEvent,
      eventId: uuidv4(),
      operationType: 'UPDATE' as const,
      entityId: `cat-${uuidv4()}`,
      payload: { deleted: true },
    };
    assert.deepEqual(await pull.applyIncoming([invalidDelete]), { applied: 0, duplicates: 0, failed: 1 });
    assert.equal(manager.query('SELECT id FROM categories WHERE id=?', [invalidDelete.entityId]).length, 0);

    const unexpectedField = {
      ...remoteEvent,
      eventId: uuidv4(),
      entityId: `cat-${uuidv4()}`,
      payload: {
        row: {
          id: `cat-placeholder`,
          name: 'Unexpected payload',
          parent_id: null,
          description: null,
          internal_secret: 'must not be accepted',
        },
      },
    };
    unexpectedField.payload.row.id = unexpectedField.entityId;
    assert.deepEqual(await pull.applyIncoming([unexpectedField]), { applied: 0, duplicates: 0, failed: 1 });
    assert.equal(manager.query('SELECT id FROM categories WHERE id=?', [unexpectedField.entityId]).length, 0);

    const conflictingId = `cat-${uuidv4()}`;
    manager.run('INSERT INTO categories (id, name) VALUES (?, ?)', [conflictingId, `Local conflict ${conflictingId}`]);
    const conflictEvent: SyncEvent = {
      ...remoteEvent,
      eventId: uuidv4(),
      entityId: conflictingId,
      payload: { row: { id: conflictingId, name: `Remote conflict ${conflictingId}`, parent_id: null, description: null } },
    };
    assert.deepEqual(await pull.applyIncoming([conflictEvent]), { applied: 1, duplicates: 0, failed: 0 });
    const conflict = service.listOpenConflicts().find((item) => item.entityId === conflictingId);
    assert.ok(conflict);
    service.resolveConflict(String(conflict!.id), 'ACCEPT_REMOTE');
    assert.equal(manager.query<{ name: string }>('SELECT name FROM categories WHERE id=?', [conflictingId])[0]?.name, `Remote conflict ${conflictingId}`);
  } finally {
    MasterDataSyncService.configure(null);
  }
});

test('master data bootstrap: publishes existing records in resumable bounded batches', async () => {
  const manager = await boot();
  const identity = {
    tenantId: `bootstrap-tenant-${uuidv4()}`,
    branchId: `bootstrap-branch-${uuidv4()}`,
    deviceId: `bootstrap-device-${uuidv4()}`,
    canManagePolicies: true,
  };
  MasterDataSyncService.configure(identity);
  const policyService = new SyncPolicyService(manager);
  policyService.publishUnmanagedPolicies();
  acknowledgeTenantOutbox(manager, identity.tenantId);

  try {
    const service = new MasterDataSyncService(manager);
    const suffix = uuidv4();
    manager.run('INSERT INTO categories (id, name) VALUES (?, ?)', [`cat_boot_${suffix}`, `Bootstrap category ${suffix}`]);
    manager.run('INSERT INTO brands (id, name) VALUES (?, ?)', [`brand_boot_${suffix}`, `Bootstrap brand ${suffix}`]);
    manager.run(
      'INSERT INTO customers (id, code, name, phone) VALUES (?, ?, ?, ?)',
      [`cust_boot_${suffix}`, `CB-${suffix}`, `Bootstrap customer ${suffix}`, '0500000000']
    );
    manager.run(
      'INSERT INTO suppliers (id, code, name, phone) VALUES (?, ?, ?, ?)',
      [`supplier_boot_${suffix}`, `SB-${suffix}`, `Bootstrap supplier ${suffix}`, '0500000000']
    );

    const expectedCount = service.getBootstrapProgress().entities.reduce((sum, entity) => sum + entity.total, 0);
    const firstBatch = service.publishExistingDataBatch(1);
    assert.equal(firstBatch.processedThisBatch, 1);
    assert.equal(firstBatch.entities[0].processed, 1);
    assert.equal(firstBatch.entities.slice(1).every((entity) => entity.processed === 0), true);

    let progress = firstBatch;
    for (let attempt = 0; !progress.completed && attempt < 100; attempt++) {
      progress = service.publishExistingDataBatch(500);
    }
    assert.equal(progress.completed, true);
    const queued = manager.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sync_outbox WHERE tenant_id=? AND entity_type!='sync_policy'`,
      [identity.tenantId]
    )[0]?.count;
    assert.equal(queued, expectedCount);

    const repeated = service.publishExistingDataBatch(500);
    assert.equal(repeated.completed, true);
    assert.equal(repeated.processedThisBatch, 0);
    assert.equal(manager.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sync_outbox WHERE tenant_id=? AND entity_type!='sync_policy'`,
      [identity.tenantId]
    )[0]?.count, expectedCount);
  } finally {
    MasterDataSyncService.configure(null);
  }
});

test('outbox: enqueue within transaction persists event', async () => {
  const manager = await boot();
  const outbox = new OutboxRepository(manager);
  let eventId = '';
  manager.executeTransaction(() => {
    eventId = outbox.enqueue({
      branchId: 'br_main',
      entityType: 'sales_invoice',
      entityId: 'inv_1',
      operationType: 'CREATE',
      payload: { total: 100 },
    });
    // simulate business write in same transaction
    manager.run(`INSERT OR IGNORE INTO customers (id, code, name) VALUES ('c_sync_test','CST','Sync Test')`);
  });
  assert.ok(eventId);
  const evt = outbox.getById(eventId);
  assert.ok(evt);
  assert.equal(evt!.entityType, 'sales_invoice');
  assert.equal(outbox.countPending() >= 1, true);
});

test('outbox: preserves enqueue order for entity versions and bootstrap dependencies', async () => {
  const manager = await boot();
  const outbox = new OutboxRepository(manager);
  const entityId = `version-order-${uuidv4()}`;
  const eventIds: string[] = [];

  manager.executeTransaction(() => {
    eventIds.push(outbox.enqueue({
      tenantId: 'version-order-tenant',
      branchId: 'version-order-branch',
      entityType: 'category',
      entityId,
      operationType: 'CREATE',
      entityVersion: 1,
      dataScope: 'TENANT',
      payload: { version: 1 },
    }));
    eventIds.push(outbox.enqueue({
      tenantId: 'version-order-tenant',
      branchId: 'version-order-branch',
      entityType: 'category',
      entityId,
      operationType: 'UPDATE',
      entityVersion: 2,
      dataScope: 'TENANT',
      payload: { version: 2 },
    }));
    eventIds.push(outbox.enqueue({
      tenantId: 'version-order-tenant',
      branchId: 'version-order-branch',
      entityType: 'product',
      entityId: `product-${entityId}`,
      operationType: 'CREATE',
      entityVersion: 1,
      dataScope: 'TENANT',
      payload: { categoryId: entityId },
    }));
  });

  const pendingIds = () => outbox.listPending(500)
    .map((event) => event.eventId)
    .filter((eventId) => eventIds.includes(eventId));
  assert.deepEqual(pendingIds(), [eventIds[0]]);
  outbox.markAcknowledged(eventIds[0]);
  assert.deepEqual(pendingIds(), [eventIds[1]]);
  outbox.markAcknowledged(eventIds[1]);
  assert.deepEqual(pendingIds(), [eventIds[2]]);
});

test('outbox: later entity versions wait for earlier failed events to be acknowledged', async () => {
  const manager = await boot();
  const outbox = new OutboxRepository(manager);
  const entityId = `retry-order-${uuidv4()}`;
  const firstEventId = outbox.enqueue({
    tenantId: 'retry-order-tenant',
    branchId: 'retry-order-branch',
    entityType: 'customer',
    entityId,
    operationType: 'CREATE',
    entityVersion: 1,
    dataScope: 'TENANT',
    payload: { version: 1 },
  });
  const secondEventId = outbox.enqueue({
    tenantId: 'retry-order-tenant',
    branchId: 'retry-order-branch',
    entityType: 'customer',
    entityId,
    operationType: 'UPDATE',
    entityVersion: 2,
    dataScope: 'TENANT',
    payload: { version: 2 },
  });
  outbox.markFailed(firstEventId, 'temporary failure', '2999-01-01 00:00:00');

  const beforeRetry = outbox.listPending(500).map((event) => event.eventId);
  assert.equal(beforeRetry.includes(firstEventId), false);
  assert.equal(beforeRetry.includes(secondEventId), false);

  outbox.markAcknowledged(firstEventId);
  const afterAck = outbox.listPending(500).map((event) => event.eventId);
  assert.equal(afterAck.includes(secondEventId), true);
});

test('outbox: ISO retry timestamps are compared as SQLite datetimes', async () => {
  const manager = await boot();
  const outbox = new OutboxRepository(manager);
  const eventId = outbox.enqueue({
    branchId: 'retry-date-branch',
    entityType: 'customer',
    entityId: `retry-date-${uuidv4()}`,
    operationType: 'CREATE',
    payload: { name: 'Retry date' },
  });

  outbox.markFailed(eventId, 'temporary failure', '2999-01-01T00:00:00.000Z');
  assert.equal(outbox.listPending(500).some((event) => event.eventId === eventId), false);

  outbox.markFailed(eventId, 'temporary failure', '2000-01-01T00:00:00.000Z');
  assert.equal(outbox.listPending(500).some((event) => event.eventId === eventId), true);
});

test('outbox: stores tenant-wide or branch-only event scope', async () => {
  const manager = await boot();
  const outbox = new OutboxRepository(manager);
  const tenantEvent = outbox.enqueue({
    tenantId: 'tenant-1',
    branchId: 'br_main',
    entityType: 'product',
    entityId: 'product-shared',
    operationType: 'UPSERT',
    dataScope: 'TENANT',
    payload: { name: 'Shared product' },
  });
  const branchEvent = outbox.enqueue({
    tenantId: 'tenant-1',
    branchId: 'br_main',
    entityType: 'sales_invoice',
    entityId: 'invoice-local',
    operationType: 'CREATE',
    payload: { id: 'invoice-local' },
  });

  assert.equal(outbox.getById(tenantEvent)?.dataScope, 'TENANT');
  assert.equal(outbox.getById(branchEvent)?.dataScope, 'BRANCH');
});

test('outbox: business transaction rollback also rolls back the sync event', async () => {
  const manager = await boot();
  const outbox = new OutboxRepository(manager);
  const before = outbox.countPending();

  assert.throws(() => manager.executeTransaction(() => {
    outbox.enqueue({
      branchId: 'br_main',
      entityType: 'customer',
      entityId: 'rollback-test',
      operationType: 'CREATE',
      payload: { name: 'Must roll back' },
    });
    throw new Error('force rollback');
  }));

  assert.equal(outbox.countPending(), before);
});

test('outbox: interrupted in-flight events can be recovered after restart', async () => {
  const manager = await boot();
  const outbox = new OutboxRepository(manager);
  const eventId = outbox.enqueue({
    branchId: 'br_main',
    entityType: 'customer',
    entityId: 'interrupted-test',
    operationType: 'CREATE',
    payload: { name: 'Interrupted' },
  });

  outbox.markInFlight(eventId);
  assert.equal(outbox.getById(eventId)?.deliveryStatus, 'IN_FLIGHT');
  assert.ok(outbox.recoverInFlight() >= 1);
  assert.equal(outbox.getById(eventId)?.deliveryStatus, 'PENDING');
});

test('inbox: duplicate event is detected and not re-applied', async () => {
  const manager = await boot();
  const inbox = new InboxRepository(manager);
  const event = {
    eventId: uuidv4(),
    branchId: 'br_main',
    entityType: 'customer',
    entityId: 'cust_1',
    operationType: 'CREATE' as any,
    entityVersion: 1,
    schemaVersion: 1,
    payload: { name: 'A' },
    createdAt: new Date().toISOString(),
  };
  assert.equal(inbox.recordReceived(event as any), true);
  assert.equal(inbox.recordReceived(event as any), false);
  assert.equal(inbox.isDuplicate(event.eventId), true);
  inbox.markApplied(event.eventId);
  assert.throws(
    () => inbox.recordReceived({ ...event, payload: { name: 'Different content' } } as any),
    /event ID collision/
  );
  const pull = new PullChangesService(inbox, new EventValidator(), new EventDispatcher());
  assert.deepEqual(
    await pull.applyIncoming([{ ...event, payload: { name: 'Different content' } } as any]),
    { applied: 0, duplicates: 0, failed: 1 }
  );
  inbox.markFailed(event.eventId, 'late failure');
  assert.equal(inbox.getStatus(event.eventId), 'APPLIED');
});

test('cursor: set/get/reset', async () => {
  const manager = await boot();
  const cursor = new CursorManager(manager);
  cursor.setCursor('scope1', 'cur_42');
  assert.equal(cursor.getCursor('scope1'), 'cur_42');
  cursor.resetCursor('scope1');
  assert.equal(cursor.getCursor('scope1'), null);
});

test('retry scheduler: exponential backoff with jitter and transient detection', async () => {
  const r = new RetryScheduler(1000, 10000);
  const d0 = r.nextDelayMs(0);
  const d1 = r.nextDelayMs(1);
  assert.ok(d1 >= d0);
  assert.equal(r.isTransientError({ code: 'ECONNREFUSED' }), true);
  assert.equal(r.isTransientError({ message: 'timeout' }), true);
  assert.equal(r.isTransientError({ status: 500 }), true);
  assert.equal(r.isTransientError({ message: 'validation failed' }), false);
});

test('sync worker waits for its active cycle during graceful shutdown', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let cycles = 0;
  const worker = new SyncWorker({
    runCycle: async () => {
      cycles++;
      await gate;
    },
  }, 10000);

  const first = worker.tick();
  const duplicate = worker.tick();
  assert.equal(first, duplicate);
  const stopping = worker.stopAndWait();
  release();
  await Promise.all([first, stopping]);
  assert.equal(cycles, 1);
  assert.equal(worker.isRunning(), false);
  assert.throws(() => new SyncWorker({ runCycle: async () => undefined }, 999), /at least 1000ms/);
});

test('conflict resolver: policies and version handling', async () => {
  const c = new ConflictResolver();
  assert.equal(c.policyFor('sales_invoice'), 'APPEND_ONLY');
  assert.equal(c.policyFor('product'), 'DETECT');
  assert.equal(c.detectConcurrentEdit(1, 2), true);
  assert.equal(c.resolveVersion(3, 5), 6);
});

test('event validator: rejects invalid events', async () => {
  const v = new EventValidator();
  const r = v.validate({} as any);
  assert.equal(r.valid, false);
  assert.ok(r.errors.length > 0);
  const ok = v.validate({
    eventId: 'e1', branchId: 'b1', entityType: 'customer', entityId: 'c1',
    operationType: 'CREATE', entityVersion: 1, schemaVersion: 1,
    payload: {}, createdAt: new Date().toISOString(),
  } as any);
  assert.equal(ok.valid, true);
});

test('inbox: failed application can be retried after a handler is registered', async () => {
  const manager = await boot();
  const inbox = new InboxRepository(manager);
  const dispatcher = new EventDispatcher();
  const pull = new PullChangesService(inbox, new EventValidator(), dispatcher);
  const event = {
    eventId: uuidv4(),
    branchId: 'br_main',
    entityType: 'retry_test',
    entityId: 'retry-1',
    operationType: 'CREATE' as const,
    entityVersion: 1,
    schemaVersion: 1,
    payload: { value: 1 },
    createdAt: new Date().toISOString(),
  };

  assert.deepEqual(await pull.applyIncoming([event]), { applied: 0, duplicates: 0, failed: 1 });
  assert.equal(inbox.getStatus(event.eventId), 'FAILED');
  dispatcher.register('retry_test', () => undefined);
  assert.deepEqual(await pull.applyIncoming([event]), { applied: 1, duplicates: 0, failed: 0 });
  assert.equal(inbox.getStatus(event.eventId), 'APPLIED');
  assert.deepEqual(await pull.applyIncoming([event]), { applied: 0, duplicates: 1, failed: 0 });
});

test('inbox: concurrent delivery of one event dispatches its handler only once', async () => {
  const manager = await boot();
  const dispatcher = new EventDispatcher();
  const pull = new PullChangesService(new InboxRepository(manager), new EventValidator(), dispatcher);
  let releaseHandler!: () => void;
  const handlerGate = new Promise<void>((resolve) => { releaseHandler = resolve; });
  let handlerCalls = 0;
  dispatcher.register('concurrent_test', async () => {
    handlerCalls++;
    await handlerGate;
  });
  const event = {
    eventId: uuidv4(),
    branchId: 'br_main',
    entityType: 'concurrent_test',
    entityId: 'concurrent-1',
    operationType: 'CREATE' as const,
    entityVersion: 1,
    schemaVersion: 1,
    payload: { value: 1 },
    createdAt: new Date().toISOString(),
  };

  const firstDelivery = pull.applyIncoming([event]);
  assert.deepEqual(
    await pull.applyIncoming([event]),
    { applied: 0, duplicates: 1, failed: 0 }
  );
  releaseHandler();
  assert.deepEqual(await firstDelivery, { applied: 1, duplicates: 0, failed: 0 });
  assert.equal(handlerCalls, 1);
});

test('push: failed network request remains retryable instead of stuck in flight', async () => {
  const manager = await boot();
  const outbox = new OutboxRepository(manager);
  const eventId = outbox.enqueue({
    branchId: 'br_main',
    entityType: 'customer',
    entityId: 'push-network-test',
    operationType: 'CREATE',
    payload: { name: 'Retry me' },
  });
  const transport = {
    pushEvents: async () => {
      throw Object.assign(new Error('network request failed'), { code: 'ECONNRESET' });
    },
    pullEvents: async () => ({ events: [], nextCursor: null }),
  };
  const push = new PushChangesService(outbox, transport);

  await assert.rejects(() => push.pushOnce());
  assert.equal(outbox.getById(eventId)?.deliveryStatus, 'FAILED');
  assert.ok(outbox.getById(eventId)?.nextRetryAt);
});

test('sync engine: does not advance cursor while an incoming event is unapplied', async () => {
  const manager = await boot();
  const event = {
    eventId: uuidv4(),
    branchId: 'br_main',
    entityType: 'cursor_retry_test',
    entityId: 'cursor-retry-1',
    operationType: 'CREATE' as const,
    entityVersion: 1,
    schemaVersion: 1,
    payload: { value: 1 },
    createdAt: new Date().toISOString(),
  };
  const engine = new SyncEngine({
    scope: `cursor-test-${event.eventId}`,
    transport: {
      pushEvents: async (events) => ({ acknowledged: events.map((item) => item.eventId), failed: [] }),
      pullEvents: async () => ({ events: [event], nextCursor: 'cursor-after-event' }),
    },
  });

  await engine.runCycle();
  assert.equal(engine.cursor.getCursor(`cursor-test-${event.eventId}`), null);
  assert.equal(engine.status().connected, false);

  engine.dispatcher.register('cursor_retry_test', () => undefined);
  await engine.runCycle();
  assert.equal(engine.cursor.getCursor(`cursor-test-${event.eventId}`), 'cursor-after-event');
  assert.equal(engine.status().connected, true);
});

test('sync engine: enqueue and status reflect pending count', async () => {
  const manager = await boot();
  const engine = new SyncEngine();
  const id = engine.enqueueChange({
    branchId: 'br_main', entityType: 'customer', entityId: 'c2',
    operationType: 'CREATE', payload: { name: 'B' },
  });
  assert.ok(id);
  const st = engine.status();
  assert.ok(st.pendingCount >= 1);
});
