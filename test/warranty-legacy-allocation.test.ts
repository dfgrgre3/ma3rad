import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { CustomerService } from '../src/services/domains/customers/CustomerService.ts';
import { SalesService } from '../src/services/domains/sales/SalesService.ts';
import { WarrantyClaimService } from '../src/services/domains/sales/WarrantyClaimService.ts';

test('legacy warranty and return allocations use the same invoice-line order', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const customer = new CustomerService().createCustomer({
    name: 'عميل توزيع المطالبات التاريخية', phone: '0123333344', customerType: 'RETAIL', creditLimit: 0,
  });
  db.run(
    `INSERT INTO products (id, product_type, custom_unit, sku, barcode, name, category_id, brand_id,
       grade, size, base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2, is_active)
     VALUES ('prod_warranty_legacy_order', 'GENERAL', '', 'SKU-WARRANTY-LEGACY', 'BAR-WARRANTY-LEGACY',
       'بلاط اختبار الضمان التاريخي', 'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2', 4, 1.44, 100, 300, 1)`
  );
  db.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
    VALUES ('stk_warranty_legacy_order', 'wh_main', 'prod_warranty_legacy_order', 100, 0)`);

  const invoice = new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [
      { productId: 'prod_warranty_legacy_order', soldBy: 'M2', quantityM2: 4, boxesCount: 0, piecesCount: 0, unitPrice: 300 },
      { productId: 'prod_warranty_legacy_order', soldBy: 'M2', quantityM2: 6, boxesCount: 0, piecesCount: 0, unitPrice: 300 },
    ],
    paidAmount: 3000,
    paymentType: 'CASH',
  } as any);

  const lines = db.query<{ id: string }>(
    'SELECT id FROM sales_invoice_items WHERE invoice_id = ? ORDER BY rowid', [invoice.id]
  );
  assert.equal(lines.length, 2);
  db.run('DELETE FROM inventory_cost_allocations WHERE invoice_item_id IN (?, ?)', [lines[0].id, lines[1].id]);
  db.run('UPDATE sales_invoice_items SET id = ? WHERE id = ?', ['sii_legacy_z', lines[0].id]);
  db.run('UPDATE sales_invoice_items SET id = ? WHERE id = ?', ['sii_legacy_a', lines[1].id]);

  db.run(`INSERT INTO sales_returns
    (id, return_number, original_invoice_id, original_invoice_number, customer_id, warehouse_id,
     date, total_amount, refunded_amount, remaining_to_balance, reason, created_by)
    VALUES ('ret_warranty_legacy_order', 'RET-WARRANTY-LEGACY-ORDER', ?, ?, ?, 'wh_main', ?, 600, 600, 0, 'legacy allocation', 'usr_admin')`,
  [invoice.id, invoice.invoiceNumber, customer.id, new Date().toISOString().slice(0, 10)]);
  db.run(`INSERT INTO sales_return_items
    (id, return_id, product_id, product_name, grade, quantity_m2, boxes_count, unit_price, unit_cost, total_refund)
    VALUES ('sri_warranty_legacy_order', 'ret_warranty_legacy_order', 'prod_warranty_legacy_order',
      'بلاط اختبار الضمان التاريخي', 'GRADE_1', 2, 0, 300, 100, 600)`);
  db.run(`INSERT INTO customer_warranty_claims
    (id, claim_number, invoice_id, invoice_item_id, customer_id, product_id, warehouse_id,
     claim_type, status, quantity_m2, warranty_months, issue_description, created_by)
    VALUES ('wcl_warranty_legacy_order', 'WCLM-WARRANTY-LEGACY-ORDER', ?, NULL, ?,
      'prod_warranty_legacy_order', 'wh_main', 'WARRANTY', 'OPEN', 1, 12, 'legacy claim', 'usr_admin')`,
  [invoice.id, customer.id]);

  const returnable = new SalesService().getReturnableItems(invoice.id);
  const eligible = new WarrantyClaimService().getEligibleItems(invoice.id, 12);
  assert.deepEqual(
    returnable.map((item) => [item.invoiceItemId, item.returnedM2]),
    eligible.map((item) => [item.invoiceItemId, item.returnedQuantity]),
  );
  assert.equal(eligible.find((item) => item.invoiceItemId === 'sii_legacy_a')?.availableQuantity, 3);
  assert.equal(eligible.find((item) => item.invoiceItemId === 'sii_legacy_z')?.availableQuantity, 4);
});
