import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { CustomerService } from '../src/services/domains/customers/CustomerService.ts';
import { SalesService } from '../src/services/domains/sales/SalesService.ts';
import { PricingService } from '../src/services/domains/sales/PricingService.ts';
import { FinancialStatementsService } from '../src/services/domains/reports/FinancialStatementsService.ts';
import { CommissionService } from '../src/services/domains/hr/CommissionService.ts';
import { LeaveService } from '../src/services/domains/hr/LeaveService.ts';
import { ReservationService } from '../src/services/domains/sales/ReservationService.ts';
import { ApprovalService } from '../src/services/domains/approvals/ApprovalService.ts';
import { DailyOperationsService } from '../src/services/domains/operations/DailyOperationsService.ts';
import { AccountingService } from '../src/services/domains/finance/AccountingService.ts';
import { SupplierService } from '../src/services/domains/suppliers/SupplierService.ts';
import { localDateString } from '../src/utils/shared/date.ts';
import { postLedgerEntry } from '../src/database/repositories/ledger.ts';
import { EmployeeService } from '../src/services/domains/hr/EmployeeService.ts';
import { AttendanceService } from '../src/services/domains/hr/AttendanceService.ts';
import { InventoryCostingService } from '../src/services/domains/inventory/InventoryCostingService.ts';
import { FinanceExtrasService } from '../src/services/domains/finance/FinanceExtrasService.ts';
import { CustomerSupplyService } from '../src/services/domains/customers/CustomerSupplyService.ts';
import { SettingsService } from '../src/services/domains/config/SettingsService.ts';
import { CashierService } from '../src/services/domains/finance/CashierService.ts';
import { BackupService } from '../src/services/infrastructure/backup/BackupService.ts';
import { MIGRATION_PART_28 } from '../src/database/migrations/part28.ts';

function q(sql: string, params: any[] = []): any[] {
  return DatabaseManager.getInstance().query(sql, params);
}

test('business date uses the local calendar day', () => {
  assert.equal(localDateString(new Date(2026, 9, 24, 0, 0, 0)), '2026-10-24');
});

