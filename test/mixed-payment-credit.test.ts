import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/auth/AuthService.ts';
import { PermissionService } from '../src/services/auth/PermissionService.ts';
import { CustomerService } from '../src/services/customers/CustomerService.ts';
import { SalesService } from '../src/services/sales/SalesService.ts';

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
