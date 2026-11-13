import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { CustomerService } from '../src/services/domains/customers/CustomerService.ts';
import { FinanceExtrasService } from '../src/services/domains/finance/FinanceExtrasService.ts';
import { PrintService } from '../src/services/shared/PrintService.ts';
import { SalesService } from '../src/services/domains/sales/SalesService.ts';
import { PartnerService } from '../src/services/domains/customers/PartnerService.ts';
import { runMigrations } from '../src/database/migrations/index.ts';
import { SCHEMA_SQL } from '../src/database/schema/index.ts';

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
  const partnerService = new PartnerService();
  const majorityPartner = partnerService.createPartner({ name: 'شريك حصة 60%', ownershipPercent: 60, capitalAmount: 0 });
  const minorityPartner = partnerService.createPartner({ name: 'شريك حصة 40%', ownershipPercent: 40, capitalAmount: 0 });

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
  assert.equal(partnerService.getPartnerStatement(majorityPartner.id).partner.profitsDue, invoice.grossProfit * 0.6);
  assert.equal(partnerService.getPartnerStatement(minorityPartner.id).partner.profitsDue, invoice.grossProfit * 0.4);

  const invoiceHtml = new PrintService().getInvoiceHtml({
    ...invoice,
    customerName: '<script>alert(1)</script>',
    taxPercentage: 14,
    taxAmount: 420,
    items: invoice.items.map((item) => ({ ...item, productName: '<img src=x onerror=alert(1)>' })),
  });
  assert.match(invoiceHtml, /ضريبة القيمة المضافة \(14%\)/);
  assert.match(invoiceHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(invoiceHtml, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(invoiceHtml, /<img src=x onerror=alert\(1\)>/);

  // Simulate closing and reopening the SQLite file saved by Electron.
  await db.flush();
  const persistedBytes = db.exportDatabaseBinary();
  await db.importDatabaseBinary(persistedBytes);
  const restoredDb = db.getDatabase();
  assert.equal(restoredDb.exec('PRAGMA integrity_check')[0]?.values[0]?.[0], 'ok');
  assert.equal(restoredDb.exec('PRAGMA foreign_key_check')[0]?.values.length ?? 0, 0);
  assert.equal(restoredDb.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0], 1);
  const reopenedInvoice = svc.getInvoiceById(invoice.id)!;
  assert.equal(reopenedInvoice.id, invoice.id);
  assert.equal(reopenedInvoice.customerId, customer.id);
  assert.equal(reopenedInvoice.items[0].productId, 'prod_sale_1');
  const reopenedHtml = new PrintService().getInvoiceHtml(reopenedInvoice, {
    settingsOverride: { invoiceShowItemCode: true },
  });
  assert.match(reopenedHtml, new RegExp(invoice.invoiceNumber));
  assert.match(reopenedHtml, /SKU-prod_sale_1/);

  // stock was reduced
  const stock = q(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_sale_1' AND warehouse_id = 'wh_main'`)[0];
  assert.equal(stock.q, 90);

  // partial payment completes the invoice
  assert.throws(() => svc.recordInvoicePayment(invoice.id, 1001), /يتجاوز المتبقي/);
  assert.equal(svc.getInvoiceById(invoice.id)!.remainingAmount, 1000);
  svc.recordInvoicePayment(invoice.id, 1000);
  const paid = svc.getInvoiceById(invoice.id)!;
  assert.equal(paid.remainingAmount, 0);

  // payment on a fully-paid invoice is rejected
  assert.throws(() => svc.recordInvoicePayment(invoice.id, 100), /مسددة بالكامل/);

  // partial return of 4 m2 back into stock
  svc.returnSale(invoice.id, [{
    productId: 'prod_sale_1', quantityM2: 4, boxesCount: 3, unitPrice: 300, unitCost: 100, reason: 'اختبار',
  }]);
  assert.equal(partnerService.getPartnerStatement(majorityPartner.id).partner.profitsDue, invoice.grossProfit * 0.6 * 0.6);
  assert.equal(partnerService.getPartnerStatement(minorityPartner.id).partner.profitsDue, invoice.grossProfit * 0.4 * 0.6);
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
  assert.equal(partnerService.getPartnerStatement(majorityPartner.id).partner.profitsDue, invoice.grossProfit * 0.6 * 0.6);
  assert.equal(partnerService.getPartnerStatement(minorityPartner.id).partner.profitsDue, invoice.grossProfit * 0.4 * 0.6);
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

test('sales returns allocate line and invoice discounts before applying invoice tax', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const svc = new SalesService();
  const customer = new CustomerService().createCustomer({
    name: 'عميل مرتجع بخصم اختبار', phone: '0122222233', customerType: 'RETAIL', creditLimit: 0,
  });
  const taxReports = new FinanceExtrasService();
  const taxSummaryBefore = taxReports.getTaxSummary('2000-01-01', '2999-12-31');

  seedProduct(db, 'prod_sale_return_discount');

  const invoice = svc.createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [
      {
        productId: 'prod_sale_return_discount', soldBy: 'M2', quantityM2: 10,
        boxesCount: 0, piecesCount: 0, unitPrice: 100, discountAmount: 100,
      },
      {
        productId: 'prod_sale_return_discount', soldBy: 'M2', quantityM2: 10,
        boxesCount: 0, piecesCount: 0, unitPrice: 100,
      },
    ],
    discountAmount: 100,
    taxAmount: 270,
    paidAmount: 2070,
    paymentType: 'CASH',
  });

  const salesReturn = svc.returnSale(invoice.id, [{
    productId: 'prod_sale_return_discount',
    quantityM2: 10,
    boxesCount: 0,
    unitPrice: 100,
    unitCost: 100,
    reason: 'إرجاع بخصم',
  }]);

  assert.equal(invoice.subtotal - invoice.discountAmount, 1800);
  assert.equal(salesReturn.totalAmount, 900);
  assert.equal(salesReturn.refundedAmount, 1035);
  assert.equal(salesReturn.remainingToBalance, 0);
  const returnLine = q(
    'SELECT total_refund AS refund FROM sales_return_items WHERE return_id = ?',
    [salesReturn.id]
  )[0];
  assert.equal(returnLine.refund, 900);
  const taxDebit = q(`
    SELECT l.debit
    FROM journal_entry_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    JOIN chart_of_accounts a ON a.id = l.account_id
    WHERE e.reference_type = 'SALES_RETURN' AND e.reference_id = ? AND a.code = '2102'
  `, [salesReturn.id])[0]?.debit;
  assert.equal(taxDebit, 135);
  const revenueDebit = q(`
    SELECT l.debit
    FROM journal_entry_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    JOIN chart_of_accounts a ON a.id = l.account_id
    WHERE e.reference_type = 'SALES_RETURN' AND e.reference_id = ? AND a.code = '4101'
  `, [salesReturn.id])[0]?.debit;
  assert.equal(revenueDebit, 900);
  const returnCustomer = q(
    'SELECT current_balance AS balance, total_purchases AS purchases FROM customers WHERE id = ?',
    [customer.id]
  )[0];
  assert.equal(returnCustomer.balance, 0);
  assert.equal(returnCustomer.purchases, 1035);
  const taxSummaryAfter = taxReports.getTaxSummary('2000-01-01', '2999-12-31');
  assert.equal(taxSummaryAfter.outputTax - taxSummaryBefore.outputTax, 135);
  assert.equal(taxSummaryAfter.salesTotal - taxSummaryBefore.salesTotal, 1035);

  const invoice4 = svc.createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 0, paymentType: 'CREDIT',
  });
  const stockBeforeExchange = q(
    `SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_sale_1' AND warehouse_id = 'wh_main'`
  )[0].q;
  assert.throws(() => svc.exchangeSale(invoice4.id, [{
    productId: 'prod_sale_1', quantityM2: 1, boxesCount: 1, unitPrice: 300, unitCost: 100, reason: 'استبدال',
  }], [{
    productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 500, boxesCount: 0, piecesCount: 0, unitPrice: 300,
  }]), /غير كافٍ/);
  assert.equal(q(`SELECT COUNT(*) AS count FROM sales_returns WHERE original_invoice_id = ?`, [invoice4.id])[0].count, 0);
  assert.equal(q(
    `SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_sale_1' AND warehouse_id = 'wh_main'`
  )[0].q, stockBeforeExchange);

  const exchange = svc.exchangeSale(invoice4.id, [{
    productId: 'prod_sale_1', quantityM2: 1, boxesCount: 1, unitPrice: 300, unitCost: 100, reason: 'استبدال',
  }], [{
    productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 0, unitPrice: 300,
  }]);
  assert.equal(exchange.return.originalInvoiceId, invoice4.id);
  assert.equal(exchange.invoice.customerId, customer.id);
});

