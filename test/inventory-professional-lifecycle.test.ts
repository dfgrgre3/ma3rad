import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { runMigrations } from '../src/database/migrations/index.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { InventoryService } from '../src/services/domains/inventory/InventoryService.ts';
import { BatchService } from '../src/services/domains/inventory/BatchService.ts';
import type { User } from '../src/types/auth/identity.ts';
import { approveCountSession, cancelCountSession, rejectCountSession, startCountSession, submitCountSession } from '../src/services/domains/inventory-count/countSessionService.ts';
import { loadBranchCountSessions, loadCountSessionItems } from '../src/services/domains/inventory-count/countSessionData.ts';

function queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
  return DatabaseManager.getInstance().query<T>(sql, params)[0];
}

test('5.4: Inventory & Warehouse Professional Lifecycle', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const adminUser = queryOne<{ id: string }>(`SELECT id FROM users WHERE username = 'admin'`);
  assert.ok(adminUser?.id, 'Admin user must exist');
  const adminId = adminUser!.id;

  const inventoryService = new InventoryService();

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Setup Test Product and Warehouses
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const prodId = 'prod_inv_prof_tile';
  const whSource = 'wh_inv_source';
  const whDest = 'wh_inv_dest';

  db.run(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, is_active) VALUES (?, ?, ?, 'br_main', 1)`,
    [whSource, 'WH-SRC-01', 'مستودع الوجه القبلي المركزي']);
  db.run(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, is_active) VALUES (?, ?, ?, 'br_main', 1)`,
    [whDest, 'WH-DST-01', 'مستودع فرع المعادي']);

  db.run(`INSERT OR IGNORE INTO categories (id, name) VALUES ('cat_tiles_inv', 'سيراميك وبورسلين - اختبار')`);
  db.run(`INSERT OR IGNORE INTO brands (id, name) VALUES ('br_royale_inv', 'رويال سيراميكا - اختبار')`);

  db.run(`INSERT OR IGNORE INTO products (
    id, sku, barcode, name, category_id, brand_id, grade, size, base_unit, sell_unit,
    pieces_per_box, meters_per_box, cost_price, selling_price_m2, wholesale_price_m2,
    min_selling_price_m2, min_stock_level, is_active
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`, [
    prodId, 'SKU-INV-TILE', 'BAR-INV-TILE', 'بورسلين إسباني ليزر 120*60 - اختبار', 'cat_tiles_inv', 'br_royale_inv',
    'GRADE_1', '120x60', 'M2', 'M2', 2, 1.44, 150, 260, 240, 220, 40
  ]);

  // Update reorder/safety/lead_time columns via migration columns
  db.run(`UPDATE products SET reorder_point = 60, safety_stock = 20, lead_time_days = 7 WHERE id = ?`, [prodId]);

  // Clean test stock records
  db.run(`DELETE FROM warehouse_stock WHERE product_id = ?`, [prodId]);
  db.run(`DELETE FROM inventory_cost_layers WHERE product_id = ?`, [prodId]);
  db.run(`DELETE FROM product_location_stock WHERE product_id = ?`, [prodId]);
  db.run(`DELETE FROM inventory_special_stocks WHERE product_id = ?`, [prodId]);
  db.run(`DELETE FROM inventory_transactions WHERE product_id = ?`, [prodId]);

  // Set initial stock in source warehouse: 100 m2 — sufficient for all subsequent steps
  db.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2) VALUES (?, ?, ?, 100, 0)`,
    ['stk_inv_src', whSource, prodId]);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 1. Immutable Stock Movement Ledger (Triggers)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const txId = 'tx_test_immutable_01';
  db.run(`INSERT INTO inventory_transactions (
    id, transaction_number, type, product_id, warehouse_id,
    quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id,
    notes, performed_by, created_at
  ) VALUES (?, 'TX-TEST-01', 'OPENING_BALANCE', ?, ?, 100, 2, 150, 15000, 'SYSTEM_INIT', 'INIT-01', 'رصيد افتتاحي محمي', ?, CURRENT_TIMESTAMP)`,
    [txId, prodId, whSource, adminId]);

  // Attempt UPDATE on immutable ledger — must throw trigger error
  let updateFailed = false;
  try {
    db.run(`UPDATE inventory_transactions SET quantity_m2 = 999 WHERE id = ?`, [txId]);
  } catch (err: any) {
    updateFailed = true;
    assert.match(err.message, /immutable/i, 'Expected immutability trigger abort on UPDATE');
  }
  assert.ok(updateFailed, 'Inventory transactions must reject any UPDATE modifications');

  // Attempt DELETE on immutable ledger — must throw trigger error
  let deleteFailed = false;
  try {
    db.run(`DELETE FROM inventory_transactions WHERE id = ?`, [txId]);
  } catch (err: any) {
    deleteFailed = true;
    assert.match(err.message, /immutable/i, 'Expected immutability trigger abort on DELETE');
  }
  assert.ok(deleteFailed, 'Inventory transactions must reject any DELETE operations');

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 2. Strict Reservation Rule: reserved_m2 <= quantity_m2
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let excessReserveFailed = false;
  try {
    // Attempt reserving 150 m2 when on_hand is only 100 m2
    db.run(`UPDATE warehouse_stock SET reserved_m2 = 150 WHERE id = 'stk_inv_src'`);
  } catch (err: any) {
    excessReserveFailed = true;
    assert.match(err.message, /Reserved stock cannot exceed/i, 'Expected excess reservation trigger abort');
  }
  assert.ok(excessReserveFailed, 'System must forbid reserved_m2 > quantity_m2');

  // Valid reservation of 30 m2
  db.run(`UPDATE warehouse_stock SET reserved_m2 = 30 WHERE id = 'stk_inv_src'`);
  const stockRow = queryOne<{ quantityM2: number; reservedM2: number }>(
    `SELECT quantity_m2, reserved_m2 FROM warehouse_stock WHERE id = 'stk_inv_src'`
  );
  assert.equal(stockRow?.reservedM2, 30);
  assert.equal(stockRow?.quantityM2, 100);

  // Attempt reducing quantity_m2 below reserved_m2 (25 < reserved 30)
  let sellBeyondAvailableFailed = false;
  try {
    db.run(`UPDATE warehouse_stock SET quantity_m2 = 25 WHERE id = 'stk_inv_src'`);
  } catch (err: any) {
    sellBeyondAvailableFailed = true;
    assert.match(err.message, /Reserved stock cannot exceed/i, 'Expected abort when quantity drops below reserved');
  }
  assert.ok(sellBeyondAvailableFailed, 'Cannot reduce total stock below the reserved amount');

  // Reset reserved back to 0 for next tests
  db.run(`UPDATE warehouse_stock SET reserved_m2 = 0 WHERE id = 'stk_inv_src'`);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 3. Storage Hierarchy & Rack / Bin Barcoding
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loc = inventoryService.createWarehouseLocation({
    warehouseId: whSource,
    zone: 'A',
    aisle: '01',
    shelf: '03',
    bin: 'B',
    barcode: 'LOC-SRC-A-01-03-B',
    maxCapacityM2: 500,
  });
  assert.ok(loc?.id, 'Created location must have an id');
  const locId = loc.id;

  const locs = inventoryService.getWarehouseLocations(whSource);
  assert.ok(locs.some((l: any) => l.id === locId), 'Location must be listed under warehouse');

  // Place stock in location
  inventoryService.assignProductLocation(locId, prodId, 50);
  const secondLocation = inventoryService.createWarehouseLocation({
    warehouseId: whSource, zone: 'B', aisle: '01', shelf: '01', bin: 'A',
    barcode: 'LOC-SRC-B-01-01-A', maxCapacityM2: 500,
  });
  const smallCapacityLocation = inventoryService.createWarehouseLocation({
    warehouseId: whSource, zone: 'C', aisle: '01', shelf: '01', bin: 'A',
    barcode: 'LOC-SRC-C-01-01-A', maxCapacityM2: 20,
  });
  assert.throws(
    () => inventoryService.assignProductLocation(secondLocation.id, prodId, 51),
    /يتجاوز رصيد المستودع/
  );
  assert.throws(
    () => inventoryService.assignProductLocation(smallCapacityLocation.id, prodId, 21),
    /سعة الموقع/
  );
  assert.equal(queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM warehouse_location_movements WHERE product_id = ?`, [prodId]
  )?.count, 1, 'rejected assignments must not create movement history');
  inventoryService.assignProductLocation(locId, prodId, 40);
  inventoryService.assignProductLocation(locId, prodId, 50);
  const locationMovements = db.query<{ movementType: string; fromLocationId: string | null; toLocationId: string | null; quantityM2: number }>(`
    SELECT movement_type AS movementType, from_location_id AS fromLocationId,
      to_location_id AS toLocationId, quantity_m2 AS quantityM2
    FROM warehouse_location_movements WHERE product_id = ? ORDER BY rowid
  `, [prodId]);
  assert.deepEqual(locationMovements.map((movement) => movement.movementType), ['ASSIGN', 'RELEASE', 'ASSIGN']);
  assert.equal(locationMovements[0].toLocationId, locId);
  assert.equal(locationMovements[1].fromLocationId, locId);
  assert.equal(locationMovements[2].quantityM2, 10);
  const locStock = inventoryService.getLocationProducts(locId);
  assert.equal(locStock.length, 1);
  assert.equal(locStock[0].quantityM2, 50);
  assert.equal(locStock[0].productName, 'بورسلين إسباني ليزر 120*60 - اختبار');

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 4. Stock Transfer Lifecycle: Request -> Approve -> Prepare -> Dispatch -> Partial Receive with Loss
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Step A: Create Transfer Request for 30 m2 (using available stock)
  const transferId = inventoryService.createTransferRequest({
    fromWarehouseId: whSource,
    toWarehouseId: whDest,
    notes: 'تحويل دوري لتغذية فرع المعادي',
    items: [{ productId: prodId, quantityM2: 30 }]
  });
  assert.ok(typeof transferId === 'string' && transferId.startsWith('trf_'), 'Transfer ID must be returned');

  let xfer = queryOne<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId]);
  assert.equal(xfer?.status, 'REQUESTED');

  const transferApprover: User = {
    id: 'usr_inv_transfer_approver',
    username: 'inventory-transfer-approver',
    fullName: 'Inventory Transfer Approver',
    role: 'ADMIN',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES (?, ?, 'test', ?, 'ADMIN', 1)`,
    [transferApprover.id, transferApprover.username, transferApprover.fullName]
  );
  assert.throws(() => inventoryService.approveTransfer(transferId), /لا يمكن لمنشئ طلب التحويل اعتماده/);

  // Step B: A different administrator approves
  AuthService.setCurrentUser(transferApprover);
  PermissionService.invalidate(transferApprover);
  inventoryService.approveTransfer(transferId);
  xfer = queryOne<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId]);
  assert.equal(xfer?.status, 'APPROVED');

  // Step C: Prepare
  inventoryService.prepareTransfer(transferId);
  xfer = queryOne<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId]);
  assert.equal(xfer?.status, 'PREPARING');

  // Step D: Dispatch (stock moves out of source)
  inventoryService.dispatchTransfer(transferId);
  xfer = queryOne<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId]);
  assert.equal(xfer?.status, 'IN_TRANSIT');

  const sourceAfterDispatch = queryOne<{ quantityM2: number }>(
    `SELECT quantity_m2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
    [whSource, prodId]
  );
  assert.equal(sourceAfterDispatch?.quantityM2, 70, 'Source stock must reduce from 100 to 70 after dispatch of 30');

  // Step E: Receive with Partial Loss (received 27 m2, lost 3 m2 during transport)
  const transferItems = inventoryService.getTransferItems(transferId);
  assert.equal(transferItems.length, 1);
  const itemId = transferItems[0].id;

  db.run(`
    INSERT INTO stock_transfers (
      id, transfer_number, date, from_warehouse_id, to_warehouse_id, status,
      total_quantity_m2, created_by
    ) VALUES ('trf_other_scope', 'TRF-OTHER-SCOPE', date('now'), ?, ?, 'IN_TRANSIT', 1, ?)
  `, [whSource, whDest, adminId]);
  db.run(`
    INSERT INTO stock_transfer_items (
      id, transfer_id, product_id, product_name, quantity_m2, shipped_m2, unit_cost, total_cost
    ) VALUES ('trfi_other_scope', 'trf_other_scope', ?, 'Other transfer item', 1, 1, 150, 150)
  `, [prodId]);
  assert.throws(
    () => inventoryService.receiveTransfer(transferId, [{ itemId: 'trfi_other_scope', receivedM2: 1 }]),
    /لا ينتمي إلى التحويل/
  );
  assert.throws(
    () => inventoryService.receiveTransfer(transferId, [{ itemId, receivedM2: 28, lostM2: 3 }]),
    /يتجاوز الكمية المشحونة/
  );

  inventoryService.receiveTransfer(transferId, [{ itemId, receivedM2: 10, lostM2: 1 }]);
  assert.throws(
    () => inventoryService.receiveTransfer(transferId, [{ itemId, receivedM2: 20, lostM2: 1 }]),
    /الاستلام التراكمي/
  );
  inventoryService.receiveTransfer(transferId, [{ itemId, receivedM2: 17, lostM2: 2, notes: 'استكمال استلام التحويل' }]);
  xfer = queryOne<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId]);
  assert.equal(xfer?.status, 'COMPLETED');
  assert.equal(xfer?.totalReceivedM2, 27);
  assert.equal(xfer?.totalLostM2, 3);
  assert.throws(
    () => inventoryService.receiveTransfer(transferId, [{ itemId, receivedM2: 1 }]),
    /لا يمكن استلام تحويل/
  );
  assert.throws(() => inventoryService.rejectTransfer(transferId, 'مغلق'), /لا يمكن رفض تحويل/);

  const sourceQuantityOut = inventoryService.getWarehouseStock(whSource)
    .find((stock) => stock.productId === prodId)?.quantityOut;
  assert.equal(sourceQuantityOut, 30, 'Transfer loss must not be added again to dispatched quantity out');
  assert.equal(queryOne<{ total: number }>(
    `SELECT SUM(ABS(quantity_m2)) AS total FROM inventory_transactions
     WHERE reference_type = 'TRANSFER_LOSS' AND reference_id = ? AND quantity_m2 < 0`,
    [transferId]
  )?.total, 3, 'Transfer loss remains documented in the movement ledger');
  db.run(`INSERT INTO inventory_transactions (
    id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count,
    unit_cost, total_cost, reference_type, reference_id, notes, performed_by, created_at
  ) VALUES (?, ?, 'TRANSFER_OUT', ?, ?, -30, -2, 150, 4500, 'TRANSFER', ?, ?, ?, CURRENT_TIMESTAMP)`, [
    'tx_inv_pair_out', 'TX-INV-PAIR-OUT', prodId, whSource, 'trf_similar_01',
    `إرسال تحويل مخزني (TRF-SIMILAR) إلى ${whDest}`, adminId,
  ]);
  db.run(`INSERT INTO inventory_transactions (
    id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count,
    unit_cost, total_cost, reference_type, reference_id, notes, performed_by, created_at
  ) VALUES (?, ?, 'TRANSFER_IN', ?, ?, 30, 2, 150, 4500, 'TRANSFER', ?, ?, ?, CURRENT_TIMESTAMP)`, [
    'tx_inv_pair_in', 'TX-INV-PAIR-IN', prodId, whDest, 'trf_similar_01',
    `استلام تحويل مخزني (TRF-SIMILAR) من ${whSource}`, adminId,
  ]);
  assert.equal(
    inventoryService.getTransfersList(undefined, undefined, whSource)
      .filter((row) => row.productSku === 'SKU-INV-TILE').length,
    2,
    'Transfers for the same product and warehouse pair must remain separate'
  );

  // Verify destination warehouse received 27 m2
  const destAfterReceive = queryOne<{ quantityM2: number }>(
    `SELECT quantity_m2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
    [whDest, prodId]
  );
  assert.equal(destAfterReceive?.quantityM2, 27, 'Destination warehouse must receive 27 m2');

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 5. Special Stock Handling & Write-off with GL Journal Entry
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Current source stock: 70 m2 (after dispatch). Record 5 m2 of BROKEN.
  const specialResult = inventoryService.recordSpecialStock({
    warehouseId: whSource,
    productId: prodId,
    category: 'BROKEN',
    quantityM2: 5,
    notes: 'سقوط طبلية بورسلين أثناء التحميل',
  });
  assert.ok(specialResult, 'Special stock record must be returned');
  assert.equal(specialResult.category, 'BROKEN');
  assert.equal(specialResult.status, 'RECORDED');

  const specialId = specialResult.id;

  // Inspect special stock
  inventoryService.inspectSpecialStock(specialId, 'البلاط مكسور بالكامل ولا يصلح كعينات أو بواقي');
  const inspected = queryOne<{ status: string }>(`SELECT status FROM inventory_special_stocks WHERE id = ?`, [specialId]);
  assert.equal(inspected?.status, 'INSPECTED');

  // Resolve with WRITE_OFF (Dr 5201 / Cr 1104)
  inventoryService.resolveSpecialStock(specialId, 'WRITE_OFF', 'اعتماد لجنة الجرد لإعدام الطبلية');
  const resolved = queryOne<{ status: string }>(`SELECT status FROM inventory_special_stocks WHERE id = ?`, [specialId]);
  assert.equal(resolved?.status, 'WRITTEN_OFF');

  // Verify GL journal entry: find write-off entry by reference
  const glEntry = queryOne<{ id: string }>(
    `SELECT id FROM journal_entries WHERE reference_type = 'INVENTORY_WRITE_OFF' AND reference_id = ?`,
    [specialId]
  );
  assert.ok(glEntry?.id, 'GL journal entry must be recorded for write-off');

  const glLines = db.query<{ accountCode: string; debit: number; credit: number }>(
    `SELECT coa.code as account_code, jel.debit, jel.credit
     FROM journal_entry_lines jel
     JOIN chart_of_accounts coa ON jel.account_id = coa.id
     WHERE jel.entry_id = ?`,
    [glEntry!.id]
  );
  assert.ok(glLines.length >= 2, 'Write-off must post double-entry GL lines');
  const lossLine = glLines.find((l) => l.accountCode === '5201');
  const inventoryAssetLine = glLines.find((l) => l.accountCode === '1104');
  assert.ok(lossLine && lossLine.debit > 0, 'Must debit 5201 (Inventory Losses & Breakage)');
  assert.ok(inventoryAssetLine && inventoryAssetLine.credit > 0, 'Must credit 1104 (Merchandise Inventory)');

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 6. Stock Count with Blind Count via Direct DB (no dedicated service yet)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const countId = 'cnt_inv_test_01';
  db.run(`INSERT INTO stock_counts (id, count_number, warehouse_id, date, status, is_blind, created_by, created_at)
    VALUES (?, 'CNT-TEST-01', ?, date('now'), 'COUNTING', 1, ?, CURRENT_TIMESTAMP)`,
    [countId, whSource, adminId]);

  const countRow = queryOne<{ isBlind: number; status: string }>(
    `SELECT is_blind, status FROM stock_counts WHERE id = ?`, [countId]
  );
  assert.equal(countRow?.isBlind, 1, 'Stock count must be marked as blind count');
  assert.equal(countRow?.status, 'COUNTING');

  // Add count item with discrepancy reason
  // System stock for prodId in whSource is now: 70 (after dispatch) - 5 (breakage removed) = 65 m2
  // Physical count found 62 m2 (-3 variance)
  db.run(`INSERT INTO stock_count_items (id, count_id, product_id, product_name, system_quantity_m2, counted_quantity_m2, variance_m2, unit_cost, variance_value, discrepancy_reason, notes)
    VALUES (?, ?, ?, 'بورسلين إسباني ليزر 120*60 - اختبار', 65, 62, -3, 150, -450, 'BROKEN', 'عجز 3 متر مربع نتيجة كسر غير مسجل')`,
    ['cni_inv_test_01', countId, prodId]);

  const countItem = queryOne<{ countedQuantityM2: number; discrepancyReason: string }>(
    `SELECT counted_quantity_m2, discrepancy_reason FROM stock_count_items WHERE count_id = ? AND product_id = ?`,
    [countId, prodId]
  );
  assert.equal(countItem?.countedQuantityM2, 62);
  assert.equal(countItem?.discrepancyReason, 'BROKEN');

  // Approve count
  db.run(`UPDATE stock_counts SET status = 'POSTED', approval_status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?`, [adminId, countId]);
  const approvedCount = queryOne<{ status: string; approvalStatus: string }>(`SELECT status, approval_status FROM stock_counts WHERE id = ?`, [countId]);
  assert.equal(approvedCount?.approvalStatus, 'APPROVED');
  assert.equal(approvedCount?.status, 'POSTED');

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 7. Reorder Planning Engine
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const salesCustomerId = queryOne<{ id: string }>('SELECT id FROM customers ORDER BY id LIMIT 1')?.id;
  assert.ok(salesCustomerId, 'sales history fixture requires a customer');
  db.run(`
    INSERT INTO sales_invoices (
      id, invoice_number, date, customer_id, warehouse_id, subtotal, total_amount,
      paid_amount, remaining_amount, payment_type, payment_status, invoice_status, created_by
    ) VALUES
      ('inv_reorder_sale', 'INV-REORDER-SALE', date('now'), ?, ?, 60, 60, 60, 0, 'CASH', 'PAID', 'COMPLETED', ?),
      ('inv_reorder_void', 'INV-REORDER-VOID', date('now'), ?, ?, 1000, 1000, 1000, 0, 'CASH', 'PAID', 'VOID', ?)
  `, [salesCustomerId, whSource, adminId, salesCustomerId, whSource, adminId]);
  db.run(`
    INSERT INTO sales_invoice_items (
      id, invoice_id, product_id, product_name, product_sku, product_grade, size, sold_by,
      quantity_m2, boxes_count, pieces_count, unit_price, original_unit_price, unit_cost,
      discount_amount, total_price, total_cost, profit, meters_per_box, pieces_per_box
    ) VALUES
      ('sii_reorder_sale', 'inv_reorder_sale', ?, 'Reorder sale product', 'SKU-INV-TILE', 'GRADE_1', '120x60', 'M2', 60, 42, 0, 1, 1, 0, 0, 60, 0, 60, 1.44, 2),
      ('sii_reorder_void', 'inv_reorder_void', ?, 'Reorder sale product', 'SKU-INV-TILE', 'GRADE_1', '120x60', 'M2', 1000, 695, 0, 1, 1, 0, 0, 1000, 0, 1000, 1.44, 2)
  `, [prodId, prodId]);
  db.run(`
    INSERT INTO sales_returns (
      id, return_number, original_invoice_id, original_invoice_number, customer_id,
      warehouse_id, date, total_amount, reason, created_by
    ) VALUES ('ret_reorder_sale', 'RET-REORDER-SALE', 'inv_reorder_sale', 'INV-REORDER-SALE', ?, ?, date('now'), 10, 'Reorder net sales test', ?)
  `, [salesCustomerId, whSource, adminId]);
  db.run(`
    INSERT INTO sales_return_items (
      id, return_id, product_id, product_name, grade, quantity_m2,
      boxes_count, unit_price, unit_cost, total_refund
    ) VALUES ('sri_reorder_sale', 'ret_reorder_sale', ?, 'Reorder sale product', 'GRADE_1', 10, 7, 1, 0, 10)
  `, [prodId]);
  const reorderPlans = inventoryService.getReorderPlanning(whSource);
  const plan = reorderPlans.find((p: any) => p.productId === prodId);
  assert.ok(plan, 'Reorder plan for product must be calculated');
  assert.equal(plan.reorderPoint, 60);
  assert.equal(plan.safetyStock, 20);
  assert.equal(plan.salesPast60Days, 50, 'void sales are excluded and returns reduce recent consumption');
  assert.equal(plan.dailySalesRate, 0.83, 'daily velocity uses net sales quantity');
  // Source stock is now ~65 m2 and reorder point is 60 m2; since stock > reorder, it may not flag.
  // Reduce stock to ensure it's below reorder point for testing
  db.run(`UPDATE warehouse_stock SET quantity_m2 = 50 WHERE warehouse_id = ? AND product_id = ?`, [whSource, prodId]);
  const reorderPlansLow = inventoryService.getReorderPlanning(whSource);
  const planLow = reorderPlansLow.find((p: any) => p.productId === prodId);
  assert.ok(planLow, 'Low-stock product must appear in reorder plan');
  assert.ok(planLow.stockStatus === 'REORDER_NEEDED' || planLow.stockStatus === 'CRITICAL' || planLow.availableStockM2 <= planLow.reorderPoint,
    'Product stock (50) must be recognized as below reorder point (60)');

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 8. Triangular Reconciliation (Physical vs FIFO Layers vs GL Account 1104)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const recon = inventoryService.reconcileInventoryWithGL(whSource);
  assert.ok(typeof recon.totalPhysicalQty === 'number', 'totalPhysicalQty must be a number');
  assert.ok(typeof recon.totalPhysicalCost === 'number', 'totalPhysicalCost must be a number');
  assert.ok(typeof recon.totalGlInventoryCost === 'number', 'totalGlInventoryCost must be a number');
  assert.ok(typeof recon.variancePhysicalVsFifo === 'number', 'variancePhysicalVsFifo must be a number');

  // Save audit reconciliation stamp
  inventoryService.saveReconciliationLog({
    warehouseId: whSource,
    totalPhysicalCost: recon.totalPhysicalCost,
    totalFifoLayerCost: recon.totalFifoLayerCost,
    totalGlInventoryCost: recon.totalGlInventoryCost,
    variancePhysicalVsFifo: recon.variancePhysicalVsFifo,
    varianceFifoVsGl: recon.varianceFifoVsGl,
    status: recon.status,
    notes: 'مطابقة دورية نصف سنوية - اختبار'
  });

  const reconLogs = inventoryService.getReconciliationLogs();
  assert.ok(reconLogs.length > 0, 'Reconciliation audit history must be logged');
  const myLog = reconLogs.find((l: any) => l.warehouseId === whSource);
  assert.ok(myLog, 'Reconciliation log must exist for the test warehouse');

  // 9. Stocktake review requires a different authorized reviewer.
  new AuthService().createUser({ username: 'inventory_reviewer_test', password: 'Reviewer-pass-123!', fullName: 'Inventory Reviewer', role: 'MANAGER' });
  const pieceProductId = 'prod_inv_prof_general_piece';
  const weightProductId = 'prod_inv_prof_general_kg';
  db.run(`
    INSERT OR IGNORE INTO products (
      id, sku, barcode, name, category_id, brand_id, product_type, base_unit, custom_unit,
      grade, size, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
      wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active
    ) VALUES
      (?, 'SKU-INV-PIECE', 'BAR-INV-PIECE', 'منتج عام بالقطعة', 'cat_tiles_inv', 'br_royale_inv',
       'GENERAL', 'PIECE', '', 'GENERAL', '', 'PIECE', 6, 1.44, 5, 10, 8, 7, 0, 1),
      (?, 'SKU-INV-KG', 'BAR-INV-KG', 'منتج عام بالكيلوجرام', 'cat_tiles_inv', 'br_royale_inv',
       'GENERAL', 'KG', '', 'GENERAL', '', 'KG', 4, 1.44, 5, 10, 8, 7, 0, 1)
  `, [pieceProductId, weightProductId]);
  db.run(`
    INSERT OR IGNORE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
    VALUES ('stk_inv_piece_count', ?, ?, 24, 0), ('stk_inv_kg_count', ?, ?, 30, 0)
  `, [whSource, pieceProductId, whSource, weightProductId]);
  startCountSession({
    warehouseId: whSource,
    countType: 'PARTIAL',
    selectedProductIds: [prodId, pieceProductId, weightProductId],
    isBlindCount: false,
    notes: 'approval workflow test',
  });
  const reviewSession = loadBranchCountSessions().find((session) => session.warehouseId === whSource && session.status === 'COUNTING');
  assert.ok(reviewSession, 'Count session should be created');
  const reviewItems = loadCountSessionItems(reviewSession!);
  const ceramicItem = reviewItems.find((item) => item.productId === prodId)!;
  const pieceItem = reviewItems.find((item) => item.productId === pieceProductId)!;
  const weightItem = reviewItems.find((item) => item.productId === weightProductId)!;
  ceramicItem.countedQuantityM2 = ceramicItem.systemQuantityM2 + 2.88;
  ceramicItem.discrepancyReason = 'OTHER';
  pieceItem.countedQuantityM2 = pieceItem.systemQuantityM2 + 12;
  pieceItem.discrepancyReason = 'OTHER';
  weightItem.countedQuantityM2 = weightItem.systemQuantityM2 + 3.6;
  weightItem.discrepancyReason = 'OTHER';
  submitCountSession(reviewSession!, reviewItems);
  assert.equal(queryOne<{ status: string }>('SELECT status FROM stock_counts WHERE id = ?', [reviewSession!.id])?.status, 'REVIEW');
  assert.throws(() => approveCountSession(reviewSession!), 'Creator cannot approve their own count');
  const priorCountCostingMethod = queryOne<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'costingMethod'`
  )?.value;
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', 'FIFO')`);
  AuthService.login('inventory_reviewer_test', 'Reviewer-pass-123!');
  try {
    approveCountSession(reviewSession!);
  } finally {
    if (priorCountCostingMethod === undefined) {
      db.run(`DELETE FROM system_settings WHERE key = 'costingMethod'`);
    } else {
      db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', ?)`, [priorCountCostingMethod]);
    }
  }
  assert.equal(queryOne<{ status: string; approvalStatus: string }>('SELECT status, approval_status AS approvalStatus FROM stock_counts WHERE id = ?', [reviewSession!.id])?.status, 'POSTED');
  assert.equal(queryOne<{ approvalStatus: string }>('SELECT approval_status AS approvalStatus FROM stock_counts WHERE id = ?', [reviewSession!.id])?.approvalStatus, 'APPROVED');
  const countBoxRows = db.query<{ transactionId: string; productId: string; boxesCount: number }>(`
    SELECT id AS transactionId, product_id AS productId, boxes_count AS boxesCount
    FROM inventory_transactions WHERE reference_type = 'STOCK_COUNT' AND reference_id = ?
  `, [reviewSession!.id]);
  const boxesByProduct = new Map(countBoxRows.map((row) => [row.productId, row.boxesCount]));
  assert.equal(boxesByProduct.get(prodId), 2, 'ceramic variance converts from m² using meters per box');
  assert.equal(boxesByProduct.get(pieceProductId), 2, 'piece variance converts using pieces per box');
  assert.equal(boxesByProduct.get(weightProductId), 0, 'kilogram products without a box conversion keep boxes at zero');
  const countCostLayers = db.query<{ productId: string; transactionId: string }>(`
    SELECT product_id AS productId, source_transaction_id AS transactionId
    FROM inventory_cost_layers
    WHERE source_type = 'STOCK_COUNT_GAIN' AND source_id = ?
  `, [reviewSession!.id]);
  assert.deepEqual(
    countCostLayers.map((layer) => layer.productId).sort(),
    [prodId, pieceProductId, weightProductId].sort(),
    'count gains must create FIFO cost layers for ceramic and general products'
  );
  assert.ok(countCostLayers.every((layer) => countBoxRows.some((transaction) => transaction.transactionId === layer.transactionId)));
  assert.equal(queryOne<{ quantity: number }>(
    'SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
    [whDest, prodId]
  )?.quantity, 27, 'count posting must not alter stock in another warehouse');

  db.run('UPDATE warehouse_stock SET reserved_m2 = 10 WHERE warehouse_id = ? AND product_id = ?', [whSource, prodId]);
  const sourceBeforeReservedCount = queryOne<{ quantity: number }>(
    'SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
    [whSource, prodId]
  )?.quantity;
  startCountSession({
    warehouseId: whSource,
    countType: 'PARTIAL',
    selectedProductIds: [prodId],
    isBlindCount: false,
    notes: 'reserved stock count test',
  });
  const reservedSessionId = queryOne<{ id: string }>(
    'SELECT id FROM stock_counts WHERE notes = ? ORDER BY rowid DESC LIMIT 1',
    ['reserved stock count test']
  )?.id;
  const reservedSession = loadBranchCountSessions().find((session) => session.id === reservedSessionId);
  assert.ok(reservedSession, 'Reserved stock count session should be created');
  const reservedItems = loadCountSessionItems(reservedSession!);
  reservedItems[0].countedQuantityM2 = 9;
  reservedItems[0].discrepancyReason = 'OTHER';
  submitCountSession(reservedSession!, reservedItems);
  AuthService.setCurrentUser(transferApprover);
  PermissionService.invalidate(transferApprover);
  assert.throws(() => approveCountSession(reservedSession!), /أقل من الكمية المحجوزة/);
  assert.equal(queryOne<{ quantity: number }>(
    'SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
    [whSource, prodId]
  )?.quantity, sourceBeforeReservedCount, 'a count below reserved stock must not post');
  rejectCountSession(reservedSession!, 'Reserved quantity must be released or recounted');
  db.run('UPDATE warehouse_stock SET reserved_m2 = 0 WHERE warehouse_id = ? AND product_id = ?', [whSource, prodId]);

  startCountSession({ warehouseId: whSource, countType: 'PARTIAL', selectedProductIds: [prodId], isBlindCount: false, notes: 'rejection workflow test' });
  const rejectedSession = loadBranchCountSessions().find((session) => session.warehouseId === whSource && session.status === 'COUNTING');
  assert.ok(rejectedSession, 'Second count session should be created');
  const rejectedItems = loadCountSessionItems(rejectedSession!);
  rejectedItems[0].countedQuantityM2 = rejectedItems[0].systemQuantityM2;
  submitCountSession(rejectedSession!, rejectedItems);
  AuthService.login('admin', 'admin123');
  rejectCountSession(rejectedSession!, 'Recount required');
  const rejectedState = queryOne<{ status: string; approvalStatus: string; rejectionReason: string }>('SELECT status, approval_status AS approvalStatus, rejection_reason AS rejectionReason FROM stock_counts WHERE id = ?', [rejectedSession!.id]);
  assert.equal(rejectedState?.status, 'COUNTING');
  assert.equal(rejectedState?.approvalStatus, 'REJECTED');
  assert.equal(rejectedState?.rejectionReason, 'Recount required');

  AuthService.login('admin', 'admin123');
  for (const countType of ['FULL', 'PARTIAL', 'SPOT', 'PERIODIC', 'SURPRISE', 'BLIND'] as const) {
    const notes = `supported count type: ${countType}`;
    startCountSession({
      warehouseId: whSource,
      countType,
      selectedProductIds: [prodId],
      isBlindCount: false,
      notes,
    });
    const created = queryOne<{ id: string; countType: string; isBlind: number }>(
      'SELECT id, count_type AS countType, is_blind AS isBlind FROM stock_counts WHERE notes = ?',
      [notes]
    );
    assert.equal(created?.countType, countType);
    assert.equal(Boolean(created?.isBlind), countType === 'BLIND');
    const session = loadBranchCountSessions().find((item) => item.id === created?.id);
    assert.ok(session);
    cancelCountSession(session!);
  }

  const countItemsBeforeMigration = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM stock_count_items')?.count;
  db.run("DELETE FROM schema_migrations WHERE id = '107_inventory_count_type_options'");
  const migrationReport = runMigrations(db.getDatabase());
  assert.ok(migrationReport.applied.includes('107_inventory_count_type_options'));
  assert.equal(
    queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM stock_count_items')?.count,
    countItemsBeforeMigration,
    'the count table rebuild must preserve count items and their parent references'
  );
  assert.deepEqual(db.getDatabase().exec('PRAGMA foreign_key_check')[0]?.values ?? [], []);
});