test('attendance migration consolidates legacy punches and status records without losing either', async () => {
  const SQL = await (globalThis as any).initSqlJs();
  const database = new SQL.Database();
  database.exec(`
    CREATE TABLE employees (id TEXT PRIMARY KEY);
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE branches (id TEXT PRIMARY KEY);
    CREATE TABLE attendance (
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL,
      notes TEXT, recorded_by TEXT, created_at TEXT, late_minutes INTEGER DEFAULT 0,
      overtime_minutes INTEGER DEFAULT 0, UNIQUE(employee_id, date)
    );
    CREATE TABLE employee_attendance (
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, date TEXT NOT NULL, check_in TEXT,
      check_out TEXT, worked_minutes INTEGER DEFAULT 0, late_minutes INTEGER DEFAULT 0,
      overtime_minutes INTEGER DEFAULT 0, status TEXT, notes TEXT, recorded_by TEXT,
      created_at TEXT, UNIQUE(employee_id, date)
    );
    CREATE INDEX idx_attendance_date ON attendance(date);
    CREATE INDEX idx_attendance_employee ON attendance(employee_id);
    CREATE INDEX idx_attendance_emp_date ON employee_attendance(employee_id, date);
    INSERT INTO employees VALUES ('legacy_employee');
    INSERT INTO users VALUES ('legacy_user');
    INSERT INTO branches VALUES ('legacy_branch');
    INSERT INTO attendance
      (id, employee_id, date, status, recorded_by, created_at)
      VALUES ('simple', 'legacy_employee', '2026-01-05', 'PRESENT', 'legacy_user', '2026-01-05');
    INSERT INTO employee_attendance
      (id, employee_id, date, check_in, check_out, worked_minutes, late_minutes,
       overtime_minutes, status, recorded_by, created_at)
      VALUES ('rich_duplicate', 'legacy_employee', '2026-01-05', '09:00:00', '18:00:00',
        480, 12, 30, 'LATE', 'legacy_user', '2026-01-05'),
        ('weekend', 'legacy_employee', '2026-01-04', '09:00', NULL, 0, 0, 0,
        'WEEKEND', 'legacy_user', '2026-01-04');
  `);

  MIGRATION_PART_28[0].up(database);
  const rows = database.exec(
    `SELECT date, status, check_in_at, check_out_at, worked_minutes, late_minutes,
            overtime_minutes, overtime_approved FROM attendance ORDER BY date`
  )[0].values;
  assert.equal(rows.length, 2);
  assert.equal(rows[1][2], '2026-01-05T09:00:00');
  assert.equal(rows[1][3], '2026-01-05T18:00:00');
  assert.equal(rows[1][4], 480);
  assert.equal(rows[1][5], 12);
  assert.equal(rows[1][6], 30);
  assert.equal(rows[1][7], 1, 'legacy extra minutes remain payroll-approved for compatibility');
  assert.equal(rows[0][1], 'WEEKEND');
  assert.equal(database.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='employee_attendance'`).length, 0);
  database.close();
});

test('dashboard sales and gross profit reconcile invoice returns and same-period growth', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const today = localDateString();
  const [year, month, day] = today.split('-').map(Number);
  const previousMonth = new Date(year, month - 2, 1);
  const previousMonthLastDay = new Date(year, month - 1, 0).getDate();
  const previousMonthDate = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, previousMonthLastDay)).padStart(2, '0')}`;
  const customerId = q('SELECT id FROM customers LIMIT 1')[0].id;
  const id = 'dashboard_return_reconcile';
  const before = new AccountingService().getDashboardMetrics();
  db.run(`INSERT INTO products
    (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,pieces_per_box,meters_per_box,
     cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,min_stock_level,is_active)
    VALUES (?, ?, ?, 'Dashboard return test', 'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2',
      4, 1.44, 80, 100, 90, 0, 0, 1)`,
    [`${id}_product`, `${id}_product`, `${id}_product`]);

  db.run(`INSERT INTO sales_invoices
    (id,invoice_number,date,customer_id,warehouse_id,branch_id,company_id,subtotal,discount_amount,tax_amount,total_amount,
     paid_amount,remaining_amount,payment_type,payment_status,invoice_status,total_cost,gross_profit,created_by)
    VALUES (?, ?, ?, ?, 'wh_main', 'br_main', 'cmp_main', 200, 0, 0, 200, 0, 200, 'CREDIT', 'UNPAID', 'COMPLETED', 80, 120, 'usr_admin')`,
    [`${id}_current`, `${id}_current`, today, customerId]);
  db.run(`INSERT INTO sales_returns
    (id,return_number,original_invoice_id,original_invoice_number,customer_id,warehouse_id,date,total_amount,
     refunded_amount,remaining_to_balance,reason,created_by)
    VALUES (?, ?, ?, ?, ?, 'wh_main', ?, 100, 0, 100, 'test', 'usr_admin')`,
    [`${id}_return`, `${id}_return`, `${id}_current`, `${id}_current`, customerId, today]);
  db.run(`INSERT INTO sales_return_items
    (id,return_id,product_id,product_name,grade,quantity_m2,boxes_count,unit_price,unit_cost,total_refund)
    VALUES (?, ?, ?, 'test', 'GRADE_1', 1, 1, 100, 80, 100)`,
    [`${id}_item`, `${id}_return`, `${id}_product`]);
  db.run(`INSERT INTO sales_invoices
    (id,invoice_number,date,customer_id,warehouse_id,branch_id,company_id,subtotal,discount_amount,tax_amount,total_amount,
     paid_amount,remaining_amount,payment_type,payment_status,invoice_status,total_cost,gross_profit,created_by)
    VALUES (?, ?, ?, ?, 'wh_main', 'br_main', 'cmp_main', 100, 0, 0, 100, 0, 100, 'CREDIT', 'UNPAID', 'COMPLETED', 40, 60, 'usr_admin')`,
    [`${id}_previous`, `${id}_previous`, previousMonthDate, customerId]);
  const after = new AccountingService().getDashboardMetrics();

  assert.equal(after.monthSales - before.monthSales, 100);
  assert.equal(after.todaySales - before.todaySales, 100);
  assert.equal(after.grossProfit - before.grossProfit, 100);
  assert.equal(after.previousMonthSales - before.previousMonthSales, 100);
  assert.equal(after.salesCount - before.salesCount, 1);

  db.run('DELETE FROM sales_returns WHERE id = ?', [`${id}_return`]);
  db.run('DELETE FROM sales_invoices WHERE id IN (?, ?)', [`${id}_current`, `${id}_previous`]);
});

test('dashboard trend and monthly comparison batch invoice and return totals correctly', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const today = localDateString();
  const [year, month, day] = today.split('-').map(Number);
  const previousMonth = new Date(year, month - 2, 1);
  const previousMonthLastDay = new Date(year, month - 1, 0).getDate();
  const previousMonthDate = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, previousMonthLastDay)).padStart(2, '0')}`;
  const customerId = q('SELECT id FROM customers LIMIT 1')[0].id;
  const id = 'dashboard_summary_batch';
  const accounting = new AccountingService();
  const trendBefore = accounting.getSalesTrendLast7Days();
  const monthBefore = accounting.getMonthlyComparison();

  try {
    db.run(`INSERT INTO products
      (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,pieces_per_box,meters_per_box,
       cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,min_stock_level,is_active)
      VALUES (?, ?, ?, 'Dashboard summary batch test', 'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2',
        4, 1.44, 80, 100, 90, 0, 0, 1)`,
      [`${id}_product`, `${id}_product`, `${id}_product`]);
    db.run(`INSERT INTO sales_invoices
      (id,invoice_number,date,customer_id,warehouse_id,branch_id,company_id,subtotal,discount_amount,tax_amount,total_amount,
       paid_amount,remaining_amount,payment_type,payment_status,invoice_status,total_cost,gross_profit,created_by)
      VALUES (?, ?, ?, ?, 'wh_main', 'br_main', 'cmp_main', 200, 0, 0, 200, 0, 200, 'CREDIT', 'UNPAID', 'COMPLETED', 80, 120, 'usr_admin')`,
      [`${id}_current`, `${id}_current`, today, customerId]);
    db.run(`INSERT INTO sales_returns
      (id,return_number,original_invoice_id,original_invoice_number,customer_id,warehouse_id,date,total_amount,
       refunded_amount,remaining_to_balance,reason,created_by)
      VALUES (?, ?, ?, ?, ?, 'wh_main', ?, 100, 0, 100, 'test', 'usr_admin')`,
      [`${id}_return`, `${id}_return`, `${id}_current`, `${id}_current`, customerId, today]);
    db.run(`INSERT INTO sales_return_items
      (id,return_id,product_id,product_name,grade,quantity_m2,boxes_count,unit_price,unit_cost,total_refund)
      VALUES (?, ?, ?, 'test', 'GRADE_1', 1, 1, 100, 80, 100)`,
      [`${id}_item`, `${id}_return`, `${id}_product`]);
    db.run(`INSERT INTO sales_invoices
      (id,invoice_number,date,customer_id,warehouse_id,branch_id,company_id,subtotal,discount_amount,tax_amount,total_amount,
       paid_amount,remaining_amount,payment_type,payment_status,invoice_status,total_cost,gross_profit,created_by)
      VALUES (?, ?, ?, ?, 'wh_main', 'br_main', 'cmp_main', 90, 0, 0, 90, 0, 90, 'CREDIT', 'UNPAID', 'COMPLETED', 40, 50, 'usr_admin')`,
      [`${id}_previous`, `${id}_previous`, previousMonthDate, customerId]);

    const trendAfter = accounting.getSalesTrendLast7Days();
    const monthAfter = accounting.getMonthlyComparison();
    const todayBefore = trendBefore.find((row) => row.date === today)!;
    const todayAfter = trendAfter.find((row) => row.date === today)!;

    assert.equal(todayAfter.sales - todayBefore.sales, 100);
    assert.equal(todayAfter.profit - todayBefore.profit, 100);
    assert.equal(monthAfter.currentMonth.sales - monthBefore.currentMonth.sales, 100);
    assert.equal(monthAfter.currentMonth.profit - monthBefore.currentMonth.profit, 100);
    assert.equal(monthAfter.currentMonth.invoices - monthBefore.currentMonth.invoices, 1);
    assert.equal(monthAfter.previousMonth.sales - monthBefore.previousMonth.sales, 90);
    assert.equal(monthAfter.previousMonth.profit - monthBefore.previousMonth.profit, 50);
    assert.equal(monthAfter.previousMonth.invoices - monthBefore.previousMonth.invoices, 1);
  } finally {
    db.run('DELETE FROM sales_return_items WHERE id = ?', [`${id}_item`]);
    db.run('DELETE FROM sales_returns WHERE id = ?', [`${id}_return`]);
    db.run('DELETE FROM sales_invoices WHERE id IN (?, ?)', [`${id}_current`, `${id}_previous`]);
    db.run('DELETE FROM products WHERE id = ?', [`${id}_product`]);
  }
});

test('dashboard FIFO inventory valuation uses remaining layer cost', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const originalMethod = q(`SELECT value FROM system_settings WHERE key = 'costingMethod'`)[0]?.value || 'AVERAGE_COST';
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', 'FIFO')`);
  const before = new AccountingService().getDashboardMetrics();
  const productId = 'dashboard_fifo_valuation_test';
  db.run(`INSERT INTO products
    (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,pieces_per_box,meters_per_box,
     cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,min_stock_level,is_active)
    VALUES (?, ?, ?, 'Dashboard FIFO valuation test', 'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2',
      4, 1.44, 99, 100, 90, 0, 0, 1)`,
    [productId, productId, productId]);
  db.run(`INSERT INTO warehouse_stock (id,warehouse_id,product_id,quantity_m2,reserved_m2)
    VALUES (?, 'wh_main', ?, 10, 0)`, [`stock_${productId}`, productId]);
  InventoryCostingService.addLayer(db, {
    productId, warehouseId: 'wh_main', sourceType: 'TEST', sourceId: 'dashboard_fifo_1',
    date: '2026-01-01', quantity: 5, unitCost: 10,
  });
  InventoryCostingService.addLayer(db, {
    productId, warehouseId: 'wh_main', sourceType: 'TEST', sourceId: 'dashboard_fifo_2',
    date: '2026-02-01', quantity: 5, unitCost: 20,
  });

  const after = new AccountingService().getDashboardMetrics();
  assert.equal(after.inventoryValuationCost - before.inventoryValuationCost, 150);

  db.run('DELETE FROM inventory_cost_layers WHERE product_id = ?', [productId]);
  db.run('DELETE FROM warehouse_stock WHERE product_id = ?', [productId]);
  db.run('DELETE FROM products WHERE id = ?', [productId]);
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', ?)`, [originalMethod]);
});

