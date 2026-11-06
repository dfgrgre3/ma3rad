import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { AuditService } from '../src/services/AuditService.ts';
import { CashierService } from '../src/services/CashierService.ts';
import { CustomerService } from '../src/services/CustomerService.ts';
import { CustomerSupplyService } from '../src/services/CustomerSupplyService.ts';
import { EmployeeService } from '../src/services/EmployeeService.ts';
import { PermissionService, ROLE_DEFAULTS } from '../src/services/PermissionService.ts';
import { ROUTE_PERMISSIONS } from '../src/config/routePermissions.ts';
import { NAV_GROUPS_01 } from '../src/config/navigationGroups01.ts';
import { NAV_GROUPS_02 } from '../src/config/navigationGroups02.ts';
import { NavigationService } from '../src/services/NavigationService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import { SupplierService } from '../src/services/SupplierService.ts';
import { SystemDiagnosticsService } from '../src/services/SystemDiagnosticsService.ts';

function q(sql: string, params: any[] = []): any[] {
  return DatabaseManager.getInstance().query(sql, params);
}

function makeUser(db: DatabaseManager, id: string, role: string): any {
  db.run(
    'INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    [id, id, 'test-only', id, role]
  );
  return { id, username: id, fullName: id, role, phone: null, isActive: true, createdAt: '', updatedAt: '' };
}

test('finance navigation separates calendar viewing from close access', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  const role = PermissionService.createRole({ code: 'test_finance_close_only', name: 'Finance close only test' }, admin);
  PermissionService.setRolePermissions(role.code, ['finance.close'], admin);
  const closeOnly = makeUser(db, 'usr_finance_close_only_test', role.code);

  try {
    const calendarRoute = ROUTE_PERMISSIONS.find(({ path }) => path === '/finance/calendar');
    const fiscalCloseRoute = ROUTE_PERMISSIONS.find(({ path }) => path === '/finance/fiscal-closing');
    const financeGroupDefinition = NAV_GROUPS_01.find(({ id }) => id === 'finance');
    const accessibleFinanceGroup = NavigationService.getAccessibleGroups(closeOnly).find(({ id }) => id === 'finance');

    assert.deepEqual(calendarRoute?.all, ['finance.view']);
    assert.deepEqual(fiscalCloseRoute?.any, ['finance.view', 'finance.close']);
    assert.deepEqual(financeGroupDefinition?.anyPerms, ['finance.view', 'finance.close']);
    assert.equal(accessibleFinanceGroup?.items.some(({ to }) => to === '/finance/fiscal-closing'), true);
    assert.equal(accessibleFinanceGroup?.items.some(({ to }) => to === '/finance/calendar'), false);
  } finally {
    db.run('DELETE FROM users WHERE id = ?', [closeOnly.id]);
    PermissionService.deleteRole(role.id, admin);
  }
});

test('permissions: admin has everything, limited role is denied, override grants and denies', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const admin = AuthService.login('admin', 'admin123');
  assert.equal(PermissionService.can(admin, 'sales.create'), true);
  assert.equal(PermissionService.can(admin, 'roles.manage'), true);
  assert.equal(PermissionService.can(null, 'sales.create'), false);

  // a custom role with a single permission
  const role = PermissionService.createRole({ code: 'test_viewer', name: 'عارض اختبار' }, admin);
  PermissionService.setRolePermissions(role.code, ['reports.view'], admin);

  const limited = makeUser(db, 'usr_limited_test', role.code);
  assert.equal(PermissionService.can(limited, 'reports.view'), true);
  assert.equal(PermissionService.can(limited, 'sales.create'), false);
  assert.throws(() => PermissionService.require(limited, 'sales.create'), /غير مصرح/);

  // wildcard: granting sales.* grants every sales permission
  PermissionService.setRolePermissions(role.code, ['sales.*'], admin);
  PermissionService.invalidate(limited);
  assert.equal(PermissionService.can(limited, 'sales.create'), true);
  assert.equal(PermissionService.can(limited, 'sales.refund'), true);

  // user-level DENY override beats the role (explicit role codes, no wildcard)
  PermissionService.setRolePermissions(role.code, ['sales.create', 'sales.refund'], admin);
  PermissionService.setUserOverride(limited.id, 'sales.refund', 'DENY', admin);
  PermissionService.invalidate(limited);
  assert.equal(PermissionService.can(limited, 'sales.refund'), false);
  assert.equal(PermissionService.can(limited, 'sales.create'), true);

  PermissionService.clearUserOverrides(limited.id, admin);
});

