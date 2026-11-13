import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { InventoryService } from '../src/services/domains/inventory/InventoryService.ts';
import { SalesService } from '../src/services/domains/sales/SalesService.ts';

test('discounted special stock is inspected, priced, sold, and linked to its source', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
  const warehouseId = `wh_sp_sale_${suffix}`;
  const productId = `prod_sp_sale_${suffix}`;
  const categoryId = `cat_sp_sale_${suffix}`;
  const brandId = `brand_sp_sale_${suffix}`;

  db.run(`INSERT INTO warehouses (id, code, name, branch_id, is_active)
    VALUES (?, ?, ?, 'br_main', 1)`, [warehouseId, `SP-${suffix}`, 'Test discounted-stock warehouse']);
  db.run(`INSERT INTO categories (id, name) VALUES (?, ?)`, [categoryId, 'Test special stock']);
  db.run(`INSERT INTO brands (id, name) VALUES (?, ?)`, [brandId, 'Test brand']);
  db.run(`INSERT INTO products (
    id, sku, barcode, name, category_id, brand_id, grade, size, base_unit, sell_unit,
    pieces_per_box, meters_per_box, cost_price, selling_price_m2, wholesale_price_m2,
    min_selling_price_m2, min_stock_level, is_active
  ) VALUES (?, ?, ?, ?, ?, ?, 'GRADE_1', '1x1', 'M2', 'M2', 1, 1, 10, 30, 25, 20, 0, 1)`,
  [productId, `SKU-${suffix}`, `BAR-${suffix}`, 'Test special stock product', categoryId, brandId]);
  db.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
    VALUES (?, ?, ?, 10, 0)`, [`stock_${suffix}`, warehouseId, productId]);
  db.run(`INSERT INTO inventory_cost_layers (
    id, product_id, warehouse_id, source_type, received_at, quantity_received, quantity_remaining, unit_cost
  ) VALUES (?, ?, ?, 'TEST', date('now'), 10, 10, 10)`, [`layer_${suffix}`, productId, warehouseId]);

  const inventory = new InventoryService();
  const source = inventory.recordSpecialStock({
    warehouseId,
    productId,
    category: 'DAMAGED',
    quantityM2: 4,
    notes: 'Surface damage suitable for a discounted sale',
  });
  assert.throws(
    () => inventory.resolveSpecialStock(source.id, 'DOWNGRADE_SALE', 'Approve before inspection', 15),
    /يجب فحص السجل/
  );
  inventory.inspectSpecialStock(source.id, 'Inspected and approved for discounted sale');
  inventory.resolveSpecialStock(source.id, 'DOWNGRADE_SALE', 'Approved discounted price', 15);
  const listing = inventory.getDiscountedSaleStocks(warehouseId).find((row: any) => row.id === source.id);
  assert.equal(listing?.availableQuantityM2, 4);
  assert.equal(listing?.discountedUnitPrice, 15);
  const ordinaryStockBeforeSale = db.query<{ quantityM2: number }>(
    'SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?',
    [productId, warehouseId]
  )[0]?.quantityM2;

  const customerId = db.query<{ id: string }>('SELECT id FROM customers ORDER BY id LIMIT 1')[0]?.id;
  assert.ok(customerId);
  const sales = new SalesService();
  const invoice = sales.createSale({
    customerId: customerId!,
    warehouseId,
    items: [{
      productId,
      specialStockId: source.id,
      soldBy: 'M2',
      uom: 'M2',
      quantity: 2,
      quantityM2: 2,
      boxesCount: 0,
      piecesCount: 0,
      unitPrice: 15,
      unitCost: 999,
    }],
    paidAmount: 30,
    paymentType: 'CASH',
  });

  const invoiceItem = db.query<any>(
    `SELECT id, special_stock_id AS specialStockId, unit_price AS unitPrice, unit_cost AS unitCost
     FROM sales_invoice_items WHERE invoice_id = ?`,
    [invoice.id]
  )[0];
  assert.equal(invoiceItem.specialStockId, source.id);
  assert.equal(invoiceItem.unitPrice, 15);
  assert.equal(invoiceItem.unitCost, 10);
  const movement = db.query<any>(`
    SELECT reference_type AS referenceType, reference_id AS referenceId,
      quantity_m2 AS quantityM2, unit_cost AS unitCost
    FROM inventory_transactions WHERE reference_type = 'SPECIAL_STOCK_SALE' AND reference_id = ?
  `, [invoiceItem.id])[0];
  assert.equal(movement.quantityM2, -2);
  assert.equal(movement.unitCost, 10);
  assert.equal(db.query<{ remaining: number }>(
    'SELECT remaining_quantity_m2 AS remaining FROM inventory_special_stocks WHERE id = ?',
    [source.id]
  )[0]?.remaining, 2);
  assert.equal(db.query<{ quantityM2: number }>(
    'SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?',
    [productId, warehouseId]
  )[0]?.quantityM2, ordinaryStockBeforeSale, 'Discounted sale does not consume regular warehouse stock');

  assert.throws(() => sales.createSale({
    customerId: customerId!,
    warehouseId,
    items: [{
      productId,
      specialStockId: source.id,
      soldBy: 'M2',
      uom: 'M2',
      quantity: 3,
      quantityM2: 3,
      boxesCount: 0,
      piecesCount: 0,
      unitPrice: 15,
    }],
    paidAmount: 45,
    paymentType: 'CASH',
  }), /الكمية المتاحة من سجل البيع المخفض/);

  sales.voidInvoice(invoice.id, 'Test discounted-stock sale reversal');
  assert.equal(db.query<{ remaining: number }>(
    'SELECT remaining_quantity_m2 AS remaining FROM inventory_special_stocks WHERE id = ?',
    [source.id]
  )[0]?.remaining, 4, 'Voiding the invoice restores quantity to the original discounted-stock source');
  assert.equal(db.query<{ count: number }>(`
    SELECT COUNT(*) AS count FROM inventory_transactions
    WHERE reference_type = 'SPECIAL_STOCK_SALE_VOID' AND reference_id = ?
  `, [invoiceItem.id])[0]?.count, 1, 'Invoice reversal is linked to the original discounted sale line');

  const returnedSale = sales.createSale({
    customerId: customerId!, warehouseId,
    items: [{ productId, specialStockId: source.id, soldBy: 'M2', uom: 'M2', quantity: 1,
      quantityM2: 1, boxesCount: 0, piecesCount: 0, unitPrice: 15 }],
    paidAmount: 15, paymentType: 'CASH',
  });
  const returnedSaleItem = db.query<any>('SELECT id FROM sales_invoice_items WHERE invoice_id=?', [returnedSale.id])[0];
  const returned = sales.returnSale(returnedSale.id, [{
    productId, quantityM2: 1, boxesCount: 1, unitPrice: 15, unitCost: 10,
    reason: 'Return to discounted source', specialStockId: source.id, disposition: 'SPECIAL_STOCK',
  }], false);
  assert.equal(returned.totalAmount, 15);
  assert.equal(db.query<{ remaining: number }>(
    'SELECT remaining_quantity_m2 AS remaining FROM inventory_special_stocks WHERE id = ?', [source.id]
  )[0]?.remaining, 4);
  assert.equal(db.query<{ quantityM2: number }>(
    'SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?',
    [productId, warehouseId]
  )[0]?.quantityM2, ordinaryStockBeforeSale, 'Returning discounted stock does not change ordinary stock');
  assert.equal(db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM inventory_transactions
    WHERE reference_type='SPECIAL_STOCK_RETURN' AND reference_id=?`, [source.id])[0]?.count, 1);
  assert.equal(db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM inventory_transactions
    WHERE reference_type='SPECIAL_STOCK_RETURN_HOLD' AND reference_id=?`, [returnedSaleItem.id])[0]?.count, 0);

  const mixedSourceInvoice = sales.createSale({
    customerId: customerId!, warehouseId,
    items: [
      { productId, soldBy: 'M2', uom: 'M2', quantity: 1, quantityM2: 1, boxesCount: 0, piecesCount: 0, unitPrice: 30 },
      { productId, soldBy: 'M2', uom: 'M2', quantity: 1, quantityM2: 1, boxesCount: 0, piecesCount: 0, unitPrice: 35 },
      { productId, specialStockId: source.id, soldBy: 'M2', uom: 'M2', quantity: 1, quantityM2: 1, boxesCount: 0, piecesCount: 0, unitPrice: 15 },
    ],
    paidAmount: 80, paymentType: 'CASH',
  });
  const returnable = sales.getReturnableItems(mixedSourceInvoice.id);
  assert.equal(returnable.length, 3);
  const pricedRegularLine = returnable.find((item) => item.sourceType === 'INVOICE' && item.unitPrice === 35);
  assert.ok(pricedRegularLine?.invoiceItemId);
  assert.equal(returnable.find((item) => item.sourceType === 'INVOICE')?.specialStockId, null);
  assert.equal(returnable.find((item) => item.sourceType === 'SPECIAL_STOCK_SALE')?.specialStockId, source.id);
  const regularReturn = sales.returnSale(mixedSourceInvoice.id, [{
    productId, invoiceItemId: pricedRegularLine!.invoiceItemId, quantityM2: 1, boxesCount: 0, unitPrice: 35, unitCost: 10,
    reason: 'Return specific regular stock line', sourceType: 'REGULAR', disposition: 'RESTOCK',
  }], false);
  assert.equal(regularReturn.totalAmount, 35);
  const returnedItem = sales.getReturnItems(regularReturn.id)[0];
  assert.equal(returnedItem.invoiceItemId, pricedRegularLine!.invoiceItemId);
  const otherRegularLine = returnable.find((item) => item.sourceType === 'INVOICE' && item.invoiceItemId !== pricedRegularLine!.invoiceItemId)!;
  assert.throws(() => sales.returnSale(mixedSourceInvoice.id, [
    { productId, invoiceItemId: pricedRegularLine!.invoiceItemId, quantityM2: 0.5, boxesCount: 0, unitPrice: 35, unitCost: 10, reason: 'Exceed this line', sourceType: 'REGULAR' },
    { productId, invoiceItemId: otherRegularLine.invoiceItemId, quantityM2: 0.5, boxesCount: 0, unitPrice: 30, unitCost: 10, reason: 'Use remaining allowance', sourceType: 'REGULAR' },
  ], false), /سطر الفاتورة المحدد/);
});
