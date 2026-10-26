import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { postLedgerEntry } from '../src/database/ledger.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { AccountingService } from '../src/services/AccountingService.ts';
import { FinancialStatementsService } from '../src/services/FinancialStatementsService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { SalesFinancialReconciliationService } from '../src/services/SalesFinancialReconciliationService.ts';
import { CommissionService } from '../src/services/CommissionService.ts';
import { EmployeeService } from '../src/services/EmployeeService.ts';
import type { User } from '../src/types/identity.ts';

test('financial statements only include assigned-branch ledger entries', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  PermissionService.seed();
  manager.run(`
    INSERT INTO branches (id, code, name, is_main, is_active)
    VALUES ('br_ledger_a', 'LEDGER-A', 'Ledger A', 0, 1),
           ('br_ledger_b', 'LEDGER-B', 'Ledger B', 0, 1)
  `);
  manager.run(`
    INSERT INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
    VALUES ('usr_ledger_a', 'ledger-a', 'test', 'Ledger A User', 'SALES', 1, 'ASSIGNED')
  `);
  manager.run("INSERT INTO users_branches (user_id, branch_id) VALUES ('usr_ledger_a', 'br_ledger_a')");
  manager.run(`
    INSERT INTO user_permissions (user_id, permission_code, effect)
    VALUES ('usr_ledger_a', 'finance.view', 'GRANT'),
           ('usr_ledger_a', 'finance.close', 'GRANT'),
           ('usr_ledger_a', 'finance.debts.view', 'GRANT'),
           ('usr_ledger_a', 'employees.view', 'GRANT'),
           ('usr_ledger_a', 'employees.manage', 'GRANT')
  `);
  manager.run(`
    INSERT INTO employees (id, code, full_name, phone, job_title, hired_at, branch_id, commission_percentage, is_active)
    VALUES ('emp_ledger_a', 'EMP-LEDGER-A', 'Employee A', '0100000001', 'Sales', '2030-01-01', 'br_ledger_a', 5, 1),
           ('emp_ledger_b', 'EMP-LEDGER-B', 'Employee B', '0100000002', 'Sales', '2030-01-01', 'br_ledger_b', 5, 1)
  `);
  manager.run(`
    INSERT INTO commissions
      (id, employee_id, source_type, source_id, period_month, branch_id, base_amount, percentage, commission_amount, status, created_by)
    VALUES ('com_ledger_a', 'emp_ledger_a', 'MANUAL', NULL, '2037-05', 'br_ledger_a', 100, 5, 5, 'PENDING', 'usr_ledger_a'),
           ('com_ledger_b', 'emp_ledger_b', 'MANUAL', NULL, '2037-05', 'br_ledger_b', 200, 5, 10, 'PENDING', 'usr_ledger_a')
  `);
  manager.run(`
    INSERT INTO payroll_transactions (id, employee_id, type, amount, date, created_by, branch_id)
    VALUES ('pay_ledger_a', 'emp_ledger_a', 'BONUS', 10, '2037-05-14', 'usr_ledger_a', 'br_ledger_a'),
           ('pay_ledger_b', 'emp_ledger_b', 'BONUS', 20, '2037-05-14', 'usr_ledger_a', 'br_ledger_b')
  `);
  const user: User = {
    id: 'usr_ledger_a',
    username: 'ledger-a',
    fullName: 'Ledger A User',
    role: 'SALES',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  PermissionService.invalidate(user);

  manager.executeTransaction(() => {
    for (const entry of [
      { id: 'branch_a', branchId: 'br_ledger_a', amount: 100 },
      { id: 'branch_b', branchId: 'br_ledger_b', amount: 200 },
      { id: 'unassigned', branchId: null, amount: 300 },
    ]) {
      postLedgerEntry(manager.getDatabase(), {
        date: '2037-05-14',
        description: `Branch ledger report ${entry.id}`,
        referenceType: 'BRANCH_LEDGER_REPORT_TEST',
        referenceId: entry.id,
        createdBy: user.id,
        branchId: entry.branchId,
        lines: [
          { accountCode: '1101', debit: entry.amount, credit: 0 },
          { accountCode: '4101', debit: 0, credit: entry.amount },
        ],
      });
    }
  });

  AuthService.setCurrentUser(user);
  try {
    const service = new FinancialStatementsService();
    const cashFlow = service.getCashFlow('2037-05-14', '2037-05-14');
    assert.equal(cashFlow.totals.inflows, 100);
    assert.equal(cashFlow.totals.net, 100);
    assert.equal(new AccountingService().getProfitAndLossReport('2037-05-14', '2037-05-14').revenue, 100);

    const cashAccount = manager.query<{ id: string }>(
      "SELECT id FROM chart_of_accounts WHERE code = '1101'"
    )[0];
    assert.ok(cashAccount);
    const ledger = service.getGeneralLedger(cashAccount.id, '2037-05-14', '2037-05-14');
    assert.equal(ledger.lines.length, 1);
    assert.equal(ledger.lines[0].debit, 100);
    assert.match(service.getBranchScopeWarning() || '', /1 قيد محاسبي غير منسوب/);

    const reconciliation = new SalesFinancialReconciliationService();
    const checks = reconciliation.getReconciliation('2037-05-14', '2037-05-14');
    assert.equal(checks.length, 5);
    assert.equal(checks.find(check => check.key === 'cash')?.ledger, 100);
    assert.equal(reconciliation.getLatestClosure('2037-05-14', '2037-05-14'), null);
    assert.throws(
      () => reconciliation.closeReconciliation('2037-05-14', '2037-05-14', {}),
      /متاح للصلاحيات المركزية فقط/
    );

    assert.deepEqual(new CommissionService().getCommissions().map(commission => commission.id), ['com_ledger_a']);
    assert.deepEqual(new CommissionService().getStats('2037-05').pending, 1);
    assert.deepEqual(new CommissionService().getSalesReps().map(rep => rep.id), ['emp_ledger_a']);
    assert.throws(
      () => new CommissionService().setStatus('com_ledger_b', 'APPROVED'),
      /ليس لديك صلاحية الوصول/
    );
    assert.deepEqual(EmployeeService.getAll().map(employee => employee.id), ['emp_ledger_a']);
    assert.deepEqual(EmployeeService.getTransactions().map(transaction => transaction.id), ['pay_ledger_a']);
    assert.throws(
      () => EmployeeService.addTransaction({
        employeeId: 'emp_ledger_b', type: 'BONUS', amount: 5, date: '2037-05-14', notes: 'out of scope',
      }),
      /ليس لديك صلاحية الوصول/
    );
  } finally {
    AuthService.logout();
  }
});