test('permissions: user-level DENY beats role wildcards (sales.* and *)', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  assert.equal(q('SELECT pin_code FROM users WHERE id = ?', ['usr_admin'])[0]?.pinCode ?? null, null);
  const admin = AuthService.login('admin', 'admin123');

  const role = PermissionService.createRole({ code: 'test_wildcard', name: 'اختبار wildcard' }, admin);
  const w = makeUser(db, 'usr_wildcard_test', role.code);

  // role grants sales.* — user DENY on one code must win
  PermissionService.setRolePermissions(role.code, ['sales.*'], admin);
  PermissionService.setUserOverride(w.id, 'sales.refund', 'DENY', admin);
  PermissionService.invalidate(w);
  assert.equal(PermissionService.can(w, 'sales.create'), true);
  assert.equal(PermissionService.can(w, 'sales.refund'), false);

  // module-wide DENY (sales.*) beats the role wildcard too
  PermissionService.setUserOverride(w.id, 'sales.*', 'DENY', admin);
  PermissionService.invalidate(w);
  assert.equal(PermissionService.can(w, 'sales.create'), false);
  assert.equal(PermissionService.can(w, 'sales.refund'), false);

  // global DENY (*) blocks everything the role grants
  PermissionService.setUserOverride(w.id, 'sales.*', 'GRANT', admin);
  PermissionService.setUserOverride(w.id, '*', 'DENY', admin);
  PermissionService.invalidate(w);
  assert.equal(PermissionService.can(w, 'sales.create'), false);

  PermissionService.clearUserOverrides(w.id, admin);
  db.run('DELETE FROM users WHERE id = ?', [w.id]);
  PermissionService.deleteRole(role.id, admin);
});

test('permissions: supplier financial statements require finance debt access', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  const role = PermissionService.createRole({ code: 'supplier_statement_viewer', name: 'عارض موردين' }, admin);
  PermissionService.setRolePermissions(role.code, ['suppliers.view', 'suppliers.update'], admin);
  const limited = makeUser(db, 'usr_supplier_statement_viewer', role.code);
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync('test-password', 10), limited.id]);

  try {
    AuthService.login(limited.username, 'test-password');
    const suppliers = new SupplierService();
    assert.throws(() => suppliers.getSupplierStatement('supplier_missing'), /غير مصرح/);
    assert.throws(() => suppliers.getInvoicesWithAllocations('supplier_missing'), /غير مصرح/);
    assert.throws(() => suppliers.getPaymentsWithAllocations('supplier_missing'), /غير مصرح/);
    assert.throws(() => suppliers.updateSupplier('supplier_missing', { isActive: 0 }), /غير مصرح/);
  } finally {
    AuthService.login('admin', 'admin123');
    db.run('DELETE FROM users WHERE id = ?', [limited.id]);
    PermissionService.deleteRole(role.id, admin);
  }
});

test('permissions: manager defaults exclude full-access privileges, including legacy seeded grants', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  const defaultPermissions = PermissionService.getRolePermissions('MANAGER');
  assert.ok(defaultPermissions.includes('sales.create'));
  assert.ok(defaultPermissions.includes('approvals.approve'));
  assert.ok(defaultPermissions.includes('customers.payment.reverse'));
  assert.ok(defaultPermissions.includes('cashier.expense.update'));
  assert.ok(!defaultPermissions.includes('cashier.expense.delete'));
  for (const permission of [
    'roles.manage', 'users.create', 'users.update', 'users.delete',
    'users.reset_password', 'users.permissions', 'settings.update',
    'settings.backup', 'products.delete',
    'admin.data.delete',
  ]) {
    assert.ok(!defaultPermissions.includes(permission), `manager must not have ${permission}`);
  }

  db.run('DELETE FROM role_permissions WHERE role_code = ?', ['MANAGER']);
  for (const permission of PermissionService.getCatalog().map((row) => row.code)) {
    db.run('INSERT INTO role_permissions (role_code, permission_code) VALUES (?, ?)', ['MANAGER', permission]);
  }
  PermissionService.seed();
  assert.deepEqual(
    PermissionService.getRolePermissions('MANAGER').sort((a, b) => a.localeCompare(b)),
    defaultPermissions.sort((a, b) => a.localeCompare(b))
  );
});

