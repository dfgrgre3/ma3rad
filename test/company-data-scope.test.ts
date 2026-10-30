import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { CompanyService } from '../src/services/CompanyService.ts';
import { BranchService } from '../src/services/BranchService.ts';
import { CustomerService } from '../src/services/CustomerService.ts';
import { SupplierService } from '../src/services/SupplierService.ts';
import { ProductService } from '../src/services/ProductService.ts';
import { PurchaseService } from '../src/services/PurchaseService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import { BranchAccessService } from '../src/services/BranchAccessService.ts';
import { InventoryService } from '../src/services/InventoryService.ts';
import { FinancialStatementsService } from '../src/services/FinancialStatementsService.ts';
import { AccountingService } from '../src/services/AccountingService.ts';
import { FinanceEnterpriseService } from '../src/services/FinanceEnterpriseService.ts';
import { FinanceExtrasService } from '../src/services/FinanceExtrasService.ts';
import { postLedgerEntry } from '../src/database/ledger.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = {
  id: 'usr_scope_admin',
  username: 'scope-admin',
  fullName: 'Scope Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const LIMITED_ID = 'usr_scope_limited';

function limitedUser(): User {
  return {
    id: LIMITED_ID,
    username: 'scope-limited',
    fullName: 'Scope Limited',
    role: 'SALES',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
}

function asUser(user: User): void {
  AuthService.setCurrentUser(user);
  PermissionService.invalidate(user);
}

async function boot(): Promise<{ db: DatabaseManager; betaId: string }> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_scope_admin', 'scope-admin', 'test', 'Scope Admin', 'ADMIN', 1, 'ALL'),
            ('usr_scope_limited', 'scope-limited', 'test', 'Scope Limited', 'SALES', 1, 'ASSIGNED')`
  );
  db.run(`INSERT OR IGNORE INTO users_branches (user_id, branch_id) VALUES ('usr_scope_limited', 'br_main')`);
  db.run(
    `INSERT OR IGNORE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_scope_limited', 'sales.view', 'GRANT'),
            ('usr_scope_limited', 'customers.view', 'GRANT'),
            ('usr_scope_limited', 'suppliers.view', 'GRANT'),
            ('usr_scope_limited', 'products.view', 'GRANT'),
            ('usr_scope_limited', 'purchases.view', 'GRANT'),
            ('usr_scope_limited', 'inventory.view', 'GRANT'),
            ('usr_scope_limited', 'finance.view', 'GRANT'),
            ('usr_scope_limited', 'reports.view', 'GRANT')`
  );
  asUser(admin);

  const companies = new CompanyService();
  const beta =
    companies.getAllCompanies().find((company) => company.code === 'SCOPE-BETA') ??
    companies.createCompany({ code: 'SCOPE-BETA', name: 'Scope Beta Co' });
  const branches = new BranchService();
  const betaBranch =
    branches.getAllBranches().find((branch) => branch.code === 'SCOPE-BETA-1') ??
    branches.createBranch({ name: 'Scope Beta Branch', code: 'SCOPE-BETA-1', companyId: beta.id });
  db.run(
    `INSERT OR REPLACE INTO warehouses (id, name, code, branch_id, company_id, is_active)
     VALUES ('wh_scope_beta', 'Scope Beta WH', 'SCOPE-BETA-WH', ?, ?, 1),
            ('wh_scope_leak', 'Scope Leak WH', 'SCOPE-LEAK-WH', 'br_main', ?, 1)`,
    [betaBranch.id, beta.id, beta.id]
  );

  // Master data owned by each company.
  db.run(
    `INSERT OR REPLACE INTO customers (id, code, name, phone, customer_type, company_id)
     VALUES ('cus_scope_main', 'SC-M', 'Scope Main Customer', '1', 'RETAIL', 'cmp_main'),
            ('cus_scope_beta', 'SC-B', 'Scope Beta Customer', '2', 'RETAIL', ?)`,
    [beta.id]
  );
  db.run(
    `INSERT OR REPLACE INTO suppliers (id, code, name, phone, is_active, company_id)
     VALUES ('sup_scope_main', 'SC-SM', 'Scope Main Supplier', '1', 1, 'cmp_main'),
            ('sup_scope_beta', 'SC-SB', 'Scope Beta Supplier', '2', 1, ?)`,
    [beta.id]
  );
  db.run(
    `INSERT OR REPLACE INTO products
      (id, sku, barcode, name, category_id, brand_id, grade, size, base_unit, sell_unit,
       pieces_per_box, meters_per_box, cost_price, selling_price_m2, is_active, company_id)
     VALUES ('prod_scope_main', 'SC-PM', 'SC-PM', 'Scope Main Product', 'cat_floor', 'br_cleo', 'GRADE_1', '60x60',
             'M2', 'M2', 1, 1, 10, 20, 1, 'cmp_main'),
            ('prod_scope_beta', 'SC-PB', 'SC-PB', 'Scope Beta Product', 'cat_floor', 'br_cleo', 'GRADE_1', '60x60',
             'M2', 'M2', 1, 1, 10, 20, 1, ?)`,
    [beta.id]
  );
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES ('ws_scope_main', 'wh_main', 'prod_scope_main', 10, 0),
            ('ws_scope_leak', 'wh_scope_leak', 'prod_scope_main', 5, 0),
            ('ws_scope_beta', 'wh_scope_beta', 'prod_scope_beta', 7, 0)`
  );

  const today = new Date().toISOString().slice(0, 10);
  db.run(
    `INSERT OR REPLACE INTO sales_invoices
      (id, invoice_number, date, customer_id, warehouse_id, branch_id, company_id, subtotal, discount_amount,
       tax_amount, total_amount, paid_amount, remaining_amount, payment_type, payment_status, invoice_status,
       total_cost, gross_profit, created_by)
     VALUES ('inv_scope_main', 'SC-INV-M', ?, 'cus_scope_main', 'wh_main', 'br_main', 'cmp_main', 100, 0, 0, 100,
             0, 100, 'CREDIT', 'UNPAID', 'COMPLETED', 40, 60, 'usr_scope_admin'),
            ('inv_scope_leak', 'SC-INV-L', ?, 'cus_scope_main', 'wh_main', 'br_main', ?, 100, 0, 0, 100,
             0, 100, 'CREDIT', 'UNPAID', 'COMPLETED', 40, 60, 'usr_scope_admin'),
            ('inv_scope_beta', 'SC-INV-B', ?, 'cus_scope_beta', 'wh_scope_beta', ?, ?, 100, 0, 0, 100,
             0, 100, 'CREDIT', 'UNPAID', 'COMPLETED', 40, 60, 'usr_scope_admin')`,
    [today, today, beta.id, today, betaBranch.id, beta.id]
  );
  db.run(
    `INSERT OR REPLACE INTO purchase_invoices
      (id, invoice_number, date, supplier_id, warehouse_id, branch_id, company_id, subtotal, discount_amount,
       tax_amount, shipping_cost, total_amount, paid_amount, remaining_amount, payment_type, payment_status,
       created_by)
     VALUES ('pi_scope_main', 'SC-PI-M', ?, 'sup_scope_main', 'wh_main', 'br_main', 'cmp_main', 50, 0, 0, 0, 50,
             0, 50, 'CREDIT', 'UNPAID', 'usr_scope_admin'),
            ('pi_scope_leak', 'SC-PI-L', ?, 'sup_scope_main', 'wh_main', 'br_main', ?, 50, 0, 0, 0, 50,
             0, 50, 'CREDIT', 'UNPAID', 'usr_scope_admin'),
            ('pi_scope_beta', 'SC-PI-B', ?, 'sup_scope_beta', 'wh_scope_beta', ?, ?, 50, 0, 0, 0, 50,
             0, 50, 'CREDIT', 'UNPAID', 'usr_scope_admin')`,
    [today, today, beta.id, today, betaBranch.id, beta.id]
  );

  return { db, betaId: beta.id };
}

