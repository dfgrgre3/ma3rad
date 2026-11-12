import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { InventoryService } from '../src/services/domains/inventory/InventoryService.ts';
import { InventoryValuationService } from '../src/services/domains/inventory/InventoryValuationService.ts';

const db = DatabaseManager.getInstance();

function queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
  return db.query<T>(sql, params)[0];
}

function setCostingMethod(method: 'FIFO' | 'AVERAGE_COST'): void {
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', ?)`, [method]);
}

test('inventory valuation follows the configured costing method', async () => {
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const warehouseId = 'wh_policy_test';
  const productId = 'prod_policy_test';
  db.run(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, is_active) VALUES (?, 'WH-POL', 'سياسة التكلفة', 'br_main', 1)`, [warehouseId]);
  db.run(`INSERT OR IGNORE INTO categories (id, name) VALUES ('cat_policy', 'تصنيف سياسة التكلفة')`);
  db.run(`INSERT OR IGNORE INTO brands (id, name) VALUES ('brand_policy', 'ماركة سياسة التكلفة')`);
  db.run(`INSERT OR IGNORE INTO products (
    id, sku, barcode, name, category_id, brand_id, size, base_unit, sell_unit, cost_price, selling_price_m2, is_active
  ) VALUES (?, 'SKU-POL', 'BAR-POL', 'صنف سياسة التكلفة', 'cat_policy', 'brand_policy', '60x60', 'M2', 'M2', 100, 150, 1)`, [productId]);
  db.run(`DELETE FROM warehouse_stock WHERE product_id = ?`, [productId]);
  db.run(`DELETE FROM inventory_cost_layers WHERE product_id = ?`, [productId]);
  db.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2) VALUES ('stk_policy', ?, ?, 10, 0)`, [warehouseId, productId]);
  // A stale FIFO layer worth 200/unit must be ignored under AVERAGE_COST.
  db.run(`INSERT INTO inventory_cost_layers (
    id, product_id, warehouse_id, source_type, received_at,
    quantity_received, quantity_remaining, unit_cost
  ) VALUES ('icl_policy', ?, ?, 'OPENING_ESTIMATE', '2026-01-01', 10, 10, 200)`, [productId, warehouseId]);

  const valuation = new InventoryValuationService();

  setCostingMethod('AVERAGE_COST');
  const averageKpi = valuation.getKpi();
  assert.equal(averageKpi.totalValue, 1000, 'Average cost must value physical stock at the current product cost');

  setCostingMethod('FIFO');
  const fifoKpi = valuation.getKpi();
  assert.equal(fifoKpi.totalValue, 2000, 'FIFO must value the remaining cost layers');
});

test('warehouse movements keep bin-level stock in sync', async () => {
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const inventory = new InventoryService();
  const warehouseId = 'wh_bin_test';
  const productId = 'prod_bin_test';
  db.run(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, is_active) VALUES (?, 'WH-BIN', 'مخزن المواقع', 'br_main', 1)`, [warehouseId]);
  db.run(`INSERT OR IGNORE INTO categories (id, name) VALUES ('cat_bin', 'تصنيف مواقع التخزين')`);
  db.run(`INSERT OR IGNORE INTO brands (id, name) VALUES ('brand_bin', 'ماركة مواقع التخزين')`);
  db.run(`INSERT OR IGNORE INTO products (
    id, sku, barcode, name, category_id, brand_id, size, base_unit, sell_unit, cost_price, selling_price_m2, is_active
  ) VALUES (?, 'SKU-BIN', 'BAR-BIN', 'صنف المواقع', 'cat_bin', 'brand_bin', '60x60', 'M2', 'M2', 100, 150, 1)`, [productId]);
  db.run(`DELETE FROM warehouse_stock WHERE product_id = ?`, [productId]);
  db.run(`DELETE FROM product_location_stock WHERE product_id = ?`, [productId]);
  db.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2) VALUES ('stk_bin', ?, ?, 100, 0)`, [warehouseId, productId]);

  const location = inventory.createWarehouseLocation({
    warehouseId, zone: 'A', aisle: '01', shelf: 'S1', bin: 'B1',
  });
  inventory.assignProductLocation(location.id, productId, 50);

  const assigned = queryOne<{ quantity: number }>(
    `SELECT quantity_m2 AS quantity FROM product_location_stock WHERE location_id = ? AND product_id = ?`,
    [location.id, productId]
  );
  assert.equal(assigned?.quantity, 50);

  // Moving 20 units out of the warehouse must reduce the bin proportionally.
  inventory.recordSpecialStock({
    warehouseId,
    productId,
    category: 'DAMAGED',
    quantityM2: 20,
    notes: 'اختبار مزامنة مواقع التخزين',
  });

  const afterMovement = queryOne<{ quantity: number }>(
    `SELECT quantity_m2 AS quantity FROM product_location_stock WHERE location_id = ? AND product_id = ?`,
    [location.id, productId]
  );
  assert.equal(afterMovement?.quantity, 30, 'Bin stock must follow the warehouse outflow');
  const movement = queryOne<{ quantity: number; after: number; type: string }>(`
    SELECT quantity_m2 AS quantity, location_quantity_after AS after, movement_type AS type
    FROM warehouse_location_movements
    WHERE warehouse_id = ? AND product_id = ? AND from_location_id = ?
    ORDER BY created_at DESC, rowid DESC LIMIT 1
  `, [warehouseId, productId, location.id]);
  assert.equal(movement?.type, 'RELEASE');
  assert.equal(movement?.quantity, 20);
  assert.equal(movement?.after, 30);
});
