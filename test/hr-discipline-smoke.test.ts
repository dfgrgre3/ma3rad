import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { HrDisciplineService } from '../src/services/domains/hr/HrDisciplineService.ts';

async function bootstrap() {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  return db;
}

test('hr discipline service manages violations, warnings, penalties, complaints, appeals and attachments', async () => {
  await bootstrap();
  const employee = (await import('../src/services/domains/hr/EmployeeService.ts')).EmployeeService.create({
    name: 'موظف جزاء', location: 'اختبار', role: 'موظف', phone: '0109000077', email: '',
    baseSalary: 1000, salaryType: 'MONTHLY', status: 'ACTIVE', joinedDate: '2020-08-01',
  });
  const empId = employee.id;
  const violation = HrDisciplineService.createViolation({ employeeId: empId, violationType: 'تأخير', occurredAt: '2020-08-01', severity: 'MINOR' });
  HrDisciplineService.closeViolation(violation.id);
  const warning = HrDisciplineService.issueWarning({ employeeId: empId, warningType: 'WRITTEN', issuedAt: '2020-08-02', notes: 'اختبار' });
  HrDisciplineService.cancelWarning(warning.id);
  const penalty = HrDisciplineService.createPenalty({ employeeId: empId, amount: 50, notes: 'اختبار' });
  HrDisciplineService.requestPenaltyApproval(penalty.id);
  HrDisciplineService.approvePenalty(penalty.id);
  const approved = HrDisciplineService.getPenalties(empId)[0];
  assert.equal(approved.status, 'POSTED');
  assert.ok(approved.payrollTransactionId);
  const complaint = HrDisciplineService.createComplaint({ employeeId: empId, subject: 'شكوى اختبار', description: 'وصف' });
  HrDisciplineService.resolveComplaint(complaint.id, 'تم الحل');
  const appeal = HrDisciplineService.createAppeal({ referenceType: 'HR_PENALTY', referenceId: penalty.id, employeeId: empId, reason: 'اعتراض' });
  HrDisciplineService.decideAppeal(appeal.id, true, 'قبول');
  const attachment = HrDisciplineService.addAttachment({ referenceType: 'HR_VIOLATION', referenceId: violation.id, fileName: 'test.txt' });
  assert.ok(attachment.id);
});
