import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { PerformanceService } from '../src/services/domains/hr/PerformanceService.ts';
import { EmployeeService } from '../src/services/domains/hr/EmployeeService.ts';

async function bootstrap() {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  { const __u = AuthService.getCurrentUser(); if (__u) __u.mustChangePassword = false; }
  return db;
}

test('performance auto evaluations and attendance kpi sync', async () => {
  await bootstrap();
  const cycle = PerformanceService.createCycle({ name: 'دورة تلقائية', periodType: 'MONTHLY', startDate: '2020-08-01', endDate: '2020-08-31' });
  const created = PerformanceService.autoCreateEvaluations(cycle.id, 'MANAGER');
  assert.ok(created >= 0);
  const evaluations = PerformanceService.getEvaluations(undefined, cycle.id);
  if (evaluations.length) {
    const evalId = evaluations[0].id;
    const employeeId = evaluations[0].employeeId;
    const score = PerformanceService.syncAttendanceKpi(evalId, employeeId, '2020-08-01', '2020-08-31');
    assert.ok(score >= 0 && score <= 100);
    const synced = PerformanceService.getEvaluations(employeeId, cycle.id)[0];
    assert.ok(synced.items.some((item) => item.comments?.includes('أيام')));
  }
  const count = PerformanceService.autoScoreAllAttendance(cycle.id, '2020-08-01', '2020-08-31');
  assert.ok(count >= 0);
});

test('performance service manages cycles, kpis, goals, evaluations, pips and rewards', async () => {
  await bootstrap();
  const cycle = PerformanceService.createCycle({ name: 'دورة 2020', periodType: 'MONTHLY', startDate: '2020-08-01', endDate: '2020-08-31' });
  const kpi = PerformanceService.createKpi({ name: 'KPI اختبار', defaultWeight: 2 });
  const employee = EmployeeService.create({
    name: 'موظف أداء', location: 'اختبار', role: 'موظف', phone: '0109000099', email: '',
    baseSalary: 1000, salaryType: 'MONTHLY', status: 'ACTIVE', joinedDate: '2020-08-01',
  });
  const _goal = PerformanceService.createGoal({ employeeId: employee.id, cycleId: cycle.id, title: 'هدف اختبار', weight: 1, targetValue: 100 });
  const evaluation = PerformanceService.createEvaluation({ employeeId: employee.id, cycleId: cycle.id, evaluatorType: 'MANAGER' });
  PerformanceService.addEvaluationItem({ evaluationId: evaluation.id, kpiId: kpi.id, score: 80, weight: 2 });
  const updated = PerformanceService.getEvaluations(employee.id, cycle.id)[0];
  assert.ok(updated.score > 0);
  const pip = PerformanceService.createPip({ employeeId: employee.id, startDate: '2020-08-01', endDate: '2020-08-31', reason: 'اختبار' });
  assert.equal(pip.status, 'ACTIVE');
  const reward = PerformanceService.createReward({ employeeId: employee.id, evaluationId: evaluation.id, rewardType: 'BONUS', amount: 100 });
  assert.equal(reward.status, 'PENDING');
  PerformanceService.updateCycleStatus(cycle.id, 'OPEN');
  PerformanceService.approveEvaluation(evaluation.id);
  PerformanceService.approveReward(reward.id);
});
