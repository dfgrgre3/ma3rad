import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { BranchService } from '../src/services/BranchService.ts';
import { ManufacturingService } from '../src/services/ManufacturingService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = { id: 'usr_mnt_admin', username: 'mnt-admin', fullName: 'Mnt Admin', role: 'ADMIN', isActive: true, createdAt: '', updatedAt: '' };
const manager: User = { id: 'usr_mnt_manager', username: 'mnt-manager', fullName: 'Mnt Manager', role: 'MANAGER', isActive: true, createdAt: '', updatedAt: '' };
const sales: User = { id: 'usr_mnt_sales', username: 'mnt-sales', fullName: 'Mnt Sales', role: 'SALES', isActive: true, createdAt: '', updatedAt: '' };

async function boot(): Promise<DatabaseManager> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(`INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active) VALUES ('usr_mnt_admin', 'mnt-admin', 'test', 'Mnt Admin', 'ADMIN', 1)`);
  for (const [id, username, fullName, role] of [['usr_mnt_manager', 'mnt-manager', 'Mnt Manager', 'MANAGER'], ['usr_mnt_sales', 'mnt-sales', 'Mnt Sales', 'SALES']]) {
    db.run(`INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope) VALUES (?, ?, 'test', ?, ?, 1, 'ASSIGNED')`, [id, username, fullName, role]);
    db.run(`INSERT OR REPLACE INTO users_branches (user_id, branch_id) VALUES (?, 'br_main')`, [id]);
    db.run(`DELETE FROM user_permissions WHERE user_id = ?`, [id]);
  }
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  PermissionService.invalidate(manager);
  PermissionService.invalidate(sales);
  if (!ModuleRegistryService.isModuleEnabled('manufacturing')) {
    ModuleRegistryService.activate('manufacturing', admin);
    AuthService.setCurrentUser(admin);
    PermissionService.invalidate(admin);
  }
  return db;
}

function asAdmin() { AuthService.setCurrentUser(admin); PermissionService.invalidate(admin); }
function asManager() { AuthService.setCurrentUser(manager); PermissionService.invalidate(manager); }
function asSales() { AuthService.setCurrentUser(sales); PermissionService.invalidate(sales); }

test('maintenance records are created, updated and permission-gated', async () => {
  await boot();
  asAdmin();
  const service = new ManufacturingService();
  const created = service.createMaintenance({ equipmentName: 'CNC Router', maintenanceType: 'PREVENTIVE', scheduledDate: '2026-11-01', notes: 'oil change' });
  assert.equal(created.status, 'SCHEDULED');
  assert.equal(created.equipmentName, 'CNC Router');
  assert.equal(created.maintenanceType, 'PREVENTIVE');

  const updated = service.updateMaintenance(created.id, { status: 'COMPLETED', cost: 150 });
  assert.equal(updated.status, 'COMPLETED');
  assert.equal(updated.cost, 150);
  assert.ok(updated.completedDate);

  asSales();
  assert.throws(() => service.createMaintenance({ equipmentName: 'X' }), /صلاحية|permission/i);
  asAdmin();
});

test('maintenance records are branch scoped', async () => {
  await boot();
  asAdmin();
  const service = new ManufacturingService();
  const beta = new BranchService().createBranch({ name: 'Mnt Beta', code: 'MNT-BETA', companyId: 'cmp_main' });
  const rec = service.createMaintenance({ equipmentName: 'Lathe', branchId: beta.id });
  assert.equal(rec.branchId, beta.id);

  asManager();
  const visible = service.getMaintenanceRecords();
  assert.ok(!visible.some((r) => r.id === rec.id));
  asAdmin();
});

test('deactivating manufacturing blocks maintenance writes but keeps reads', async () => {
  await boot();
  asAdmin();
  const service = new ManufacturingService();
  const rec = service.createMaintenance({ equipmentName: 'Drill' });
  ModuleRegistryService.deactivate('manufacturing', admin, 'not used');
  assert.throws(() => service.createMaintenance({ equipmentName: 'Blocked' }), /غير مفعّلة/);
  const rows = service.getMaintenanceRecords();
  assert.ok(rows.some((r) => r.id === rec.id));
  ModuleRegistryService.activate('manufacturing', admin, 're-enabled');
  asAdmin();
});
