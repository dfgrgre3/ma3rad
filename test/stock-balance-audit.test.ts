import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { StockBalanceAuditService } from '../src/services/domains/inventory/StockBalanceAuditService.ts';
import { InventoryCostingService } from '../src/services/domains/inventory/InventoryCostingService.ts';

const db = DatabaseManager.getInstance();

function queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
  return db.query<T>(sql, params)[0];
}

async function prepare(): Promise<void> {
  await db.initialize();
  await PermissionService.seed();
  const user = AuthService.login('admin', 'admin123');
  user.mustChangePassword = false;
  user.securityKeySetupRequired = false;
  AuthService.setCurrentUser(user);
  db.run(`INSERT OR IGNORE INTO categories (id, name) VALUES ('cat_audit', 'تصنيف التدقيق')`);
  db.run(`INSERT OR IGNORE INTO brands (id, name) VALUES ('brand_audit', 'ماركة التدقيق')`);
}

function insertAuditProduct(productId: string): void {
  db.run(`INSERT OR REPLACE INTO products (
    id, sku, barcode, name, category_id, brand_id, product_type, grade, size, base_unit, sell_unit,
    pieces_per_box, meters_per_box, cost_price, selling_price_m2, is_active
  ) VALUES (?, ?, ?, 'صنف اختبار التدقيق', 'cat_audit', 'brand_audit', 'CERAMIC', 'GRADE_1',
    '60x60', 'M2', 'M2', 4, 1.44, 100, 200, 1)`, [productId, `SKU-${productId}`, `BAR-${productId}`]);
}

function setupPair(productId: string, warehouseId: string, warehouseCode: string, warehouseName: string, stockQty: number): void {
  db.run(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, is_active)
          VALUES (?, ?, ?, 'br_main', 1)`, [warehouseId, warehouseCode, warehouseName]);
  insertAuditProduct(productId);
  db.run(`DELETE FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`, [productId, warehouseId]);
  db.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
          VALUES (?, ?, ?, ?, 0)`, [`stk_${productId}`, warehouseId, productId, stockQty]);
}

function insertStockTx(id: string, productId: string, warehouseId: string, qty: number, performedBy: string, referenceType = 'OPENING'): void {
  db.run(`INSERT INTO inventory_transactions (
    id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count,
    unit_cost, total_cost, reference_type, reference_id, notes, performed_by
  ) VALUES (?, ?, ?, ?, ?, ?, 0, 100, ?, ?, ?, 'اختبار تدقيق', ?)`, [
    id, `TX-${id}`, qty >= 0 ? 'OPENING_BALANCE' : 'ADJUSTMENT_SUB', productId, warehouseId,
    qty, qty * 100, referenceType, `ref_${id}`, performedBy,
  ]);
}

function insertLayer(id: string, productId: string, warehouseId: string, sourceTx: string, received: number, remaining: number): void {
  db.run(`INSERT INTO inventory_cost_layers (
    id, product_id, warehouse_id, source_type, source_id, received_at,
    quantity_received, quantity_remaining, unit_cost, is_estimated
  ) VALUES (?, ?, ?, 'TEST', ?, '2026-01-01', ?, ?, 100, 0)`,
  [id, productId, warehouseId, sourceTx, received, remaining]);
}

test('stock balance audit reports a clean pair as MATCH', async () => {
  await prepare();
  const adminId = queryOne<{ id: string }>(`SELECT id FROM users WHERE username = 'admin'`)!.id;
  const productId = 'prod_audit_clean';
  const warehouseId = 'wh_audit_clean';
  setupPair(productId, warehouseId, 'WH-AUDIT-C', 'مخزن تدقيق سليم', 100);
  insertStockTx('tx_audit_clean_1', productId, warehouseId, 100, adminId);
  insertLayer('icl_audit_clean', productId, warehouseId, 'tx_audit_clean_1', 100, 100);

  const report = new StockBalanceAuditService().runAudit({ warehouseId, includeMatched: true });
  const row = report.rows.find((r) => r.productId === productId && r.warehouseId === warehouseId);
  assert.ok(row, 'Expected an audit row for the seeded pair');
  assert.equal(row!.status, 'MATCH');
  const stockCheck = row!.checks.find((c) => c.key === 'STOCK_VS_LEDGER')!;
  assert.equal(stockCheck.status, 'MATCH');
  assert.equal(stockCheck.book, 100);
  assert.equal(stockCheck.ledger, 100);
});

