import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { EmployeeService } from '../src/services/domains/hr/EmployeeService.ts';
import { EmployeeSelfServiceService } from '../src/services/domains/hr/EmployeeSelfServiceService.ts';
import { HrBenefitsService } from '../src/services/domains/hr/HrBenefitsService.ts';
import { TrainingService } from '../src/services/domains/hr/TrainingService.ts';
import { LeaveService } from '../src/services/domains/hr/LeaveService.ts';
import type { User } from '../src/types/auth/identity.ts';

const db = DatabaseManager.getInstance();

const userA: User = { id: 'usr_ss_a', username: 'ss-employee-a', fullName: 'موظف البوابة أ', role: 'CASHIER', isActive: true, createdAt: '', updatedAt: '' };
const userB: User = { id: 'usr_ss_b', username: 'ss-employee-b', fullName: 'موظف البوابة ب', role: 'SALES', isActive: true, createdAt: '', updatedAt: '' };
const userC: User = { id: 'usr_ss_c', username: 'ss-no-employee', fullName: 'بلا ملف موظف', role: 'CASHIER', isActive: true, createdAt: '', updatedAt: '' };

const q = (sql: string, params: unknown[] = []) => db.query<any>(sql, params as any[]);

function asUser(user: User): void {
  AuthService.setCurrentUser(user);
  PermissionService.invalidate(user);
}

