import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AccountingService } from '../src/services/AccountingService.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { CrmService } from '../src/services/CrmService.ts';
import { NavigationService } from '../src/services/NavigationService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';

test('dashboard.view alone cannot read embedded sales, finance or CRM data', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  const role = PermissionService.createRole({ code: 'dashboard_only_test', name: 'Dashboard only test' }, admin);
  PermissionService.setRolePermissions(role.code, ['dashboard.view'], admin);
  const id = 'usr_dashboard_only_test';
  db.run('INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)', [id, id, 'test-only', id, role.code]);
  const dashboardOnly = { id, username: id, fullName: id, role: role.code, isActive: true, createdAt: '', updatedAt: '' };

  AuthService.setCurrentUser(dashboardOnly);
  assert.equal(PermissionService.can(dashboardOnly, 'dashboard.view'), true);
  assert.throws(() => new AccountingService().getDashboardMetrics(), /ui\.sales\.invoices\.view/);
  assert.throws(() => new CrmService().getLeads(), /ui\.crm\.leads\.view/);
  assert.deepEqual(NavigationService.getRequiredPermissions('/central-activation'), ['admin.license.manage']);

  AuthService.setCurrentUser(admin);
  db.run('DELETE FROM users WHERE id = ?', [id]);
  PermissionService.deleteRole(role.id, admin);
});
