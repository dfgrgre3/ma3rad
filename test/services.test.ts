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
import { localDateString } from '../src/utils/date.ts';
import { postLedgerEntry } from '../src/database/ledger.ts';
import { EmployeeService } from '../src/services/EmployeeService.ts';
import { InventoryCostingService } from '../src/services/InventoryCostingService.ts';
import { FinanceExtrasService } from '../src/services/FinanceExtrasService.ts';

function q(sql: string, params: any[] = []): any[] {
  return DatabaseManager.getInstance().query(sql, params);
}

test('business date uses the local calendar day', () => {
  assert.equal(localDateString(new Date(2026, 9, 24, 0, 0, 0)), '2026-10-24');
});

test('FIFO cost layers consume oldest lots first and can restore a returned issue', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const productId = 'prod_fifo_test';
  db.run(`INSERT INTO products (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,
    pieces_per_box,meters_per_box,cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,min_stock_level,is_active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [productId,'FIFO-T','FIFO-T','FIFO test','cat_floor','br_cleo','GRADE_1','60x60','M2','M2',4,1.44,10,20,18,0,0]);
  db.run(`INSERT INTO warehouse_stock (id,warehouse_id,product_id,quantity_m2,reserved_m2) VALUES (?,?,?,?,0)`,
    ['stk_fifo_test','wh_main',productId,15]);
  const firstLayer = InventoryCostingService.addLayer(db, { productId,warehouseId:'wh_main',sourceType:'TEST',sourceId:'first',date:'2026-01-01',quantity:10,unitCost:5 });
  InventoryCostingService.addLayer(db, { productId,warehouseId:'wh_main',sourceType:'TEST',sourceId:'second',date:'2026-02-01',quantity:5,unitCost:9 });
  const plan = InventoryCostingService.planFifo(db,productId,'wh_main',12);
  assert.equal(plan.totalCost,68);
  const issueId='tx_fifo_test';
  db.run(`INSERT INTO inventory_transactions (id,transaction_number,type,product_id,warehouse_id,quantity_m2,unit_cost,total_cost,reference_type,performed_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,[issueId,'FIFO-ISSUE','SALE',productId,'wh_main',-12,plan.unitCost,plan.totalCost,'INVOICE','usr_admin']);
  InventoryCostingService.consumeFifo(db,issueId,plan);
  assert.equal(db.query<any>('SELECT quantity_remaining AS q FROM inventory_cost_layers WHERE id=?',[firstLayer])[0].q,0);
  assert.equal(InventoryCostingService.previewRestoreCost(db,issueId,2),10);
  InventoryCostingService.restoreIssue(db,issueId,2);
  assert.equal(db.query<any>('SELECT quantity_remaining AS q FROM inventory_cost_layers WHERE id=?',[firstLayer])[0].q,2);
});

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

