import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { HrBenefitsService } from '../src/services/domains/hr/HrBenefitsService.ts';
import { EmployeeService } from '../src/services/domains/hr/EmployeeService.ts';

const q = (sql: string, params: unknown[] = []) => DatabaseManager.getInstance().query<any>(sql, params as any[]);

let employeeId = '';

test('hr benefits service manages allowances, benefits, loans, installments and settlements', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const employee = EmployeeService.create({
    name: 'موظف مزايا', location: 'اختبار', role: 'موظف', phone: '0109011001', email: '',
    baseSalary: 1000, salaryType: 'MONTHLY', status: 'ACTIVE', joinedDate: '2020-09-01',
  });
  employeeId = employee.id;

  const allowance = HrBenefitsService.createAllowance({
    employeeId, allowanceType: 'بدل سكن', amount: 200, frequency: 'MONTHLY', effectiveFrom: '2020-09-01',
  });
  assert.equal(allowance.isActive, true);
  assert.equal(HrBenefitsService.getAllowanceTotal(employeeId, '2020-09'), 200);
  assert.equal(HrBenefitsService.getAllowanceTotal(employeeId, '2020-08'), 0, 'allowance is not effective before its start date');

  const benefit = HrBenefitsService.createBenefit({
    employeeId, benefitType: 'تأمين صحي', provider: 'مزود الاختبار', policyNumber: 'POL-1',
    startDate: '2020-09-01', amount: 150,
  });
  assert.equal(benefit.status, 'ACTIVE');
  HrBenefitsService.updateBenefitStatus(benefit.id, 'EXPIRED');
  assert.equal(HrBenefitsService.getBenefits(employeeId)[0].status, 'EXPIRED');

  const loan = HrBenefitsService.createLoan({
    employeeId, principal: 300, installmentAmount: 100, startDate: '2020-09-01', notes: 'قرض اختبار',
  });
  const installments = HrBenefitsService.getInstallments(loan.id);
  assert.equal(installments.length, 3, 'a 300 loan with 100 installments splits into 3');
  assert.equal(installments.map((row) => row.amount).reduce((a, b) => a + b, 0), 300);
  assert.equal(installments[0].status, 'PENDING');
  assert.equal(HrBenefitsService.getDueInstallments(employeeId, '2020-09'), 100, 'only the September installment is due');
  assert.ok(
    q("SELECT id FROM journal_entries WHERE reference_type='HR_LOAN_DISBURSEMENT' AND reference_id=?", [`${employeeId}:${loan.id}`]).length,
    'loan disbursement posts a balanced ledger entry'
  );

  const settlement = HrBenefitsService.createLeaveSettlement({
    employeeId, leaveDays: 5, amount: 250, settlementDate: '2020-10-01',
  });
  assert.equal(settlement.status, 'PENDING');
});

test('payroll run adds monthly allowances to gross and deducts due loan installments from net', async () => {
  const run = EmployeeService.calculatePayrollRun('2020-09');
  const item = run.items.find((row) => row.employeeId === employeeId)!;
  assert.equal(item.allowanceAmount, 200, 'active monthly allowance enters the payroll gross');
  assert.equal(item.loanDeductionAmount, 100, 'the due loan installment is deducted');
  assert.equal(item.grossAmount, item.baseAmount + 200);
  assert.equal(item.netAmount, item.baseAmount + 200 - 100);
  assert.ok(item.details.loanInstallmentIds?.length === 1);
  assert.ok(item.warnings.some((w) => w.includes('بدلات')));
  assert.ok(item.warnings.some((w) => w.includes('قروض')));

  EmployeeService.approvePayrollRun(run.id);
  assert.ok(
    q("SELECT id FROM journal_entries WHERE reference_type='PAYROLL_RUN_LOAN_DEDUCTION'").length,
    'approval posts the loan deduction ledger entry'
  );

  assert.throws(
    () => EmployeeService.calculatePayrollRun('2020-09'),
    /لا يمكن إعادة احتساب/
  );

  const paid = EmployeeService.payPayrollRun(run.id);
  assert.equal(paid.status, 'PAID');
  const paidItem = paid.items.find((row) => row.employeeId === employeeId)!;
  assert.equal(paidItem.payoutStatus, 'PAID');
  const paidInstallments = q(
    'SELECT status, payroll_transaction_id AS txId FROM hr_loan_installments WHERE status = \'PAID\''
  );
  assert.equal(paidInstallments.length, 1, 'exactly the September installment is settled');
  assert.equal(paidInstallments[0].txId, paidItem.payoutTransactionId);
  const loanRow = q('SELECT remaining_balance AS remaining, status FROM hr_loans')[0];
  assert.equal(loanRow.remaining, 200, 'the remaining balance drops by the paid installment');
  assert.equal(loanRow.status, 'ACTIVE');
});

test('approved leave settlement posts a payroll bonus transaction', async () => {
  const settlement = HrBenefitsService.getLeaveSettlements(employeeId)[0];
  HrBenefitsService.approveLeaveSettlement(settlement.id);
  assert.equal(HrBenefitsService.getLeaveSettlements(employeeId)[0].status, 'APPROVED');
  const bonus = q(
    "SELECT amount, type FROM payroll_transactions WHERE employee_id = ? AND type = 'BONUS'", [employeeId]
  )[0];
  assert.ok(bonus, 'settlement approval creates a payroll bonus');
  assert.equal(Number(bonus.amount), 250);
});
