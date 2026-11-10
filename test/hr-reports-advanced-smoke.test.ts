import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { EmployeeService } from '../src/services/domains/hr/EmployeeService.ts';
import { ReportCenterService } from '../src/services/domains/reports/ReportCenterService.ts';
import { runReport, REPORT_DEFINITIONS } from '../src/pages/reports/reports-hub/reportCatalog.ts';

const db = DatabaseManager.getInstance();
const q = (sql: string, params: unknown[] = []) => db.query<any>(sql, params as any[]);

test('advanced hr/performance/production/sales reports return structured results', async () => {
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const employee = EmployeeService.create({
    name: 'مندوب التقارير', phone: '0110000999', location: 'الفرع', role: 'بائع', email: '',
    baseSalary: 4000, salaryType: 'MONTHLY', status: 'ACTIVE', joinedDate: '2021-01-01',
  });
  const employeeId = employee.id;
  // حقول المندوب تُضبط مباشرة (create لا يقبلها).
  db.run('UPDATE employees SET is_sales_rep = 1, commission_percentage = 3, monthly_target = 10000 WHERE id = ?', [employeeId]);

  // أداء: دورة + تقييم + هدف + خطة تحسين
  q(`INSERT INTO performance_cycles (id, name, period_type, start_date, end_date, status)
     VALUES ('cyc_adv', 'دورة التقارير', 'ANNUAL', '2021-01-01', '2021-12-31', 'OPEN')`);
  q(`INSERT INTO performance_evaluations (id, employee_id, cycle_id, evaluator_id, evaluator_type, score, rating, status, submitted_at)
     VALUES ('evl_adv', ?, 'cyc_adv', 'usr_admin', 'MANAGER', 4.7, 'EXCELLENT', 'SUBMITTED', '2021-07-15')`, [employeeId]);
  q(`INSERT INTO performance_goals (id, employee_id, cycle_id, title, weight, target_value, actual_value, status, created_at)
     VALUES ('gl_adv', ?, 'cyc_adv', 'هدف التقارير', 1, 100, 120, 'COMPLETED', '2021-06-15 10:00:00')`, [employeeId]);
  q(`INSERT INTO performance_pips (id, employee_id, start_date, end_date, reason, status, outcome)
     VALUES ('pip_adv', ?, '2021-06-01', '2021-08-31', 'انخفاض الإنتاجية', 'COMPLETED', 'تحسن ملحوظ')`, [employeeId]);

  // تدريب: دورة + مصروف
  q(`INSERT INTO training_courses (id, name, cost, status, created_by) VALUES ('crs_adv', 'دورة تقارير', 500, 'COMPLETED', 'usr_admin')`);
  q(`INSERT INTO training_expenses (id, course_id, employee_id, amount, expense_date, payment_method, created_by)
     VALUES ('texp_adv', 'crs_adv', ?, 300, '2021-07-10', 'CASH', 'usr_admin')`, [employeeId]);

  // إنتاج: تصنيف + ماركة + منتج + قائمة مواد (FK حقيقي) + أمر إنتاج + فحص جودة
  q(`INSERT OR IGNORE INTO categories (id, name) VALUES ('cat_adv', 'تصنيف التقارير')`);
  q(`INSERT OR IGNORE INTO brands (id, name) VALUES ('brd_adv', 'ماركة التقارير')`);
  q(`INSERT OR IGNORE INTO products (id, sku, barcode, name, category_id, brand_id, size)
     VALUES ('prd_adv', 'SKU-ADV', 'BC-ADV', 'منتج التقارير', 'cat_adv', 'brd_adv', '60x60')`);
  q(`INSERT OR IGNORE INTO bills_of_materials (id, product_id, name, status, created_by)
     VALUES ('bom_adv', 'prd_adv', 'قائمة مواد التقارير', 'ACTIVE', 'usr_admin')`);
  q(`INSERT INTO production_orders (id, order_number, product_id, bom_id, quantity, status, start_date, due_date, completed_at, branch_id, created_by, created_at)
     VALUES ('po_adv', 'PO-ADV-1', 'prd_adv', 'bom_adv', 50, 'COMPLETED', '2021-07-01', '2021-07-20', '2021-07-25', 'br_main', 'usr_admin', '2021-07-01 10:00:00')`);
  q(`INSERT INTO manufacturing_quality_checks (id, production_order_id, inspection_type, result, quantity_inspected, quantity_accepted, quantity_rejected)
     VALUES ('qc_adv', 'po_adv', 'FINAL', 'PASS', 50, 45, 5)`);

  const service = new ReportCenterService();

  const evaluations = service.hrPerformanceEvaluations({ from: '2021-01-01', to: '2021-12-31' });
  assert.equal(evaluations.rows.length, 1);
  assert.equal(evaluations.rows[0].employeeName, 'مندوب التقارير');
  assert.equal(evaluations.rows[0].score, 4.7);
  assert.ok(evaluations.kpis.some((k) => k.label === 'متوسط الدرجة' && k.value === 4.7));

  const goals = service.hrPerformanceGoals({ from: '2021-01-01', to: '2021-12-31' });
  assert.equal(goals.rows.length, 1);
  assert.equal(goals.rows[0].progress, 120, '120% achievement');
  assert.ok(goals.kpis.some((k) => k.label === 'متجاوزة للمستهدف' && k.value === 1));

  const pips = service.hrPerformancePips({ from: '2021-01-01', to: '2021-12-31' });
  assert.equal(pips.rows.length, 1);
  assert.equal(pips.rows[0].status, 'COMPLETED');

  const trainingExpenses = service.hrTrainingExpenses({ from: '2021-01-01', to: '2021-12-31' });
  assert.equal(trainingExpenses.rows.length, 1);
  assert.equal(trainingExpenses.rows[0].amount, 300);
  assert.equal(trainingExpenses.rows[0].courseName, 'دورة تقارير');

  const production = service.mfgProductionKpis({ from: '2021-01-01', to: '2021-12-31' });
  assert.equal(production.rows.length, 1);
  assert.equal(production.rows[0].lateFlag, 1, 'completed after due date is late');
  assert.equal(production.rows[0].acceptedQty, 45);
  assert.ok(production.kpis.some((k) => k.label === 'نسبة الجودة' && k.value === 90));

  // أهداف المبيعات: المندوب له مستهدف شهري 10000؛ الفترة يوليو (31 يومًا) → مستهدف الفترة ≈ 10333
  const salesTargets = service.salesTargetKpis({ from: '2021-07-01', to: '2021-07-31' });
  const repRow = salesTargets.rows.find((r) => r.repName === 'مندوب التقارير');
  assert.ok(repRow, 'sales rep appears in the target report');
  assert.equal(repRow.proratedTarget, 10333.33);
  assert.equal(repRow.achievement, 0, 'no sales yet');
  assert.equal(repRow.targetBadge, 'متأخر');
});

test('new report catalog entries run through runReport and resolve definitions', async () => {
  await db.initialize();
  const ids = ['hr-performance-evaluations', 'hr-performance-goals', 'hr-performance-pips', 'mfg-production-kpis', 'sales-target-kpis', 'hr-training-expenses'];
  for (const id of ids) {
    const definition = REPORT_DEFINITIONS.find((r) => r.id === id);
    assert.ok(definition, `${id} is registered in the catalog`);
    const result = runReport(id, { from: '2021-01-01', to: '2021-12-31' });
    assert.ok(Array.isArray(result.columns) && result.columns.length > 0, `${id} defines columns`);
    assert.ok(Array.isArray(result.kpis), `${id} defines kpis`);
    assert.ok(Array.isArray(result.rows), `${id} defines rows`);
  }
});
