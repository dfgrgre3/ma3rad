import './integration.setup.ts';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { CustomerService } from '../src/services/domains/customers/CustomerService.ts';
import { InventoryService } from '../src/services/domains/inventory/InventoryService.ts';
import { InventoryValuationService } from '../src/services/domains/inventory/InventoryValuationService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { SalesService } from '../src/services/domains/sales/SalesService.ts';

test('general product sales decrement stock using the selected unit', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const db = manager.getDatabase();

  const productId = 'prod_unit_box_test';
  db.run(
    `INSERT INTO products (
       id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price,
       selling_price_m2, is_active
     ) VALUES (?, 'GENERAL', '', ?, ?, ?, ?, ?, '', 'BOX', 'BOX', 1, 1, 5, 10, 1)`,
    [productId, 'SKU-UNIT-BOX', 'BAR-UNIT-BOX', 'اختبار كرتونة', 'cat_floor', 'br_cleo'],
  );
  db.run(
    `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?, 'wh_main', ?, 5, 0)`,
    ['stk_unit_box_test', productId],
  );
  const customer = new CustomerService().createCustomer({
    name: 'عميل اختبار وحدات عامة',
    phone: '01000000991',
    customerType: 'RETAIL',
    creditLimit: 0,
  });

  const invoice = new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{
      productId,
      soldBy: 'BOX',
      quantityM2: 2,
      boxesCount: 2,
      piecesCount: 0,
      unitPrice: 10,
    }],
    paidAmount: 20,
    paymentType: 'CASH',
  });

  const savedInvoice = new SalesService().getInvoiceById(invoice.id);
  const stock = new InventoryService().getWarehouseStock('wh_main').find((row) => row.productId === productId);
  assert.equal(stock?.quantityM2, 3);
  assert.equal(stock?.quantityBoxes, 3);
  assert.equal(savedInvoice?.items[0].productType, 'GENERAL');
  assert.equal(savedInvoice?.items[0].baseUnit, 'BOX');
});

test('general product sales preserve non-box base units on invoice rows', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const db = manager.getDatabase();

  const productId = 'prod_unit_kg_test';
  db.run(
    `INSERT INTO products (
       id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price,
       selling_price_m2, is_active
     ) VALUES (?, 'GENERAL', '', ?, ?, ?, ?, ?, '', 'KG', 'KG', 1, 1, 5, 10, 1)`,
    [productId, 'SKU-UNIT-KG', 'BAR-UNIT-KG', 'اختبار بالكيلو', 'cat_floor', 'br_cleo'],
  );
  db.run(
    `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?, 'wh_main', ?, 5, 0)`,
    ['stk_unit_kg_test', productId],
  );
  const customer = new CustomerService().createCustomer({
    code: 'CUST-UNIT-KG',
    name: 'عميل اختبار وحدة الكيلو',
    phone: '01000000992',
    customerType: 'RETAIL',
    creditLimit: 0,
  });

  const invoice = new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{
      productId,
      soldBy: 'KG',
      quantityM2: 2,
      boxesCount: 0,
      piecesCount: 0,
      unitPrice: 10,
    }],
    paidAmount: 20,
    paymentType: 'CASH',
  });

  const savedInvoice = new SalesService().getInvoiceById(invoice.id);
  const stock = new InventoryService().getWarehouseStock('wh_main').find((row) => row.productId === productId);
  assert.equal(stock?.quantityM2, 3);
  assert.equal(savedInvoice?.items?.[0].soldBy, 'KG');
  assert.equal(savedInvoice?.items?.[0].baseUnit, 'KG');
});

test('inactive products with remaining stock stay visible in inventory and valuation', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const db = manager.getDatabase();
  const productId = 'prod_inactive_stock_visibility_test';
  const stockId = 'stk_inactive_stock_visibility_test';
  const costLayerId = 'icl_inactive_stock_visibility_test';
  const inventory = new InventoryService();
  const valuation = new InventoryValuationService();
  let transferId: string | null = null;

  db.run('DELETE FROM warehouse_stock WHERE id = ?', [stockId]);
  db.run('DELETE FROM inventory_cost_layers WHERE id = ?', [costLayerId]);
  db.run('DELETE FROM products WHERE id = ?', [productId]);

  try {
    const before = valuation.getByWarehouse().find((row) => row.id === 'wh_main');
    const kpiBefore = valuation.getKpi();
    const reconciliationBefore = inventory.reconcileInventoryWithGL('wh_main');
    db.run(
      `INSERT INTO products (
         id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, size,
         base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price,
         selling_price_m2, is_active
       ) VALUES (?, 'GENERAL', '', ?, ?, ?, ?, ?, '', 'KG', 'KG', 1, 1, 20, 30, 1)`,
      [productId, 'SKU-INACTIVE-STOCK', 'BAR-INACTIVE-STOCK', 'صنف معطل برصيد', 'cat_floor', 'br_cleo'],
    );
    db.run(
      `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
       VALUES (?, 'wh_main', ?, 7, 0)`,
      [stockId, productId],
    );
    db.run(
      `INSERT INTO inventory_cost_layers (
         id, product_id, warehouse_id, source_type, received_at, quantity_received,
         quantity_remaining, unit_cost, is_estimated
       ) VALUES (?, ?, 'wh_main', 'OPENING_ESTIMATE', date('now'), 7, 7, 20, 1)`,
      [costLayerId, productId],
    );

    assert.equal(inventory.getWarehouseStock('wh_main').some((row) => row.productId === productId), true);
    db.run('UPDATE products SET is_active = 0 WHERE id = ?', [productId]);
    assert.equal(inventory.getWarehouseStock('wh_main').some((row) => row.productId === productId), false);
    assert.equal(inventory.getInactiveWarehouseStock('wh_main').find((row) => row.productId === productId)?.quantityM2, 7);
    const after = valuation.getByWarehouse().find((row) => row.id === 'wh_main');
    const kpiAfter = valuation.getKpi();
    const reconciliationAfter = inventory.reconcileInventoryWithGL('wh_main');
    assert.ok(before && after);
    assert.ok(
      Math.abs((after.costValue - before.costValue) - 140) < 0.001,
      `expected valuation to increase by 140, got ${before.costValue} -> ${after.costValue}`,
    );
    assert.ok(Math.abs((kpiAfter.totalValue - kpiBefore.totalValue) - 140) < 0.001);
    assert.ok(kpiAfter.topValueItems.some((item) => item.name === 'صنف معطل برصيد' && item.value === 140));
    assert.equal(reconciliationAfter.totalPhysicalQty - reconciliationBefore.totalPhysicalQty, 7);
    transferId = inventory.requestWarehouseStockTransfer('wh_main', 'wh_ext', 'اختبار نقل رصيد الصنف المعطل');
    const transferItem = manager.query<{ productId: string; quantityM2: number }>(`
      SELECT product_id AS productId, quantity_m2 AS quantityM2
      FROM stock_transfer_items WHERE transfer_id = ?
    `, [transferId])[0];
    assert.deepEqual(transferItem, { productId, quantityM2: 7 });
  } finally {
    if (transferId) {
      db.run('DELETE FROM stock_transfer_items WHERE transfer_id = ?', [transferId]);
      db.run('DELETE FROM stock_transfers WHERE id = ?', [transferId]);
    }
    db.run('DELETE FROM inventory_cost_layers WHERE id = ?', [costLayerId]);
    db.run('DELETE FROM warehouse_stock WHERE id = ?', [stockId]);
    db.run('DELETE FROM products WHERE id = ?', [productId]);
  }
});
