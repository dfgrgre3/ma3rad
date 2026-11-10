import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { CustomerService } from '../src/services/domains/customers/CustomerService.ts';
import { SalesService } from '../src/services/domains/sales/SalesService.ts';
import { AnalyticsService } from '../src/services/domains/reports/AnalyticsService.ts';
import { localDateString } from '../src/utils/shared/date.ts';
import { loadReport } from '../src/pages/reports/sales-reports/SalesReportsPage.tsx';
import { runReport } from '../src/pages/reports/reports-hub/reportCatalog.ts';
import { SalesFinancialReconciliationService } from '../src/services/domains/sales/SalesFinancialReconciliationService.ts';
import { ReportCenterService } from '../src/services/domains/reports/ReportCenterService.ts';
import { HistoricalReturnReconciliationService } from '../src/services/domains/sales/HistoricalReturnReconciliationService.ts';
import { postLedgerEntry } from '../src/database/repositories/ledger.ts';

test('sales reports net sales, profit and daily revenue against returns by return date', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', 'AVERAGE_COST')`);

  const productId = 'sales_report_return_product';
  db.run(`INSERT INTO products (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,
    pieces_per_box,meters_per_box,cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,
    min_stock_level,is_active)
    VALUES (?, ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2', 4, 1.44, 100, 300, 250, 0, 0, 1)`,
    [productId, productId, productId, 'Sales report return product']);
  db.run(`INSERT INTO warehouse_stock (id,warehouse_id,product_id,quantity_m2,reserved_m2)
    VALUES (?, 'wh_main', ?, 20, 0)`, [`stock_${productId}`, productId]);
  const customer = new CustomerService().createCustomer({
    name: 'Sales report return customer',
    phone: '0199000033',
    customerType: 'RETAIL',
    creditLimit: 0,
  });
  const invoice = new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{
      productId, soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 0, unitPrice: 300,
    }],
    paidAmount: 0,
    paymentType: 'CREDIT',
    taxAmount: 150,
    shippingCost: 50,
  });
  const analyticsService = new AnalyticsService();
  const dashboardBefore = analyticsService.getDashboardMetrics();
  const salesReturn = new SalesService().returnSale(invoice.id, [{
    productId, quantityM2: 4, boxesCount: 3, unitPrice: 300, unitCost: 100, reason: 'report test',
  }]);
  const expectedNetSales = invoice.subtotal - invoice.discountAmount - salesReturn.totalAmount;
  const dashboardAfter = analyticsService.getDashboardMetrics();
  const dashboardSales = (metrics: ReturnType<typeof analyticsService.getDashboardMetrics>, name: string) =>
    metrics.find((metric) => metric.name === name)!.value;
  assert.equal(
    dashboardSales(dashboardAfter, 'المبيعات اليوم') - dashboardSales(dashboardBefore, 'المبيعات اليوم'),
    -salesReturn.totalAmount,
  );
  assert.equal(
    dashboardSales(dashboardAfter, 'المبيعات هذا الشهر') - dashboardSales(dashboardBefore, 'المبيعات هذا الشهر'),
    -salesReturn.totalAmount,
  );

  const today = localDateString();
  const returnDate = '2099-01-02';
  db.run('UPDATE sales_returns SET date = ? WHERE original_invoice_id = ?', [returnDate, invoice.id]);
  const analytics = analyticsService.getSalesAnalytics(invoice.date, returnDate);
  assert.equal(analytics.totalSales, expectedNetSales);
  assert.equal(analytics.totalOrders, 1);
  assert.equal(analytics.averageOrderValue, expectedNetSales);
  assert.equal(analytics.totalProfit, 1200);
  assert.deepEqual(analytics.salesByDay, [
    { date: invoice.date, amount: invoice.subtotal - invoice.discountAmount, count: 1 },
    { date: returnDate, amount: -salesReturn.totalAmount, count: 0 },
  ]);
  const analyticsProduct = analytics.topProducts.find((row) => row.productId === productId);
  assert.ok(analyticsProduct);
  assert.equal(analyticsProduct.quantity, 6);
  assert.equal(analyticsProduct.revenue, 1800);
  const analyticsCustomer = analytics.topCustomers.find((row) => row.customerId === customer.id);
  assert.ok(analyticsCustomer);
  assert.equal(analyticsCustomer.totalSpent, expectedNetSales);
  assert.equal(analyticsCustomer.orderCount, 1);

  const productRows = loadReport('by_product', today, returnDate) as Array<{
    label: string; revenue: number; cost: number; profit: number; count: number;
  }>;
  const product = productRows.find((row) => row.label === 'Sales report return product');
  assert.ok(product);
  assert.equal(product.revenue, 1800);
  assert.equal(product.cost, 600);
  assert.equal(product.profit, 1200);
  assert.equal(product.count, 1);

  const categoryRows = loadReport('by_category', today, returnDate) as typeof productRows;
  const categoryName = db.query<{ name: string }>('SELECT name FROM categories WHERE id = ?', ['cat_floor'])[0].name;
  const categoryRow = categoryRows.find((row) => row.label === categoryName);
  assert.ok(categoryRow);
  assert.equal(categoryRow.revenue, 1800);
  assert.equal(categoryRow.profit, 1200);

  const customerRows = loadReport('by_customer', today, returnDate) as typeof productRows;
  const customerRow = customerRows.find((row) => row.label === customer.name);
  assert.ok(customerRow);
  assert.equal(customerRow.revenue, 1800);
  assert.equal(customerRow.cost, 600);
  assert.equal(customerRow.profit, 1200);

  const userRows = loadReport('by_user', today, returnDate) as typeof productRows;
  const userRow = userRows.find((row) => row.revenue === 1800);
  assert.ok(userRow);
  assert.equal(userRow.profit, 1200);

  const dailyRows = loadReport('daily', today, returnDate) as Array<{
    date: string; revenue: number; invoiceCount: number; returnCount: number;
  }>;
  const daily = dailyRows.find((row) => row.date === today);
  assert.ok(daily);
  assert.equal(daily.revenue, 3000);
  assert.equal(daily.invoiceCount, 1);
  assert.equal(daily.returnCount, 0);

  const returnDayRows = loadReport('daily', returnDate, returnDate) as Array<{
    date: string; revenue: number; invoiceCount: number; returnCount: number;
  }>;
  assert.deepEqual(returnDayRows, [{
    date: returnDate,
    revenue: -1200,
    invoiceCount: 0,
    returnCount: 1,
  }]);

  const cityRows = loadReport('by_city', returnDate, returnDate) as Array<{
    label: string; revenue: number; count: number; customers: number; margin: number;
  }>;
  assert.equal(cityRows.length, 1);
  assert.equal(cityRows[0].revenue, -1200);
  assert.equal(cityRows[0].count, 0);
  assert.equal(cityRows[0].customers, 1);
  assert.equal(cityRows[0].margin, 0);
  db.run('UPDATE sales_returns SET date = ? WHERE original_invoice_id = ?', [today, invoice.id]);
});

