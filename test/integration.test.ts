import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { CustomerService } from '../src/services/CustomerService.ts';
import { PurchaseService } from '../src/services/PurchaseService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import { InventoryService } from '../src/services/InventoryService.ts';
import { QuotationService } from '../src/services/QuotationService.ts';
import { OrderService } from '../src/services/OrderService.ts';

function q(sql: string, params: any[] = []): any[] {
  return DatabaseManager.getInstance().query(sql, params);
}

test('end-to-end: weighted-average costing, sale, and return accounting', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const pid = 'prod_test_1';
  db.run(
    `INSERT INTO products (id, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
       wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [pid, 'SKU-T1', 'BAR-T1', 'بلاطة اختبار', 'cat_floor', 'br_cleo', 'GRADE_1', '60x60',
     'M2', 'M2', 4, 1.44, 100, 300, 250, 0, 10]
  );
  db.run(
    `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?,?,?,?,0)`,
    ['stk_test', 'wh_main', pid, 200]
  );
  db.run(`INSERT INTO suppliers (id, code, name, phone, current_balance, total_purchases)
          VALUES (?,?,?,?,0,0)`, ['sup_test', 'SUP-T', 'مورد اختبار', '0100000001']);
  const created = new CustomerService().createCustomer({ name: 'عميل اختبار', phone: '0100000002', customerType: 'RETAIL', creditLimit: 0 });

  const product = q('SELECT meters_per_box, pieces_per_box FROM products WHERE id=?', [pid])[0];
  const mPerBox = product.metersPerBox;
  const pPerBox = product.piecesPerBox;
  const box = (m2: number) => Math.round(m2 / mPerBox);
  const piece = (m2: number) => box(m2) * pPerBox;

  // --- Weighted-average costing (brief §33): 200@100 + 100@200 => 133.33 ---
  new PurchaseService().createPurchase({
    supplierId: 'sup_test',
    warehouseId: 'wh_main',
    items: [{ productId: pid, quantityM2: 100, boxesCount: box(100), unitCost: 200 }],
    paidAmount: 0,
    paymentType: 'CREDIT',
  });
  const avgCost = q('SELECT cost_price FROM products WHERE id=?', [pid])[0].costPrice;
  assert.equal(avgCost, 133.33, 'weighted average cost should be 133.33');

  // --- Credit sale (paid 0) then full return ---
  const sale1 = new SalesService().createSale({
    customerId: created.id,
    warehouseId: 'wh_main',
    items: [{ productId: pid, soldBy: 'M2', quantityM2: 50, boxesCount: box(50), piecesCount: piece(50), unitPrice: 300 }],
    paidAmount: 0,
    paymentType: 'CREDIT',
  });
  assert.equal(q('SELECT quantity_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id=?', [pid, 'wh_main'])[0].quantityM2, 250, 'stock after sale = 250');
  assert.equal(q('SELECT current_balance FROM customers WHERE id=?', [created.id])[0].currentBalance, 15000, 'credit balance = 15000');

  new SalesService().returnSale(sale1.id, [{ productId: pid, quantityM2: 50, boxesCount: box(50), unitPrice: 300, unitCost: avgCost, reason: 'إرجاع' }], true);
  assert.equal(q('SELECT current_balance FROM customers WHERE id=?', [created.id])[0].currentBalance, 0, 'balance back to 0 after unpaid return');
  assert.equal(q('SELECT quantity_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id=?', [pid, 'wh_main'])[0].quantityM2, 300, 'stock restored to 300');

  // --- Cash sale (paid in full) then full return ---
  const sale2 = new SalesService().createSale({
    customerId: created.id,
    warehouseId: 'wh_main',
    items: [{ productId: pid, soldBy: 'M2', quantityM2: 50, boxesCount: box(50), piecesCount: piece(50), unitPrice: 300 }],
    paidAmount: 15000,
    paymentType: 'CASH',
  });
  assert.equal(q('SELECT current_balance FROM customers WHERE id=?', [created.id])[0].currentBalance, 0, 'fully-paid sale does not increase balance');
  assert.equal(q('SELECT current_balance FROM cash_registers WHERE id=?', ['cr_main'])[0].currentBalance, 15000, 'cash register received 15000');

  new SalesService().returnSale(sale2.id, [{ productId: pid, quantityM2: 50, boxesCount: box(50), unitPrice: 300, unitCost: avgCost, reason: 'إرجاع' }], true);
  assert.equal(q('SELECT current_balance FROM customers WHERE id=?', [created.id])[0].currentBalance, 0, 'balance unchanged after paid return');
  assert.equal(q('SELECT current_balance FROM cash_registers WHERE id=?', ['cr_main'])[0].currentBalance, 0, 'cash register refunded to 0');
  assert.equal(q('SELECT quantity_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id=?', [pid, 'wh_main'])[0].quantityM2, 300, 'stock restored to 300 after paid return');

  // --- Quotation → order → delivery → invoice pipeline ---
  const quotation = new QuotationService().createQuotation({
    customerId: created.id,
    validDays: 15,
    items: [{ productId: pid, quantityM2: 20, unitPrice: 300 }],
  });
  assert.equal(quotation.status, 'PENDING');
  assert.equal(quotation.totalAmount, 6000);

  new QuotationService().scheduleFollowUp(quotation.id, '2026-12-01', 'متابعة العميل');
  assert.equal(q('SELECT follow_up_date FROM quotations WHERE id=?', [quotation.id])[0].followUpDate, '2026-12-01');

  const order = new QuotationService().convertToOrder(quotation.id, { warehouseId: 'wh_main' });
  assert.equal(q('SELECT converted_order_id FROM quotations WHERE id=?', [quotation.id])[0].convertedOrderId, order.id);
  assert.equal(q('SELECT follow_up_date FROM quotations WHERE id=?', [quotation.id])[0].followUpDate, null);
  assert.equal(q('SELECT reserved_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id=?', [pid, 'wh_main'])[0].reservedM2, 20);

  const orderSvc = new OrderService();
  orderSvc.updateStatus(order.id, 'CONFIRMED');
  orderSvc.updateStatus(order.id, 'PROCESSING');
  const firstDelivery = orderSvc.recordDelivery(order.id, [{ itemId: order.items![0].id, quantityM2: 10 }], 'تسليم أول');
  assert.equal(firstDelivery.status, 'PARTIAL');
  assert.equal(firstDelivery.items![0].deliveredM2, 10);
  orderSvc.recordDelivery(order.id, [{ itemId: order.items![0].id, quantityM2: 10 }], 'تسليم ثانٍ');
  assert.equal(orderSvc.getOrder(order.id)!.items![0].deliveredM2, 20);
  assert.equal(orderSvc.getStatusHistory(order.id).length, 5, 'create + 2 status changes + 2 deliveries');

  const orderInvoice = orderSvc.convertToInvoice(order.id, { paymentType: 'CASH' });
  assert.equal(orderInvoice.totalAmount, 6000);
  assert.equal(q('SELECT status FROM orders WHERE id=?', [order.id])[0].status, 'COMPLETED');
  assert.equal(q('SELECT quantity_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id=?', [pid, 'wh_main'])[0].quantityM2, 280);
  assert.equal(q('SELECT reserved_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id=?', [pid, 'wh_main'])[0].reservedM2, 0);

  // --- Refund to customer balance instead of cash ---
  const balanceReturn = new SalesService().returnSale(
    orderInvoice.id,
    [{ productId: pid, quantityM2: 20, boxesCount: box(20), unitPrice: 300, unitCost: avgCost, reason: 'إرجاع كامل' }],
    true,
    undefined,
    { refundMethod: 'BALANCE' }
  );
  assert.equal(balanceReturn.refundMethod, 'BALANCE');
  assert.equal(balanceReturn.refundedAmount, 0, 'no cash leaves the register');
  assert.equal(q('SELECT current_balance FROM cash_registers WHERE id=?', ['cr_main'])[0].currentBalance, 6000, 'balance refund leaves the cash register untouched');
  assert.equal(q('SELECT current_balance FROM customers WHERE id=?', [created.id])[0].currentBalance, -6000, 'full value credited to the customer balance');

  // --- RBAC: a CASHIER cannot adjust inventory (brief §108) ---
  AuthService.logout();
  db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active)
          VALUES (?,?,?,?,?,1)`,
    ['usr_cashier', 'cashier1', bcrypt.hashSync('pass123', 10), 'كاشير', 'CASHIER']);
  AuthService.login('cashier1', 'pass123');
  assert.throws(
    () => new InventoryService().adjustStock(pid, 'wh_main', 999, 'test'),
    /غير مصرح/
  );
});