function insertUser(user: User, branchId: string): void {
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES (?, ?, 'test', ?, ?, 1, 'ASSIGNED')`,
    [user.id, user.username, user.fullName, user.role]
  );
  db.run('INSERT OR REPLACE INTO users_branches (user_id, branch_id) VALUES (?, ?)', [user.id, branchId]);
}

let employeeAId = '';
let employeeBId = '';
let penaltyAApprovedId = '';
let penaltyBDraftOrApprovedId = '';
let payslipItemIdA = '';

test('self-service portal shows only the linked employee own data and hides drafts and peers', async () => {
  await db.initialize();
  PermissionService.seed();
  asUser({ id: 'usr_admin', username: 'admin', fullName: 'مدير النظام', role: 'ADMIN', isActive: true, createdAt: '', updatedAt: '' });

  // موظفان مرتبطان بمستخدمين مختلفين
  const employeeA = EmployeeService.create({
    name: 'بوابة أ', phone: '0111112001', location: 'الفرع', role: 'كاشير', email: '',
    baseSalary: 3000, salaryType: 'MONTHLY', status: 'ACTIVE', joinedDate: '2021-01-01',
  });
  const employeeB = EmployeeService.create({
    name: 'بوابة ب', phone: '0111112002', location: 'الفرع', role: 'بائع', email: '',
    baseSalary: 4000, salaryType: 'MONTHLY', status: 'ACTIVE', joinedDate: '2021-01-01',
  });
  employeeAId = employeeA.id;
  employeeBId = employeeB.id;
  const branchId = employeeA.branchId || 'br_main';
  insertUser(userA, branchId);
  insertUser(userB, branchId);
  insertUser(userC, branchId);
  db.run('UPDATE employees SET user_id = ? WHERE id = ?', [userA.id, employeeAId]);
  db.run('UPDATE employees SET user_id = ? WHERE id = ?', [userB.id, employeeBId]);

  // بيانات إدارية لكل من الموظفين (حضور، إجازة، انضباط، تدريب، تقييم، مزايا)
  db.run(`INSERT INTO attendance (id, employee_id, date, status, recorded_by) VALUES ('att_a_1', ?, '2021-05-10', 'PRESENT', 'usr_admin')`, [employeeAId]);
  db.run(`INSERT INTO attendance (id, employee_id, date, status, recorded_by) VALUES ('att_a_2', ?, '2021-05-11', 'LATE', 'usr_admin')`, [employeeAId]);
  db.run(`INSERT INTO attendance (id, employee_id, date, status, recorded_by) VALUES ('att_b_1', ?, '2021-05-10', 'PRESENT', 'usr_admin')`, [employeeBId]);

  db.run(
    `INSERT INTO employee_leave_requests (id, employee_id, branch_id, leave_type, start_date, end_date, days, status, requested_by)
     VALUES ('lr_a_seed', ?, ?, 'SICK', '2021-05-20', '2021-05-21', 2, 'PENDING', 'usr_admin')`,
    [employeeAId, branchId]
  );

  db.run(`INSERT INTO hr_violations (id, employee_id, violation_type, description, occurred_at, severity, reported_by)
          VALUES ('vio_a_1', ?, 'تأخير', 'تكرار التأخير', '2021-05-12', 'MINOR', 'usr_admin')`, [employeeAId]);
  db.run(`INSERT INTO hr_warnings (id, employee_id, warning_type, issued_at, issued_by)
          VALUES ('wrn_a_1', ?, 'WRITTEN', '2021-05-13', 'usr_admin')`, [employeeAId]);
  db.run(`INSERT INTO hr_penalties (id, employee_id, penalty_type, amount, status, approved_by, approved_at, created_by)
          VALUES ('pen_a_ok', ?, 'FINANCIAL', 100, 'APPROVED', 'usr_admin', '2021-05-14', 'usr_admin')`, [employeeAId]);
  db.run(`INSERT INTO hr_penalties (id, employee_id, penalty_type, amount, status, created_by)
          VALUES ('pen_a_draft', ?, 'FINANCIAL', 500, 'DRAFT', 'usr_admin')`, [employeeAId]);
  db.run(`INSERT INTO hr_penalties (id, employee_id, penalty_type, amount, status, approved_by, approved_at, created_by)
          VALUES ('pen_b_ok', ?, 'FINANCIAL', 50, 'APPROVED', 'usr_admin', '2021-05-14', 'usr_admin')`, [employeeBId]);
  db.run(`INSERT INTO hr_complaints (id, employee_id, subject, description, status, submitted_at)
          VALUES ('cmp_b_1', ?, 'مرتب', 'مشكلة في الترتيب', 'OPEN', '2021-05-15')`, [employeeBId]);

  const course = TrainingService.createCourse({ name: 'دورة خدمة العملاء' });
  db.run(`INSERT INTO training_enrollments (id, course_id, employee_id, status, attendance_percent, score)
          VALUES ('enr_a_1', ?, ?, 'COMPLETED', 90, 85)`, [course.id, employeeAId]);

  db.run(`INSERT INTO performance_cycles (id, name, period_type, start_date, end_date, status)
          VALUES ('cyc_2021', 'دورة 2021', 'ANNUAL', '2021-01-01', '2021-12-31', 'OPEN')`);
  db.run(`INSERT INTO performance_evaluations (id, employee_id, cycle_id, evaluator_id, evaluator_type, score, rating, status, submitted_at)
          VALUES ('evl_a_1', ?, 'cyc_2021', 'usr_admin', 'MANAGER', 4.2, 'GOOD', 'SUBMITTED', '2021-07-01')`, [employeeAId]);
  db.run(`INSERT INTO performance_evaluation_items (id, evaluation_id, score, weight) VALUES ('evi_1', 'evl_a_1', 4.5, 1), ('evi_2', 'evl_a_1', 3.9, 1)`);
  db.run(`INSERT INTO performance_goals (id, employee_id, cycle_id, title, weight, target_value, status)
          VALUES ('gl_a_1', ?, 'cyc_2021', 'هدف المبيعات', 1, 10, 'OPEN')`, [employeeAId]);

  HrBenefitsService.createAllowance({ employeeId: employeeAId, allowanceType: 'بدل سكن', amount: 300, frequency: 'MONTHLY', effectiveFrom: '2021-01-01' });
  HrBenefitsService.createLoan({ employeeId: employeeAId, principal: 600, installmentAmount: 100, startDate: '2021-01-01' });

  const admin = AuthService.requireAuth();
  new LeaveService().adjustAnnualBalance({ employeeId: employeeAId, year: 2021, daysDelta: 10, transactionType: 'ALLOCATION', effectiveDate: '2021-01-01', reason: 'رصيد 2021' });
  new LeaveService().adjustAnnualBalance({ employeeId: employeeBId, year: 2021, daysDelta: 10, transactionType: 'ALLOCATION', effectiveDate: '2021-01-01', reason: 'رصيد 2021' });

  // دورة رواتب معتمدة تضم بنود الموظفين معًا — يجب أن يرى كل موظف بندَه فقط
  const run = EmployeeService.calculatePayrollRun('2021-06');
  EmployeeService.approvePayrollRun(run.id);
  const itemA = run.items.find((row) => row.employeeId === employeeAId)!;
  assert.equal(itemA.allowanceAmount, 300, 'allowance reaches the run item');
  payslipItemIdA = itemA.id;
  penaltyAApprovedId = 'pen_a_ok';
  penaltyBDraftOrApprovedId = 'pen_b_ok';
  assert.ok(admin);

  // ===== مستخدم أ (CASHIER): بياناته فقط =====
  asUser(userA);
  const profileA = EmployeeSelfServiceService.getMyProfile();
  assert.equal(profileA.employeeId, employeeAId);
  assert.equal(profileA.fullName, 'بوابة أ');

  const payslipsA = EmployeeSelfServiceService.getMyPayslips();
  assert.equal(payslipsA.length, 1, 'one approved payslip for A');
  assert.equal(payslipsA[0].id, payslipItemIdA);
  assert.equal(payslipsA[0].period, '2021-06');
  assert.equal(payslipsA[0].allowanceAmount, 300);

  const attendanceA = EmployeeSelfServiceService.getMyAttendance();
  assert.equal(attendanceA.length, 2, 'only A attendance rows');
  assert.ok(attendanceA.every((row) => row.id.startsWith('att_a_')));

  const leavesA = EmployeeSelfServiceService.getMyLeaveRequests();
  assert.equal(leavesA.length, 1);
  assert.equal(leavesA[0].id, 'lr_a_seed');

  const disciplineA = EmployeeSelfServiceService.getMyDiscipline();
  assert.equal(disciplineA.penalties.length, 1, 'DRAFT penalty hidden');
  assert.equal(disciplineA.penalties[0].id, 'pen_a_ok');
  assert.equal(disciplineA.complaints.length, 0, 'peer complaints are not visible');
  assert.equal(disciplineA.violations.length, 1);
  assert.equal(disciplineA.warnings.length, 1);

  const trainingA = EmployeeSelfServiceService.getMyTraining();
  assert.equal(trainingA.length, 1);
  assert.equal(trainingA[0].courseName, 'دورة خدمة العملاء');

  const performanceA = EmployeeSelfServiceService.getMyPerformance();
  assert.equal(performanceA.evaluations.length, 1);
  assert.equal(performanceA.evaluations[0].items.length, 2);
  assert.equal(performanceA.goals.length, 1);

  const benefitsA = EmployeeSelfServiceService.getMyBenefits();
  assert.equal(benefitsA.allowances.length, 1);
  assert.equal(benefitsA.allowances[0].amount, 300);
  assert.equal(benefitsA.loans.length, 1);
  assert.equal(benefitsA.loans[0].installments.length, 6);

  const balancesA = EmployeeSelfServiceService.getMyLeaveBalances(2021);
  assert.ok(balancesA, 'balances summary loads for the linked employee');

  // التقديم باسم أ: شكوى/تظلم/طلب عام تعمل؛ طلب الإجازة يحتاج صلاحية hr.leave.request
  const complaintA = EmployeeSelfServiceService.submitComplaint({ subject: 'بيئة العمل', description: 'مقترح تحسين' });
  assert.equal(complaintA.status, 'OPEN');
  assert.equal(q('SELECT employee_id AS employeeId FROM hr_complaints WHERE id = ?', [complaintA.id])[0].employeeId, employeeAId);

  const generalA = EmployeeSelfServiceService.submitRequest({ requestType: 'SALARY_CERTIFICATE', subject: 'شهادة راتب' });
  assert.equal(generalA.status, 'PENDING');
  assert.equal(q('SELECT employee_id AS employeeId FROM hr_self_service_requests WHERE id = ?', [generalA.id])[0].employeeId, employeeAId);

  const appealA = EmployeeSelfServiceService.submitAppeal({ referenceType: 'HR_PENALTY', referenceId: penaltyAApprovedId, reason: 'الجزاء غير عادل' });
  assert.equal(appealA.status, 'OPEN');
  assert.throws(
    () => EmployeeSelfServiceService.submitAppeal({ referenceType: 'HR_PENALTY', referenceId: penaltyBDraftOrApprovedId, reason: 'محاولة' }),
    /لا يخصّك|غير موجود/,
    'cannot appeal a peer penalty'
  );
  assert.throws(
    () => EmployeeSelfServiceService.submitAppeal({ referenceType: 'HR_PENALTY', referenceId: 'pen_a_draft', reason: 'مسودة' }),
    /لا يخصّك|غير موجود/,
    'cannot appeal a DRAFT penalty'
  );
  assert.throws(
    () => EmployeeSelfServiceService.submitLeaveRequest({ leaveType: 'ANNUAL', startDate: '2021-07-01', endDate: '2021-07-02' }),
    /صلاحية/,
    'CASHIER lacks hr.leave.request'
  );

  // ===== مستخدم ب (SALES): لا يرى بيانات أ ويستطيع طلب إجازة لنفسه =====
  asUser(userB);
  const profileB = EmployeeSelfServiceService.getMyProfile();
  assert.equal(profileB.employeeId, employeeBId);

  const payslipsB = EmployeeSelfServiceService.getMyPayslips();
  assert.equal(payslipsB.length, 1);
  assert.ok(payslipsB[0].id !== payslipItemIdA, 'peer payslip is not visible');

  const disciplineB = EmployeeSelfServiceService.getMyDiscipline();
  assert.equal(disciplineB.complaints.length, 1, 'B sees own complaint');
  assert.equal(disciplineB.penalties.length, 1);
  assert.equal(disciplineB.penalties[0].id, 'pen_b_ok');

  assert.equal(EmployeeSelfServiceService.getMyAttendance().length, 1);
  assert.equal(EmployeeSelfServiceService.getMyLeaveRequests().length, 0);
  assert.equal(EmployeeSelfServiceService.getMyRequests().length, 0);

  const leaveB = EmployeeSelfServiceService.submitLeaveRequest({ leaveType: 'ANNUAL', startDate: '2021-07-01', endDate: '2021-07-02' });
  assert.equal(leaveB.status, 'PENDING');
  assert.equal(leaveB.days, 2);
  assert.equal(
    q('SELECT employee_id AS employeeId FROM employee_leave_requests WHERE id = ?', [leaveB.id])[0].employeeId,
    employeeBId,
    'the leave request is filed under B only'
  );
  assert.equal(EmployeeSelfServiceService.getMyLeaveRequests().length, 1);

  const requestsB = EmployeeSelfServiceService.getMyRequests();
  assert.equal(requestsB.length, 0, 'A requests stay invisible to B');
});

test('self-service rejects users without a linked employee or without the portal permission', async () => {
  asUser(userC);
  assert.throws(() => EmployeeSelfServiceService.getMyProfile(), /لا يوجد ملف موظف مرتبط/);
  assert.throws(() => EmployeeSelfServiceService.getMyPayslips(), /لا يوجد ملف موظف مرتبط/);

  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES (?, 'hr.selfservice.view', 'DENY')`,
    [userC.id]
  );
  PermissionService.invalidate(userC);
  asUser(userC);
  db.run('UPDATE employees SET user_id = ? WHERE id = ?', [userC.id, employeeBId]);
  assert.throws(() => EmployeeSelfServiceService.getMyProfile(), /غير مصرح/);
  db.run('UPDATE employees SET user_id = ? WHERE id = ?', [userB.id, employeeBId]);
  db.run("DELETE FROM user_permissions WHERE user_id = ? AND permission_code = 'hr.selfservice.view'", [userC.id]);
  PermissionService.invalidate(userC);
});
