import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { CompanyService } from '../src/services/CompanyService.ts';
import { BranchService } from '../src/services/BranchService.ts';
import { BranchAccessService } from '../src/services/BranchAccessService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = {
  id: 'usr_company_admin',
  username: 'company-admin',
  fullName: 'Company Admin',
  role: 'ADMIN',
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
     VALUES ('usr_company_admin', 'company-admin', 'test', 'Company Admin', 'ADMIN', 1)`
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  return db;
}

test('existing branches are attached to a default seeded company', async () => {
  const db = await boot();
  const companies = new CompanyService().getAllCompanies();
  const main = companies.find((company) => company.id === 'cmp_main');
  assert.ok(main, 'default company exists');
  assert.equal(main.isActive, true);

  const branchCompany = db.query<{ companyId: string }>(
    "SELECT company_id AS companyId FROM branches WHERE id = 'br_main'"
  )[0];
  assert.equal(branchCompany.companyId, 'cmp_main');
});

test('companies create, update and deactivate with ownership guards', async () => {
  const db = await boot();
  const service = new CompanyService();

  const beta = service.createCompany({ code: 'BETA', name: 'Beta Trading', currency: 'USD' });
  assert.equal(beta.code, 'BETA');
  assert.throws(() => service.createCompany({ code: 'BETA', name: 'Duplicate' }), /مستخدم بالفعل/);
  assert.throws(() => service.createCompany({ code: 'bad code', name: 'Bad' }), /كود الشركة/);
  assert.throws(() => service.createCompany({ code: 'AB', name: 'x' }), /اسم الشركة/);

  const branch = new BranchService().createBranch({
    name: 'Beta Branch',
    code: 'BETA-1',
    companyId: beta.id,
  });
  assert.equal(branch.companyId, beta.id);
  assert.equal(branch.companyName, 'Beta Trading');

  assert.throws(() => service.deactivateCompany(beta.id), /فرع نشط/);

  const updated = service.updateCompany(beta.id, { name: 'Beta Trading LLC', taxNumber: 'TAX-9' });
  assert.equal(updated.name, 'Beta Trading LLC');
  assert.equal(updated.taxNumber, 'TAX-9');

  // Parent/child ownership cannot form a cycle.
  const child = service.createCompany({ code: 'CHILD', name: 'Child Co', parentCompanyId: beta.id });
  assert.equal(child.parentCompanyId, beta.id);
  assert.throws(
    () => service.updateCompany(beta.id, { parentCompanyId: child.id }),
    /دائري/
  );
  assert.throws(
    () => service.updateCompany(beta.id, { parentCompanyId: beta.id }),
    /تابعة لنفسها/
  );

  db.run("UPDATE branches SET is_active = 0 WHERE id = ?", [branch.id]);
  assert.throws(() => service.deactivateCompany(beta.id), /شركات تابعة نشطة/);
  db.run("UPDATE companies SET is_active = 0 WHERE id = ?", [child.id]);
  const deactivated = service.deactivateCompany(beta.id);
  assert.equal(deactivated.isActive, false);
});

test('company scope isolates users whose branch access is restricted', async () => {
  const db = await boot();
  const service = new CompanyService();
  const beta = service.createCompany({ code: 'SCOPE-B', name: 'Scope Beta' });
  const betaBranch = new BranchService().createBranch({ name: 'Scope Beta Branch', code: 'SB-1', companyId: beta.id });

  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_company_limited', 'company-limited', 'test', 'Limited User', 'SALES', 1, 'ASSIGNED')`
  );
  db.run(
    `INSERT OR IGNORE INTO users_branches (user_id, branch_id) VALUES ('usr_company_limited', 'br_main')`
  );
  db.run(
    `INSERT OR IGNORE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_company_limited', 'companies.view', 'GRANT'),
            ('usr_company_limited', 'branches.view', 'GRANT'),
            ('usr_company_limited', 'branches.create', 'GRANT')`
  );

  const limited: User = {
    id: 'usr_company_limited',
    username: 'company-limited',
    fullName: 'Limited User',
    role: 'SALES',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  AuthService.setCurrentUser(limited);
  PermissionService.invalidate(limited);

  const access = new BranchAccessService();
  assert.deepEqual(access.getAccessibleCompanyIds(limited), ['cmp_main']);
  assert.equal(access.hasCompanyAccess(beta.id, limited), false);
  assert.throws(() => access.requireCompanyAccess(beta.id, limited), /صلاحية الوصول/);

  const visible = service.getAllCompanies();
  assert.deepEqual(visible.map((company) => company.id), ['cmp_main']);
  assert.throws(() => service.getCompanyById(beta.id), /صلاحية الوصول/);
  assert.throws(
    () => new BranchService().getBranchById(betaBranch.id),
    /صلاحية الوصول/
  );

  // A limited user cannot create a branch inside a company they cannot see.
  assert.throws(
    () => new BranchService().createBranch({ name: 'Nope', code: 'NOPE-1', companyId: beta.id }),
    /صلاحية الوصول|صلاحية/
  );

  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
});
