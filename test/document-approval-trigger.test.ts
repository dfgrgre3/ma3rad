import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { DocumentService } from '../src/services/DocumentService.ts';
import { ApprovalService } from '../src/services/ApprovalService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = { id: 'usr_appr_admin', username: 'appr-admin', fullName: 'Appr Admin', role: 'ADMIN', isActive: true, createdAt: '', updatedAt: '' };

async function boot(): Promise<DatabaseManager> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(`INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active) VALUES ('usr_appr_admin', 'appr-admin', 'test', 'Appr Admin', 'ADMIN', 1)`);
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  if (!ModuleRegistryService.isModuleEnabled('documents')) {
    ModuleRegistryService.activate('documents', admin);
    AuthService.setCurrentUser(admin);
    PermissionService.invalidate(admin);
  }
  if (!ModuleRegistryService.isModuleEnabled('approvals')) {
    ModuleRegistryService.activate('approvals', admin);
    AuthService.setCurrentUser(admin);
    PermissionService.invalidate(admin);
  }
  return db;
}

function localDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('requesting contract activation approval creates an approval and activates on approval', async () => {
  await boot();
  const docs = new DocumentService();
  const approvals = new ApprovalService();

  const contract = docs.createContract({
    companyId: 'cmp_main',
    title: 'Approval-gated contract',
    partyName: 'Party',
    startDate: localDate(0),
    endDate: localDate(30),
  });
  assert.equal(contract.status, 'DRAFT');

  const { approvalId, requestNumber } = docs.requestActivationApproval(contract.id, 'CONTRACT');
  assert.match(requestNumber, /^APR-/);

  const pending = approvals.getRequests('PENDING');
  assert.ok(pending.some((r) => r.id === approvalId));

  approvals.decide(approvalId, true);
  const activated = docs.getContract(contract.id);
  assert.equal(activated.status, 'ACTIVE');
});

test('requesting document activation approval creates an approval and activates on approval', async () => {
  await boot();
  const docs = new DocumentService();
  const approvals = new ApprovalService();

  const document = docs.createDocument({ companyId: 'cmp_main', title: 'Approval-gated document' });
  assert.equal(document.status, 'DRAFT');

  const { approvalId } = docs.requestActivationApproval(document.id, 'DOCUMENT');
  approvals.decide(approvalId, true);
  const activated = docs.getDocument(document.id);
  assert.equal(activated.status, 'ACTIVE');
});