test('inventory adjustments require independent approval before stock and ledger posting', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const suffix = randomUUID().replace(/-/g, '');
  const warehouseId = `wh_adjust_${suffix}`;
  const productId = `prod_adjust_${suffix}`;
  const categoryId = `cat_adjust_${suffix}`;
  const brandId = `brand_adjust_${suffix}`;
  db.run(`INSERT INTO warehouses (id, code, name, branch_id, is_active) VALUES (?, ?, ?, 'br_main', 1)`,
    [warehouseId, `WH-ADJ-${suffix}`, 'Adjustment workflow test warehouse']);
  db.run('INSERT INTO categories (id, name) VALUES (?, ?)', [categoryId, `Adjustment workflow ${suffix}`]);
  db.run('INSERT INTO brands (id, name) VALUES (?, ?)', [brandId, `Adjustment workflow ${suffix}`]);
  db.run(`INSERT INTO products (
    id, sku, barcode, name, category_id, brand_id, product_type, base_unit, custom_unit,
    grade, size, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
    wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active
  ) VALUES (?, ?, ?, ?, ?, ?, 'GENERAL', 'BOX', '', 'GENERAL', '', 'BOX', 1, 1, 5, 10, 8, 7, 0, 1)`, [
    productId, `SKU-ADJ-${suffix}`, `BAR-ADJ-${suffix}`, 'Adjustment workflow box product', categoryId, brandId,
  ]);
  db.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
    VALUES (?, ?, ?, 10, 0)`, [`stk_adjust_${suffix}`, warehouseId, productId]);

  const inventory = new InventoryService();
  inventory.adjustStock(productId, warehouseId, 12, 'Adjustment lifecycle test');
  const adjustment = queryOne<{
    id: string;
    status: string;
    approvalStatus: string;
    createdBy: string;
  }>(`
    SELECT sa.id, sa.status, sa.approval_status AS approvalStatus, sa.created_by AS createdBy
    FROM stock_adjustments sa
    JOIN stock_adjustment_items sai ON sai.adjustment_id = sa.id
    WHERE sa.warehouse_id = ? AND sai.product_id = ?
    ORDER BY sa.rowid DESC LIMIT 1
  `, [warehouseId, productId]);
  assert.ok(adjustment);
  assert.equal(adjustment!.status, 'PENDING_APPROVAL');
  assert.equal(adjustment!.approvalStatus, 'PENDING');
  assert.equal(queryOne<{ quantity: number }>(
    'SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
    [warehouseId, productId]
  )?.quantity, 10, 'requesting an adjustment must not move stock');
  assert.throws(() => inventory.approveAdjustment(adjustment!.id), /لا يمكن لمنشئ التسوية اعتمادها/);

  const approver: User = {
    id: `usr_adjust_approver_${suffix}`,
    username: `adjust-approver-${suffix}`,
    fullName: 'Adjustment Approver',
    role: 'ADMIN',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active)
    VALUES (?, ?, 'test', ?, 'ADMIN', 1)`, [approver.id, approver.username, approver.fullName]);
  AuthService.setCurrentUser(approver);
  PermissionService.invalidate(approver);
  inventory.approveAdjustment(adjustment!.id);
  assert.equal(queryOne<{ status: string }>(
    'SELECT status FROM stock_adjustments WHERE id = ?', [adjustment!.id]
  )?.status, 'PENDING_APPROVAL');
  assert.equal(queryOne<{ quantity: number }>(
    'SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
    [warehouseId, productId]
  )?.quantity, 10, 'approval alone must not post the adjustment');

  inventory.postAdjustment(adjustment!.id);
  const posted = queryOne<{
    status: string;
    approvalStatus: string;
    createdBy: string;
    approvedBy: string;
    postedBy: string;
    totalValue: number;
  }>(`
    SELECT status, approval_status AS approvalStatus, created_by AS createdBy,
      approved_by AS approvedBy, posted_by AS postedBy, total_value AS totalValue
    FROM stock_adjustments WHERE id = ?
  `, [adjustment!.id]);
  assert.deepEqual(posted, {
    status: 'POSTED',
    approvalStatus: 'APPROVED',
    createdBy: adjustment!.createdBy,
    approvedBy: approver.id,
    postedBy: approver.id,
    totalValue: 10,
  });
  assert.equal(queryOne<{ quantity: number }>(
    'SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
    [warehouseId, productId]
  )?.quantity, 12);
  const transaction = queryOne<{ type: string; boxesCount: number; performedBy: string; totalCost: number }>(`
    SELECT type, boxes_count AS boxesCount, performed_by AS performedBy, total_cost AS totalCost
    FROM inventory_transactions WHERE reference_type = 'ADJUSTMENT' AND reference_id = ?
  `, [adjustment!.id]);
  assert.deepEqual(transaction, {
    type: 'ADJUSTMENT_ADD',
    boxesCount: 2,
    performedBy: approver.id,
    totalCost: 10,
  }, 'general-product quantities, movement actor and cost must be recorded correctly');
  assert.ok(queryOne<{ id: string }>(
    `SELECT id FROM journal_entries WHERE reference_type = 'INVENTORY_ADJUSTMENT' AND reference_id = ?`,
    [adjustment!.id]
  ), 'posting an adjustment must create its accounting entry');
  assert.deepEqual(
    db.query<{ action: string; userId: string }>(
      `SELECT action, user_id AS userId FROM audit_logs
       WHERE module = 'INVENTORY_ADJUSTMENT' AND record_id = ? ORDER BY rowid`,
      [adjustment!.id]
    ),
    [
      { action: 'CREATE', userId: adjustment!.createdBy },
      { action: 'APPROVE', userId: approver.id },
      { action: 'POST', userId: approver.id },
    ]
  );
});

