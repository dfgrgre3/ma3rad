import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { CustomerService } from '../src/services/CustomerService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import { PricingService } from '../src/services/PricingService.ts';
import { FinancialStatementsService } from '../src/services/FinancialStatementsService.ts';
import { CommissionService } from '../src/services/CommissionService.ts';
import { ReservationService } from '../src/services/ReservationService.ts';
import { ApprovalService } from '../src/services/ApprovalService.ts';
import { DailyOperationsService } from '../src/services/DailyOperationsService.ts';
import { AccountingService } from '../src/services/AccountingService.ts';
import { SupplierService } from '../src/services/SupplierService.ts';

function q(sql: string, params: any[] = []): any[] {
  return DatabaseManager.getInstance().query(sql, params);
}

test('dashboard metrics handle an empty database without a top customer', async () => {
  await DatabaseManager.getInstance().initialize();
  const metrics = new AccountingService().getDashboardMetrics();
  assert.equal(metrics.topCustomer, null);
  assert.equal(metrics.todaySales, 0);
  assert.equal(metrics.totalReceivables, 0);
});

test('pricing and financial statements: overrides, aging and balance sheet', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const pid = 'prod_stmt_1';
  db.run(
    `INSERT INTO products (id, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
       wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [pid, 'SKU-ST1', 'BAR-ST1', 'بلاط اختبار', 'cat_floor', 'br_cleo', 'GRADE_1', '60x60',
     'M2', 'M2', 4, 1.44, 100, 300, 250, 0, 10]
  );
  db.run(
    `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?,?,?,?,0)`,
    ['stk_stmt_1', 'wh_main', pid, 100]
  );

  const customer = new CustomerService().createCustomer({
    name: 'عميل قوائم مالية', phone: '0111111111', customerType: 'RETAIL', creditLimit: 0,
  });

  const pricing = new PricingService();
  const base = pricing.getEffectivePrice(pid, customer.id, 10);
  assert.equal(base.priceM2, 300);
  assert.equal(base.source, 'BASE');

  db.run(
    `INSERT INTO price_lists (id, code, name, customer_type, is_default, is_active)
     VALUES ('pl_stmt', 'PL-ST', 'قائمة عملاء التجزئة', 'RETAIL', 1, 1)`
  );
  db.run(
    `INSERT INTO price_list_items (id, price_list_id, product_id, price_m2, price_box, min_quantity_m2)
     VALUES ('pli_stmt', 'pl_stmt', ?, 280, 403.2, 0)`,
    [pid]
  );
  const listed = pricing.getEffectivePrice(pid, customer.id, 10);
  assert.equal(listed.priceM2, 280);
  assert.equal(listed.source, 'PRICE_LIST');

  pricing.setCustomerOverride({ customerId: customer.id, productId: pid, priceM2: 260 });
  const overridden = pricing.getEffectivePrice(pid, customer.id, 10);
  assert.equal(overridden.priceM2, 260);
  assert.equal(overridden.source, 'OVERRIDE');

  const sale = new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{ productId: pid, soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 28, unitPrice: 260 }],
    paidAmount: 0,
    paymentType: 'CREDIT',
  });
  assert.equal(sale.totalAmount, 2600);

  const statements = new FinancialStatementsService();
  const aging = statements.getCustomerAging();
  const row = aging.rows.find((r) => r.id === customer.id);
  assert.ok(row, 'customer should appear in AR aging');
  assert.equal(row!.total, 2600);

  const sheet = statements.getBalanceSheet();
  const receivables = sheet.assets.find((l) => l.label.includes('العملاء'));
  assert.ok((receivables?.amount || 0) >= 2600, 'receivables should include the open invoice');
  assert.ok(sheet.totals.assets > 0, 'assets should be positive');
  assert.ok(Math.abs(sheet.totals.difference) < 0.01, 'balance sheet should balance');
});

test('commissions and stock reservations lifecycle', async () => {
  const db = DatabaseManager.getInstance();
  const customer = q(`SELECT id FROM customers WHERE phone = '0111111111'`)[0];

  db.run(
    `INSERT INTO employees (id, code, full_name, phone, job_title, hired_at, commission_percentage, is_sales_rep, is_active)
     VALUES ('emp_test_1', 'EMP-T1', '????? ??????', '0100000009', 'Sales Rep', '2025-01-01', 5, 1, 1)`
  );
  db.run(`UPDATE sales_invoices SET sales_rep_id = 'emp_test_1' WHERE customer_id = ?`, [customer.id]);

  const month = new Date().toISOString().slice(0, 7);
  const commissions = new CommissionService();
  const generated = commissions.generateForMonth(month);
  assert.ok(generated.created >= 1, 'at least one commission should be generated');
  const rows = commissions.getCommissions({ month });
  assert.ok(rows.some((row) => row.employeeName === '????? ??????' && row.percentage === 5));
  const commission = rows[0];
  commissions.setStatus(commission.id, 'APPROVED');
  commissions.setStatus(commission.id, 'PAID');
  assert.equal(commissions.getCommissions({ month, status: 'PAID' }).length, 1);

  const reservations = new ReservationService();
  const before = reservations.getAvailability('prod_stmt_1', 'wh_main');
  const reservation = reservations.createReservation({
    productId: 'prod_stmt_1', warehouseId: 'wh_main', quantityM2: 5, notes: '??????',
  });
  const during = reservations.getAvailability('prod_stmt_1', 'wh_main');
  assert.equal(during.reserved, before.reserved + 5);
  assert.equal(during.available, before.available - 5);

  reservations.releaseReservation(reservation.id);
  const after = reservations.getAvailability('prod_stmt_1', 'wh_main');
  assert.equal(after.reserved, before.reserved);

  const second = reservations.createReservation({ productId: 'prod_stmt_1', warehouseId: 'wh_main', quantityM2: 5 });
  reservations.consumeReservation(second.id);
  const consumed = reservations.getAvailability('prod_stmt_1', 'wh_main');
  assert.equal(consumed.onHand, before.onHand - 5);
  assert.equal(consumed.reserved, before.reserved);
});

test('approved credit-limit request updates the customer automatically', async () => {
  const db = DatabaseManager.getInstance();
  const customer = q(`SELECT id, credit_limit AS creditLimit FROM customers WHERE phone = '0111111111'`)[0];
  const service = new ApprovalService();
  const request = service.createRequest({
    requestType: 'CREDIT_LIMIT',
    title: '??? ?? ????????',
    referenceType: 'CUSTOMER',
    referenceId: customer.id,
    requestedValue: 5000,
    currentValue: customer.creditLimit,
  });
  service.decide(request.id, true, '?????? ??????');
  const updated = q(`SELECT credit_limit AS creditLimit FROM customers WHERE id = ?`, [customer.id])[0];
  assert.equal(updated.creditLimit, 5000);
  const decisions = q(`SELECT status FROM approval_requests WHERE id = ?`, [request.id]);
  assert.equal(decisions[0].status, 'APPROVED');
});

test('supplier lifecycle supports edit, archive, reactivation, payments and statement ranges', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const service = new SupplierService();
  const supplier = service.createSupplier({
    code: 'SUP-LIFECYCLE',
    name: 'مورد دورة الحياة',
    phone: '01000000077',
    initialBalance: 100,
    paymentTermsDays: 20,
  });

  assert.equal(supplier.currentBalance, 100);
  assert.ok(service.getAllSuppliers().some((row) => row.id === supplier.id));

  const edited = service.updateSupplier(supplier.id, { email: 'supplier@example.test', paymentTermsDays: 45 });
  assert.equal(edited.email, 'supplier@example.test');
  assert.equal(edited.paymentTermsDays, 45);

  service.updateSupplier(supplier.id, { isActive: 0 });
  assert.ok(!service.getAllSuppliers().some((row) => row.id === supplier.id));
  assert.ok(service.getAllSuppliers(undefined, true).some((row) => row.id === supplier.id));

  service.updateSupplier(supplier.id, { isActive: 1 });
  service.recordPayment(supplier.id, 30, 'BANK_TRANSFER', undefined, 'دفعة اختبار');
  const statement = service.getSupplierStatement(supplier.id);
  assert.equal(statement.openingBalance, 100);
  assert.equal(statement.closingBalance, 70);
  assert.equal(statement.transactions.length, 1);
  const futureStatement = service.getSupplierStatement(supplier.id, '9999-01-01', '9999-12-31');
  assert.equal(futureStatement.openingBalance, 70);
  assert.equal(futureStatement.transactions.length, 0);

  assert.throws(() => service.recordPayment(supplier.id, Number.NaN), /مبلغ السداد/);
  assert.equal(db.query<any>('SELECT is_active FROM suppliers WHERE id = ?', [supplier.id])[0].isActive, 1);
});


test("daily operations expose today's sales, purchases, expenses and debts", async () => {
  const db = DatabaseManager.getInstance();
  const service = new DailyOperationsService();
  const today = service.today();
  const register = q(`SELECT id FROM cash_registers LIMIT 1`)[0];

  db.run(
    `INSERT INTO expenses (id, category, amount, register_id, payment_type, date, description, performed_by)
     VALUES ('exp_daily_test', '??????', 125, ?, 'CASH', ?, '????? ?????? ??????', 'usr_admin')`,
    [register.id, today]
  );

  const sales = service.getSales(today);
  assert.equal(sales.summary.count, 1);
  assert.equal(sales.summary.total, 2600);
  assert.equal(sales.rows[0].customerPhone, '0111111111');

  const purchases = service.getPurchases(today);
  assert.equal(purchases.summary.count, 0);
  assert.deepEqual(purchases.rows, []);

  const expenses = service.getExpenses(today);
  assert.equal(expenses.summary.count, 1);
  assert.equal(expenses.summary.total, 125);
  assert.equal(expenses.summary.topCategory, '??????');

  const debts = service.getDebts(today);
  assert.equal(debts.summary.newDebt, 2600);
  assert.equal(debts.rows.length, 1);
  assert.equal(debts.summary.netChange, 2600);
});