test('automatic backup retention deletes old files and preserves manual and newest backups', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const previousCeramisys = window.ceramisys;
  window.ceramisys = { ...previousCeramisys, db: { ...previousCeramisys?.db } };
  const api = window.ceramisys.db!;
  const originalInfo = api.info;
  const originalRemoveBackup = api.removeBackup;
  const removed: string[] = [];
  api.info = async () => ({ path: '', exists: true, bytes: 0, backupDir: 'test-backups' });
  api.removeBackup = async (fileName) => {
    removed.push(fileName);
    return { ok: true, deleted: true };
  };
  const now = localDateString();
  db.run(`INSERT INTO backup_history
    (id,file_name,file_path,file_size_bytes,backup_type,status,created_at)
    VALUES
      ('retention_old','ceramisys_auto_old.sqlite','test',1,'AUTO','SUCCESS','2000-01-01'),
      ('retention_extra','ceramisys_auto_extra.sqlite','test',1,'AUTO','SUCCESS',?),
      ('retention_keep','ceramisys_auto_keep.sqlite','test',1,'AUTO','SUCCESS',?),
      ('retention_manual','manual.sqlite','test',1,'MANUAL_DOWNLOAD','SUCCESS','2000-01-01')`,
    [now, now]);
  try {
    const result = await new BackupService().cleanupOldBackups(30, 1);
    assert.equal(result.deleted, 2);
    assert.deepEqual(
      removed.sort((a, b) => a.localeCompare(b)),
      ['ceramisys_auto_extra.sqlite', 'ceramisys_auto_old.sqlite']
    );
    assert.deepEqual(
      q(`SELECT id FROM backup_history WHERE id LIKE 'retention_%' ORDER BY id`).map((row) => row.id),
      ['retention_keep', 'retention_manual'],
    );
  } finally {
    if (originalInfo) api.info = originalInfo;
    else delete api.info;
    if (originalRemoveBackup) api.removeBackup = originalRemoveBackup;
    else delete api.removeBackup;
    window.ceramisys = previousCeramisys;
    db.run(`DELETE FROM backup_history WHERE id LIKE 'retention_%'`);
  }
});