test('stock balance audit detects warehouse_stock drift from the movement ledger', async () => {
  await prepare();
  const adminId = queryOne<{ id: string }>(`SELECT id FROM users WHERE username = 'admin'`)!.id;
  const productId = 'prod_audit_drift';
  const warehouseId = 'wh_audit_drift';
  setupPair(productId, warehouseId, 'WH-AUDIT-D', 'مخزن تدقيق انحراف', 90);
  insertStockTx('tx_audit_drift_1', productId, warehouseId, 100, adminId);

  const report = new StockBalanceAuditService().runAudit({ warehouseId });
  const row = report.rows.find((r) => r.productId === productId && r.warehouseId === warehouseId);
  assert.ok(row, 'Drifted pair must surface in the discrepancy rows');
  assert.equal(row!.status, 'DISCREPANCY');
  const stockCheck = row!.checks.find((c) => c.key === 'STOCK_VS_LEDGER')!;
  assert.equal(stockCheck.status, 'DIFFERENCE');
  assert.equal(stockCheck.book, 90);
  assert.equal(stockCheck.ledger, 100);
  assert.equal(stockCheck.difference, -10);
  assert.ok(report.discrepancyPairs >= 1);
});

test('stock balance audit compares reserved_m2 against active reservations', async () => {
  await prepare();
  const adminId = queryOne<{ id: string }>(`SELECT id FROM users WHERE username = 'admin'`)!.id;
  const productId = 'prod_audit_reserved';
  const warehouseId = 'wh_audit_reserved';
  setupPair(productId, warehouseId, 'WH-AUDIT-R', 'مخزن تدقيق حجز', 50);
  insertStockTx('tx_audit_reserved_1', productId, warehouseId, 50, adminId);
  db.run(`INSERT INTO stock_reservations (id, product_id, warehouse_id, quantity_m2, reference_type, status, created_by)
          VALUES ('res_audit_1', ?, ?, 7, 'ORDER', 'ACTIVE', ?)`, [productId, warehouseId, adminId]);

  const report = new StockBalanceAuditService().runAudit({ warehouseId });
  const row = report.rows.find((r) => r.productId === productId && r.warehouseId === warehouseId);
  assert.ok(row);
  const reservedCheck = row!.checks.find((c) => c.key === 'RESERVED_VS_RESERVATIONS')!;
  assert.equal(reservedCheck.status, 'DIFFERENCE');
  assert.equal(reservedCheck.book, 0);
  assert.equal(reservedCheck.ledger, 7);
});

test('special-stock sale transactions do not distort the ledger comparison', async () => {
  await prepare();
  const adminId = queryOne<{ id: string }>(`SELECT id FROM users WHERE username = 'admin'`)!.id;
  const productId = 'prod_audit_special';
  const warehouseId = 'wh_audit_special';
  setupPair(productId, warehouseId, 'WH-AUDIT-S', 'مخزن تدقيق مخزون خاص', 80);
  insertStockTx('tx_audit_special_1', productId, warehouseId, 100, adminId);
  insertStockTx('tx_audit_special_2', productId, warehouseId, -20, adminId, 'SPECIAL_STOCK');
  insertStockTx('tx_audit_special_3', productId, warehouseId, -5, adminId, 'SPECIAL_STOCK_SALE');
  insertStockTx('tx_audit_special_4', productId, warehouseId, 5, adminId, 'SPECIAL_STOCK_SALE_VOID');
  insertLayer('icl_audit_special', productId, warehouseId, 'tx_audit_special_1', 100, 80);

  const report = new StockBalanceAuditService().runAudit({ warehouseId, includeMatched: true });
  const row = report.rows.find((r) => r.productId === productId && r.warehouseId === warehouseId);
  assert.ok(row);
  const stockCheck = row!.checks.find((c) => c.key === 'STOCK_VS_LEDGER')!;
  // Ledger counts only stock-moving tx: 100 - 20 = 80, matching warehouse_stock.
  assert.equal(stockCheck.status, 'MATCH');
  assert.equal(stockCheck.book, 80);
  assert.equal(stockCheck.ledger, 80);
});

test('fifo layer check compares on-hand quantity against remaining layer quantity', async () => {
  await prepare();
  const adminId = queryOne<{ id: string }>(`SELECT id FROM users WHERE username = 'admin'`)!.id;
  const productId = 'prod_audit_fifo';
  const warehouseId = 'wh_audit_fifo';
  setupPair(productId, warehouseId, 'WH-AUDIT-F', 'مخزن تدقيق FIFO', 60);
  insertStockTx('tx_audit_fifo_1', productId, warehouseId, 100, adminId);
  insertStockTx('tx_audit_fifo_2', productId, warehouseId, -40, adminId, 'SALE');
  insertLayer('icl_audit_fifo', productId, warehouseId, 'tx_audit_fifo_1', 100, 60);

  const method = InventoryCostingService.costingMethod(db);
  if (method !== 'FIFO') return;

  const report = new StockBalanceAuditService().runAudit({ warehouseId, includeMatched: true });
  const row = report.rows.find((r) => r.productId === productId && r.warehouseId === warehouseId);
  assert.ok(row);
  const fifoCheck = row!.checks.find((c) => c.key === 'FIFO_LAYERS');
  assert.ok(fifoCheck, 'FIFO costing must produce a layer check');
  assert.equal(fifoCheck!.status, 'MATCH');
  assert.equal(fifoCheck!.ledger, 60);
});