test('product reports subtract the stored pre-tax return amounts by item', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const productIds = ['sales_report_tax_product_a', 'sales_report_tax_product_b'];
  for (const productId of productIds) {
    db.run(`INSERT INTO products (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,
      pieces_per_box,meters_per_box,cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,
      min_stock_level,is_active)
      VALUES (?, ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2', 4, 1.44, 100, 300, 250, 0, 0, 1)`,
      [productId, productId, productId, productId]);
    db.run(`INSERT INTO warehouse_stock (id,warehouse_id,product_id,quantity_m2,reserved_m2)
      VALUES (?, 'wh_main', ?, 20, 0)`, [`stock_${productId}`, productId]);
  }

  const customer = new CustomerService().createCustomer({
    name: 'Sales report tax allocation customer',
    phone: '0199000034',
    customerType: 'RETAIL',
    creditLimit: 0,
  });
  const invoice = new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [
      { productId: productIds[0], soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 0, unitPrice: 300 },
      { productId: productIds[1], soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 0, unitPrice: 300 },
    ],
    paidAmount: 0,
    paymentType: 'CREDIT',
    taxAmount: 150,
    shippingCost: 50,
  });
  new SalesService().returnSale(invoice.id, [
    { productId: productIds[0], quantityM2: 1, boxesCount: 1, unitPrice: 300, unitCost: 100, reason: 'tax allocation test' },
    { productId: productIds[1], quantityM2: 1, boxesCount: 1, unitPrice: 300, unitCost: 100, reason: 'tax allocation test' },
  ]);

  const today = localDateString();
  const productRows = loadReport('by_product', today, today) as Array<{ label: string; revenue: number }>;
  const customerRows = loadReport('by_customer', today, today) as Array<{ label: string; revenue: number }>;
  const customerRow = customerRows.find((row) => row.label === customer.name);
  assert.ok(customerRow);
  const returnedProductRows = productRows.filter((row) => productIds.includes(row.label));
  assert.equal(returnedProductRows.reduce((sum, row) => sum + row.revenue, 0), customerRow.revenue);
  assert.equal(customerRow.revenue, 2700);

  const reconciliation = new SalesFinancialReconciliationService();
  const checks = reconciliation.getReconciliation(today, today);
  assert.equal(checks.find((check) => check.key === 'sales')?.status, 'MATCH',
    JSON.stringify(checks.find((check) => check.key === 'sales')));
  assert.equal(checks.find((check) => check.key === 'cost')?.status, 'MATCH',
    JSON.stringify(checks.find((check) => check.key === 'cost')));

  const reasons = Object.fromEntries(checks
    .filter((check) => check.status === 'DIFFERENCE')
    .map((check) => [check.key, 'فرق سابق في بيانات الاختبار']));
  const closure = reconciliation.closeReconciliation(today, today, reasons);
  assert.equal(closure.dateFrom, today);
  assert.equal(closure.checks.length, 6);
  assert.equal(reconciliation.getLatestClosure(today, today)?.id, closure.id);
});

