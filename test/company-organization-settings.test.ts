import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { CompanyService } from '../src/services/CompanyService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = { id: 'usr_org_admin', username: 'org-admin', fullName: 'Org Admin', role: 'ADMIN', isActive: true, createdAt: '', updatedAt: '' };

async function boot(): Promise<DatabaseManager> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(`INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active) VALUES ('usr_org_admin', 'org-admin', 'test', 'Org Admin', 'ADMIN', 1)`);
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  return db;
}

test('company stores organization-level settings with sensible defaults', async () => {
  await boot();
  const service = new CompanyService();
  const company = service.createCompany({ code: 'ORG1', name: 'Org One', currency: 'EGP' });
  assert.equal(company.fiscalYearStartMonth, 1);
  assert.equal(company.locale, 'ar');
  assert.equal(company.dateFormat, 'YYYY-MM-DD');
  assert.equal(company.currency, 'EGP');
});

test('company organization settings can be updated', async () => {
  await boot();
  const service = new CompanyService();
  const company = service.createCompany({ code: 'ORG2', name: 'Org Two' });
  const updated = service.updateCompany(company.id, {
    fiscalYearStartMonth: 4,
    timeZone: 'Asia/Riyadh',
    locale: 'en',
    dateFormat: 'DD/MM/YYYY',
  });
  assert.equal(updated.fiscalYearStartMonth, 4);
  assert.equal(updated.timeZone, 'Asia/Riyadh');
  assert.equal(updated.locale, 'en');
  assert.equal(updated.dateFormat, 'DD/MM/YYYY');

  const reloaded = service.getCompanyById(company.id);
  assert.equal(reloaded?.fiscalYearStartMonth, 4);
  assert.equal(reloaded?.timeZone, 'Asia/Riyadh');
});