test('company scope hides master data owned by another company', async () => {
  await boot();
  const limited = limitedUser();
  asUser(limited);

  const access = new BranchAccessService();
  assert.deepEqual(access.getAccessibleCompanyIds(limited), ['cmp_main']);

  const customers = new CustomerService();
  const customerIds = customers.getAllCustomers().map((row) => row.id);
  assert.ok(customerIds.includes('cus_scope_main'));
  assert.ok(!customerIds.includes('cus_scope_beta'));
  assert.equal(customers.getCustomerById('cus_scope_beta'), null);
  assert.equal(customers.getCustomerById('cus_scope_main')?.id, 'cus_scope_main');

  const suppliers = new SupplierService();
  const supplierIds = suppliers.getAllSuppliers().map((row) => row.id);
  assert.ok(supplierIds.includes('sup_scope_main'));
  assert.ok(!supplierIds.includes('sup_scope_beta'));
  assert.equal(suppliers.getSupplierById('sup_scope_beta'), null);

  const products = new ProductService();
  const productIds = products.getAllProducts().map((row) => row.id);
  assert.ok(productIds.includes('prod_scope_main'));
  assert.ok(!productIds.includes('prod_scope_beta'));
  assert.equal(products.getProductById('prod_scope_beta'), null);
  assert.equal(products.getProductByBarcode('SC-PB'), null);

  asUser(admin);
});