test('branch performance subtracts returns and restores returned inventory cost in profit', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const productId = 'branch_performance_return_product';
  db.run(`INSERT INTO products (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,
    pieces_per_box,meters_per_box,cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,
    min_stock_level,is_active)
    VALUES (?, ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2', 4, 1.44, 100, 300, 250, 0, 0, 1)`,
    [productId, productId, productId, 'Branch performance return product']);
  db.run(`INSERT INTO warehouse_stock (id,warehouse_id,product_id,quantity_m2,reserved_m2)
    VALUES (?, 'wh_main', ?, 20, 0)`, [`stock_${productId}`, productId]);
  const customer = new CustomerService().createCustomer({
    name: 'Branch performance return customer',
    phone: '0199000035',
    customerType: 'RETAIL',
    creditLimit: 0,
  });
  const invoice = new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{ productId, soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 0,
    paymentType: 'CREDIT',
  });
  const salesReturn = new SalesService().returnSale(invoice.id, [{
    productId, quantityM2: 4, boxesCount: 3, unitPrice: 300, unitCost: 100, reason: 'branch performance report test',
  }]);

  const reportDate = '2099-01-03';
  db.run('UPDATE sales_invoices SET date = ? WHERE id = ?', [reportDate, invoice.id]);
  db.run('UPDATE sales_returns SET date = ? WHERE original_invoice_id = ?', [reportDate, invoice.id]);
  ReportCenterService.clearCache();
  const report = new ReportCenterService().branchPerformance({ from: reportDate, to: reportDate });
  const branchName = db.query<{ name: string }>(
    'SELECT b.name FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.id = ?',
    ['wh_main'],
  )[0].name;
  const branchRow = report.rows.find((row) => row.branch === branchName);

  assert.ok(branchRow);
  assert.equal(branchRow.sales, invoice.subtotal - invoice.discountAmount);
  assert.equal(branchRow.returns, salesReturn.totalAmount);
  assert.equal(branchRow.netSales, invoice.subtotal - invoice.discountAmount - salesReturn.totalAmount);
  assert.equal(branchRow.profit, 1200);
  assert.equal(branchRow.margin, Number(((1200 / branchRow.netSales) * 100).toFixed(2)));
});

