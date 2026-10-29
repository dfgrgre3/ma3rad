import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { ApprovalService } from '../src/services/ApprovalService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = {
  id: 'usr_approval_admin',
  username: 'approval-admin',
  fullName: 'Approval Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const manager: User = {
  id: 'usr_approval_manager',
  username: 'approval-manager',
  fullName: 'Approval Manager',
  role: 'MANAGER',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const secondManager: User = {
  id: 'usr_approval_manager2',
  username: 'approval-manager2',
  fullName: 'Second Manager',
  role: 'MANAGER',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

async function boot(): Promise<DatabaseManager> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES ('usr_approval_admin', 'approval-admin', 'test', 'Approval Admin', 'ADMIN', 1),
            ('usr_approval_manager', 'approval-manager', 'test', 'Approval Manager', 'MANAGER', 1),
            ('usr_approval_manager2', 'approval-manager2', 'test', 'Second Manager', 'MANAGER', 1)`
  );
  db.run(
    `INSERT OR REPLACE INTO users_branches (user_id, branch_id)
     SELECT 'usr_approval_manager', id FROM branches WHERE is_main = 1`
  );
  db.run(
    `INSERT OR REPLACE INTO users_branches (user_id, branch_id)
     SELECT 'usr_approval_manager2', id FROM branches WHERE is_main = 1`
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  return db;
}

test('segregation of duties blocks self-approval only when the policy is enabled', async () => {
  await boot();
  const approvals = new ApprovalService();
  ModuleRegistryService.setModuleSetting('approvals', 'requireSegregationOfDuties', false, admin);

  AuthService.setCurrentUser(manager);
  PermissionService.invalidate(manager);
  const request = approvals.createRequest({ requestType: 'EXPENSE', title: 'Self approval allowed' });
  approvals.decide(request.id, true);

  ModuleRegistryService.setModuleSetting('approvals', 'requireSegregationOfDuties', true, admin);
  const guarded = approvals.createRequest({ requestType: 'EXPENSE', title: 'Self approval blocked' });
  assert.throws(() => approvals.decide(guarded.id, true), /فصل المهام/);

  AuthService.setCurrentUser(secondManager);
  PermissionService.invalidate(secondManager);
  approvals.decide(guarded.id, true);
  const row = DatabaseManager.getInstance().query<{ status: string; decidedBy: string }>(
    'SELECT status, decided_by AS decidedBy FROM approval_requests WHERE id = ?',
    [guarded.id]
  )[0];
  assert.equal(row.status, 'APPROVED');
  assert.equal(row.decidedBy, secondManager.id);
});