test('batch receipt posts stock movement and FIFO layer atomically', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const suffix = randomUUID().replace(/-/g, '');
  const warehouseId = `wh_batch_${suffix}`;
  const productId = `prod_batch_${suffix}`;
  const categoryId = `cat_batch_${suffix}`;
  const brandId = `brand_batch_${suffix}`;
  db.run(`INSERT INTO warehouses (id, code, name, branch_id, is_active) VALUES (?, ?, ?, 'br_main', 1)`,
    [warehouseId, `WH-BATCH-${suffix}`, 'Batch receipt test warehouse']);
  db.run(`INSERT INTO categories (id, name) VALUES (?, ?)`, [categoryId, `Batch receipt test ${suffix}`]);
  db.run(`INSERT INTO brands (id, name) VALUES (?, ?)`, [brandId, `Batch receipt test ${suffix}`]);
  db.run(`INSERT INTO products (
    id, sku, barcode, name, category_id, brand_id, grade, size, base_unit, sell_unit,
    pieces_per_box, meters_per_box, cost_price, selling_price_m2, wholesale_price_m2,
    min_selling_price_m2, min_stock_level, is_active
  ) VALUES (?, ?, ?, ?, ?, ?, 'GRADE_1', '60x60', 'M2', 'M2', 4, 1.44, 8, 20, 15, 10, 1, 1)`, [
    productId, `SKU-BATCH-${suffix}`, `BAR-BATCH-${suffix}`, 'Batch receipt test product', categoryId, brandId,
  ]);

  const batchService = new BatchService();
  const batch = batchService.createBatch({
    productId, warehouseId, batchNumber: `LOT-${suffix}`, toneShade: 'A12',
    quantityM2: 7.25, costPrice: 12.5,
  });
  assert.equal(batch.quantityM2, 7.25);
  assert.equal(batch.quantityRemainingM2, 7.25);
  assert.equal(queryOne<{ quantity: number }>(
    'SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?',
    [productId, warehouseId]
  )?.quantity, 7.25);

  const movement = queryOne<{ id: string; type: string; quantity: number; referenceId: string }>(`
    SELECT id, type, quantity_m2 AS quantity, reference_id AS referenceId
    FROM inventory_transactions WHERE reference_type = 'BATCH_RECEIPT' AND reference_id = ?
  `, [batch.id]);
  assert.deepEqual(movement && { type: movement.type, quantity: movement.quantity, referenceId: movement.referenceId }, {
    type: 'PURCHASE', quantity: 7.25, referenceId: batch.id,
  });
  const layer = queryOne<{ quantity: number; unitCost: number; transactionId: string }>(`
    SELECT quantity_remaining AS quantity, unit_cost AS unitCost, source_transaction_id AS transactionId
    FROM inventory_cost_layers WHERE batch_id = ?
  `, [batch.id]);
  assert.deepEqual(layer, { quantity: 7.25, unitCost: 12.5, transactionId: movement?.id });

  assert.throws(() => batchService.updateBatch(batch.id, { quantityM2: 20 }), /حركة مخزنية/);
  assert.throws(() => batchService.updateBatch(batch.id, { quantityRemainingM2: 20 }), /حركة مخزنية/);
  assert.throws(() => batchService.updateBatch(batch.id, { costPrice: 20 }), /بيانات الاستلام أو تكلفته/);
  assert.throws(() => batchService.deleteBatch(batch.id), /لها حركة مخزنية أو طبقة تكلفة/);
});