test('historical return reconciliation requires verified values and leaves historic cash unchanged', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const productId = 'historical_return_reconcile_product';
  db.run(`INSERT INTO products (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,
    pieces_per_box,meters_per_box,cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,
    min_stock_level,is_active)
    VALUES (?, ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2', 4, 1.44, 100, 100, 80, 0, 0, 1)`,
    [productId, productId, productId, 'Historical return reconcile product']);
  db.run(`INSERT INTO warehouse_stock (id,warehouse_id,product_id,quantity_m2,reserved_m2)
    VALUES (?, 'wh_main', ?, 10, 0)`, [`stock_${productId}`, productId]);
  const customer = new CustomerService().createCustomer({
    name: 'Historical return reconciliation customer',
    phone: '0199000045',
    customerType: 'RETAIL',
    creditLimit: 10000,
  });
  const invoice = new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{ productId, soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 0, unitPrice: 100 }],
    paidAmount: 0,
    paymentType: 'CREDIT',
    taxAmount: 15,
  });
  db.run(
    `UPDATE sales_invoices SET subtotal = 100, discount_amount = 0, tax_amount = 15,
     total_amount = 115, returned_amount = 100, remaining_amount = 100, payment_status = 'UNPAID'
     WHERE id = ?`,
    [invoice.id],
  );
  db.run(
    'UPDATE customers SET current_balance = 200, total_purchases = 500 WHERE id = ?',
    [customer.id],
  );
  const returnId = 'ret_historical_reconcile_test';
  db.run(
    `INSERT INTO sales_returns (
       id, return_number, original_invoice_id, original_invoice_number, customer_id, warehouse_id,
       date, total_amount, return_tax_amount, refunded_amount, remaining_to_balance, reason,
       refund_method, created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 100, NULL, 0, 100, 'legacy return', 'BALANCE', ?)`,
    [returnId, 'RET-HIST-RECONCILE', invoice.id, invoice.invoiceNumber, customer.id, 'wh_main',
      localDateString(), 'usr_admin'],
  );
  postLedgerEntry(db.getDatabase(), {
    date: localDateString(),
    description: 'Legacy return journal entry',
    referenceType: 'SALES_RETURN',
    referenceId: returnId,
    createdBy: 'usr_admin',
    lines: [
      { accountCode: '4101', debit: 85, credit: 0 },
      { accountCode: '2102', debit: 15, credit: 0 },
      { accountCode: '1103', debit: 0, credit: 100 },
    ],
  });
  const legacyV4ReturnId = 'ret_historical_reconcile_v4_test';
  db.run(
    `INSERT INTO sales_returns (
       id, return_number, original_invoice_id, original_invoice_number, customer_id, warehouse_id,
       date, total_amount, return_tax_amount, refunded_amount, remaining_to_balance, reason,
       refund_method, created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 50, NULL, 0, 50, 'legacy v4 return', 'BALANCE', ?)`,
    [legacyV4ReturnId, 'RET-HIST-RECONCILE-V4', invoice.id, invoice.invoiceNumber, customer.id, 'wh_main',
      localDateString(), 'usr_admin'],
  );
  postLedgerEntry(db.getDatabase(), {
    date: localDateString(),
    description: 'Legacy v4 return journal entry without a separate tax line',
    referenceType: 'SALES_RETURN',
    referenceId: legacyV4ReturnId,
    createdBy: 'usr_admin',
    lines: [
      { accountCode: '4101', debit: 50, credit: 0 },
      { accountCode: '1103', debit: 0, credit: 50 },
    ],
  });

  const service = new HistoricalReturnReconciliationService();
  const candidate = service.listPending().find((row) => row.id === returnId);
  const legacyV4Candidate = service.listPending().find((row) => row.id === legacyV4ReturnId);
  assert.ok(candidate);
  assert.ok(legacyV4Candidate);
  assert.equal(candidate.calculatedTax, 15);
  assert.equal(candidate.grossAmount, 115);
  assert.equal(legacyV4Candidate.calculatedTax, 7.5);
  const reviewId = service.recordReportReview();

  const cashBefore = db.query<{ balance: number }>(
    `SELECT COALESCE(SUM(jel.debit - jel.credit), 0) AS balance
     FROM journal_entry_lines jel JOIN chart_of_accounts coa ON coa.id = jel.account_id
     WHERE coa.code IN ('1101','1102','1105','1106')`,
  )[0].balance;
  assert.throws(
    () => service.approve({
      returnId, reviewId, confirmedCashAmount: 0, confirmedBalanceAmount: 100,
      taxAlreadyIncludedInCustomerPurchases: true, notes: 'verified source records',
    }),
    /مجموع النقد المؤكد والرصيد المؤكد/
  );
  assert.equal(db.query<{ returnTaxAmount: number | null }>(
    'SELECT return_tax_amount AS returnTaxAmount FROM sales_returns WHERE id = ?', [returnId]
  )[0].returnTaxAmount, null);

  service.approve({
    returnId,
    reviewId,
    confirmedCashAmount: 0,
    confirmedBalanceAmount: 115,
    taxAlreadyIncludedInCustomerPurchases: true,
    notes: 'verified customer ledger and invoice',
  });

  const correctedReturn = db.query<{ tax: number; cash: number; balance: number }>(
    `SELECT return_tax_amount AS tax, refunded_amount AS cash, remaining_to_balance AS balance
     FROM sales_returns WHERE id = ?`,
    [returnId],
  )[0];
  assert.deepEqual(correctedReturn, { tax: 15, cash: 0, balance: 115 });
  assert.equal(db.query<{ balance: number }>('SELECT current_balance AS balance FROM customers WHERE id = ?', [customer.id])[0].balance, 185);
  assert.equal(db.query<{ purchases: number }>('SELECT total_purchases AS purchases FROM customers WHERE id = ?', [customer.id])[0].purchases, 500);
  assert.equal(db.query<{ remaining: number }>('SELECT remaining_amount AS remaining FROM sales_invoices WHERE id = ?', [invoice.id])[0].remaining, 85);
  assert.equal(db.query<{ count: number }>(
    'SELECT COUNT(*) AS count FROM sales_return_reconciliations WHERE return_id = ?', [returnId]
  )[0].count, 1);
  const cashAfter = db.query<{ balance: number }>(
    `SELECT COALESCE(SUM(jel.debit - jel.credit), 0) AS balance
     FROM journal_entry_lines jel JOIN chart_of_accounts coa ON coa.id = jel.account_id
     WHERE coa.code IN ('1101','1102','1105','1106')`,
  )[0].balance;
  assert.equal(cashAfter, cashBefore);

  service.approve({
    returnId: legacyV4ReturnId,
    reviewId,
    confirmedCashAmount: 0,
    confirmedBalanceAmount: 57.5,
    taxAlreadyIncludedInCustomerPurchases: false,
    notes: 'verified v4 customer ledger',
  });
  assert.equal(db.query<{ purchases: number }>(
    'SELECT total_purchases AS purchases FROM customers WHERE id = ?', [customer.id]
  )[0].purchases, 492.5);
  assert.equal(db.query<{ remaining: number }>(
    'SELECT remaining_amount AS remaining FROM sales_invoices WHERE id = ?', [invoice.id]
  )[0].remaining, 77.5);
  assert.equal(db.query<{ usedAt: string | null }>(
    'SELECT used_at AS usedAt FROM sales_return_reconciliation_reviews WHERE id = ?', [reviewId]
  )[0].usedAt, null);
  assert.deepEqual(db.query<{ taxIncluded: number }>(
    'SELECT customer_purchase_tax_included AS taxIncluded FROM sales_return_reconciliations WHERE return_id = ?',
    [returnId],
  )[0], { taxIncluded: 1 });
  assert.deepEqual(db.query<{ taxIncluded: number }>(
    'SELECT customer_purchase_tax_included AS taxIncluded FROM sales_return_reconciliations WHERE return_id = ?',
    [legacyV4ReturnId],
  )[0], { taxIncluded: 0 });
});

