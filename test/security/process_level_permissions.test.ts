import '../integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../../src/database/repositories/databaseManager.ts';
import { AuthService } from '../../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../../src/services/domains/auth/PermissionService.ts';
import { SalesService } from '../../src/services/domains/sales/SalesService.ts';
import { FinanceExtrasService } from '../../src/services/domains/finance/FinanceExtrasService.ts';
import { CashierService } from '../../src/services/domains/finance/CashierService.ts';
import { CustomerService } from '../../src/services/domains/customers/CustomerService.ts';
import type { User } from '../../src/types/auth/identity.ts';

const TS = String(Date.now());
const userViewOnly: User = {
  id: 'usr_proc_view_' + TS, username: 'proc-view-only-' + TS, fullName: 'Proc View Only',
  role: 'SALES', isActive: true, createdAt: '', updatedAt: '',
};

const userNoDelete: User = {
  id: 'usr_proc_nodelete_' + TS, username: 'proc-no-delete-' + TS, fullName: 'Proc No Delete',
  role: 'SALES', isActive: true, createdAt: '', updatedAt: '',
};

function asUser(user: User): void {
  AuthService.setCurrentUser(user);
  PermissionService.invalidate(user);
}

async function boot(db: DatabaseManager): Promise<void> {
  await db.initialize();
  PermissionService.seed();

  db.run(`INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
   VALUES ('${userViewOnly.id}','${userViewOnly.username}','test','${userViewOnly.fullName}','${userViewOnly.role}',1,'ALL'),
          ('${userNoDelete.id}','${userNoDelete.username}','test','${userNoDelete.fullName}','${userNoDelete.role}',1,'ALL')`);

  db.run(`INSERT OR IGNORE INTO user_permissions (user_id, permission_code, effect) VALUES ('${userViewOnly.id}','sales.view','GRANT')`);
  db.run(`INSERT OR IGNORE INTO user_permissions (user_id, permission_code, effect) VALUES ('${userNoDelete.id}','sales.view','GRANT'),('${userNoDelete.id}','sales.create','GRANT')`);

  db.run(`INSERT OR IGNORE INTO customers (id, code, name, phone, branch_id, company_id, current_balance, total_purchases)
   VALUES ('cust_proc_${TS}','CUST-PROC','عميل إجراء','01000000000','br_main','cmp_main',0,0)`);
  db.run(`INSERT OR IGNORE INTO products (id, sku, barcode, name, category_id, brand_id, grade, size, base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2, wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active, company_id)
   VALUES ('prod_proc_${TS}','SKU-PROC','BAR-PROC','منتج إجراء','cat_floor','br_cleo','GRADE_1','60x60','M2','M2',4,1.44,100,300,250,0,10,1,'cmp_main')`);
  db.run(`INSERT OR IGNORE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2) VALUES ('stk_proc_${TS}','wh_main','prod_proc_${TS}',100,0)`);
}

test('process-level: view-only user cannot create sales invoice (create operation denied)', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(userViewOnly);

  const sales = new SalesService();
  assert.throws(
    () => sales.createSale({ customerId: 'cust_proc_' + TS, warehouseId: 'wh_main', items: [], paidAmount: 0, paymentType: 'CASH' }),
    /صلاحية|غير مصرح|ممنوع|create/
  );
});

test('process-level: user with create but no delete cannot delete a posted invoice', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(userNoDelete);

  const sales = new SalesService();
  const invoice = sales.createSale({ customerId: 'cust_proc_' + TS, warehouseId: 'wh_main',
    items: [{ productId: 'prod_proc_' + TS, soldBy: 'M2', quantityM2: 1, boxesCount: 0, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 300, paymentType: 'CASH' });
  assert.ok(invoice.id, 'invoice created successfully');

  assert.throws(
    () => sales.deleteSale(invoice.id),
    /صلاحية|غير مصرح|ممنوع|delete|غير قابل/
  );
});

test('process-level: permission checker distinguishes page view from action execute', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(userViewOnly);

  // مستخدم بـ sales.view فقط يجب أن يمتلك عرض الصفحة
  assert.equal(PermissionService.can(userViewOnly, 'sales.view'), true, 'view permission granted');

  // التأكد من أن الصلاحيات ليست مفتوحة تماماً (على الأقل واحدة من العمليات الحساسة غير ممنوحة للمستخدم المحدود)
  const sensitiveOps = ['sales.delete', 'sales.approve', 'sales.post', 'finance.expense.create'];
  const deniedOps = sensitiveOps.filter((op) => !PermissionService.can(userViewOnly, op));
  assert.ok(deniedOps.length > 0, 'at least one sensitive operation is denied to view-only user');
});

test('process-level: finance operations require specific operation permission not just page access', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(userViewOnly);

  // مستخدم بـ sales.view فقط يجب ألا يملك صلاحية إنشاء مصروف أو إجراء عمليات مالية
  assert.equal(PermissionService.can(userViewOnly, 'finance.expense.create'), false, 'create expense permission denied');
  assert.equal(PermissionService.can(userViewOnly, 'cashier.expense'), false, 'cashier expense permission denied');
});

test('process-level: journal reversal requires reversal permission, not just view', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(userViewOnly);

  const extras = new FinanceExtrasService();
  assert.throws(
    () => extras.reverseJournalEntry('entry_proc_' + TS, { reason: 'test' }),
    /صلاحية|غير مصرح|ممنوع|reverse/
  );
});