test('sales return credit memo includes VAT for unpaid customer balances', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const customer = new CustomerService().createCustomer({
    name: 'عميل مرتجع ضريبي آجل', phone: '0122222244', customerType: 'RETAIL', creditLimit: 0,
  });
  seedProduct(db, 'prod_sale_return_tax_credit');
  const sales = new SalesService();
  const invoice = sales.createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{
      productId: 'prod_sale_return_tax_credit', soldBy: 'M2', quantityM2: 10,
      boxesCount: 0, piecesCount: 0, unitPrice: 100,
    }],
    paidAmount: 0,
    paymentType: 'CREDIT',
    taxAmount: 140,
  });

  const returned = sales.returnSale(invoice.id, [{
    productId: 'prod_sale_return_tax_credit',
    quantityM2: 4,
    boxesCount: 0,
    unitPrice: 100,
    unitCost: 100,
    reason: 'إرجاع آجل شامل الضريبة',
  }]);

  assert.equal(returned.totalAmount, 400);
  assert.equal(returned.refundedAmount, 0);
  assert.equal(returned.remainingToBalance, 456);
  assert.equal(q('SELECT current_balance AS balance FROM customers WHERE id = ?', [customer.id])[0].balance, 684);
  assert.equal(q('SELECT returned_amount AS amount FROM sales_invoices WHERE id = ?', [invoice.id])[0].amount, 456);
  assert.deepEqual(q(
    'SELECT remaining_amount AS remaining, payment_status AS status FROM sales_invoices WHERE id = ?',
    [invoice.id],
  )[0], { remaining: 684, status: 'UNPAID' });
  const ledgerLines = q(`
    SELECT coa.code, jel.debit, jel.credit
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.entry_id = je.id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.reference_type = 'SALES_RETURN' AND je.reference_id = ?
  `, [returned.id]);
  assert.equal(ledgerLines.find((line) => line.code === '4101')?.debit, 400);
  assert.equal(ledgerLines.find((line) => line.code === '2102')?.debit, 56);
  assert.equal(ledgerLines.find((line) => line.code === '1103')?.credit, 456);
  const statement = new CustomerService().getCustomerStatement(customer.id);
  const returnTransaction = statement.transactions.find((transaction: any) => transaction.docNumber === returned.returnNumber);
  assert.equal(returnTransaction?.credit, 456);

  const finalReturn = sales.returnSale(invoice.id, [{
    productId: 'prod_sale_return_tax_credit',
    quantityM2: 6,
    boxesCount: 0,
    unitPrice: 100,
    unitCost: 100,
    reason: 'إكمال المرتجع الآجل شامل الضريبة',
  }]);
  assert.equal(finalReturn.totalAmount, 600);
  assert.equal(finalReturn.remainingToBalance, 684);
  assert.equal(q('SELECT current_balance AS balance FROM customers WHERE id = ?', [customer.id])[0].balance, 0);
  assert.equal(q('SELECT returned_amount AS amount FROM sales_invoices WHERE id = ?', [invoice.id])[0].amount, 1140);
  assert.deepEqual(q(
    'SELECT remaining_amount AS remaining, payment_status AS status FROM sales_invoices WHERE id = ?',
    [invoice.id],
  )[0], { remaining: 0, status: 'PAID' });
});
