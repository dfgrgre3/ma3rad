import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { CompanyService } from '../src/services/CompanyService.ts';
import { BranchService } from '../src/services/BranchService.ts';
import { DocumentService } from '../src/services/DocumentService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = {
  id: 'usr_docs_admin',
  username: 'docs-admin',
  fullName: 'Documents Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const limited: User = {
  id: 'usr_docs_limited',
  username: 'docs-limited',
  fullName: 'Documents Limited',
  role: 'SALES',
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
     VALUES ('usr_docs_admin', 'docs-admin', 'test', 'Documents Admin', 'ADMIN', 1),
            ('usr_docs_limited', 'docs-limited', 'test', 'Documents Limited', 'SALES', 1)`
  );
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_docs_limited', 'docs-limited', 'test', 'Documents Limited', 'SALES', 1, 'ASSIGNED')`
  );
  db.run(
    `INSERT OR REPLACE INTO users_branches (user_id, branch_id) VALUES ('usr_docs_limited', 'br_main')`
  );
  db.run("DELETE FROM user_permissions WHERE user_id = 'usr_docs_limited'");
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  PermissionService.invalidate(limited);
  return db;
}

function asAdmin(): void {
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
}

function localDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('documents keep immutable numbered versions and complete event history', async () => {
  await boot();
  const service = new DocumentService();

  const created = service.createDocument({
    companyId: 'cmp_main',
    title: 'Commercial registry 2026',
    category: 'LEGAL',
    confidentiality: 'RESTRICTED',
    expiresAt: localDate(365),
    initialVersion: {
      fileName: 'commercial-registry.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      checksum: 'a'.repeat(64),
      storageName: `doc_${'b'.repeat(32)}.pdf`,
      notes: 'signed copy',
    },
  });

  assert.match(created.documentNumber, /^DOC-\d{4}-\d{6}$/);
  assert.equal(created.status, 'DRAFT');
  assert.equal(created.currentVersion, 1);
  assert.equal(created.versions?.length, 1);
  assert.equal(created.versions?.[0].versionNumber, 1);

  const withSecondVersion = service.addDocumentVersion(created.id, {
    fileName: 'commercial-registry-amended.pdf',
    fileSize: 2048,
  });
  assert.equal(withSecondVersion.currentVersion, 2);
  assert.deepEqual(
    withSecondVersion.versions?.map((version) => version.versionNumber),
    [2, 1],
    'versions are listed newest first and both remain present'
  );

  // Version rows are append-only: adding a version never rewrites the previous one.
  assert.equal(withSecondVersion.versions?.[1].fileName, 'commercial-registry.pdf');

  const events = service.getEvents('DOCUMENT', created.id);
  assert.ok(events.some((event) => event.action === 'CREATED'));
  assert.ok(events.some((event) => event.action === 'VERSION_ADDED'));

  const active = service.setDocumentStatus(created.id, 'ACTIVE');
  assert.equal(active.status, 'ACTIVE');
  const activeVersion = service.addDocumentVersion(created.id, { fileName: 'active-version.pdf' });
  assert.equal(activeVersion.currentVersion, 3, 'active documents accept new versions');
  const archived = service.setDocumentStatus(created.id, 'ARCHIVED');
  assert.equal(archived.status, 'ARCHIVED');
  assert.throws(() => service.addDocumentVersion(created.id, { fileName: 'blocked.pdf' }), /مؤرشف/);
  assert.throws(() => service.updateDocument(created.id, { title: 'Changed' }), /مؤرشف/);
  assert.throws(() => service.setDocumentStatus(created.id, 'DRAFT'), /الانتقال/);

  const restored = service.setDocumentStatus(created.id, 'ACTIVE');
  assert.equal(restored.status, 'ACTIVE');

  // Invalid attachment metadata is rejected before persistence.
  assert.throws(
    () => service.addDocumentVersion(created.id, { fileName: 'x.pdf', fileSize: 26 * 1024 * 1024 }),
    /25 ميجابايت/
  );
  assert.throws(
    () => service.addDocumentVersion(created.id, { fileName: 'x.pdf', storageName: '../escape.pdf' }),
    /مسار تخزين/
  );
  assert.throws(
    () => service.addDocumentVersion(created.id, { fileName: 'x.pdf', checksum: 'not-a-hash' }),
    /SHA-256/
  );
});

