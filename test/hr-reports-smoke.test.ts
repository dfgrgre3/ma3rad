import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { EmployeeService } from '../src/services/domains/hr/EmployeeService.ts';
import { ReportCenterService } from '../src/services/domains/reports/ReportCenterService.ts';

async function bootstrap() {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  return db;
}

test('hr report center methods return report results', async () => {
  await bootstrap();
  const service = new ReportCenterService();
  for (const method of ['hrPayrollSummary', 'hrPayrollPayouts', 'hrAttendanceSummary', 'hrLeaveSummary', 'hrTaxSummary'] as const) {
    const result = service[method]({ from: '2020-08-01', to: '2020-08-31' });
    assert.ok(Array.isArray(result.columns));
    assert.ok(Array.isArray(result.rows));
    assert.ok(Array.isArray(result.kpis));
  }
});
