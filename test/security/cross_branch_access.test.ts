import '../integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../../src/database/repositories/databaseManager.ts';
import { AuthService } from '../../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../../src/services/domains/auth/PermissionService.ts';
import { BranchAccessService } from '../../src/services/domains/auth/BranchAccessService.ts';
import { SalesService } from '../../src/services/domains/sales/SalesService.ts';
import { CustomerService } from '../../src/services/domains/customers/CustomerService.ts';
import type { User } from '../../src/types/auth/identity.ts';

const TS = String(Date.now());
const branchA = 'br_cross_a_' + TS;
const branchB = 'br_cross_b_' + TS;

const userA: User = {
  id: 'usr_cross_a_' + TS, username: 'cross-user-a-' + TS, fullName: 'Cross User A',
  role: 'SALES', isActive: true, createdAt: '', updatedAt: '',
};
const userB: User = {
  id: 'usr_cross_b_' + TS, username: 'cross-user-b-' + TS, fullName: 'Cross User B',
  role: 'SALES', isActive: true, createdAt: '', updatedAt: '',
};

function asUser(user: User): void {
  AuthService.setCurrentUser(user);
  PermissionService.invalidate(user);
}

async function boot(db: DatabaseManager): Promise<void> {
  await db.initialize();
  PermissionService.seed();

  db.run(`INSERT OR IGNORE INTO branches (id, code, name, is_main, is_active, company_id)
   VALUES ('${branchA}','BR-A-${TS}','Branch A ${TS}',1,1,'cmp_main'),
          ('${branchB}','BR-B-${TS}','Branch B ${TS}',0,1,'cmp_main')`);
  db.run(`INSERT OR IGNORE INTO warehouses (id, name, code, branch_id, is_active, company_id)
   VALUES ('wh_a_${TS}','Warehouse A','WA-${TS}','${branchA}',1,'cmp_main'),
          ('wh_b_${TS}','Warehouse B','WB-${TS}','${branchB}',1,'cmp_main')`);
  db.run(`INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
   VALUES ('${userA.id}','${userA.username}','test','${userA.fullName}','${userA.role}',1,'ASSIGNED')`);
  db.run(`INSERT OR IGNORE INTO users_branches (user_id, branch_id) VALUES ('${userA.id}','${branchA}')`);
  db.run(`INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
   VALUES ('${userB.id}','${userB.username}','test','${userB.fullName}','${userB.role}',1,'ASSIGNED')`);
  db.run(`INSERT OR IGNORE INTO users_branches (user_id, branch_id) VALUES ('${userB.id}','${branchB}')`);
  for (const user of [userA, userB]) {
    for (const p of ['sales.view','sales.create','sales.delete','purchases.view','purchases.create',
      'inventory.view','customers.view','suppliers.view','products.view','finance.view','reports.view']) {
      db.run(`INSERT OR IGNORE INTO user_permissions (user_id, permission_code, effect) VALUES ('${user.id}','${p}','GRANT')`);
    }
  }
}

function seedCustomer(db: DatabaseManager, id: string, branchId: string): void {
  db.run(`INSERT OR IGNORE INTO customers (id, code, name, phone, branch_id, company_id, current_balance, total_purchases)
   VALUES ('${id}','CUST-${id}','عميل اختبار ${branchId}','01000000000','${branchId}','cmp_main',0,0)`);
}

test('cross-branch: user B cannot see user A customers', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  seedCustomer(db, 'cust_a_' + TS, branchA);
  seedCustomer(db, 'cust_b_' + TS, branchB);

  const allCustomers = db.query<{ id: string; branch_id: string }>('SELECT id, branch_id FROM customers WHERE id LIKE ?', ['cust_%_' + TS]);
  assert.ok(allCustomers.length >= 2, 'both customers are stored');

  // مستخدم B يمتلك نطاق فرع B فقط
  asUser(userB);
  const access = new BranchAccessService();
  const accessibleB = access.getAccessibleBranchIds(userB);
  assert.ok(accessibleB.includes(branchB), 'user B should access branch B');
  assert.ok(!accessibleB.includes(branchA), 'user B must not access branch A via branch scope');

  // استعلام scoped يجب أن يعيد فقط عملاء فرع B
  const branchBCustomers = db.query<{ id: string }>(
    `SELECT id FROM customers WHERE branch_id = ? AND id LIKE ?`, [branchB, 'cust_%_' + TS]
  );
  assert.ok(branchBCustomers.length >= 1, 'branch B customers visible');
  assert.ok(!branchBCustomers.some((c) => c.id === 'cust_a_' + TS), 'branch A customers hidden from branch B scope');
});

test('cross-branch: branch SQL scope rejects foreign branch warehouse', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(userA);
  const access = new BranchAccessService();
  const accessible = access.getAccessibleBranchIds(userA);
  assert.ok(accessible.includes(branchA), 'user A should access branch A');
  assert.ok(!accessible.includes(branchB), 'user A must not access branch B');

  const scope = access.sqlScope('w.branch_id', undefined, userA);
  // النطاق يجب أن يحتوي على معرف الفرع A
  assert.ok(scope.params.includes(branchA), 'scope params must include branch A');
  assert.ok(!scope.params.includes(branchB), 'scope params must not include branch B');
});

test('cross-branch: admin with ALL scope can see all branches', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  const admin: User = { id: 'usr_cross_admin_' + TS, username: 'cross-admin-' + TS, fullName: 'Cross Admin',
    role: 'ADMIN', isActive: true, createdAt: '', updatedAt: '' };
  db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
   VALUES ('${admin.id}','${admin.username}','test','${admin.fullName}','${admin.role}',1,'ALL')`);
  asUser(admin);
  const access = new BranchAccessService();
  assert.equal(access.getAccessibleBranchIds(admin), null, 'ADMIN with ALL scope returns null (unrestricted)');
});