test('document and contract permissions are enforced at the service layer', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new DocumentService();

  // Deny viewing for a user whose role would otherwise allow it.
  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_docs_limited', 'documents.view', 'DENY'),
            ('usr_docs_limited', 'contracts.view', 'DENY')`
  );
  AuthService.setCurrentUser(limited);
  PermissionService.invalidate(limited);
  assert.throws(() => service.getDocuments(), /صلاحية/);
  assert.throws(() => service.getSummary(), /صلاحية/);
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);

  const created = service.createDocument({ companyId: 'cmp_main', title: 'Policy document' });
  assert.ok(created.id);

  // A view-only role cannot create or mutate.
  db.run("DELETE FROM user_permissions WHERE user_id = 'usr_docs_limited'");
  AuthService.setCurrentUser(limited);
  PermissionService.invalidate(limited);
  assert.ok(service.getDocuments().total >= 1);
  assert.throws(() => service.createDocument({ companyId: 'cmp_main', title: 'Nope' }), /صلاحية/);
  assert.throws(() => service.addDocumentVersion(created.id, { fileName: 'nope.pdf' }), /صلاحية/);
  assert.throws(() => service.setDocumentStatus(created.id, 'ACTIVE'), /صلاحية/);
  asAdmin();
});

test('documents and contracts are isolated between companies and branches', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const companies = new CompanyService();
  const beta = companies.createCompany({ code: 'DOC-BETA', name: 'Beta Docs Co', currency: 'USD' });
  const betaBranch = new BranchService().createBranch({ name: 'Beta Docs Branch', code: 'DB-1', companyId: beta.id });

  const service = new DocumentService();
  const mainDoc = service.createDocument({ companyId: 'cmp_main', title: 'Main company policy' });
  const betaDoc = service.createDocument({ companyId: beta.id, branchId: betaBranch.id, title: 'Beta secret policy' });
  const betaContract = service.createContract({
    companyId: beta.id,
    title: 'Beta supply agreement',
    partyName: 'Beta Supplier',
    startDate: localDate(-10),
    endDate: localDate(100),
    value: 5000,
    currency: 'USD',
  });

  db.run(
    `INSERT OR IGNORE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_docs_limited', 'documents.create', 'GRANT'),
            ('usr_docs_limited', 'contracts.view', 'GRANT')`
  );
  AuthService.setCurrentUser(limited);
  PermissionService.invalidate(limited);

  const visibleDocuments = service.getDocuments().documents;
  assert.ok(
    visibleDocuments.some((document) => document.id === mainDoc.id),
    'documents from the assigned company remain visible'
  );
  assert.ok(
    visibleDocuments.every((document) => document.companyId === 'cmp_main'),
    'only documents from the assigned company are returned'
  );
  assert.ok(
    !visibleDocuments.some((document) => document.id === betaDoc.id),
    'documents from another company never leak'
  );
  assert.throws(() => service.getDocument(betaDoc.id), /صلاحية/);
  assert.throws(
    () => service.createDocument({ companyId: beta.id, title: 'Leak attempt' }),
    /صلاحية/
  );
  assert.throws(() => service.getContract(betaContract.id), /صلاحية/);
  const visibleContracts = service.getContracts().contracts.map((contract) => contract.id);
  assert.ok(!visibleContracts.includes(betaContract.id), 'contracts from another company never leak');
  assert.deepEqual(service.getCompanyOptions().map((company) => company.id), ['cmp_main']);

  // Cross-company document links are rejected for administrators too.
  asAdmin();
  assert.throws(
    () => service.createContract({
      companyId: 'cmp_main',
      title: 'Wrong link',
      partyName: 'Party',
      startDate: localDate(0),
      endDate: localDate(30),
      documentId: betaDoc.id,
    }),
    /شركة أخرى/
  );

  // The same explicit document number may exist in two separate companies.
  const mainNumbered = service.createDocument({ companyId: 'cmp_main', title: 'Numbered main', documentNumber: 'POL-001' });
  const betaNumbered = service.createDocument({ companyId: beta.id, title: 'Numbered beta', documentNumber: 'POL-001' });
  assert.equal(mainNumbered.documentNumber, 'POL-001');
  assert.equal(betaNumbered.documentNumber, 'POL-001');
  assert.throws(
    () => service.createDocument({ companyId: beta.id, title: 'Duplicate', documentNumber: 'POL-001' }),
    /مستخدم بالفعل/
  );
});

test('contract lifecycle enforces activation, renewal and termination rules', async () => {
  await boot();
  const service = new DocumentService();

  const contract = service.createContract({
    companyId: 'cmp_main',
    title: 'Annual maintenance contract',
    partyType: 'SUPPLIER',
    partyName: 'Maintenance Provider',
    startDate: localDate(0),
    endDate: localDate(10),
    value: 12000,
    currency: 'EGP',
    renewalNoticeDays: 30,
    autoRenew: true,
  });
  assert.equal(contract.status, 'DRAFT');
  assert.equal(contract.effectiveStatus, 'DRAFT');
  assert.match(contract.contractNumber, /^CTR-\d{4}-\d{6}$/);
  assert.equal(contract.autoRenew, true);

  const active = service.activateContract(contract.id);
  assert.equal(active.status, 'ACTIVE');
  assert.equal(active.effectiveStatus, 'EXPIRING');
  assert.equal(active.daysToExpiry, 10);

  const expiring = service.getContracts({ status: 'EXPIRING' }).contracts;
  assert.equal(expiring.some((row) => row.id === contract.id), true);

  assert.throws(() => service.renewContract(contract.id, localDate(5)), /بعد تاريخ النهاية الحالي/);
  const renewed = service.renewContract(contract.id, localDate(200), 15000);
  assert.equal(renewed.endDate, localDate(200));
  assert.equal(renewed.value, 15000);

  const terminated = service.terminateContract(contract.id, 'Terminated by mutual agreement');
  assert.equal(terminated.status, 'TERMINATED');
  assert.equal(terminated.effectiveStatus, 'TERMINATED');
  assert.throws(() => service.updateContract(contract.id, { title: 'After termination' }), /مفسوخ/);
  assert.throws(() => service.terminateContract(contract.id, 'Again'), /السارية/);
  assert.throws(
    () => service.createContract({
      companyId: 'cmp_main',
      title: 'Bad dates',
      partyName: 'Party',
      startDate: localDate(5),
      endDate: localDate(1),
    }),
    /بعد تاريخ البداية/
  );

  // A contract whose term already ended cannot be activated.
  const expired = service.createContract({
    companyId: 'cmp_main',
    title: 'Expired draft',
    partyName: 'Party',
    startDate: localDate(-30),
    endDate: localDate(-1),
  });
  assert.throws(() => service.activateContract(expired.id), /انتهت مدته/);

  const events = service.getEvents('CONTRACT', contract.id);
  assert.ok(events.some((event) => event.action === 'ACTIVATED'));
  assert.ok(events.some((event) => event.action === 'RENEWED'));
  assert.ok(events.some((event) => event.action === 'TERMINATED'));

  const summary = service.getSummary();
  assert.ok(summary.contracts >= 2);
});

test('deactivating the documents module blocks new operations but preserves history', async () => {
  await boot();
  const service = new DocumentService();
  const existing = service.createDocument({ companyId: 'cmp_main', title: 'Historical document' });

  ModuleRegistryService.deactivate('documents', admin, 'not used');
  assert.equal(ModuleRegistryService.isModuleEnabled('documents'), false);
  assert.throws(
    () => service.createDocument({ companyId: 'cmp_main', title: 'Blocked' }),
    /غير مفعّلة/
  );
  assert.throws(
    () => service.createContract({
      companyId: 'cmp_main',
      title: 'Blocked contract',
      partyName: 'Party',
      startDate: localDate(0),
      endDate: localDate(30),
    }),
    /غير مفعّلة/
  );

  // Existing documents remain readable while the module is disabled.
  const history = service.getDocuments();
  assert.equal(history.documents.some((document) => document.id === existing.id), true);

  ModuleRegistryService.activate('documents', admin, 're-enabled');
  assert.equal(ModuleRegistryService.isModuleEnabled('documents'), true);
});