test('scheduled shift closure records the expected till balance for the next opening', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const service = new CashierService();
  const previousSchedule = service.getShiftAutoCloseSchedule();
  let shiftId: string | null = null;

  try {
    service.saveShiftAutoCloseSchedule(true, '23:59');
    const opened = service.openShift('cr_main', 'usr_admin', 125);
    shiftId = opened.id;
    manager.run(
      'UPDATE cash_shifts SET total_sales_cash = 40, total_expenses = 15 WHERE id = ?',
      [opened.id]
    );

    const closed = service.closeScheduledShifts(new Date(2100, 0, 1, 23, 59));
    assert.equal(closed.length, 1);
    assert.equal(closed[0].id, opened.id);
    assert.equal(closed[0].status, 'CLOSED');
    assert.equal(Number(closed[0].autoClosed), 1);
    assert.equal(closed[0].expectedEndingCash, 150);
    assert.equal(closed[0].actualEndingCash, null);
    assert.equal(service.getSuggestedOpeningBalance('cr_main'), 150);
  } finally {
    if (shiftId) {
      manager.run('DELETE FROM audit_logs WHERE record_id = ?', [shiftId]);
      manager.run('DELETE FROM cash_shifts WHERE id = ?', [shiftId]);
    }
    service.saveShiftAutoCloseSchedule(previousSchedule.enabled, previousSchedule.closeTime);
  }
});

test('customer supply demand accumulates quantity and total value across added quantities', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const customer = new CustomerService().createCustomer({
    name: 'Customer supply total test',
    phone: '0199000042',
    customerType: 'RETAIL',
    creditLimit: 0,
  });
  const service = new CustomerSupplyService();
  const base = {
    customerId: customer.id,
    invoiceId: 'invoice_supply_total_test',
    invoiceNumber: 'SUPPLY-TOTAL-TEST',
    warehouseId: 'wh_main',
    productId: 'prod_supply_total_test',
    productName: 'Supply total test',
  };

  service.recordInvoiceDemand({ ...base, quantityRequested: 10, unitPrice: 100 });
  const updated = service.recordInvoiceDemand({ ...base, quantityRequested: 5, unitPrice: 120 });
  assert.equal(updated.quantityRequested, 15);
  assert.equal(updated.totalPrice, 1600);
  assert.equal(updated.unitPrice, 106.67);

  AuthService.logout();
  assert.throws(() => service.getOpenRequests(), /يجب تسجيل الدخول/);
  db.run('DELETE FROM customer_supply_requests WHERE invoice_id = ?', [base.invoiceId]);
  db.run('DELETE FROM customers WHERE id = ?', [customer.id]);
  AuthService.login('admin', 'admin123');
});

test('customer codes skip existing values when generated during creation', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const nextNumber = (db.query<{ value: number }>(
    'SELECT value FROM sequence_counters WHERE name = ?',
    ['CUST'],
  )[0]?.value ?? 0) + 1;
  const occupiedCode = `CUST-${new Date().getFullYear()}-${String(nextNumber).padStart(6, '0')}`;
  const service = new CustomerService();
  const occupied = service.createCustomer({
    code: occupiedCode,
    name: 'Customer occupied code test',
    phone: '0199000043',
    customerType: 'RETAIL',
    creditLimit: 0,
  });

  try {
    const generated = service.createCustomer({
      name: 'Customer generated code test',
      phone: '0199000044',
      customerType: 'RETAIL',
      creditLimit: 0,
    });
    assert.notEqual(generated.code, occupied.code);
    assert.match(generated.code, /^CUST-\d{4}-\d{6}$/);
    db.run('DELETE FROM customers WHERE id = ?', [generated.id]);
  } finally {
    db.run('DELETE FROM customers WHERE id = ?', [occupied.id]);
  }
});