test('permissions: reverse, expense mutation, and shift closing require their dedicated grants', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  const role = PermissionService.createRole({ code: 'test_action_limits', name: 'اختبار حدود العمليات' }, admin);
  PermissionService.setRolePermissions(role.code, [
    'customers.payment',
    'cashier.expense',
    'cashier.shift.open',
  ], admin);
  const limited = makeUser(db, 'usr_action_limits_test', role.code);
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync('test-password', 4), limited.id]);

  try {
    AuthService.login(limited.username, 'test-password');
    assert.throws(() => new CustomerService().deletePayment('missing'), /customers\.payment\.reverse/);
    assert.throws(() => new SalesService().deleteInvoicePayment('missing'), /customers\.payment\.reverse/);
    assert.throws(() => new CashierService().updateExpense('missing', {
      category: 'OTHER',
      amount: 1,
      description: 'Expense',
      paymentType: 'CASH',
    }), /cashier\.expense\.update/);
    assert.throws(() => new CashierService().deleteExpense('missing'), /cashier\.expense\.delete/);
    assert.throws(() => new CashierService().closeShift('missing', 0), /cashier\.shift\.close/);
  } finally {
    AuthService.logout();
    AuthService.login('admin', 'admin123');
    db.run('DELETE FROM users WHERE id = ?', [limited.id]);
    PermissionService.deleteRole(role.id, admin);
  }
});

test('permissions: system health view works alone and maintenance actions require health management', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  const role = PermissionService.createRole({ code: 'test_system_health_guard', name: 'System health guard test' }, admin);
  PermissionService.setRolePermissions(role.code, ['settings.health.view'], admin);
  const limited = makeUser(db, 'usr_system_health_guard_test', role.code);
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync('test-password', 4), limited.id]);
  const routeRule = ROUTE_PERMISSIONS.find(({ path }) => path === '/system-health');
  const routePermissions = NavigationService.getRequiredPermissionGroups('/system-health');
  const healthNavigationItem = NAV_GROUPS_02.flatMap(({ items }) => items)
    .find(({ to }) => to === '/system-health');

  try {
    assert.ok(routeRule);
    assert.deepEqual(routeRule.all, ['settings.health.view']);
    assert.deepEqual(routeRule.any, undefined);
    assert.deepEqual(routePermissions, { all: ['settings.health.view'], any: [] });
    assert.equal(healthNavigationItem?.perm, 'settings.health.view');
    assert.equal(PermissionService.getCatalog().some(({ code }) => code === 'settings.health.view'), true);

    AuthService.logout();
    AuthService.login(limited.username, 'test-password');
    assert.equal(PermissionService.can(limited, routePermissions!.all[0]), true);
    assert.equal(PermissionService.can(limited, 'settings.maintenance'), false);
    assert.ok(new SystemDiagnosticsService().runDiagnostics().checks.length > 0);
    await new SystemDiagnosticsService().getRuntimeDiagnostics();
    assert.throws(() => new SystemDiagnosticsService().vacuum(), /settings\.health\.manage/);
    assert.throws(() => new SystemDiagnosticsService().reindex(), /settings\.health\.manage/);

    AuthService.logout();
    AuthService.login('admin', 'admin123');
    PermissionService.setRolePermissions(role.code, ['settings.health.manage'], admin);
    AuthService.logout();
    AuthService.login(limited.username, 'test-password');
    assert.equal(PermissionService.can(limited, 'settings.health.manage'), true);
    new SystemDiagnosticsService().vacuum();
    new SystemDiagnosticsService().reindex();
  } finally {
    AuthService.logout();
    AuthService.login('admin', 'admin123');
    db.run('DELETE FROM users WHERE id = ?', [limited.id]);
    PermissionService.deleteRole(role.id, admin);
  }
});

