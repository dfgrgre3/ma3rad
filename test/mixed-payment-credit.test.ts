import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { CustomerService } from '../src/services/domains/customers/CustomerService.ts';
import { SalesService } from '../src/services/domains/sales/SalesService.ts';
import { CashierService } from '../src/services/domains/finance/CashierService.ts';

function q(sql: string, params: any[] = []): any[] {
  return DatabaseManager.getInstance().query(sql, params);
}

function seedProduct(db: any, id: string): void {
  db.run(
    `INSERT INTO products (id, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
       wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [id, `SKU-${id}`, `BAR-${id}`, 'بلاط اختبار الدفع المختلط', 'cat_floor', 'br_cleo', 'GRADE_1', '60x60',
     'M2', 'M2', 4, 1.44, 100, 300, 250, 0, 10]
  );
  db.run(
    `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?,?,?,?,0)`,
    [`stk_${id}`, 'wh_main', id, 100]
  );
}

const ledgerLinesFor = (referenceType: string, invoiceId: string): Array<{ code: string; debit: number; credit: number }> =>
  q(
    `SELECT coa.code AS code, SUM(jel.debit) AS debit, SUM(jel.credit) AS credit
     FROM journal_entries je
     JOIN journal_entry_lines jel ON jel.entry_id = je.id
     JOIN chart_of_accounts coa ON coa.id = jel.account_id
     WHERE je.reference_type = ? AND je.reference_id = ?
     GROUP BY coa.code`,
    [referenceType, invoiceId]
  ) as any;

test('mixed payment: نقدي + بطاقة + آجل (مثال 1000 + 2000 + 1000 من فاتورة 4000)', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const salesService = new SalesService();
  const customer = new CustomerService().createCustomer({
    name: 'عميل اختبار الدفع المختلط', phone: '0133333333', customerType: 'RETAIL', creditLimit: 50000,
  });
  seedProduct(db, 'prod_mixed_1');

  // 20 متر × 300 = 6000؛ 2000 نقدي + 3000 بطاقة + 1000 آجل
  const invoice = salesService.createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [
      { productId: 'prod_mixed_1', soldBy: 'M2', quantityM2: 20, boxesCount: 14, piecesCount: 0, unitPrice: 300 },
    ],
    paidAmount: 5000,
    paymentType: 'MIXED',
    payments: [
      { method: 'CASH', amount: 2000 },
      { method: 'CARD', amount: 3000 },
    ],
  });

  assert.equal(invoice.invoiceStatus, 'COMPLETED');
  assert.equal(invoice.totalAmount, 6000);
  assert.equal(invoice.paidAmount, 5000);
  assert.equal(invoice.remainingAmount, 1000);
  assert.equal(invoice.paymentType, 'MIXED');

  // كل وسيلة دفع مسجلة بصورة مستقلة
  const paymentRows = q(
    'SELECT method, SUM(amount) AS amount FROM sales_invoice_payments WHERE invoice_id = ? GROUP BY method ORDER BY method',
    [invoice.id]
  ) as any[];
  assert.deepEqual(
    paymentRows.map((r) => [r.method, Number(r.amount)]),
    [['CARD', 3000], ['CASH', 2000]]
  );

  // المتبقي الآجل يُضاف على رصيد العميل
  const customerRow = q('SELECT current_balance AS currentBalance FROM customers WHERE id = ?', [customer.id])[0] as any;
  assert.equal(Number(customerRow.currentBalance), 1000);

  // القيد المحاسبي: 1101 مدين 2000، 1102 مدين 3000، 1103 مدين 1000 (الآجل)
  const saleLines = ledgerLinesFor('SALES_INVOICE', invoice.id);
  const byCode = new Map(saleLines.map((l) => [l.code, l]));
  assert.equal(Number(byCode.get('1101')?.debit ?? 0), 2000);
  assert.equal(Number(byCode.get('1102')?.debit ?? 0), 3000);
  assert.equal(Number(byCode.get('1103')?.debit ?? 0), 1000);

  // الإلغاء عبر مستند عكسي: الخصم والتمييز يعودان بالكامل
  salesService.voidInvoice(invoice.id, 'اختبار إلغاء فاتورة مختلطة');
  const voidLines = ledgerLinesFor('SALES_VOID', invoice.id);
  const voidByCode = new Map(voidLines.map((l) => [l.code, l]));
  assert.equal(Number(voidByCode.get('1101')?.credit ?? 0), 2000);
  assert.equal(Number(voidByCode.get('1102')?.credit ?? 0), 3000);
  assert.equal(Number(voidByCode.get('1103')?.credit ?? 0), 1000);

  // بعد الإلغاء يعود رصيد العميل كما كان
  const afterVoid = q('SELECT current_balance AS currentBalance FROM customers WHERE id = ?', [customer.id])[0] as any;
  assert.equal(Number(afterVoid.currentBalance), 0);
});

test('void reverses split tender totals on the invoice shift and cash from its non-default register', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const registerId = 'cr_void_nondefault';
  db.run(`INSERT OR REPLACE INTO cash_registers (id, name, current_balance, is_default, is_active, branch_id) VALUES (?, ?, 100, 0, 1, 'br_main')`, [registerId, 'Register Void Nondefault']);
  const shift = new CashierService().openShift(registerId, 'usr_admin', 100);
  const customer = new CustomerService().createCustomer({
    name: `عميل إلغاء وردية ${Date.now()}`, phone: `015${String(Date.now()).slice(-8)}`, customerType: 'RETAIL', creditLimit: 50000,
  });
  seedProduct(db, 'prod_void_shift_multi');
  const invoice = new SalesService().createSale({
    customerId: customer.id, warehouseId: 'wh_main', shiftId: shift.id,
    items: [{ productId: 'prod_void_shift_multi', soldBy: 'M2', quantityM2: 20, boxesCount: 14, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 4000, paymentType: 'MIXED',
    payments: [{ method: 'CASH', amount: 1000 }, { method: 'CARD', amount: 1500 }, { method: 'BANK_TRANSFER', amount: 1500 }],
  });
  assert.equal(Number(q('SELECT current_balance AS balance FROM cash_registers WHERE id = ?', [registerId])[0].balance), 1100);
  assert.equal(Number(q('SELECT current_balance AS balance FROM cash_registers WHERE id = ?', ['cr_main'])[0].balance), 0);
  assert.deepEqual(Object.values(q('SELECT total_sales_cash AS cash, total_sales_card AS card, total_sales_transfer AS transfer FROM cash_shifts WHERE id = ?', [shift.id])[0]).map(Number), [1000, 1500, 1500]);

  new SalesService().voidInvoice(invoice.id, 'اختبار عكس وردية وخزينة');
  assert.equal(Number(q('SELECT current_balance AS balance FROM cash_registers WHERE id = ?', [registerId])[0].balance), 100);
  assert.equal(Number(q('SELECT current_balance AS balance FROM cash_registers WHERE id = ?', ['cr_main'])[0].balance), 0);
  assert.deepEqual(Object.values(q('SELECT total_sales_cash AS cash, total_sales_card AS card, total_sales_transfer AS transfer FROM cash_shifts WHERE id = ?', [shift.id])[0]).map(Number), [0, 0, 0]);
  db.run('DELETE FROM cash_shifts WHERE id = ?', [shift.id]);
  db.run('DELETE FROM cash_registers WHERE id = ?', [registerId]);
});

test('mixed payment: إطار آجل يصل في payments لا يُسجَّل كدفعة (يبقى متبقياً على العميل)', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const salesService = new SalesService();
  const customer = new CustomerService().createCustomer({
    name: 'عميل اختبار الآجل المختلط', phone: '0144444444', customerType: 'RETAIL', creditLimit: 50000,
  });
  seedProduct(db, 'prod_mixed_2');

  const invoice = salesService.createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [
      { productId: 'prod_mixed_2', soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 0, unitPrice: 300 },
    ],
    paidAmount: 2000,
    paymentType: 'MIXED',
    payments: [
      { method: 'CASH', amount: 2000 },
      { method: 'CREDIT', amount: 1000 }, // إطار غير صالح — يجب استبعاده من الدفعة والقيد
    ],
  });

  // إطار CREDIT مُرشّح — يُسجَّل فقط إطار الدفع الفعلي (CASH 2000 = paidAmount)
  const paymentRows = q(
    'SELECT method, SUM(amount) AS amount FROM sales_invoice_payments WHERE invoice_id = ? GROUP BY method',
    [invoice.id]
  ) as any[];
  assert.ok(paymentRows.every((row) => row.method !== 'CREDIT'));
  assert.deepEqual(paymentRows.map((r) => [r.method, Number(r.amount)]), [['CASH', 2000]]);
  // المتبقي = الإجمالي (3000) − المدفوع (2000) = 1000 آجل
  assert.equal(invoice.remainingAmount, 1000);
});