test('rows created without company_id inherit the main company instead of disappearing', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  db.run(
    `INSERT INTO customers (id, code, name, phone, customer_type)
     VALUES ('cus_scope_default', 'SC-DEF', 'Scope Default Customer', '3', 'RETAIL')`
  );
  const owner = db.query<{ companyId: string }>(
    "SELECT company_id AS companyId FROM customers WHERE id = 'cus_scope_default'"
  )[0];
  assert.equal(owner.companyId, 'cmp_main');

  asUser(limitedUser());
  assert.ok(new CustomerService().getAllCustomers().some((row) => row.id === 'cus_scope_default'));
  asUser(admin);
});

test('inventory reads stay inside the company even when the warehouse branch matches', async () => {
  await boot();
  asUser(limitedUser());
  const inventory = new InventoryService();

  const warehouseIds = inventory.getAllWarehouses().map((row) => row.id);
  assert.ok(warehouseIds.includes('wh_main'));
  assert.ok(!warehouseIds.includes('wh_scope_leak'), 'a same-branch warehouse owned by another company must be hidden');
  assert.ok(!warehouseIds.includes('wh_scope_beta'));

  const stock = inventory.getWarehouseStock();
  assert.ok(stock.some((row) => row.warehouseId === 'wh_main' && row.productId === 'prod_scope_main'));
  assert.ok(!stock.some((row) => row.warehouseId === 'wh_scope_leak'));
  assert.ok(!stock.some((row) => row.warehouseId === 'wh_scope_beta'));

  asUser(admin);
  const adminWarehouses = new InventoryService().getAllWarehouses().map((row) => row.id);
  assert.ok(adminWarehouses.includes('wh_main'));
  assert.ok(!adminWarehouses.includes('wh_scope_leak'));
  assert.ok(!adminWarehouses.includes('wh_scope_beta'));
});

