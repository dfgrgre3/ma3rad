import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { BatchService } from '../src/services/domains/inventory/BatchService.ts';
import { InventoryIntelligenceService } from '../src/services/domains/inventory/InventoryIntelligenceService.ts';

const db = DatabaseManager.getInstance();

function queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
  return db.query<T>(sql, params)[0];
}

function ensureBaseData(): string {
  const adminId = queryOne<{ id: string }>(`SELECT id FROM users WHERE username = 'admin'`)!.id;
  db.run(`INSERT OR IGNORE INTO categories (id, name) VALUES ('cat_intel', 'تصنيف ذكاء المخزون')`);
  db.run(`INSERT OR IGNORE INTO brands (id, name) VALUES ('brand_intel', 'ماركة ذكاء المخزون')`);
  db.run(`INSERT OR IGNORE INTO customers (id, code, name, phone) VALUES ('cust_intel', 'CUST-INTEL', 'عميل اختبار ذكاء المخزون', '01000000000')`);
  return adminId;
}

function insertProduct(id: string, name: string, grade = 'GRADE_1'): void {
  db.run(`INSERT OR REPLACE INTO products (
    id, sku, barcode, name, category_id, brand_id, grade, size, base_unit, sell_unit,
    pieces_per_box, meters_per_box, cost_price, selling_price_m2, wholesale_price_m2,
    min_selling_price_m2, min_stock_level, reorder_point, safety_stock, lead_time_days, is_active
  ) VALUES (?, ?, ?, ?, 'cat_intel', 'brand_intel', ?, '60x60', 'M2', 'M2',
    4, 1.44, 10000, 20000, 18000, 15000, 0, 10, 5, 7, 1)`, [
    id, `SKU-${id}`, `BAR-${id}`, name, grade,
  ]);
}

function cleanProduct(id: string): void {
  db.run(`DELETE FROM sales_invoice_items WHERE product_id = ?`, [id]);
  db.run(`DELETE FROM sales_invoices WHERE id LIKE 'inv_intel_%'`);
  db.run(`DELETE FROM stock_count_items WHERE product_id = ?`, [id]);
  db.run(`DELETE FROM stock_counts WHERE id LIKE 'cnt_intel_%'`);
  db.run(`DELETE FROM stock_reservations WHERE product_id = ?`, [id]);
  db.run(`DELETE FROM inventory_transactions WHERE product_id = ?`, [id]);
  db.run(`DELETE FROM inventory_cost_layers WHERE product_id = ?`, [id]);
  db.run(`DELETE FROM product_batches WHERE product_id = ?`, [id]);
  db.run(`DELETE FROM product_location_stock WHERE product_id = ?`, [id]);
  db.run(`DELETE FROM warehouse_stock WHERE product_id = ?`, [id]);
}

async function prepare(): Promise<void> {
  await db.initialize();
  await PermissionService.seed();
  const user = AuthService.login('admin', 'admin123');
  // Tests exercise business services directly; bypass the first-run password change gate.
  user.mustChangePassword = false;
  user.securityKeySetupRequired = false;
  AuthService.setCurrentUser(user);
  ensureBaseData();
}