test('report-center operation reports open without SQL branch scope errors', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const productId = 'report_center_ops_product';
  db.run(`INSERT INTO products (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,
    pieces_per_box,meters_per_box,cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,
    min_stock_level,is_active)
    VALUES (?, ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2', 4, 1.44, 100, 300, 250, 0, 0, 1)`,
    [productId, productId, productId, 'Operations report product']);
  db.run(`INSERT INTO warehouse_stock (id,warehouse_id,product_id,quantity_m2,reserved_m2)
    VALUES (?, 'wh_main', ?, 50, 0)`, [`stock_${productId}`, productId]);
  const customer = new CustomerService().createCustomer({
    name: 'Operations report customer',
    phone: '0199000099',
    customerType: 'RETAIL',
    creditLimit: 0,
  });
  new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{ productId, soldBy: 'M2', quantityM2: 5, boxesCount: 2, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 1500,
    paymentType: 'CASH',
    taxAmount: 0,
    shippingCost: 0,
  });

  for (const id of ['operations-log', 'user-activity', 'daily-movements', 'exceptions', 'approvals', 'received-reports', 'alerts']) {
    assert.doesNotThrow(() => runReport(id, { from: '2000-01-01', to: '2099-12-31' }));
  }
});

test('report-center cash and sales-rep reports use current tables and check permission before cache reads', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  const service = new ReportCenterService();
  ReportCenterService.clearCache();
  const params = { from: '2000-01-01', to: '2099-12-31' };

  const customer = new CustomerService().createCustomer({
    name: 'Historical aging report customer',
    phone: '0199000088',
    customerType: 'RETAIL',
    creditLimit: 0,
  });
  db.run(`INSERT INTO sales_invoices (
    id, invoice_number, date, due_date, customer_id, warehouse_id, branch_id, company_id,
    subtotal, discount_amount, tax_amount, total_amount, paid_amount, remaining_amount,
    payment_type, payment_status, invoice_status, total_cost, gross_profit, created_by
  ) VALUES (
    'aging_report_historical_invoice', 'AGING-REPORT-HISTORICAL', '2099-01-01', '2099-01-10',
    ?, 'wh_main', 'br_main', 'cmp_main', 1000, 0, 0, 1000, 1000, 0,
    'CREDIT', 'PAID', 'COMPLETED', 0, 1000, ?
  )`, [customer.id, admin.id]);
  db.run(`INSERT INTO customer_payments (
    id, receipt_number, customer_id, invoice_id, amount, payment_type, date, performed_by
  ) VALUES (
    'aging_report_future_payment', 'AGING-REPORT-FUTURE-PAYMENT', ?,
    'aging_report_historical_invoice', 1000, 'CASH', '2099-02-01', ?
  )`, [customer.id, admin.id]);
  db.run(`INSERT INTO customer_payment_allocations (id, payment_id, sales_invoice_id, amount)
    VALUES ('aging_report_future_allocation', 'aging_report_future_payment',
      'aging_report_historical_invoice', 1000)`);

  const aging = service.arAging({ from: '2099-01-30', to: '2099-01-30' });
  const historicalAgingRow = aging.rows.find((row) => row.customerId === customer.id);
  assert.ok(historicalAgingRow);
  assert.equal(historicalAgingRow.total, 1000, 'future payment must not reduce the historical receivable');
  assert.equal(historicalAgingRow.bucket0, 1000, 'aging should use the contractual due date');
  assert.equal(historicalAgingRow.dueDate, '2099-01-10');

  const sales = service.salesRepPerformance(params);
  assert.ok(Array.isArray(sales.rows));
  assert.ok(sales.columns.some((column) => column.key === 'totalSales'));

  const cash = service.cashFlowDetailed(params);
  assert.ok(Array.isArray(cash.rows));
  assert.ok(cash.columns.some((column) => column.key === 'inflow'));

  const role = PermissionService.createRole({ code: 'REPORT_CACHE_DENIED', name: 'Report cache denied test' }, admin);
  PermissionService.setRolePermissions(role.code, ['sales.view'], admin);
  const limited = {
    id: 'report_cache_denied_user',
    username: 'report-cache-denied',
    fullName: 'Report cache denied',
    role: role.code,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  try {
    AuthService.setCurrentUser(limited);
    assert.throws(() => service.salesRepPerformance(params), /غير مصرح/);
    assert.throws(() => service.cashFlowDetailed(params), /غير مصرح/);
  } finally {
    AuthService.setCurrentUser(admin);
    PermissionService.invalidate(limited);
    db.run('DELETE FROM roles WHERE id = ?', [role.id]);
  }
});