test('system diagnostics report measured database checks and mark unavailable desktop metrics honestly', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const service = new SystemDiagnosticsService();
  const report = service.runDiagnostics();
  assert.equal(report.checks.find((check) => check.key === 'sqlite_integrity')?.status, 'PASS');
  assert.equal(report.checks.find((check) => check.key === 'core_tables')?.status, 'PASS');
  assert.ok(report.totalTables > 0);
  assert.ok(report.databaseSizeBytes > 0);
  assert.ok(report.querySpeedMs >= 0);

  const runtime = await service.getRuntimeDiagnostics(report.timestamp);
  assert.equal(runtime.system, null);
  assert.equal(runtime.databaseFile.available, false);
  assert.equal(runtime.checks.find((check) => check.key === 'system_resources')?.status, 'WARN');
  assert.equal(runtime.checks.find((check) => check.key === 'database_persistence')?.status, 'WARN');
  assert.equal(runtime.checks.find((check) => check.key === 'backup_health')?.status, 'WARN');
  assert.equal(
    runtime.history[runtime.history.length - 1]?.checks.length,
    report.checks.length + runtime.checks.length,
  );
});

test('permissions: audit reads require audit.view inside the service', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  const role = PermissionService.createRole({ code: 'test_audit_read_guard', name: 'Audit read guard test' }, admin);
  PermissionService.setRolePermissions(role.code, ['admin.view'], admin);
  const limited = makeUser(db, 'usr_audit_read_guard_test', role.code);
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync('test-password', 4), limited.id]);

  try {
    AuthService.logout();
    AuthService.login(limited.username, 'test-password');
    assert.throws(() => new AuditService().getAuditLogs({ page: 1, pageSize: 8 }), /audit\.view/);
  } finally {
    AuthService.logout();
    AuthService.login('admin', 'admin123');
    db.run('DELETE FROM users WHERE id = ?', [limited.id]);
    PermissionService.deleteRole(role.id, admin);
  }
});

test('permissions: customer reads and supply requests require their view grants', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  const role = PermissionService.createRole({ code: 'test_customer_read_limits', name: 'اختبار قراءة العملاء' }, admin);
  PermissionService.setRolePermissions(role.code, ['reports.view'], admin);
  const limited = makeUser(db, 'usr_customer_read_limits_test', role.code);
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync('test-password', 4), limited.id]);

  try {
    AuthService.login(limited.username, 'test-password');
    const customers = new CustomerService();
    assert.throws(() => customers.getAllCustomers(), /customers\.view/);
    assert.throws(() => customers.getCustomersPage(), /customers\.view/);
    assert.throws(() => customers.getCustomerById('missing'), /customers\.view/);
    assert.throws(() => customers.getCustomerStatement('missing'), /sales\.view/);
    assert.throws(() => new CustomerSupplyService().getOpenRequests(), /sales\.view/);
  } finally {
    AuthService.logout();
    AuthService.login('admin', 'admin123');
    db.run('DELETE FROM users WHERE id = ?', [limited.id]);
    PermissionService.deleteRole(role.id, admin);
  }
});

test('permissions: payroll access is separate from employee directory and financial details', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  const role = PermissionService.createRole({ code: 'test_payroll_read_split', name: 'Payroll read split test' }, admin);
  PermissionService.setRolePermissions(role.code, ['employees.view', 'employees.payroll.view', 'branches.access_all'], admin);
  const limited = makeUser(db, 'usr_payroll_read_split_test', role.code);
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync('test-password', 4), limited.id]);
  db.run("UPDATE users SET branch_scope = 'ALL' WHERE id = ?", [limited.id]);

  AuthService.logout();
  AuthService.login(limited.username, 'test-password');

  try {
    assert.deepEqual(EmployeeService.getTransactions(), []);
    assert.throws(() => EmployeeService.getEmployeeFinancials('missing'), /employees\.financials\.view/);
  } finally {
    AuthService.logout();
    AuthService.login('admin', 'admin123');
    db.run('DELETE FROM users WHERE id = ?', [limited.id]);
    PermissionService.deleteRole(role.id, admin);
  }
});

