import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import {
  baseQuantityAsM2,
  convertQuantity,
  conversionFactor,
  fromBaseQuantity,
  getUomLabel,
  isSameUom,
  normalizeUom,
  toBaseQuantity,
} from '../src/utils/uom.ts';

const ceramic = { productType: 'CERAMIC', baseUnit: 'M2', metersPerBox: 1.44, piecesPerBox: 4 };
const generalPiece = { productType: 'GENERAL', baseUnit: 'PIECE', metersPerBox: 1, piecesPerBox: 12 };
const generalKg = { productType: 'GENERAL', baseUnit: 'KG' };
const service = { productType: 'SERVICE', baseUnit: 'SERVICE' };
const custom = { productType: 'GENERAL', baseUnit: 'CUSTOM', customUnit: 'رول' };

test('uom conversions cover area, boxes, pieces and weight', () => {
  assert.equal(convertQuantity(2, 'M2', 'M2', ceramic), 2);
  assert.equal(convertQuantity(2, 'BOX', 'M2', ceramic), 2.88);
  assert.equal(convertQuantity(2.88, 'M2', 'BOX', ceramic), 2);
  // 4 pieces per box, 1.44 m² per box => 0.36 m² per piece.
  assert.equal(convertQuantity(4, 'PIECE', 'M2', ceramic), 1.44);
  assert.equal(convertQuantity(1.44, 'M2', 'PIECE', ceramic), 4);
  assert.equal(convertQuantity(2, 'BOX', 'PIECE', generalPiece), 24);
  assert.equal(convertQuantity(24, 'PIECE', 'BOX', generalPiece), 2);
  assert.equal(convertQuantity(3, 'KG', 'TON', generalKg), 0.003);
  assert.equal(convertQuantity(3, 'TON', 'KG', generalKg), 3000);
  // Length units are aliases of each other.
  assert.equal(convertQuantity(5, 'METER', 'LINEAR_METER', generalKg), 5);
});

test('uom normalization treats custom units by name and refuses impossible conversions', () => {
  assert.equal(normalizeUom('custom', custom), 'CUSTOM:رول');
  assert.equal(isSameUom('CUSTOM', 'رول', custom), true);
  assert.equal(isSameUom('CUSTOM', 'متر', custom), false);
  assert.equal(conversionFactor('BOX', 'BOX', ceramic), 1);
  assert.equal(conversionFactor('BOX', 'M2', generalKg), null);
  assert.equal(conversionFactor('M2', 'KG', generalKg), null);
  assert.throws(() => convertQuantity(1, 'BOX', 'M2', generalKg), /لا يمكن تحويل الكمية/);
  assert.throws(() => convertQuantity(1, 'SERVICE', 'PIECE', service), /لا يمكن تحويل الكمية/);
});

test('toBaseQuantity and fromBaseQuantity round-trip through the product base unit', () => {
  const inBase = toBaseQuantity(2, 'BOX', ceramic);
  assert.deepEqual(inBase, { quantity: 2.88, uom: 'M2' });
  assert.equal(fromBaseQuantity(inBase.quantity, 'BOX', ceramic), 2);
  assert.equal(convertQuantity(inBase.quantity, inBase.uom, 'M2', ceramic), 2.88);
  assert.equal(getUomLabel('CUSTOM', custom), 'رول');
  assert.equal(getUomLabel('KG', generalKg), 'كجم');
});

test('base quantity can be expressed as square meters only for area-dimension products', () => {
  assert.equal(baseQuantityAsM2(2, ceramic), 2);
  assert.equal(baseQuantityAsM2(2, { ...ceramic, baseUnit: 'BOX' }), 2.88);
  assert.equal(baseQuantityAsM2(4, { ...ceramic, baseUnit: 'PIECE' }), 1.44);
  assert.equal(baseQuantityAsM2(5, generalKg), 0);
});