test('ceramic batch grade is persisted, inherited from product, and detected when mixing', async () => {
  await prepare();
  const adminId = ensureBaseData();
  const productId = 'prod_intel_grade';
  const warehouseId = 'wh_intel_grade';
  db.run(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, is_active)
          VALUES (?, 'WH-INTEL-GRADE', 'مخزن اختبار الفرز', 'br_main', 1)`, [warehouseId]);
  insertProduct(productId, 'بورسلين اختبار الفرز', 'GRADE_1');
  cleanProduct(productId);

  const service = new BatchService();
  const first = service.createBatch({
    productId,
    warehouseId,
    batchNumber: 'LOT-GRADE-A',
    toneShade: 'T1',
    caliber: '0',
    quantityM2: 10,
    costPrice: 100,
  });
  assert.equal(first.grade, 'GRADE_1', 'Batch should inherit the product grade when none is supplied');

  const second = service.createBatch({
    productId,
    warehouseId,
    batchNumber: 'LOT-GRADE-B',
    toneShade: 'T1',
    caliber: '0',
    grade: 'GRADE_2',
    quantityM2: 10,
    costPrice: 100,
  });
  assert.equal(second.grade, 'GRADE_2', 'Batch should keep the explicit sorting grade');

  const conflicts = service.checkToneMixing([{
    productId,
    productName: 'بورسلين اختبار الفرز',
    warehouseId,
    quantityM2: 15,
  }]);
  assert.equal(conflicts.length, 1, 'Same tone/caliber but different grades must raise a mixing conflict');
  assert.deepEqual(
    conflicts[0].batches.map((batch) => batch.grade).sort(),
    ['GRADE_1', 'GRADE_2']
  );

  service.updateBatch(second.id, { grade: 'GRADE_3' });
  assert.equal(service.getBatchById(second.id)?.grade, 'GRADE_3', 'Batch grade should be editable');

  assert.equal(queryOne<{ grade: string }>(`SELECT grade FROM product_batches WHERE id = ?`, [first.id])?.grade, 'GRADE_1');
  assert.ok(adminId);
});

test('inventory intelligence reports batch availability, transfer needs, low margins and dead stock', async () => {
  await prepare();
  const adminId = ensureBaseData();
  const productId = 'prod_intel_ops';
  const sourceId = 'wh_intel_source';
  const targetId = 'wh_intel_target';
  const locationId = 'loc_intel_source';

  db.run(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, is_active)
          VALUES (?, 'WH-INTEL-SRC', 'مخزن المصدر الذكي', 'br_main', 1)`, [sourceId]);
  db.run(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, is_active)
          VALUES (?, 'WH-INTEL-DST', 'مخزن الوجهة الذكية', 'br_main', 1)`, [targetId]);
  db.run(`INSERT OR IGNORE INTO warehouse_locations (id, warehouse_id, zone, aisle, shelf, bin, barcode, is_active)
          VALUES (?, ?, 'A', '1', '2', 'B-01', 'LOC-INTEL-SRC', 1)`, [locationId, sourceId]);
  insertProduct(productId, 'سيراميك اختبار الذكاء', 'GRADE_1');
  cleanProduct(productId);

  db.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
          VALUES ('stk_intel_src', ?, ?, 200, 0)`, [sourceId, productId]);
  db.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
          VALUES ('stk_intel_dst', ?, ?, 5, 2)`, [targetId, productId]);
  db.run(`INSERT INTO product_batches (
    id, product_id, warehouse_id, batch_number, tone_shade, caliber, grade, cost_price,
    quantity_m2, quantity_remaining_m2, received_date, created_by
  ) VALUES ('batch_intel_a', ?, ?, 'LOT-INTEL-A', 'A12', '0', 'GRADE_1', 10000, 120, 120, '2025-01-01', ?)`,
  [productId, sourceId, adminId]);
  db.run(`INSERT INTO product_batches (
    id, product_id, warehouse_id, batch_number, tone_shade, caliber, grade, cost_price,
    quantity_m2, quantity_remaining_m2, received_date, created_by
  ) VALUES ('batch_intel_b', ?, ?, 'LOT-INTEL-B', 'A12', '0', 'GRADE_2', 11000, 80, 80, '2025-02-01', ?)`,
  [productId, sourceId, adminId]);
  db.run(`INSERT INTO product_batches (
    id, product_id, warehouse_id, batch_number, tone_shade, caliber, grade, cost_price,
    quantity_m2, quantity_remaining_m2, received_date, created_by
  ) VALUES ('batch_intel_dst', ?, ?, 'LOT-INTEL-DST', 'A12', '0', 'GRADE_1', 10000, 5, 5, '2025-03-01', ?)`,
  [productId, targetId, adminId]);
  db.run(`INSERT INTO product_location_stock (id, location_id, product_id, quantity_m2)
          VALUES ('pls_intel_a', ?, ?, 120)`, [locationId, productId]);
  db.run(`INSERT INTO stock_reservations (id, product_id, warehouse_id, quantity_m2, reference_type, status, created_by)
          VALUES ('res_intel_a', ?, ?, 2, 'ORDER', 'ACTIVE', ?)`, [productId, targetId, adminId]);

  // 60 m² of demand over the last 60 days in the target warehouse.
  db.run(`INSERT INTO sales_invoices (
    id, invoice_number, date, customer_id, warehouse_id, subtotal, total_amount, created_by,
    payment_type, payment_status, invoice_status
  ) VALUES ('inv_intel_demand', 'INV-INTEL-DEMAND', date('now', '-10 days'), 'cust_intel', ?,
    12000, 12000, ?, 'CASH', 'PAID', 'COMPLETED')`, [targetId, adminId]);
  db.run(`INSERT INTO sales_invoice_items (
    id, invoice_id, product_id, product_name, product_sku, product_grade, size, sold_by,
    quantity_m2, boxes_count, pieces_count, unit_price, original_unit_price, unit_cost,
    total_price, total_cost, profit, meters_per_box, pieces_per_box
  ) VALUES ('sii_intel_demand', 'inv_intel_demand', ?, 'سيراميك اختبار الذكاء', ?, 'GRADE_1',
    '60x60', 'M2', 60, 1, 4, 200, 200, 180, 12000, 10800, 1200, 1.44, 4)`, [productId, `SKU-${productId}`]);

  const intelligence = new InventoryIntelligenceService();

  const availability = intelligence.getBatchAvailability({ productId });
  const sourceGroup = availability.find((row) => row.warehouseId === sourceId && row.grade === 'GRADE_1');
  assert.ok(sourceGroup, 'Availability must expose the source batch group');
  assert.equal(sourceGroup!.remainingM2, 120);
  assert.equal(sourceGroup!.grade, 'GRADE_1');
  assert.equal(sourceGroup!.locations[0]?.bin, 'B-01');
  const targetGroup = availability.find((row) => row.warehouseId === targetId);
  assert.ok(targetGroup);
  assert.equal(targetGroup!.reservedM2, 2, 'Active reservations must reduce availability');

  const transfers = intelligence.suggestTransfers({ productId });
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].fromWarehouseId, sourceId);
  assert.equal(transfers[0].toWarehouseId, targetId);
  assert.equal(transfers[0].suggestedQuantityM2, 9);
  assert.equal(transfers[0].urgency, 'CRITICAL');
  assert.equal(transfers[0].batches[0].grade, 'GRADE_1', 'Transfer must pick the oldest batch and keep its grade');

  const margins = intelligence.getLowMarginAlerts({ productId, thresholdPct: 15 });
  assert.equal(margins.length, 1);
  assert.equal(margins[0].marginPct, 10);
  assert.equal(margins[0].severity, 'BELOW_TARGET');

  const deadStock = intelligence.getDeadStock({ productId });
  assert.equal(deadStock.length, 1, 'The source warehouse never sold this product and is dead stock');
  assert.equal(deadStock[0].warehouseId, sourceId);
  assert.equal(deadStock[0].availableM2, 200);
  assert.equal(deadStock[0].stockValue, 20000);
  assert.equal(deadStock[0].batches.length, 2);
});

test('count variance analysis classifies direction, severity and reasons', async () => {
  await prepare();
  const adminId = ensureBaseData();
  const productId = 'prod_intel_count';
  const warehouseId = 'wh_intel_count';
  db.run(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, is_active)
          VALUES (?, 'WH-INTEL-CNT', 'مخزن اختبار الجرد', 'br_main', 1)`, [warehouseId]);
  insertProduct(productId, 'سيراميك اختبار الجرد');
  cleanProduct(productId);

  db.run(`INSERT INTO stock_counts (
    id, count_number, warehouse_id, date, count_type, status, created_by
  ) VALUES ('cnt_intel_a', 'CNT-INTEL-A', ?, date('now', '-5 days'), 'SURPRISE', 'POSTED', ?)`,
  [warehouseId, adminId]);
  db.run(`INSERT INTO stock_counts (
    id, count_number, warehouse_id, date, count_type, status, notes, created_by
  ) VALUES ('cnt_intel_b', 'CNT-INTEL-B', ?, date('now', '-3 days'), 'PERIODIC', 'POSTED',
    'تلف أثناء التخزين', ?)`, [warehouseId, adminId]);
  db.run(`INSERT INTO stock_counts (
    id, count_number, warehouse_id, date, count_type, status, created_by
  ) VALUES ('cnt_intel_c', 'CNT-INTEL-C', ?, date('now', '-1 days'), 'FULL', 'POSTED', ?)`,
  [warehouseId, adminId]);

  db.run(`INSERT INTO stock_count_items (
    id, count_id, product_id, product_name, system_quantity_m2, counted_quantity_m2,
    variance_m2, unit_cost, variance_value, notes, counted_by
  ) VALUES ('sci_intel_a', 'cnt_intel_a', ?, 'سيراميك اختبار الجرد', 100, 90, -10, 10000, -100000,
    'عجز نتيجة كسر أثناء المناولة', ?)`, [productId, adminId]);
  db.run(`INSERT INTO stock_count_items (
    id, count_id, product_id, product_name, system_quantity_m2, counted_quantity_m2,
    variance_m2, unit_cost, variance_value, notes
  ) VALUES ('sci_intel_b', 'cnt_intel_b', ?, 'سيراميك اختبار الجرد', 50, 52, 2, 10000, 20000, NULL)`, [productId]);
  db.run(`INSERT INTO stock_count_items (
    id, count_id, product_id, product_name, system_quantity_m2, counted_quantity_m2,
    variance_m2, unit_cost, variance_value, notes
  ) VALUES ('sci_intel_c', 'cnt_intel_c', ?, 'سيراميك اختبار الجرد', 30, 29, -1, 10000, -10000, NULL)`, [productId]);

  const analysis = new InventoryIntelligenceService().getCountVarianceAnalysis({ warehouseId });
  assert.equal(analysis.totals.sessions, 3);
  assert.equal(analysis.totals.lines, 3);
  assert.equal(analysis.totals.shortageValue, 1100);
  assert.equal(analysis.totals.surplusValue, 200);
  assert.equal(analysis.totals.netValue, -900);
  assert.equal(analysis.totals.unexplainedLines, 1);

  const noteRow = analysis.rows.find((row) => row.countId === 'cnt_intel_a')!;
  assert.equal(noteRow.direction, 'SHORTAGE');
  assert.equal(noteRow.severity, 'HIGH');
  assert.equal(noteRow.reasonSource, 'ITEM_NOTE');

  const sessionNoteRow = analysis.rows.find((row) => row.countId === 'cnt_intel_b')!;
  assert.equal(sessionNoteRow.direction, 'SURPLUS');
  assert.equal(sessionNoteRow.reasonSource, 'COUNT_NOTE');
  assert.equal(sessionNoteRow.reason, 'تلف أثناء التخزين');

  const inferredRow = analysis.rows.find((row) => row.countId === 'cnt_intel_c')!;
  assert.equal(inferredRow.reasonSource, 'INFERRED');
  assert.match(inferredRow.reason, /عجز غير مفسر/);

  const periodic = analysis.byCountType.find((row) => row.countType === 'PERIODIC')!;
  assert.equal(periodic.sessions, 1);
  assert.equal(periodic.netValue, 200);
});