test('permissions: destructive data deletion is limited to ADMIN across built-in role defaults', () => {
  for (const [role, permissions] of Object.entries(ROLE_DEFAULTS)) {
    assert.equal(permissions.includes('admin.data.delete'), role === 'ADMIN', `${role} deletion grant`);
  }
  assert.ok(ROLE_DEFAULTS.MANAGER.includes('admin.data.export'));
  assert.ok(!ROLE_DEFAULTS.MANAGER.includes('admin.data.delete'));
});

test('auth: wrong password fails, and repeated failures lock the account for 15 minutes', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  // wrong password
  assert.throws(() => AuthService.login('admin', 'wrong-pass'), /غير صحيحة/);

  // enable lockout at 3 attempts
  db.run(`UPDATE system_settings SET value = '3' WHERE key = 'maxFailedLoginAttempts'`);
  try {
    q(`DELETE FROM login_history WHERE username_attempted = 'admin'`);
    for (let i = 0; i < 3; i++) {
      assert.throws(() => AuthService.login('admin', 'wrong-pass'), /غير صحيحة/);
    }
    assert.throws(() => AuthService.login('admin', 'admin123'), /إيقاف المحاولات/);
  } finally {
    // reset the lockout window so other tests are not affected
    q(`DELETE FROM login_history WHERE username_attempted = 'admin'`);
    db.run(`UPDATE system_settings SET value = '0' WHERE key = 'maxFailedLoginAttempts'`);
  }
  const user = AuthService.login('admin', 'admin123');
  assert.equal(user.username, 'admin');
});

test('auth: PIN hashes stay private, actor arguments are ignored, and own-password changes are account-bound', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  const auth = new AuthService();
  const created = auth.createUser({
    username: 'pin_hash_test',
    password: 'TestPass123!',
    fullName: 'PIN hash test',
    role: 'CASHIER',
    pinCode: '2468',
  });

  const stored = q('SELECT pin_code AS pinCode FROM users WHERE id = ?', [created.id])[0];
  assert.match(stored.pinCode, /^\$2[aby]\$/);
  assert.equal(bcrypt.compareSync('2468', stored.pinCode), true);
  assert.equal(Object.prototype.hasOwnProperty.call(auth.getAllUsers().find((user) => user.id === created.id) || {}, 'pinCode'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(auth.getUserById(created.id) || {}, 'pinCode'), false);
  assert.throws(
    () => auth.changeOwnPassword(created.id, 'test-password', 'new-password'),
    /حسابك الحالي فقط/
  );

  AuthService.logout();
  const forgedAdmin = { ...admin, id: 'forged-admin', role: 'ADMIN' };
  assert.throws(
    () => auth.createUser({
      username: 'forged_actor_test',
      password: 'TestPass123!',
      fullName: 'forged actor',
      role: 'CASHIER',
    }, 'usr_admin', forgedAdmin),
    /يجب تسجيل الدخول/
  );

  db.run('DELETE FROM users WHERE id = ?', [created.id]);
  AuthService.login('admin', 'admin123');
});

test('auth: createUser enforces the same password policy as password changes', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  const auth = new AuthService();

  try {
    db.run(`DELETE FROM users WHERE username = ?`, ['weak_password_user']);
    assert.throws(
      () => auth.createUser({
        username: 'weak_password_user',
        password: 'short1',
        fullName: 'Weak password user',
        role: 'CASHIER',
      }, 'usr_admin', admin),
      /8|حروف|يجب/
    );
    assert.equal(db.query(`SELECT id FROM users WHERE username = ?`, ['weak_password_user']).length, 0);
  } finally {
    db.run(`DELETE FROM users WHERE username = ?`, ['weak_password_user']);
    AuthService.logout();
  }
});