test('financial statements use posted ledger balances as of the requested date', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  const db = manager.getDatabase();
  const statements = new FinancialStatementsService();
  const priorDate = q('SELECT MAX(date) AS date FROM journal_entries')[0]?.date || localDateString();
  const entryDate = new Date(`${priorDate}T00:00:00`);
  entryDate.setDate(entryDate.getDate() + 1);
  const postingDate = localDateString(entryDate);
  entryDate.setDate(entryDate.getDate() - 1);
  const asOfBefore = localDateString(entryDate);
  const actorId = q('SELECT id FROM users ORDER BY created_at, id LIMIT 1')[0]?.id;
  assert.ok(actorId, 'a user is required to create a journal entry');

  db.run('BEGIN TRANSACTION');
  try {
    const before = statements.getBalanceSheet(asOfBefore);
    postLedgerEntry(db, {
      date: postingDate,
      description: 'Financial statement as-of test',
      referenceType: 'TEST_FINANCIAL_STATEMENT',
      referenceId: 'as_of_ledger_posting',
      createdBy: actorId,
      lines: [
        { accountCode: '1101', debit: 321.45, credit: 0 },
        { accountCode: '4101', debit: 0, credit: 321.45 },
      ],
    });
    const after = statements.getBalanceSheet(postingDate);
    const flow = statements.getCashFlow(postingDate, postingDate);

    assert.equal(after.assets[0].amount, before.assets[0].amount + 321.45);
    assert.equal(flow.totals.inflows, 321.45);
    assert.ok(Math.abs(after.totals.difference) < 0.01, 'posted entries should remain balanced');
  } finally {
    db.run('ROLLBACK');
  }
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
  const commission = rows.find((row) => row.employeeId === 'emp_test_1' && row.commissionAmount > 0);
  assert.ok(commission, 'the test sales representative should have a positive commission');
  commissions.setStatus(commission!.id, 'APPROVED');
  commissions.setStatus(commission!.id, 'PAID');
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
  const registerBefore = q('SELECT current_balance FROM cash_registers WHERE id = ?', ['cr_main'])[0].currentBalance;
  const payment = service.recordPayment(supplier.id, 30, 'CASH', undefined, 'دفعة اختبار');
  const registerAfter = q('SELECT current_balance FROM cash_registers WHERE id = ?', ['cr_main'])[0].currentBalance;
  assert.equal(registerAfter, registerBefore - 30);
  assert.equal(q(
    `SELECT id FROM audit_logs WHERE record_id = ? AND action = 'سداد دفعة لمورد' AND module = 'SUPPLIERS'`,
    [payment.id]
  ).length, 1);
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

test('monthly payroll accrual is idempotent and settles advances before salary payout', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const employee = EmployeeService.create({
    name: 'موظف اختبار الرواتب',
    location: 'اختبار',
    role: 'محاسب',
    phone: '0109090909',
    email: '',
    baseSalary: 6000,
    salaryType: 'MONTHLY',
    status: 'ACTIVE',
    joinedDate: localDateString(),
  });
  const period = localDateString().slice(0, 7);
  const date = localDateString();

  assert.deepEqual(EmployeeService.accrueMonthlyPayroll(period), { created: 1, skipped: 0 });
  assert.deepEqual(EmployeeService.accrueMonthlyPayroll(period), { created: 0, skipped: 1 });
  assert.equal(EmployeeService.getPayrollPayables().find((row) => row.employeeId === employee.id)?.balance, 6000);
  EmployeeService.addTransaction({
    employeeId: employee.id, type: 'ADVANCE', amount: 1000, date, notes: 'سلفة اختبار',
  });
  EmployeeService.addTransaction({
    employeeId: employee.id, type: 'SALARY_PAYOUT', amount: 5000, date, notes: 'صرف راتب اختبار',
  });

  const balance = manager.query<{ amount: number }>(`
    SELECT SUM(l.credit-l.debit) AS amount
    FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id=l.account_id
    JOIN journal_entries e ON e.id=l.entry_id AND e.is_posted=1
    WHERE a.code='2104' AND (
      (e.reference_type IN ('PAYROLL_SALARY_ACCRUAL','PAYROLL_ADVANCE_APPLICATION') AND e.reference_id=?)
      OR e.reference_id IN (SELECT id FROM payroll_transactions WHERE employee_id=?)
    )
  `, [`${employee.id}:${period}`, employee.id])[0]?.amount;
  assert.equal(Number(balance), 0);
  assert.equal(EmployeeService.getPayrollPayables().find((row) => row.employeeId === employee.id)?.balance ?? 0, 0);
});

test('fixed asset acquisition uses the approved clearing liability by default', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const registerBefore = q('SELECT current_balance FROM cash_registers WHERE id=?', ['cr_main'])[0].currentBalance;
  const service = new FinanceExtrasService();
  service.saveFixedAsset({
    name: 'أصل اختبار المقاصة',
    purchaseDate: localDateString(),
    purchaseCost: 4500,
  });
  const asset = q('SELECT id FROM fixed_assets WHERE name=?', ['أصل اختبار المقاصة'])[0];
  const entry = q(
    `SELECT id FROM journal_entries WHERE reference_type='ASSET_ACQUISITION' AND reference_id=?`,
    [asset.id]
  )[0];
  assert.ok(entry);
  const lines = q(
    `SELECT a.code,l.debit,l.credit FROM journal_entry_lines l
     JOIN chart_of_accounts a ON a.id=l.account_id WHERE l.entry_id=?`,
    [entry.id]
  );
  assert.deepEqual(lines.map((line) => line.code).sort(), ['1601', '2201']);
  assert.equal(lines.find((line) => line.code === '2201')?.credit, 4500);
  assert.equal(q('SELECT current_balance FROM cash_registers WHERE id=?', ['cr_main'])[0].currentBalance, registerBefore);
});
