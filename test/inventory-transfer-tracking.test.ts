import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { InventoryService } from '../src/services/domains/inventory/InventoryService.ts';
import { STOCK_LEDGER_BALANCE_AMOUNT } from '../src/pages/inventory/stock-ledger/stockLedgerBalance.ts';
import type { User } from '../src/types/auth/identity.ts';

const db = DatabaseManager.getInstance();

function queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
  return db.query<T>(sql, params)[0];
}

function stockOf(warehouseId: string, productId: string): number {
  return Number(queryOne<{ quantity: number }>(
    `SELECT COALESCE(quantity_m2, 0) AS quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
    [warehouseId, productId]
  )?.quantity || 0);
}

function batchRemaining(warehouseId: string, productId: string, batchNumber: string): number {
  return Number(queryOne<{ quantity: number }>(
    `SELECT COALESCE(quantity_remaining_m2, 0) AS quantity FROM product_batches
     WHERE warehouse_id = ? AND product_id = ? AND batch_number = ?`,
    [warehouseId, productId, batchNumber]
  )?.quantity || 0);
}

function layerValue(warehouseId: string, productId: string): number {
  return Number(queryOne<{ value: number }>(
    `SELECT COALESCE(SUM(quantity_remaining * unit_cost), 0) AS value
     FROM inventory_cost_layers WHERE warehouse_id = ? AND product_id = ? AND quantity_remaining > 0.009`,
    [warehouseId, productId]
  )?.value || 0);
}

test('transfers preserve batches and cost layers through a transit warehouse', async () => {
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', 'FIFO')`);

  const adminId = queryOne<{ id: string }>(`SELECT id FROM users WHERE username = 'admin'`)!.id;
  const inventory = new InventoryService();
  const productId = 'prod_transfer_tracking';
  const sourceId = 'wh_transfer_source';
  const destId = 'wh_transfer_dest';

  db.run(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, is_active) VALUES (?, 'WH-TRF-SRC', 'مخزن تحويل المصدر', 'br_main', 1)`, [sourceId]);
  db.run(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, is_active) VALUES (?, 'WH-TRF-DST', 'مخزن تحويل الوجهة', 'br_main', 1)`, [destId]);
  db.run(`INSERT OR IGNORE INTO categories (id, name) VALUES ('cat_transfer_tracking', 'تصنيف تتبع التحويل')`);
  db.run(`INSERT OR IGNORE INTO brands (id, name) VALUES ('brand_transfer_tracking', 'ماركة تتبع التحويل')`);
  db.run(`INSERT OR IGNORE INTO products (
    id, sku, barcode, name, category_id, brand_id, size, base_unit, sell_unit,
    cost_price, selling_price_m2, is_active
  ) VALUES (?, 'SKU-TRF-TRK', 'BAR-TRF-TRK', 'صنف تتبع التحويل', 'cat_transfer_tracking',
    'brand_transfer_tracking', '60x60', 'M2', 'M2', 110, 180, 1)`, [productId]);

  db.run(`DELETE FROM warehouse_stock WHERE product_id = ?`, [productId]);
  db.run(`DELETE FROM product_batches WHERE product_id = ?`, [productId]);
  db.run(`DELETE FROM inventory_cost_layers WHERE product_id = ?`, [productId]);
  db.run(`DELETE FROM inventory_transactions WHERE product_id = ?`, [productId]);
  db.run(`DELETE FROM stock_transfer_items WHERE product_id = ?`, [productId]);
  db.run(`DELETE FROM stock_transfers WHERE id LIKE 'trf_%' AND from_warehouse_id = ?`, [sourceId]);

  db.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
          VALUES ('stk_trf_src', ?, ?, 100, 0)`, [sourceId, productId]);
  db.run(`INSERT INTO product_batches (
    id, product_id, warehouse_id, batch_number, tone_shade, caliber, cost_price,
    quantity_m2, quantity_remaining_m2, created_by, created_at
  ) VALUES ('batch_trf_a', ?, ?, 'LOT-A', 'شيد A', '0', 100, 40, 40, ?, '2026-01-01 10:00:00')`,
  [productId, sourceId, adminId]);
  db.run(`INSERT INTO product_batches (
    id, product_id, warehouse_id, batch_number, tone_shade, caliber, cost_price,
    quantity_m2, quantity_remaining_m2, created_by, created_at
  ) VALUES ('batch_trf_b', ?, ?, 'LOT-B', 'شيد B', '1', 120, 60, 60, ?, '2026-01-02 10:00:00')`,
  [productId, sourceId, adminId]);
  db.run(`INSERT INTO inventory_cost_layers (
    id, product_id, warehouse_id, source_type, received_at,
    quantity_received, quantity_remaining, unit_cost, batch_id
  ) VALUES ('icl_trf_a', ?, ?, 'GRN', '2026-01-01', 40, 40, 100, 'batch_trf_a')`, [productId, sourceId]);
  db.run(`INSERT INTO inventory_cost_layers (
    id, product_id, warehouse_id, source_type, received_at,
    quantity_received, quantity_remaining, unit_cost, batch_id
  ) VALUES ('icl_trf_b', ?, ?, 'GRN', '2026-01-02', 60, 60, 120, 'batch_trf_b')`, [productId, sourceId]);

  const approver: User = {
    id: 'usr_transfer_tracking_approver',
    username: 'transfer-tracking-approver',
    fullName: 'Transfer Tracking Approver',
    role: 'ADMIN',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  db.run(`INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
          VALUES (?, ?, 'test', ?, 'ADMIN', 1)`,
  [approver.id, approver.username, approver.fullName]);

  // ── Dispatch: source -> transit ───────────────────────────────────────────
  const transferId = inventory.createTransferRequest({
    fromWarehouseId: sourceId,
    toWarehouseId: destId,
    items: [{ productId, quantityM2: 50 }],
  });
  assert.throws(() => inventory.approveTransfer(transferId), /لا يمكن لمنشئ طلب التحويل اعتماده/);
  AuthService.setCurrentUser(approver);
  PermissionService.invalidate(approver);
  inventory.approveTransfer(transferId);
  inventory.prepareTransfer(transferId);
  inventory.dispatchTransfer(transferId, 'dispatch-key-1');

  const transitId = queryOne<{ transitWarehouseId: string }>(
    `SELECT transit_warehouse_id AS transitWarehouseId FROM stock_transfers WHERE id = ?`,
    [transferId]
  )!.transitWarehouseId;
  assert.ok(transitId, 'Dispatch must create and link a transit warehouse');
  assert.equal(
    queryOne<{ type: string }>(`SELECT warehouse_type AS type FROM warehouses WHERE id = ?`, [transitId])?.type,
    'TRANSIT_WAREHOUSE'
  );

  assert.equal(stockOf(sourceId, productId), 50);
  assert.equal(stockOf(transitId, productId), 50);
  assert.equal(batchRemaining(sourceId, productId, 'LOT-A'), 0);
  assert.equal(batchRemaining(sourceId, productId, 'LOT-B'), 50);
  assert.equal(batchRemaining(transitId, productId, 'LOT-A'), 40);
  assert.equal(batchRemaining(transitId, productId, 'LOT-B'), 10);
  assert.equal(layerValue(transitId, productId), 5200, 'Transit must hold the exact source layer cost');

  const dispatchedMovements = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM inventory_transactions WHERE reference_id = ?`,
    [transferId]
  )!.count;
  inventory.dispatchTransfer(transferId, 'dispatch-key-1');
  assert.equal(
    queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM inventory_transactions WHERE reference_id = ?`, [transferId])!.count,
    dispatchedMovements,
    'Replaying a dispatch idempotency key must not post again'
  );
  assert.throws(
    () => inventory.dispatchTransfer(transferId, 'dispatch-key-2'),
    /لا يمكن إرسال تحويل/
  );

  // ── Partial receipt ───────────────────────────────────────────────────────
  const itemId = inventory.getTransferItems(transferId)[0].id;
  const firstReceipt = inventory.receiveTransfer(
    transferId,
    [{ itemId, receivedM2: 20 }],
    { idempotencyKey: 'receipt-key-1' }
  );
  assert.equal(firstReceipt.replayed, false);
  assert.equal(stockOf(transitId, productId), 30);
  assert.equal(stockOf(destId, productId), 20);
  assert.equal(batchRemaining(destId, productId, 'LOT-A'), 20);
  assert.equal(batchRemaining(transitId, productId, 'LOT-A'), 20);

  const afterFirstReceipt = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM inventory_transactions WHERE reference_id = ?`,
    [transferId]
  )!.count;
  const replayed = inventory.receiveTransfer(
    transferId,
    [{ itemId, receivedM2: 20 }],
    { idempotencyKey: 'receipt-key-1' }
  );
  assert.equal(replayed.replayed, true);
  assert.equal(
    queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM inventory_transactions WHERE reference_id = ?`, [transferId])!.count,
    afterFirstReceipt,
    'Replaying a receipt authorization must not post again'
  );
  assert.throws(
    () => inventory.receiveTransfer(transferId, [{ itemId, receivedM2: 19 }], { idempotencyKey: 'receipt-key-1' }),
    /مفتاح تكرار الاستلام/
  );

  // ── Final receipt with transport loss ─────────────────────────────────────
  inventory.receiveTransfer(
    transferId,
    [{ itemId, receivedM2: 27, lostM2: 3 }],
    { idempotencyKey: 'receipt-key-2' }
  );
  assert.equal(stockOf(transitId, productId), 0, 'Transit must be empty after full settlement');
  assert.equal(stockOf(destId, productId), 47);
  assert.equal(batchRemaining(destId, productId, 'LOT-A'), 40);
  assert.equal(batchRemaining(destId, productId, 'LOT-B'), 7);
  assert.equal(batchRemaining(transitId, productId, 'LOT-A'), 0);
  assert.equal(layerValue(destId, productId), 4840, 'Received stock keeps the original batch costs');
  assert.equal(layerValue(transitId, productId), 0, 'Loss must consume its transit cost layer');

  const settled = queryOne<{ status: string; totalLost: number; totalReceived: number }>(
    `SELECT status, total_lost_m2 AS totalLost, total_received_m2 AS totalReceived
     FROM stock_transfers WHERE id = ?`,
    [transferId]
  )!;
  assert.equal(settled.status, 'COMPLETED');
  assert.equal(settled.totalReceived, 47);
  assert.equal(settled.totalLost, 3);

  const transitBalance = Number(queryOne<{ balance: number }>(
    `SELECT COALESCE(SUM(${STOCK_LEDGER_BALANCE_AMOUNT}), 0) AS balance
     FROM inventory_transactions it WHERE it.warehouse_id = ?`,
    [transitId]
  )?.balance || 0);
  assert.equal(transitBalance, 0, 'Transit ledger must net to zero after receipt and loss');

  // ── Reject an in-transit shipment and restore source batches ──────────────
  AuthService.setCurrentUser({
    id: adminId,
    username: 'admin',
    fullName: 'System Administrator',
    role: 'ADMIN',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  });
  PermissionService.invalidate();
  const revertedTransferId = inventory.createTransferRequest({
    fromWarehouseId: sourceId,
    toWarehouseId: destId,
    items: [{ productId, quantityM2: 10 }],
  });
  AuthService.setCurrentUser(approver);
  PermissionService.invalidate(approver);
  inventory.approveTransfer(revertedTransferId);
  inventory.prepareTransfer(revertedTransferId);
  inventory.dispatchTransfer(revertedTransferId);
  const rejectedTransitId = queryOne<{ transitWarehouseId: string }>(
    `SELECT transit_warehouse_id AS transitWarehouseId FROM stock_transfers WHERE id = ?`,
    [revertedTransferId]
  )!.transitWarehouseId;
  assert.equal(stockOf(sourceId, productId), 40);
  assert.equal(stockOf(rejectedTransitId, productId), 10);

  inventory.rejectTransfer(revertedTransferId, 'رفض تجريبي');
  assert.equal(stockOf(sourceId, productId), 50, 'Reject must restore the source stock');
  assert.equal(stockOf(rejectedTransitId, productId), 0, 'Reject must empty the transit stock');
  assert.equal(batchRemaining(sourceId, productId, 'LOT-B'), 50, 'Reject must restore the exact batch');
  assert.equal(
    queryOne<{ status: string }>(`SELECT status FROM stock_transfers WHERE id = ?`, [revertedTransferId])?.status,
    'REJECTED'
  );

  // ── Intercompany transfer must be rejected explicitly ─────────────────────
  const otherCompanyWarehouse = 'wh_transfer_other_company';
  db.run(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, company_id, is_active)
          VALUES (?, 'WH-TRF-OTHER', 'مخزن شركة أخرى', 'br_main', 'cmp_other', 1)`, [otherCompanyWarehouse]);
  assert.throws(
    () => inventory.createTransferRequest({
      fromWarehouseId: sourceId,
      toWarehouseId: otherCompanyWarehouse,
      items: [{ productId, quantityM2: 1 }],
    }),
    /شركتين مختلفتين/
  );
});