test('database lines fill uom and quantity from the product base unit automatically', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();

  db.run(
    `INSERT OR REPLACE INTO products (id, product_type, custom_unit, sku, barcode, name, category_id, brand_id,
       grade, size, base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2, is_active)
     VALUES ('prod_uom_kg', 'GENERAL', '', 'UOM-KG', 'UOM-KG', 'UOM KG product', 'cat_floor', 'br_cleo',
       'GRADE_1', '', 'KG', 'KG', 1, 1, 10, 20, 1),
       ('prod_uom_m2', 'CERAMIC', '', 'UOM-M2', 'UOM-M2', 'UOM M2 product', 'cat_floor', 'br_cleo',
       'GRADE_1', '60x60', 'M2', 'M2', 4, 1.44, 10, 20, 1)`
  );
  db.run(
    `INSERT OR REPLACE INTO sales_invoices (id, invoice_number, date, customer_id, warehouse_id, subtotal,
       discount_amount, tax_amount, total_amount, paid_amount, remaining_amount, payment_type, payment_status,
       invoice_status, total_cost, gross_profit, created_by)
     VALUES ('inv_uom_trigger', 'UOM-TRIGGER', ?,
       (SELECT id FROM customers LIMIT 1), 'wh_main', 100, 0, 0, 100, 100, 0, 'CASH', 'PAID', 'COMPLETED', 0, 100, 'usr_admin')`,
    [new Date().toISOString().slice(0, 10)]
  );
  db.run(
    `INSERT INTO sales_invoice_items
       (id, invoice_id, product_id, product_name, product_sku, product_grade, size, sold_by,
        quantity_m2, boxes_count, pieces_count, unit_price, original_unit_price, unit_cost,
        discount_amount, total_price, total_cost, profit, meters_per_box, pieces_per_box)
     VALUES ('sii_uom_source', 'inv_uom_trigger', 'prod_uom_kg', 'UOM KG product', 'UOM-KG', 'GRADE_1', '', 'KG',
       5, 0, 0, 20, 20, 10, 0, 100, 50, 50, 1, 1)`
  );
  const row = db.query<{ uom: string; quantity: number }>(
    `SELECT uom, quantity FROM sales_invoice_items WHERE id = 'sii_uom_source'`
  )[0];
  assert.equal(row.uom, 'KG');
  assert.equal(Number(row.quantity), 5);

  // Updating the legacy column keeps the generic columns in sync.
  db.run(`UPDATE sales_invoice_items SET quantity_m2 = 7 WHERE id = 'sii_uom_source'`);
  const updated = db.query<{ uom: string; quantity: number }>(
    `SELECT uom, quantity FROM sales_invoice_items WHERE id = 'sii_uom_source'`
  )[0];
  assert.equal(Number(updated.quantity), 7);

  // A ceramic line is expressed in m² even though the column name is unchanged.
  db.run(
    `INSERT INTO sales_invoice_items
       (id, invoice_id, product_id, product_name, product_sku, product_grade, size, sold_by,
        quantity_m2, boxes_count, pieces_count, unit_price, original_unit_price, unit_cost,
        discount_amount, total_price, total_cost, profit, meters_per_box, pieces_per_box)
     VALUES ('sii_uom_ceramic', 'inv_uom_trigger', 'prod_uom_m2', 'UOM M2 product', 'UOM-M2', 'GRADE_1', '60x60', 'M2',
       1.44, 1, 4, 20, 20, 10, 0, 28.8, 14.4, 14.4, 1.44, 4)`
  );
  const ceramicRow = db.query<{ uom: string; quantity: number }>(
    `SELECT uom, quantity FROM sales_invoice_items WHERE id = 'sii_uom_ceramic'`
  )[0];
  assert.equal(ceramicRow.uom, 'M2');
  assert.equal(Number(ceramicRow.quantity), 1.44);

  // Warehouse stock is covered by the same guarantees.
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES ('ws_uom_kg', 'wh_main', 'prod_uom_kg', 9, 0)`
  );
  const stock = db.query<{ uom: string; quantity: number }>(
    `SELECT uom, quantity FROM warehouse_stock WHERE id = 'ws_uom_kg'`
  )[0];
  assert.equal(stock.uom, 'KG');
  assert.equal(Number(stock.quantity), 9);
});
