import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { runMigrations } from '../src/database/migrations.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { InventoryService } from '../src/services/InventoryService.ts';
import { approveCountSession, cancelCountSession, rejectCountSession, startCountSession, submitCountSession } from '../src/services/inventory-count/countSessionService.ts';
import { loadBranchCountSessions, loadCountSessionItems } from '../src/services/inventory-count/countSessionData.ts';

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
    [whSource, 'WH-SRC-01', 'Ù…Ø³ØªÙˆØ¯Ø¹ Ø§Ù„ÙˆØ¬Ù‡ Ø§Ù„Ù‚Ø¨Ù„ÙŠ Ø§Ù„Ù…Ø±ÙƒØ²ÙŠ']);
  db.run(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, is_active) VALUES (?, ?, ?, 'br_main', 1)`,
    [whDest, 'WH-DST-01', 'Ù…Ø³ØªÙˆØ¯Ø¹ ÙØ±Ø¹ Ø§Ù„Ù…Ø¹Ø§Ø¯ÙŠ']);

  db.run(`INSERT OR IGNORE INTO categories (id, name) VALUES ('cat_tiles_inv', 'Ø³ÙŠØ±Ø§Ù…ÙŠÙƒ ÙˆØ¨ÙˆØ±Ø³Ù„ÙŠÙ† - Ø§Ø®ØªØ¨Ø§Ø±')`);
  db.run(`INSERT OR IGNORE INTO brands (id, name) VALUES ('br_royale_inv', 'Ø±ÙˆÙŠØ§Ù„ Ø³ÙŠØ±Ø§Ù…ÙŠÙƒØ§ - Ø§Ø®ØªØ¨Ø§Ø±')`);

  db.run(`INSERT OR IGNORE INTO products (
    id, sku, barcode, name, category_id, brand_id, grade, size, base_unit, sell_unit,
    pieces_per_box, meters_per_box, cost_price, selling_price_m2, wholesale_price_m2,
    min_selling_price_m2, min_stock_level, is_active
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`, [
    prodId, 'SKU-INV-TILE', 'BAR-INV-TILE', 'Ø¨ÙˆØ±Ø³Ù„ÙŠÙ† Ø¥Ø³Ø¨Ø§Ù†ÙŠ Ù„ÙŠØ²Ø± 120*60 - Ø§Ø®ØªØ¨Ø§Ø±', 'cat_tiles_inv', 'br_royale_inv',
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

  // Set initial stock in source warehouse: 100 m2 â€” sufficient for all subsequent steps
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
  ) VALUES (?, 'TX-TEST-01', 'OPENING_BALANCE', ?, ?, 100, 2, 150, 15000, 'SYSTEM_INIT', 'INIT-01', 'Ø±ØµÙŠØ¯ Ø§ÙØªØªØ§Ø­ÙŠ Ù…Ø­Ù…ÙŠ', ?, CURRENT_TIMESTAMP)`,
    [txId, prodId, whSource, adminId]);

  // Attempt UPDATE on immutable ledger â€” must throw trigger error
  let updateFailed = false;
  try {
    db.run(`UPDATE inventory_transactions SET quantity_m2 = 999 WHERE id = ?`, [txId]);
  } catch (err: any) {
    updateFailed = true;
    assert.match(err.message, /immutable/i, 'Expected immutability trigger abort on UPDATE');
  }
  assert.ok(updateFailed, 'Inventory transactions must reject any UPDATE modifications');

  // Attempt DELETE on immutable ledger â€” must throw trigger error
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
  const locStock = inventoryService.getLocationProducts(locId);
  assert.equal(locStock.length, 1);
  assert.equal(locStock[0].quantityM2, 50);
  assert.equal(locStock[0].productName, 'Ø¨ÙˆØ±Ø³Ù„ÙŠÙ† Ø¥Ø³Ø¨Ø§Ù†ÙŠ Ù„ÙŠØ²Ø± 120*60 - Ø§Ø®ØªØ¨Ø§Ø±');

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 4. Stock Transfer Lifecycle: Request -> Approve -> Prepare -> Dispatch -> Partial Receive with Loss
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Step A: Create Transfer Request for 30 m2 (using available stock)
  const transferId = inventoryService.createTransferRequest({
    fromWarehouseId: whSource,
    toWarehouseId: whDest,
    notes: 'ØªØ­ÙˆÙŠÙ„ Ø¯ÙˆØ±ÙŠ Ù„ØªØºØ°ÙŠØ© ÙØ±Ø¹ Ø§Ù„Ù…Ø¹Ø§Ø¯ÙŠ',
    items: [{ productId: prodId, quantityM2: 30 }]
  });
  assert.ok(typeof transferId === 'string' && transferId.startsWith('trf_'), 'Transfer ID must be returned');

  let xfer = queryOne<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId]);
  assert.equal(xfer?.status, 'REQUESTED');

  // Step B: Approve
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
    notes: 'Ø³Ù‚ÙˆØ· Ø·Ø¨Ù„ÙŠØ© Ø¨ÙˆØ±Ø³Ù„ÙŠÙ† Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„ØªØ­Ù…ÙŠÙ„',
  });
  assert.ok(specialResult, 'Special stock record must be returned');
  assert.equal(specialResult.category, 'BROKEN');
  assert.equal(specialResult.status, 'RECORDED');

  const specialId = specialResult.id;

  // Inspect special stock
  inventoryService.inspectSpecialStock(specialId, 'Ø§Ù„Ø¨Ù„Ø§Ø· Ù…ÙƒØ³ÙˆØ± Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ ÙˆÙ„Ø§ ÙŠØµÙ„Ø­ ÙƒØ¹ÙŠÙ†Ø§Øª Ø£Ùˆ Ø¨ÙˆØ§Ù‚ÙŠ');
  const inspected = queryOne<{ status: string }>(`SELECT status FROM inventory_special_stocks WHERE id = ?`, [specialId]);
  assert.equal(inspected?.status, 'INSPECTED');

  // Resolve with WRITE_OFF (Dr 5201 / Cr 1104)
  inventoryService.resolveSpecialStock(specialId, 'WRITE_OFF', 'Ø§Ø¹ØªÙ…Ø§Ø¯ Ù„Ø¬Ù†Ø© Ø§Ù„Ø¬Ø±Ø¯ Ù„Ø¥Ø¹Ø¯Ø§Ù… Ø§Ù„Ø·Ø¨Ù„ÙŠØ©');
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
    VALUES (?, ?, ?, 'Ø¨ÙˆØ±Ø³Ù„ÙŠÙ† Ø¥Ø³Ø¨Ø§Ù†ÙŠ Ù„ÙŠØ²Ø± 120*60 - Ø§Ø®ØªØ¨Ø§Ø±', 65, 62, -3, 150, -450, 'BROKEN', 'Ø¹Ø¬Ø² 3 Ù…ØªØ± Ù…Ø±Ø¨Ø¹ Ù†ØªÙŠØ¬Ø© ÙƒØ³Ø± ØºÙŠØ± Ù…Ø³Ø¬Ù„')`,
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
  const reorderPlans = inventoryService.getReorderPlanning(whSource);
  const plan = reorderPlans.find((p: any) => p.productId === prodId);
  assert.ok(plan, 'Reorder plan for product must be calculated');
  assert.equal(plan.reorderPoint, 60);
  assert.equal(plan.safetyStock, 20);
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
    notes: 'Ù…Ø·Ø§Ø¨Ù‚Ø© Ø¯ÙˆØ±ÙŠØ© Ù†ØµÙ Ø³Ù†ÙˆÙŠØ© - Ø§Ø®ØªØ¨Ø§Ø±'
  });

  const reconLogs = inventoryService.getReconciliationLogs();
  assert.ok(reconLogs.length > 0, 'Reconciliation audit history must be logged');
  const myLog = reconLogs.find((l: any) => l.warehouseId === whSource);
  assert.ok(myLog, 'Reconciliation log must exist for the test warehouse');

  // 9. Stocktake review requires a different authorized reviewer.
  new AuthService().createUser({ username: 'inventory_reviewer_test', password: 'Reviewer-pass-123!', fullName: 'Inventory Reviewer', role: 'MANAGER' });
  startCountSession({ warehouseId: whSource, countType: 'PARTIAL', selectedProductIds: [prodId], isBlindCount: false, notes: 'approval workflow test' });
  const reviewSession = loadBranchCountSessions().find((session) => session.warehouseId === whSource && session.status === 'COUNTING');
  assert.ok(reviewSession, 'Count session should be created');
  const reviewItems = loadCountSessionItems(reviewSession!);
  reviewItems[0].countedQuantityM2 = reviewItems[0].systemQuantityM2;
  submitCountSession(reviewSession!, reviewItems);
  assert.equal(queryOne<{ status: string }>('SELECT status FROM stock_counts WHERE id = ?', [reviewSession!.id])?.status, 'REVIEW');
  assert.throws(() => approveCountSession(reviewSession!), 'Creator cannot approve their own count');
  AuthService.login('inventory_reviewer_test', 'Reviewer-pass-123!');
  approveCountSession(reviewSession!);
  assert.equal(queryOne<{ status: string; approvalStatus: string }>('SELECT status, approval_status AS approvalStatus FROM stock_counts WHERE id = ?', [reviewSession!.id])?.status, 'POSTED');
  assert.equal(queryOne<{ approvalStatus: string }>('SELECT approval_status AS approvalStatus FROM stock_counts WHERE id = ?', [reviewSession!.id])?.approvalStatus, 'APPROVED');
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

  db.run("DELETE FROM schema_migrations WHERE id = '107_inventory_count_type_options'");
  const migrationReport = runMigrations(db.getDatabase());
  assert.ok(migrationReport.applied.includes('107_inventory_count_type_options'));
  assert.equal(
    queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM stock_count_items')?.count,
    queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM stock_counts')?.count,
    'the count table rebuild must preserve count items and their parent references'
  );
  assert.deepEqual(db.getDatabase().exec('PRAGMA foreign_key_check')[0]?.values ?? [], []);
});
