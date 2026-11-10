import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { EmployeeService } from '../src/services/domains/hr/EmployeeService.ts';
import { PayrollTaxService } from '../src/services/domains/hr/PayrollTaxService.ts';

function q(sql: string, params: any[] = []): any[] {
  return DatabaseManager.getInstance().query(sql, params);
}

async function bootstrap() {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  return db;
}

test('payroll tax engine calculates progressive brackets, exemptions and dependents', async () => {
  await bootstrap();
  const companyId = q('SELECT company_id AS companyId FROM branches WHERE id = ?', ['br_main'])[0].companyId;
  const rule = PayrollTaxService.saveRule({
    name: 'ضريبة 2020',
    taxableBasis: 'GROSS',
    effectiveFrom: '2020-01-01',
    dependentAllowance: 500,
    isActive: true,
    brackets: [
      { lowerLimit: 0, upperLimit: 5000, ratePercent: 0 },
      { lowerLimit: 5000, upperLimit: 10000, ratePercent: 10 },
      { lowerLimit: 10000, upperLimit: null, ratePercent: 20 },
    ],
  });
  assert.equal(rule.brackets.length, 3);
  assert.equal(rule.companyId, companyId);

  const employee = EmployeeService.create({
    name: 'موظف ضريبة',
    location: 'اختبار',
    role: 'موظف',
    phone: '0109000010',
    email: '',
    baseSalary: 10000,
    salaryType: 'MONTHLY',
    status: 'ACTIVE',
    joinedDate: '2020-08-01',
    taxExemptionAmount: 1000,
    taxDependents: 1,
  });
  const exemptEmployee = EmployeeService.create({
    name: 'موظف معفى',
    location: 'اختبار',
    role: 'موظف',
    phone: '0109000011',
    email: '',
    baseSalary: 10000,
    salaryType: 'MONTHLY',
    status: 'ACTIVE',
    joinedDate: '2020-08-01',
    taxExempt: true,
  });

  const run = EmployeeService.calculatePayrollRun('2020-08');
  const item = run.items.find((row) => row.employeeId === employee.id)!;
  assert.equal(item.taxAmount, 350, 'progressive tax on 8,500 taxable income');
  assert.equal(item.details.taxRuleName, 'ضريبة 2020');
  assert.equal(item.details.taxableAmount, 8500);
  assert.equal(item.details.taxExemptionAmount, 1500);
  assert.equal(item.details.taxDependents, 1);
  assert.equal(item.details.taxBreakdown?.length, 2);
  const exemptItem = run.items.find((row) => row.employeeId === exemptEmployee.id)!;
  assert.equal(exemptItem.taxAmount, 0);
  assert.equal(exemptItem.details.taxSource, 'EXEMPT');

  assert.throws(
    () => PayrollTaxService.saveRule({
      name: 'متداخلة',
      effectiveFrom: '2020-06-01',
      effectiveTo: '2020-09-30',
      isActive: true,
      brackets: [{ lowerLimit: 0, upperLimit: null, ratePercent: 5 }],
    }),
    /توجد قاعدة ضريبة نشطة متداخلة/
  );
});

test('payroll tax engine falls back to the legacy flat rate when no rule exists', async () => {
  const db = await bootstrap();
  // Deactivate all rules created by seed/default installations.
  db.run('UPDATE payroll_tax_rules SET is_active = 0');
  const calculation = PayrollTaxService.calculate({
    employeeId: 'missing',
    companyId: 'cmp_main',
    date: '2020-08-31',
    grossAmount: 10000,
    baseAmount: 10000,
    legacyRate: 5,
  });
  assert.equal(calculation.source, 'LEGACY_FLAT');
  assert.equal(calculation.taxAmount, 500);
  assert.equal(calculation.ruleId, null);
});