test('profit and loss reconciles merchandise gross profit with invoices and separates shipping revenue', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const db = manager.getDatabase();
  const today = localDateString();
  let report: ReturnType<AccountingService['getProfitAndLossReport']>;

  db.run('BEGIN TRANSACTION');
  try {
    postLedgerEntry(db, {
      date: today,
      description: 'Profit policy reconciliation test',
      referenceType: 'TEST_PROFIT_POLICY',
      referenceId: 'profit_policy_reconciliation',
      createdBy: 'usr_admin',
      branchId: 'br_main',
      lines: [
        { accountCode: '1101', debit: 115, credit: 0 },
        { accountCode: '5101', debit: 60, credit: 0 },
        { accountCode: '5201', debit: 10, credit: 0 },
        { accountCode: '4101', debit: 0, credit: 100 },
        { accountCode: '4102', debit: 0, credit: 25 },
        { accountCode: '1104', debit: 0, credit: 60 },
      ],
    });
    report = new AccountingService().getProfitAndLossReport(today, today);
    assert.equal(report.merchandiseRevenue, 100);
    assert.equal(report.shippingRevenue, 25);
    assert.equal(report.revenue, 125);
    assert.equal(report.grossProfit, 40);
    assert.equal(report.netProfit, 55);
  } finally {
    db.run('ROLLBACK');
  }
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

test('navigation layout setting accepts only header or sidebar and persists', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  AuthService.login('admin', 'admin123');

  assert.throws(
    () => SettingsService.update({ navigationLayout: 'floating' }),
    /تخطيط التنقل غير صالح/
  );

  SettingsService.update({ navigationLayout: 'header' });
  assert.equal(SettingsService.getValue('navigationLayout'), 'header');
  assert.equal(SettingsService.getSettings().navigationLayout, 'header');

  SettingsService.update({ navigationLayout: 'sidebar' });
  assert.equal(SettingsService.getSettings().navigationLayout, 'sidebar');
});

test('appearance settings validate and persist workspace colors and control styles', async () => {
  await DatabaseManager.getInstance().initialize();
  AuthService.login('admin', 'admin123');
  const before = SettingsService.getSettings();

  assert.equal(before.interfaceDirection, 'rtl');
  assert.equal(before.uiFontScale, 'standard');
  assert.throws(
    () => SettingsService.update({ uiButtonStyle: 'gradient' }),
    /نمط الأزرار غير صالح/
  );
  assert.throws(
    () => SettingsService.update({ uiCanvasColor: 'red' }),
    /لون بصيغة HEX/
  );
  assert.throws(
    () => SettingsService.update({ uiFontScale: 'huge' }),
    /حجم الخط غير صالح/
  );
  assert.throws(
    () => SettingsService.update({ interfaceDirection: 'vertical' }),
    /اتجاه الواجهة غير صالح/
  );
  assert.throws(
    () => SettingsService.update({ fontFamily: 'Comic Sans' }),
    /الخط المحدد غير صالح/
  );

  SettingsService.update({
    uiCanvasColor: '#f1f3f5',
    uiButtonStyle: 'soft',
    uiCornerRadius: 'rounded',
    uiDensity: 'compact',
    uiFontScale: 'large',
    interfaceDirection: 'ltr',
    fontFamily: 'Tajawal',
  });
  const updated = SettingsService.getSettings();
  assert.equal(updated.uiCanvasColor, '#f1f3f5');
  assert.equal(updated.uiButtonStyle, 'soft');
  assert.equal(updated.uiCornerRadius, 'rounded');
  assert.equal(updated.uiDensity, 'compact');
  assert.equal(updated.uiFontScale, 'large');
  assert.equal(updated.interfaceDirection, 'ltr');
  assert.equal(updated.fontFamily, 'Tajawal');

  SettingsService.update({
    uiCanvasColor: before.uiCanvasColor,
    uiButtonStyle: before.uiButtonStyle,
    uiCornerRadius: before.uiCornerRadius,
    uiDensity: before.uiDensity,
    uiFontScale: before.uiFontScale,
    interfaceDirection: before.interfaceDirection,
    fontFamily: before.fontFamily,
  });
});

