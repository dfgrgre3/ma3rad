import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { CustomerService } from '../src/services/CustomerService.ts';
import { PrintService } from '../src/services/PrintService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import { runMigrations } from '../src/database/migrations.ts';
import { SCHEMA_SQL } from '../src/database/schema.ts';

function q(sql: string, params: any[] = []): any[] {
  return DatabaseManager.getInstance().query(sql, params);
}

function seedProduct(db: any, id: string, opts: { cost?: number; minPrice?: number } = {}): void {
  db.run(
    `INSERT INTO products (id, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
       wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [id, `SKU-${id}`, `BAR-${id}`, 'بلاط اختبار مبيعات', 'cat_floor', 'br_cleo', 'GRADE_1', '60x60',
     'M2', 'M2', 4, 1.44, opts.cost ?? 100, 300, 250, opts.minPrice ?? 0, 10]
  );
  db.run(
    `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?,?,?,?,0)`,
    [`stk_${id}`, 'wh_main', id, 100]
  );
}

test('legacy sales invoices gain status columns before queries run', async () => {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const legacySchema = SCHEMA_SQL.replace(
    /\s*payment_status TEXT NOT NULL DEFAULT 'PAID',\s*invoice_status TEXT NOT NULL DEFAULT 'COMPLETED',/g,
    ''
  );
  db.exec(legacySchema);

  const report = runMigrations(db);
  assert.equal(report.failed.length, 0, 'legacy sales invoice migration should not fail');

  const tableInfo = db.exec('PRAGMA table_info(sales_invoices)')[0]?.values ?? [];
  const columns = tableInfo.map((row) => String(row[1]));
  assert.ok(columns.includes('payment_status'));
  assert.ok(columns.includes('invoice_status'));
});

test('sales: create, insufficient stock, partial payment, return and void', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const svc = new SalesService();
  const customer = new CustomerService().createCustomer({
    name: 'عميل اختبار المبيعات', phone: '0122222222', customerType: 'RETAIL', creditLimit: 0,
  });
  seedProduct(db, 'prod_sale_1');

  // empty cart is rejected
  assert.throws(
    () => svc.createSale({ customerId: customer.id, warehouseId: 'wh_main', items: [], paidAmount: 0, paymentType: 'CASH' } as any),
    /بدون أصناف/
  );

  // exceeding available stock is rejected
  assert.throws(
    () => svc.createSale({
      customerId: customer.id, warehouseId: 'wh_main',
      items: [{ productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 500, boxesCount: 125, piecesCount: 0, unitPrice: 300 }],
      paidAmount: 0, paymentType: 'CASH',
    } as any),
    /غير كافٍ/
  );

  // successful sale: 10 m2 at 300 = 3000, fully paid
  const invoice = svc.createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 2000, paymentType: 'CASH',
  });
  assert.equal(invoice.invoiceStatus, 'COMPLETED');
  assert.equal(invoice.totalAmount, 3000);
  assert.equal(invoice.paidAmount, 2000);
  assert.equal(invoice.remainingAmount, 1000);

  const invoiceHtml = new PrintService().getInvoiceHtml({
    ...invoice,
    customerName: '<script>alert(1)</script>',
    taxPercentage: 14,
    taxAmount: 420,
    items: invoice.items.map((item) => ({ ...item, productName: '<img src=x onerror=alert(1)>' })),
  });
  assert.match(invoiceHtml, /الضريبة \(14%\)/);
  assert.match(invoiceHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(invoiceHtml, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(invoiceHtml, /<img src=x onerror=alert\(1\)>/);

  // Simulate closing and reopening the SQLite file saved by Electron.
  await db.flush();
  const persistedBytes = db.exportDatabaseBinary();
  db.importDatabaseBinary(persistedBytes);
  const restoredDb = db.getDatabase();
  assert.equal(restoredDb.exec('PRAGMA integrity_check')[0]?.values[0]?.[0], 'ok');
  assert.equal(restoredDb.exec('PRAGMA foreign_key_check')[0]?.values.length ?? 0, 0);
  assert.equal(restoredDb.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0], 1);
  const reopenedInvoice = svc.getInvoiceById(invoice.id)!;
  assert.equal(reopenedInvoice.id, invoice.id);
  assert.equal(reopenedInvoice.customerId, customer.id);
  assert.equal(reopenedInvoice.items[0].productId, 'prod_sale_1');
  const reopenedHtml = new PrintService().getInvoiceHtml(reopenedInvoice);
  assert.match(reopenedHtml, new RegExp(invoice.invoiceNumber));
  assert.match(reopenedHtml, /SKU-prod_sale_1/);

  // stock was reduced
  const stock = q(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_sale_1' AND warehouse_id = 'wh_main'`)[0];
  assert.equal(stock.q, 90);

  // partial payment completes the invoice
  svc.recordInvoicePayment(invoice.id, 1000);
  const paid = svc.getInvoiceById(invoice.id)!;
  assert.equal(paid.remainingAmount, 0);

  // payment on a fully-paid invoice is rejected
  assert.throws(() => svc.recordInvoicePayment(invoice.id, 100), /مسددة بالكامل/);

  // partial return of 4 m2 back into stock
  svc.returnSale(invoice.id, [{
    productId: 'prod_sale_1', quantityM2: 4, boxesCount: 3, unitPrice: 300, unitCost: 100, reason: 'اختبار',
  }]);
  const afterReturn = q(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_sale_1' AND warehouse_id = 'wh_main'`)[0];
  assert.equal(afterReturn.q, 94);

  // returning more than was sold is rejected
  assert.throws(
    () => svc.returnSale(invoice.id, [{
      productId: 'prod_sale_1', quantityM2: 100, boxesCount: 0, unitPrice: 300, unitCost: 100, reason: 'اختبار',
    }]),
    /أكبر من المباعة/
  );

  // an invoice with returns cannot be voided
  assert.throws(() => svc.voidInvoice(invoice.id, 'اختبار'), /مرتجعات/);

  // a clean invoice can be voided with a reason, and payments on it are then rejected
  const invoice2 = svc.createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 300, paymentType: 'CASH',
  });
  assert.throws(() => svc.voidInvoice(invoice2.id, ''), /سبب إلغاء/);
  svc.voidInvoice(invoice2.id, 'خطأ في الإدخال');
  assert.equal(svc.getInvoiceById(invoice2.id)!.invoiceStatus, 'VOID');
  assert.throws(() => svc.recordInvoicePayment(invoice2.id, 50), /ملغاة/);

  // Voiding after a separate receipt would otherwise leave its cash/register
  // and receipt record unreversed. Reject it without changing the invoice.
  const invoice3 = svc.createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 2, boxesCount: 2, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 0, paymentType: 'CREDIT',
  });
  svc.recordInvoicePayment(invoice3.id, 100);
  const stockBeforeRejectedVoid = q(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_sale_1' AND warehouse_id = 'wh_main'`)[0].q;
  assert.throws(() => svc.voidInvoice(invoice3.id, 'خطأ في الإدخال'), /سندات قبض/);
  assert.equal(svc.getInvoiceById(invoice3.id)!.invoiceStatus, 'COMPLETED');
  assert.equal(q(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_sale_1' AND warehouse_id = 'wh_main'`)[0].q, stockBeforeRejectedVoid);
});
