import './integration.setup.ts';
import { test } from 'node:test';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { HrDisciplineService } from '../src/services/domains/hr/HrDisciplineService.ts';
import { EmployeeService } from '../src/services/domains/hr/EmployeeService.ts';

test('debug penalty', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const employee = EmployeeService.create({ name: 'موظف جزاء', location: 'اختبار', role: 'موظف', phone: '0109000077', email: '', baseSalary: 1000, salaryType: 'MONTHLY', status: 'ACTIVE', joinedDate: '2020-08-01' });
  const penalty = HrDisciplineService.createPenalty({ employeeId: employee.id, amount: 50, notes: 'اختبار' });
  HrDisciplineService.approvePenalty(penalty.id);
  console.log('penalties raw', JSON.stringify(db.query("SELECT * FROM hr_penalties WHERE id = ?", [penalty.id])));
  console.log('cols', JSON.stringify(db.query("PRAGMA table_info(hr_penalties)")));
});