test('accounting reports and journal entries are scoped by the owning company', async () => {
  const { db, betaId } = await boot();
  const today = new Date().toISOString().slice(0, 10);
  const betaBranch = db.query<{ id: string }>(
    `SELECT b.id FROM branches b WHERE b.company_id = ? AND b.code = 'SCOPE-BETA-1'`, [betaId]
  )[0].id;
  const sqlite = db.getDatabase();

  const post = (referenceType: string, referenceId: string, amount: number, branchId?: string) =>
    postLedgerEntry(sqlite, {
      date: today,
      description: `Scope audit ${referenceId}`,
      referenceType,
      referenceId,
      createdBy: 'usr_scope_admin',
      branchId,
      lines: [
        { accountCode: '1103', debit: amount, credit: 0 },
        { accountCode: '4101', debit: 0, credit: amount },
      ],
    });

  const mainEntry = post('SALES_INVOICE', 'inv_scope_main', 100, 'br_main');
  const betaEntry = post('SALES_INVOICE', 'inv_scope_beta', 300, betaBranch);
  const leakEntry = post('SALES_INVOICE', 'inv_scope_leak', 50, 'br_main');

  // Entries inherit the company of their branch; a mis-owned legacy row is
  // simulated by moving the leak entry explicitly.
  const owners = db.query<{ id: string; companyId: string }>(
    `SELECT id, company_id AS companyId FROM journal_entries WHERE id IN (?, ?, ?)`,
    [mainEntry, betaEntry, leakEntry]
  );
  assert.equal(owners.find((row) => row.id === mainEntry)?.companyId, 'cmp_main');
  assert.equal(owners.find((row) => row.id === betaEntry)?.companyId, betaId);
  db.run(`UPDATE journal_entries SET company_id = ? WHERE id = ?`, [betaId, leakEntry]);

  asUser(limitedUser());
  const limitedLedger = new FinancialStatementsService();
  const limitedPnl = new AccountingService().getProfitAndLossReport();
  assert.equal(limitedPnl.revenue, 100, 'only the main company revenue is visible');
  const revenueAccount = db.query<{ id: string }>(`SELECT id FROM chart_of_accounts WHERE code = '4101'`)[0];
  const limitedGl = limitedLedger.getGeneralLedger(revenueAccount.id);
  assert.equal(limitedGl.closing, -100, 'general ledger must apply the company scope');

  asUser(admin);
  const adminPnl = new AccountingService().getProfitAndLossReport();
  assert.equal(adminPnl.revenue, 100, 'central access still uses the selected branch');
  assert.equal(new FinancialStatementsService().getGeneralLedger(revenueAccount.id).closing, -100);

  // The enterprise P&L and the journal browser must apply the same scope.
  asUser(limitedUser());
  const enterprise = new FinanceEnterpriseService();
  const extras = new FinanceExtrasService();
  assert.equal(enterprise.getMultiDimensionalPnL({}).revenue, 100, 'enterprise P&L must not mix companies');
  const limitedEntries = extras.getJournalEntries().map((entry) => entry.id);
  assert.deepEqual(limitedEntries, [mainEntry]);
  assert.equal(extras.getJournalLines(mainEntry).length, 2);
  assert.throws(() => extras.getJournalLines(betaEntry), /نطاق صلاحيتك/);

  asUser(admin);
  assert.equal(enterprise.getMultiDimensionalPnL({}).revenue, 100);
  assert.deepEqual(extras.getJournalEntries().map((entry) => entry.id), [mainEntry]);
  assert.throws(() => extras.getJournalLines(betaEntry), /نطاق صلاحيتك/);
});

test('transaction documents are blocked by company ownership even when branch access matches', async () => {
  await boot();
  const limited = limitedUser();
  asUser(limited);
  const db = DatabaseManager.getInstance();

  const sales = new SalesService();
  const invoiceIds = sales.getAllInvoices().map((row) => row.id);
  assert.ok(invoiceIds.includes('inv_scope_main'));
  assert.ok(!invoiceIds.includes('inv_scope_leak'), 'company_id must hide same-branch foreign records');
  assert.ok(!invoiceIds.includes('inv_scope_beta'));
  assert.equal(sales.getInvoiceById('inv_scope_leak'), null);
  assert.equal(sales.getInvoiceById('inv_scope_beta'), null);
  assert.equal(sales.getInvoiceById('inv_scope_main')?.id, 'inv_scope_main');

  // The restricted user does have branch access to br_main, so this only passes
  // because company_id is enforced in the query itself.
  assert.equal(
    db.query<{ count: number }>("SELECT COUNT(*) AS count FROM sales_invoices WHERE branch_id = 'br_main'")[0].count,
    2
  );

  const purchases = new PurchaseService();
  const purchaseIds = purchases.getAllPurchases().map((row) => row.id);
  assert.ok(purchaseIds.includes('pi_scope_main'));
  assert.ok(!purchaseIds.includes('pi_scope_leak'));
  assert.ok(!purchaseIds.includes('pi_scope_beta'));
  assert.equal(purchases.getPurchaseById('pi_scope_leak'), null);
  assert.equal(purchases.getPurchaseById('pi_scope_main')?.id, 'pi_scope_main');

  asUser(admin);

  // Central users must select a branch to see its operational records.
  const adminSales = new SalesService();
  const adminInvoiceIds = adminSales.getAllInvoices().map((row) => row.id);
  assert.ok(adminInvoiceIds.includes('inv_scope_main'));
  assert.ok(!adminInvoiceIds.includes('inv_scope_leak'));
  assert.ok(!adminInvoiceIds.includes('inv_scope_beta'));
  assert.deepEqual(new PurchaseService().getAllPurchases().map((row) => row.id), ['pi_scope_main']);
});