test('enabling FIFO refuses destructive conversion when cost history exists', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  AuthService.login('admin', 'admin123');
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', 'AVERAGE_COST')`);
  const layersBefore = q('SELECT COUNT(*) AS count FROM inventory_cost_layers')[0].count;
  const allocationsBefore = q('SELECT COUNT(*) AS count FROM inventory_cost_allocations')[0].count;

  assert.throws(
    () => SettingsService.update({ costingMethod: 'FIFO' }),
    /سجل تكلفة سابق/
  );
  assert.equal(q('SELECT COUNT(*) AS count FROM inventory_cost_layers')[0].count, layersBefore);
  assert.equal(q('SELECT COUNT(*) AS count FROM inventory_cost_allocations')[0].count, allocationsBefore);
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', 'FIFO')`);
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
  assert.equal(pricing.getCustomerOverrides(customer.id).length, 1);
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
      branchId: 'br_main',
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
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
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
  const commissionRegister = q(
    `SELECT cr.id, cr.current_balance AS balance
     FROM cash_registers cr
     JOIN commissions c ON c.branch_id = cr.branch_id
     WHERE c.id = ? AND cr.is_active = 1
     ORDER BY cr.is_default DESC, cr.id ASC LIMIT 1`,
    [commission!.id]
  )[0];
  assert.ok(commissionRegister, 'the commission branch should have an active register');
  db.run(
    `CREATE TRIGGER fail_commission_status_update
     BEFORE UPDATE OF status ON commissions
     WHEN NEW.status = 'PAID'
     BEGIN
       SELECT RAISE(ABORT, 'forced commission status failure');
     END`
  );
  assert.throws(() => commissions.setStatus(commission!.id, 'PAID'), /forced commission status failure/);
  assert.equal(q(
    `SELECT COUNT(*) AS count FROM journal_entries
     WHERE reference_type = 'COMMISSION_PAYMENT' AND reference_id = ?`,
    [commission!.id]
  )[0].count, 0, 'failed state update must roll back the payment journal entry');
  assert.equal(q('SELECT current_balance AS balance FROM cash_registers WHERE id = ?', [commissionRegister.id])[0].balance,
    commissionRegister.balance, 'failed state update must roll back the cash movement');
  db.run('DROP TRIGGER fail_commission_status_update');

  commissions.setStatus(commission!.id, 'PAID');
  const balanceAfterPayment = q(
    'SELECT current_balance AS balance FROM cash_registers WHERE id = ?',
    [commissionRegister.id]
  )[0].balance;
  assert.equal(Number(commissionRegister.balance) - Number(balanceAfterPayment), commission!.commissionAmount);
  assert.throws(() => commissions.setStatus(commission!.id, 'PAID'), /مدفوعة بالفعل/);
  assert.equal(
    q('SELECT current_balance AS balance FROM cash_registers WHERE id = ?', [commissionRegister.id])[0].balance,
    balanceAfterPayment,
    'retrying a paid commission must not deduct cash again'
  );
  assert.equal(q(
    `SELECT COUNT(*) AS count FROM journal_entries
     WHERE reference_type = 'COMMISSION_PAYMENT' AND reference_id = ?`,
    [commission!.id]
  )[0].count, 1, 'a commission can only have one payment journal entry');
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
  const consumedMovement = q(
    `SELECT id, quantity_m2 AS quantity, unit_cost AS unitCost, total_cost AS totalCost
     FROM inventory_transactions WHERE reference_type = 'RESERVATION' AND reference_id = ?`,
    [second.id]
  )[0];
  assert.equal(Number(consumedMovement.quantity), -5, 'reservation consumption must be an outbound movement');
  assert.equal(Number(consumedMovement.totalCost), 500);
  const consumptionLedger = q(
    `SELECT coa.code AS code, jel.debit AS debit, jel.credit AS credit
     FROM journal_entries je
     JOIN journal_entry_lines jel ON jel.entry_id = je.id
     JOIN chart_of_accounts coa ON coa.id = jel.account_id
     WHERE je.reference_type = 'RESERVATION_CONSUMPTION' AND je.reference_id = ?`,
    [consumedMovement.id]
  );
  assert.equal(consumptionLedger.find((line: any) => line.code === '5101')?.debit, 500);
  assert.equal(consumptionLedger.find((line: any) => line.code === '1104')?.credit, 500);

  const overdue = reservations.createReservation({
    productId: 'prod_stmt_1', warehouseId: 'wh_main', quantityM2: 3,
    expiresAt: '2000-01-01T00:00:00.000Z',
  });
  const expiration = reservations.expireOverdue();
  assert.ok(expiration.released >= 1);
  assert.equal(q(`SELECT status FROM stock_reservations WHERE id = ?`, [overdue.id])[0].status, 'EXPIRED');
  assert.equal(reservations.getAvailability('prod_stmt_1', 'wh_main').reserved, before.reserved);
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
  const period = localDateString().slice(0, 7);
  const employee = EmployeeService.create({
    name: 'موظف اختبار الرواتب',
    location: 'اختبار',
    role: 'محاسب',
    phone: '0109090909',
    email: '',
    baseSalary: 6000,
    salaryType: 'MONTHLY',
    status: 'ACTIVE',
    joinedDate: `${period}-01`,
  });
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

test('payroll run snapshots period attendance, contract pay and policy deductions through close', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const employee = EmployeeService.create({
    name: 'موظف دورة رواتب',
    location: 'اختبار',
    role: 'محاسب',
    phone: '0109191919',
    email: '',
    baseSalary: 2500,
    salaryType: 'MONTHLY',
    status: 'ACTIVE',
    joinedDate: '2020-06-15',
  });

  const companyId = q('SELECT company_id AS companyId FROM branches WHERE id=?', [employee.branchId])[0].companyId;
  const previousSettings = q(
    'SELECT payroll_tax_rate AS taxRate, overtime_multiplier AS overtimeMultiplier, working_days_per_month AS workingDays FROM companies WHERE id=?',
    [companyId]
  )[0];

  try {
    manager.run(
      'UPDATE companies SET payroll_tax_rate=10, overtime_multiplier=2, working_days_per_month=26 WHERE id=?',
      [companyId]
    );
    manager.run(
      `INSERT INTO employee_contracts
         (id, employee_id, branch_id, contract_number, contract_type, start_date, job_title,
          salary, status, created_by)
       VALUES (?, ?, ?, ?, 'PERMANENT', ?, ?, ?, 'ACTIVE', ?)`,
      ['contract_payroll_run_test', employee.id, employee.branchId, 'CTR_PAYROLL_RUN_TEST', '2020-06-15', employee.role, 3000, 'usr_admin']
    );
    manager.run(
      `INSERT INTO attendance
       (id, employee_id, date, status, late_minutes, overtime_minutes, overtime_approved, source)
       VALUES (?, ?, ?, 'ABSENT', 0, 0, 0, 'TEST'),
              (?, ?, ?, 'LATE', 60, 120, 1, 'TEST')`,
      ['att_payroll_absent_test', employee.id, '2020-06-17', 'att_payroll_late_test', employee.id, '2020-06-18']
    );
    manager.run(
      `INSERT INTO employee_leave_requests
         (id, employee_id, branch_id, leave_type, start_date, end_date, days, status, requested_by)
       VALUES (?, ?, ?, 'UNPAID', ?, ?, 3, 'APPROVED', ?)`,
      ['leave_payroll_run_test', employee.id, employee.branchId, '2020-06-19', '2020-06-21', 'usr_admin']
    );
    EmployeeService.addTransaction({
      employeeId: employee.id, type: 'BONUS', amount: 100, date: '2020-06-22', notes: 'مكافأة اختبار',
    });
    EmployeeService.addTransaction({
      employeeId: employee.id, type: 'DEDUCTION', amount: 20, date: '2020-06-22', notes: 'خصم اختبار',
    });
    manager.run(
      `INSERT INTO commissions
         (id, employee_id, branch_id, source_type, period_month, commission_amount, status, created_by)
       VALUES (?, ?, ?, 'MANUAL', ?, 250, 'PENDING', ?)`,
      ['commission_payroll_run_test', employee.id, employee.branchId, '2020-06', 'usr_admin']
    );
    new CommissionService().setStatus('commission_payroll_run_test', 'APPROVED');

    const draft = EmployeeService.calculatePayrollRun('2020-06');
    const item = draft.items.find((row) => row.employeeId === employee.id);
    assert.ok(item);
    assert.equal(item.baseSalary, 3000);
    assert.equal(item.absentDays, 1);
    assert.equal(item.unpaidLeaveDays, 3, 'without a shift, unpaid leave uses calendar days rather than an assumed workweek');
    assert.equal(item.lateMinutes, 60);
    assert.equal(item.overtimeMinutes, 120);
    assert.equal(item.bonusAmount, 100);
    assert.equal(item.commissionAmount, 250);
    assert.equal(item.manualDeductionAmount, 20);
    assert.equal(item.details.taxRate, 10);
    assert.equal(item.details.overtimeMultiplier, 2);
    assert.equal(item.baseAmount, 1600);
    assert.ok(item.netAmount > 0);
    assert.equal(draft.status, 'DRAFT');

    EmployeeService.addTransaction({
      employeeId: employee.id, type: 'BONUS', amount: 1, date: '2020-06-22', notes: 'حركة بعد الاحتساب',
    });
    assert.throws(() => EmployeeService.approvePayrollRun(draft.id), /تغيرت بيانات الرواتب/);
    const refreshedDraft = EmployeeService.calculatePayrollRun('2020-06');
    assert.equal(refreshedDraft.id, draft.id);
    assert.equal(refreshedDraft.items.find((row) => row.employeeId === employee.id)?.bonusAmount, 101);
    const approved = EmployeeService.approvePayrollRun(refreshedDraft.id);
    assert.equal(approved.status, 'APPROVED');
    assert.throws(
      () => new CommissionService().setStatus('commission_payroll_run_test', 'CANCELLED'),
      /دورة رواتب معتمدة/
    );
    assert.throws(
      () => new LeaveService().cancel('leave_payroll_run_test'),
      /فترة رواتب معتمدة/
    );
    const paid = EmployeeService.payPayrollRun(draft.id);
    assert.equal(paid.status, 'PAID');
    assert.ok(paid.items.find((row) => row.employeeId === employee.id)?.payoutTransactionId);
    assert.equal(q('SELECT status FROM commissions WHERE id=?', ['commission_payroll_run_test'])[0].status, 'PAID');
    assert.equal(EmployeeService.getPayrollPayables().find((row) => row.employeeId === employee.id)?.balance ?? 0, 0);

    const closed = EmployeeService.closePayrollRun(draft.id);
    assert.equal(closed.status, 'CLOSED');
    assert.throws(() => EmployeeService.addTransaction({
      employeeId: employee.id, type: 'BONUS', amount: 1, date: '2020-06-23', notes: 'بعد الإغلاق',
    }), /دورة رواتب معتمدة/);
    assert.throws(() => EmployeeService.upsertAttendance({
      employeeId: employee.id, date: '2020-06-23', status: 'PRESENT',
    }), /دورة رواتب معتمدة/);
  } finally {
    manager.run(
      'UPDATE companies SET payroll_tax_rate=?, overtime_multiplier=?, working_days_per_month=? WHERE id=?',
      [previousSettings.taxRate, previousSettings.overtimeMultiplier, previousSettings.workingDays, companyId]
    );
  }
});

