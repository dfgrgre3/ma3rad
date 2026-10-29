import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { ExportService } from '../src/services/ExportService.ts';
import { buildExportHtml, exportToPdf } from '../src/utils/export.ts';
import type { User } from '../src/types/identity.ts';

const doc = {
  title: 'تقرير اختبار',
  columns: [{ key: 'name', label: 'الاسم' }],
  rows: [{ name: 'A' }],
  fileName: 'test',
  permission: 'reports.export',
};

async function boot(): Promise<void> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES ('usr_export_admin', 'export-admin', 'test', 'Export Admin', 'ADMIN', 1),
            ('usr_export_limited', 'export-limited', 'test', 'Export Limited', 'ACCOUNTANT', 1)`
  );
  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_export_limited', 'reports.export', 'DENY')`
  );
  const admin: User = {
    id: 'usr_export_admin', username: 'export-admin', fullName: 'Export Admin',
    role: 'ADMIN', isActive: true, createdAt: '', updatedAt: '',
  };
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate();
}

const limited: User = {
  id: 'usr_export_limited', username: 'export-limited', fullName: 'Export Limited',
  role: 'ACCOUNTANT', isActive: true, createdAt: '', updatedAt: '',
};

test('exports that declare a permission are refused without it', async () => {
  await boot();
  AuthService.setCurrentUser(limited);
  PermissionService.invalidate(limited);

  assert.equal(PermissionService.can(limited, 'reports.view'), true);
  assert.equal(PermissionService.can(limited, 'reports.export'), false);
  assert.equal(ExportService.canExport('reports.export', limited), false);
  assert.throws(() => ExportService.assertAllowed('reports.export', limited), /صلاحية/);
  assert.throws(() => buildExportHtml(doc), /صلاحية/);
  assert.throws(() => exportToPdf(doc), /صلاحية/);
});

test('legacy documents without a declared export permission keep building', async () => {
  await boot();
  AuthService.setCurrentUser(limited);
  PermissionService.invalidate(limited);
  const { permission, ...legacy } = doc;
  assert.match(buildExportHtml(legacy), /<table>/);
});

test('an authorized user passes the export guard', async () => {
  await boot();
  const admin = AuthService.requireAuth();
  assert.equal(ExportService.canExport('reports.export', admin), true);
  ExportService.assertAllowed('reports.export', admin);
  assert.match(buildExportHtml(doc), /تقرير اختبار/);
});

test('new export permissions follow the domains a role can already view', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const seeded = PermissionService.getRolePermissions('ACCOUNTANT');
  assert.equal(seeded.includes('purchases.export'), true);
  assert.equal(seeded.includes('suppliers.export'), true);
  assert.equal(seeded.includes('finance.export'), true);
  assert.equal(seeded.includes('employees.export'), true);
  assert.equal(PermissionService.getRolePermissions('SALES').includes('purchases.export'), false);

  // Simulate an installation seeded before these codes existed.
  db.run(
    `DELETE FROM role_permissions
     WHERE role_code = 'ACCOUNTANT'
       AND permission_code IN ('purchases.export', 'suppliers.export', 'finance.export', 'employees.export')`
  );
  db.run(`DELETE FROM system_settings WHERE key = 'rbac.exportBackfill.v2.ACCOUNTANT'`);
  PermissionService.seed();
  const backfilled = PermissionService.getRolePermissions('ACCOUNTANT');
  assert.equal(backfilled.includes('purchases.export'), true);
  assert.equal(backfilled.includes('suppliers.export'), true);
  assert.equal(backfilled.includes('finance.export'), true);
  assert.equal(backfilled.includes('employees.export'), true);

  // Once the backfill has run, an explicit administrator removal is respected.
  db.run(
    `DELETE FROM role_permissions WHERE role_code = 'ACCOUNTANT' AND permission_code = 'suppliers.export'`
  );
  PermissionService.seed();
  assert.equal(PermissionService.getRolePermissions('ACCOUNTANT').includes('suppliers.export'), false);
});
