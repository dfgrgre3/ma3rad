import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { EmployeeOrganizationService } from '../src/services/domains/hr/EmployeeOrganizationService.ts';

async function bootstrap() {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  return db;
}

test('hr organization service manages structure, grades, cost centers, transfers and lifecycle', async () => {
  await bootstrap();
  const service = new EmployeeOrganizationService();
  const department = service.createDepartment({ name: 'قسم اختبار' });
  service.updateDepartmentStructure(department.id, { requiredHeadcount: 2 });
  const grade = service.createJobGrade({ name: 'درجة اختبار', level: 1, minSalary: 100, maxSalary: 200 });
  const costCenter = service.createCostCenter({ code: 'CC1', name: 'مركز اختبار' });
  assert.ok(service.getOrgTree().length >= 1);
  assert.ok(service.getVacancies().some((row) => row.departmentId === department.id));
  const employee = (await import('../src/services/domains/hr/EmployeeService.ts')).EmployeeService.create({
    name: 'موظف نقل', location: 'اختبار', role: 'موظف', phone: '0109000099', email: '',
    baseSalary: 1000, salaryType: 'MONTHLY', status: 'ACTIVE', joinedDate: '2020-08-01',
  });
  const transfer = service.transferEmployee({
    employeeId: employee.id,
    toDepartmentId: department.id,
    toJobTitle: 'موظف نقل',
    toGradeId: grade.id,
    transferDate: '2020-08-15',
    reason: 'اختبار',
  });
  assert.equal(transfer.employeeId, employee.id);
  assert.ok(service.getTransfers(employee.id).length >= 1);
  const event = service.addLifecycleEvent({
    employeeId: employee.id,
    eventType: 'PROMOTION',
    eventDate: '2020-08-20',
    fromValue: 'موظف',
    toValue: 'مشرف',
    notes: 'اختبار',
  });
  assert.equal(event.eventType, 'PROMOTION');
  assert.ok(service.getLifecycleEvents(employee.id).length >= 1);
  service.deactivateJobGrade(grade.id);
  service.deactivateCostCenter(costCenter.id);
});