test('time attendance uses assigned shifts, approves corrections and gates overtime payroll', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const employee = EmployeeService.create({
    name: 'موظف اختبار البصمة',
    location: 'اختبار',
    role: 'موظف',
    phone: '0109191918',
    email: '',
    baseSalary: 3000,
    salaryType: 'MONTHLY',
    status: 'ACTIVE',
    joinedDate: localDateString(),
  });
  const date = localDateString();
  const shift = AttendanceService.saveShift({
    name: `وردية اختبار ${employee.id}`,
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    graceMinutes: 5,
    overtimeAfterMinutes: 15,
    workdays: [0, 1, 2, 3, 4, 5, 6],
  });
  AttendanceService.assignShift(employee.id, shift.id, date);
  const monthEnd = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate();
  const holidayDate = `${date.slice(0, 7)}-${String(monthEnd).padStart(2, '0')}`;
  AttendanceService.addHoliday(holidayDate, 'عطلة اختبار');

  const created = AttendanceService.saveManualRecord({
    employeeId: employee.id,
    date,
    status: 'PRESENT',
    checkInAt: `${date}T09:05:00`,
    checkOutAt: `${date}T18:30:00`,
  });
  assert.equal(created.pendingApproval, false);
  let attendance = AttendanceService.getAttendanceByDate(date).find((row) => row.employeeId === employee.id)!;
  assert.equal(attendance.lateMinutes, 0, 'grace time should suppress lateness');
  assert.equal(attendance.overtimeMinutes, 75, 'overtime excludes the configured 15-minute threshold');
  assert.equal(attendance.overtimeApproved, false);

  const correction = AttendanceService.saveManualRecord({
    employeeId: employee.id,
    date,
    status: 'PRESENT',
    checkInAt: `${date}T08:40:00`,
    checkOutAt: `${date}T19:00:00`,
    notes: 'تصحيح معتمد',
  });
  assert.equal(correction.pendingApproval, true);
  assert.equal(AttendanceService.getAttendanceByDate(date).find((row) => row.employeeId === employee.id)?.checkOutAt, `${date}T18:30:00`);
  const request = AttendanceService.getCorrectionRequests().find((row) => row.employeeId === employee.id)!;
  AttendanceService.decideCorrection(request.id, true);
  attendance = AttendanceService.getAttendanceByDate(date).find((row) => row.employeeId === employee.id)!;
  assert.equal(attendance.checkOutAt, `${date}T19:00:00`);
  assert.equal(attendance.overtimeMinutes, 105);
  const decidedCorrection = AttendanceService.getCorrectionHistory(date.slice(0, 7))
    .find((row) => row.id === request.id);
  assert.equal(decidedCorrection?.status, 'APPROVED');
  assert.ok(decidedCorrection?.beforeJson);
  assert.ok(decidedCorrection?.decidedByName);
  assert.ok(AttendanceService.getAuditHistory(date.slice(0, 7))
    .some((row) => row.employeeName === employee.name && row.action === 'CORRECTION_APPROVED'));
  assert.equal(AttendanceService.getHolidays(date.slice(0, 7)).some((row) => row.date === holidayDate), true);

  let run = EmployeeService.calculatePayrollRun(date.slice(0, 7));
  assert.equal(run.items.find((row) => row.employeeId === employee.id)?.overtimeMinutes, 0);
  AttendanceService.approveOvertime(attendance.id);
  run = EmployeeService.calculatePayrollRun(date.slice(0, 7));
  assert.equal(run.items.find((row) => row.employeeId === employee.id)?.overtimeMinutes, 105);
  assert.equal(
    db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM attendance_audit_log
       WHERE employee_id = ? AND action IN ('MANUAL_ENTRY', 'CORRECTION_APPROVED', 'OVERTIME_APPROVED')`,
      [employee.id]
    )[0].count,
    3
  );
});

test('punch workflow records breaks and permits next-day checkout for overnight shifts', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const employee = EmployeeService.create({
    name: 'موظف اختبار تسجيل الوقت',
    location: 'اختبار',
    role: 'موظف',
    phone: '0109191917',
    email: '',
    baseSalary: 2000,
    salaryType: 'MONTHLY',
    status: 'ACTIVE',
    joinedDate: localDateString(),
  });
  const started = AttendanceService.punchIn(employee.id);
  assert.ok(started.checkInAt);
  AttendanceService.startBreak(employee.id);
  let record = AttendanceService.getAttendanceByDate(localDateString()).find((row) => row.employeeId === employee.id)!;
  assert.equal(record.activeBreak, true);
  const breakStarted = new Date(Date.now() - 10 * 60 * 1000);
  db.run(
    'UPDATE attendance_breaks SET started_at = ? WHERE attendance_id = ? AND ended_at IS NULL',
    [`${localDateString(breakStarted)}T${breakStarted.toTimeString().slice(0, 8)}`, record.id]
  );
  AttendanceService.endBreak(employee.id);
  AttendanceService.punchOut(employee.id);
  record = AttendanceService.getAttendanceByDate(localDateString()).find((row) => row.employeeId === employee.id)!;
  assert.equal(record.activeBreak, false);
  assert.ok(record.breakMinutes >= 9 && record.breakMinutes <= 11);
  assert.equal(AttendanceService.getBreaks(record.id).length, 1);
  const breakEntry = AttendanceService.getBreaksByDate(localDateString()).find((item) => item.attendanceId === record.id);
  assert.ok(breakEntry && breakEntry.minutes >= 9 && breakEntry.minutes <= 11);

  const overnightEmployee = EmployeeService.create({
    name: 'موظف اختبار الوردية الليلية',
    location: 'اختبار',
    role: 'موظف',
    phone: '0109191916',
    email: '',
    baseSalary: 2000,
    salaryType: 'MONTHLY',
    status: 'ACTIVE',
    joinedDate: localDateString(),
  });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayString = localDateString(yesterday);
  db.run(
    `INSERT INTO attendance (id, employee_id, date, status, check_in_at, source, recorded_by)
     VALUES (?, ?, ?, 'PRESENT', ?, 'PUNCH', ?)`,
    ['att_overnight_test', overnightEmployee.id, yesterdayString, `${yesterdayString}T22:00:00`, 'usr_admin']
  );
  const overnight = AttendanceService.punchOut(overnightEmployee.id);
  assert.equal(overnight.date, yesterdayString);
  assert.ok(overnight.checkOutAt?.startsWith(localDateString()));
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
  assert.deepEqual(
    lines.map((line) => line.code).sort((a, b) => a.localeCompare(b)),
    ['1601', '2201']
  );
  assert.equal(lines.find((line) => line.code === '2201')?.credit, 4500);
  assert.equal(q('SELECT current_balance FROM cash_registers WHERE id=?', ['cr_main'])[0].currentBalance, registerBefore);
});
