import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { SupplierService } from '../src/services/SupplierService.ts';
import { AnalyticsService } from '../src/services/AnalyticsService.ts';
import { ProcurementService } from '../src/services/ProcurementService.ts';
import { loadReport } from '../src/pages/reports/SalesReportsPage.tsx';
import { loadPurchaseKpi, loadInventoryKpi } from '../src/pages/reports/PurchaseInventoryReportPage.tsx';
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
    `INSERT OR IGNORE INTO branches (id, code, name, is_main, is_active)
     VALUES ('br_page_a', 'PAGE-A', 'Page Branch A', 0, 1),
            ('br_page_b', 'PAGE-B', 'Page Branch B', 0, 1)`
  );
  db.run(
    `INSERT OR IGNORE INTO warehouses (id, name, code, branch_id, is_active)
     VALUES ('wh_page_a', 'Page Warehouse A', 'PAGE-WA', 'br_page_a', 1),
            ('wh_page_b', 'Page Warehouse B', 'PAGE-WB', 'br_page_b', 1)`
  );
  db.run(
    `INSERT OR IGNORE INTO cash_registers (id, name, current_balance, is_default, is_active, branch_id)
     VALUES ('cr_page_a', 'Page Register A', 0, 1, 1, 'br_page_a'),
            ('cr_page_b', 'Page Register B', 0, 1, 1, 'br_page_b')`
  );
  db.run(
    `INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_page_scope', 'page-scope', 'test', 'Page Scope', 'SALES', 1, 'ASSIGNED')`
  );
  db.run(
    `INSERT OR IGNORE INTO users_branches (user_id, branch_id) VALUES ('usr_page_scope', 'br_page_a')`
  );
  db.run(
    `INSERT OR IGNORE INTO customers (id, code, name, phone) VALUES
      ('cust_page_a', 'PAGE-CUST-A', 'Page Customer A', '0100000001'),
      ('cust_page_b', 'PAGE-CUST-B', 'Page Customer B', '0100000002')`
  );
  db.run(
    `INSERT OR IGNORE INTO suppliers (id, code, name, phone) VALUES
      ('sup_page', 'PAGE-SUP', 'Page Supplier', '0100000003')`
  );

  const today = localDateString();
  db.run(
    `INSERT INTO sales_invoices (id, invoice_number, date, customer_id, warehouse_id, branch_id,
       subtotal, discount_amount, total_amount, created_by)
     VALUES ('si_page_a', 'PAGE-SI-A', ?, 'cust_page_a', 'wh_page_a', 'br_page_a', 500, 0, 500, 'usr_page_scope'),
            ('si_page_b', 'PAGE-SI-B', ?, 'cust_page_b', 'wh_page_b', 'br_page_b', 900, 0, 900, 'usr_page_scope')`,
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
       subtotal, total_amount, created_by)
     VALUES ('pi_page_a', 'PAGE-PI-A', ?, 'sup_page', 'wh_page_a', 'br_page_a', 200, 200, 'usr_page_scope'),
            ('pi_page_b', 'PAGE-PI-B', ?, 'sup_page', 'wh_page_b', 'br_page_b', 300, 300, 'usr_page_scope')`,
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

  AuthService.setCurrentUser(assignedUser);

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

  // Central users keep full visibility.
  const admin = db.query<User & { branchScope: string }>(
    "SELECT id, username, full_name AS fullName, role, is_active AS isActive FROM users WHERE role = 'ADMIN' LIMIT 1"
  )[0];
  AuthService.setCurrentUser(admin);
  assert.equal(loadInventoryKpi().totalValue, 1500);
  assert.equal(new AnalyticsService().getSalesAnalytics(today, today).totalSales, 1400);
  assert.deepEqual(
    loadBranchAdjustments().map(row => row.id).sort((a, b) => a.localeCompare(b)),
    ['adj_page_a', 'adj_page_b']
  );
  assert.equal(loadPurchaseKpi(today, today).totalPurchases, 500);
  assert.deepEqual(
    loadBranchCountSessions().map(row => row.id).sort((a, b) => a.localeCompare(b)),
    ['cnt_page_a', 'cnt_page_b']
  );
  assert.deepEqual(
    new SupplierService().getInvoicesWithAllocations('sup_page').map(row => row.id).sort((a, b) => a.localeCompare(b)),
    ['pi_page_a', 'pi_page_b']
  );
  assert.equal(new ProcurementService().getSupplierScorecard('sup_page').totalOrders, 2);

  db.run("DELETE FROM purchase_invoices WHERE id IN ('pi_page_a', 'pi_page_b')");
  db.run("DELETE FROM purchase_orders WHERE id IN ('po_page_a', 'po_page_b')");
  db.run("DELETE FROM supplier_payments WHERE id = 'sp_page_a'");
  db.run("DELETE FROM sales_invoices WHERE id IN ('si_page_a', 'si_page_b')");
  db.run("DELETE FROM stock_adjustments WHERE id IN ('adj_page_a', 'adj_page_b')");
  db.run("DELETE FROM stock_counts WHERE id IN ('cnt_page_a', 'cnt_page_b')");
  db.run("DELETE FROM warehouse_stock WHERE id IN ('ws_page_a', 'ws_page_b')");
  AuthService.logout();
});
