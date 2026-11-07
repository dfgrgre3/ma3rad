import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { BranchAccessService } from '../src/services/BranchAccessService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { SupplierService } from '../src/services/SupplierService.ts';
import { AnalyticsService } from '../src/services/AnalyticsService.ts';
import { ProcurementService } from '../src/services/ProcurementService.ts';
import { runExecutiveQueries } from '../src/pages/dashboard/executive/useExecutiveQueries.ts';
import { queryFinanceOverviewMetrics } from '../src/services/DashboardQueryScopeService.ts';
import { DebtService } from '../src/services/DebtService.ts';
import { InventoryValuationService } from '../src/services/InventoryValuationService.ts';
import { InstallmentService } from '../src/services/InstallmentService.ts';
import { loadReport } from '../src/pages/reports/SalesReportsPage.tsx';
import { loadPurchaseKpi, loadInventoryKpi } from '../src/services/InventoryReportService.ts';
import { loadBranchAdjustments } from '../src/pages/inventory/InventoryAdjustmentsPage.tsx';
import { loadBranchCountSessions } from '../src/pages/inventory/InventoryCountPage.tsx';
import { localDateString } from '../src/utils/date.ts';
import type { User } from '../src/types/identity.ts';

const assignedUser: User = {
  id: 'usr_page_scope',
  username: 'page-scope',
  fullName: 'Page Scope',
  role: 'SALES',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

test('inventory, report and party pages only expose data from accessible branches', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();

  db.run(
    `INSERT OR IGNORE INTO branches (id, code, name, is_main, is_active, company_id)
     VALUES ('br_page_a', 'PAGE-A', 'Page Branch A', 0, 1, 'cmp_main'),
            ('br_page_b', 'PAGE-B', 'Page Branch B', 0, 1, 'cmp_main')`
  );
  db.run(
    `INSERT OR IGNORE INTO warehouses (id, name, code, branch_id, is_active)
     VALUES ('wh_page_a', 'Page Warehouse A', 'PAGE-WA', 'br_page_a', 1),
            ('wh_page_b', 'Page Warehouse B', 'PAGE-WB', 'br_page_b', 1)`
  );
  db.run(
    `INSERT OR IGNORE INTO cash_registers (id, name, current_balance, is_default, is_active, branch_id)
     VALUES ('cr_page_a', 'Page Register A', 100, 1, 1, 'br_page_a'),
            ('cr_page_b', 'Page Register B', 900, 1, 1, 'br_page_b')`
  );
  db.run(
    `INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_page_scope', 'page-scope', 'test', 'Page Scope', 'SALES', 1, 'ASSIGNED')`
  );
  db.run(
    `INSERT OR IGNORE INTO users_branches (user_id, branch_id) VALUES ('usr_page_scope', 'br_page_a')`
  );
  db.run(
    `INSERT OR IGNORE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_page_scope', 'suppliers.view', 'GRANT'),
           ('usr_page_scope', 'finance.debts.view', 'GRANT'),
           ('usr_page_scope', 'purchases.view', 'GRANT'),
           ('usr_page_scope', 'sales.view', 'GRANT'),
           ('usr_page_scope', 'finance.view', 'GRANT'),
           ('usr_page_scope', 'finance.installments.view', 'GRANT')`
  );
  db.run(
    `INSERT OR IGNORE INTO customers (id, code, name, phone) VALUES
      ('cust_page_a', 'PAGE-CUST-A', 'Page Customer A', '0100000001'),
      ('cust_page_b', 'PAGE-CUST-B', 'Page Customer B', '0100000002')`
  );
  db.run(
    `INSERT OR IGNORE INTO suppliers (id, code, name, phone, company_id) VALUES
      ('sup_page', 'PAGE-SUP', 'Page Supplier', '0100000003', 'cmp_main')`
  );

  const today = localDateString();
  db.run(
    `INSERT INTO sales_invoices (id, invoice_number, date, customer_id, warehouse_id, branch_id,
       subtotal, discount_amount, total_amount, created_by, remaining_amount)
     VALUES ('si_page_a', 'PAGE-SI-A', ?, 'cust_page_a', 'wh_page_a', 'br_page_a', 500, 0, 500, 'usr_page_scope', 50),
            ('si_page_b', 'PAGE-SI-B', ?, 'cust_page_b', 'wh_page_b', 'br_page_b', 900, 0, 900, 'usr_page_scope', 90)`,
    [today, today]
  );
  db.run(
    `INSERT INTO stock_adjustments (id, adjustment_number, warehouse_id, date, adjustment_type, reason, created_by)
     VALUES ('adj_page_a', 'PAGE-ADJ-A', 'wh_page_a', ?, 'ADD', 'Page A addition', 'usr_page_scope'),
            ('adj_page_b', 'PAGE-ADJ-B', 'wh_page_b', ?, 'ADD', 'Page B addition', 'usr_page_scope')`,
    [today, today]
  );
  db.run(
    `INSERT INTO stock_counts (id, count_number, warehouse_id, date, created_by)
     VALUES ('cnt_page_a', 'PAGE-CNT-A', 'wh_page_a', ?, 'usr_page_scope'),
            ('cnt_page_b', 'PAGE-CNT-B', 'wh_page_b', ?, 'usr_page_scope')`,
    [today, today]
  );
  db.run(
    `INSERT OR IGNORE INTO products (id, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
       wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active)
     VALUES ('prod_page', 'PAGE-PROD', 'PAGE-PROD', 'Page Product', 'cat_floor', 'br_cleo', 'GRADE_1',
       '60x60', 'M2', 'M2', 4, 1.44, 100, 300, 250, 0, 0, 1)`
  );
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES ('ws_page_a', 'wh_page_a', 'prod_page', 10, 0),
            ('ws_page_b', 'wh_page_b', 'prod_page', 5, 0)`
  );
  db.run(
    `INSERT INTO purchase_invoices (id, invoice_number, date, supplier_id, warehouse_id, branch_id,
       subtotal, total_amount, created_by, remaining_amount)
     VALUES ('pi_page_a', 'PAGE-PI-A', ?, 'sup_page', 'wh_page_a', 'br_page_a', 200, 200, 'usr_page_scope', 20),
            ('pi_page_b', 'PAGE-PI-B', ?, 'sup_page', 'wh_page_b', 'br_page_b', 300, 300, 'usr_page_scope', 30)`,
    [today, today]
  );
  db.run(
    `INSERT INTO purchase_invoice_items (id, purchase_id, product_id, product_name, grade,
       quantity_m2, boxes_count, unit_cost, total_cost, meters_per_box, pieces_per_box)
     VALUES ('pii_page_a', 'pi_page_a', 'prod_page', 'Page Product', 'GRADE_1', 2, 1, 100, 200, 1.44, 4),
            ('pii_page_b', 'pi_page_b', 'prod_page', 'Page Product', 'GRADE_1', 3, 1, 100, 300, 1.44, 4)`
  );
  db.run(
    `INSERT INTO purchase_orders (id, order_number, date, supplier_id, warehouse_id, total_amount, status, created_by)
     VALUES ('po_page_a', 'PAGE-PO-A', ?, 'sup_page', 'wh_page_a', 200, 'RECEIVED', 'usr_page_scope'),
            ('po_page_b', 'PAGE-PO-B', ?, 'sup_page', 'wh_page_b', 300, 'RECEIVED', 'usr_page_scope')`,
    [today, today]
  );
  db.run(
    `INSERT INTO supplier_payments (id, receipt_number, supplier_id, amount, payment_type, date,
       register_id, branch_id, performed_by)
     VALUES ('sp_page_a', 'PAGE-SP-A', 'sup_page', 50, 'CASH', ?, 'cr_page_a', 'br_page_a', 'usr_page_scope')`,
    [today]
  );
  db.run(
    `INSERT INTO expenses (id, category, amount, register_id, date, description, performed_by, branch_id)
     VALUES ('exp_page_a', 'Page A', 40, 'cr_page_a', ?, 'Page A expense', 'usr_page_scope', 'br_page_a'),
            ('exp_page_b', 'Page B', 90, 'cr_page_b', ?, 'Page B expense', 'usr_page_scope', 'br_page_b')`,
    [today, today]
  );
  db.run(
    `INSERT INTO installment_plans (id, plan_number, customer_id, invoice_id, total_amount, financed_amount,
       installments_count, installment_amount, start_date, remaining_amount, created_by, branch_id)
     VALUES ('plan_page_a', 'PAGE-PLAN-A', 'cust_page_a', 'si_page_a', 50, 50, 1, 50, ?, 50, 'usr_page_scope', 'br_page_a'),
            ('plan_page_b', 'PAGE-PLAN-B', 'cust_page_b', 'si_page_b', 90, 90, 1, 90, ?, 90, 'usr_page_scope', 'br_page_b')`,
    [today, today]
  );
  db.run(
    `INSERT INTO installments (id, plan_id, sequence_number, due_date, amount, remaining_amount)
     VALUES ('inst_page_a', 'plan_page_a', 1, ?, 50, 50), ('inst_page_b', 'plan_page_b', 1, ?, 90, 90)`,
    [today, today]
  );

  AuthService.setCurrentUser(assignedUser);

  const executive = runExecutiveQueries(today, today)!;
  assert.equal(executive.total, 500, 'executive sales KPI excludes branch B');
  assert.equal(executive.totalPurchases, 200, 'executive purchasing KPI excludes branch B');
  assert.equal(executive.totalDebt, 50, 'executive receivables exclude branch B');
  assert.equal(executive.branchDataList.length, 1, 'branch comparison does not reveal another branch');
  assert.ok(executive.recentInvoicesData.every(invoice => invoice.id === 'si_page_a'));
  assert.ok(executive.lowStockData.every(item => item.warehouse === 'Page Warehouse A'));
  const finance = queryFinanceOverviewMetrics(db.getDatabase()!, today, today, assignedUser);
  assert.equal(finance.totalRevenue, 500, 'finance dashboard revenue excludes branch B');
  assert.equal(finance.cashBalance, 100, 'finance dashboard cash excludes branch B');
  assert.equal(finance.totalExpenses, 40, 'finance dashboard expenses exclude branch B');
  assert.equal(finance.totalReceivables, 50, 'finance dashboard receivables exclude branch B');
  assert.equal(finance.totalPayables, 20, 'finance dashboard payables exclude branch B');
  assert.deepEqual(new DebtService().getTotals(), { receivable: 50, payable: 20, net: 30 });
  assert.ok(new DebtService().getDebts().every((debt) => debt.amount === 50 || debt.amount === 20));
  const valuation = new InventoryValuationService();
  assert.deepEqual(valuation.getByWarehouse().map((warehouse) => warehouse.name), ['Page Warehouse A']);
  assert.equal(valuation.getKpi().totalValue, 1000);
  const installments = new InstallmentService().getPageData();
  assert.deepEqual(installments.invoiceRows.map((row) => row[0]), ['si_page_a']);
  assert.deepEqual(installments.planRows.map((row) => row[0]), ['plan_page_a']);
  assert.deepEqual(installments.installmentRows.map((row) => row[0]), ['inst_page_a']);
  assert.equal(finance.inventoryValue, 1000, 'finance dashboard inventory excludes branch B');

  const salesRows = loadReport('by_customer', today, today) as Array<{ label: string; revenue: number }>;
  assert.deepEqual(salesRows.map(row => row.label), ['Page Customer A']);
  assert.equal(salesRows[0].revenue, 500);

  const analytics = new AnalyticsService().getSalesAnalytics(today, today);
  assert.equal(analytics.totalSales, 500);
  assert.deepEqual(analytics.topCustomers.map(row => row.customerName), ['Page Customer A']);

  const purchaseKpi = loadPurchaseKpi(today, today);
  assert.equal(purchaseKpi.totalInvoices, 1);
  assert.equal(purchaseKpi.totalPurchases, 200);

  const inventoryKpi = loadInventoryKpi();
  assert.equal(inventoryKpi.totalSkus, 1);
  assert.equal(inventoryKpi.totalValue, 1000);

  assert.deepEqual(loadBranchAdjustments().map(row => row.id), ['adj_page_a']);
  assert.deepEqual(loadBranchCountSessions().map(row => row.id), ['cnt_page_a']);

  const statement = new SupplierService().getSupplierStatement('sup_page');
  assert.deepEqual(
    statement.transactions.map(row => row.id).sort((a, b) => a.localeCompare(b)),
    ['pi_page_a', 'sp_page_a']
  );
  assert.equal(
    statement.transactions.reduce((sum, row) => sum + Number(row.credit || 0), 0),
    200
  );

  const supplierService = new SupplierService();
  assert.deepEqual(
    supplierService.getInvoicesWithAllocations('sup_page').map(row => row.id),
    ['pi_page_a']
  );
  assert.deepEqual(
    supplierService.getPaymentsWithAllocations('sup_page').map(row => row.id),
    ['sp_page_a']
  );

  const scorecard = new ProcurementService().getSupplierScorecard('sup_page');
  assert.equal(scorecard.totalOrders, 1);

  const priceHistory = new ProcurementService().getProductPriceHistory('prod_page');
  assert.deepEqual(priceHistory.map(row => row.invoiceNumber), ['PAGE-PI-A']);

  // Central users explicitly switch branches; operational reports stay branch-scoped.
  const admin = db.query<User & { branchScope: string }>(
    "SELECT id, username, full_name AS fullName, role, is_active AS isActive FROM users WHERE role = 'ADMIN' LIMIT 1"
  )[0];
  AuthService.setCurrentUser(admin);
  const branchAccess = new BranchAccessService();
  branchAccess.setCurrentBranchId('br_page_a', admin);
  assert.equal(loadInventoryKpi().totalValue, 1000);
  assert.equal(new AnalyticsService().getSalesAnalytics(today, today).totalSales, 500);
  assert.deepEqual(loadBranchAdjustments().map(row => row.id), ['adj_page_a']);
  assert.equal(loadPurchaseKpi(today, today).totalPurchases, 200);
  assert.deepEqual(loadBranchCountSessions().map(row => row.id), ['cnt_page_a']);
  assert.deepEqual(new SupplierService().getInvoicesWithAllocations('sup_page').map(row => row.id), ['pi_page_a']);
  assert.equal(new ProcurementService().getSupplierScorecard('sup_page').totalOrders, 1);

  branchAccess.setCurrentBranchId('br_page_b', admin);
  assert.equal(loadInventoryKpi().totalValue, 500);
  assert.equal(new AnalyticsService().getSalesAnalytics(today, today).totalSales, 900);
  assert.deepEqual(loadBranchAdjustments().map(row => row.id), ['adj_page_b']);
  assert.equal(loadPurchaseKpi(today, today).totalPurchases, 300);
  assert.deepEqual(loadBranchCountSessions().map(row => row.id), ['cnt_page_b']);
  assert.deepEqual(new SupplierService().getInvoicesWithAllocations('sup_page').map(row => row.id), ['pi_page_b']);
  assert.equal(new ProcurementService().getSupplierScorecard('sup_page').totalOrders, 1);

  db.run("DELETE FROM purchase_invoices WHERE id IN ('pi_page_a', 'pi_page_b')");
  db.run("DELETE FROM purchase_orders WHERE id IN ('po_page_a', 'po_page_b')");
  db.run("DELETE FROM supplier_payments WHERE id = 'sp_page_a'");
  db.run("DELETE FROM expenses WHERE id IN ('exp_page_a', 'exp_page_b')");
  db.run("DELETE FROM installments WHERE id IN ('inst_page_a', 'inst_page_b')");
  db.run("DELETE FROM installment_plans WHERE id IN ('plan_page_a', 'plan_page_b')");
  db.run("DELETE FROM sales_invoices WHERE id IN ('si_page_a', 'si_page_b')");
  db.run("DELETE FROM stock_adjustments WHERE id IN ('adj_page_a', 'adj_page_b')");
  db.run("DELETE FROM stock_counts WHERE id IN ('cnt_page_a', 'cnt_page_b')");
  db.run("DELETE FROM warehouse_stock WHERE id IN ('ws_page_a', 'ws_page_b')");
  AuthService.logout();
});
