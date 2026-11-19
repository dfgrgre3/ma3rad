import type { DatabaseManager } from '../../../database/repositories/databaseManager';
import { safeJsonArray } from '../platformUtils';

export function generateTenantCode(db: DatabaseManager, name: string): string {
  const base = name.trim().replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '').slice(0, 8).toUpperCase() || 'TEN';
  let index = 1;
  let candidate = `${base}-${String(index).padStart(4, '0')}`;
  while (db.query('SELECT 1 FROM platform_tenants WHERE code = ?', [candidate]).length) {
    index++;
    candidate = `${base}-${String(index).padStart(4, '0')}`;
  }
  return candidate;
}

export function generateUsername(db: DatabaseManager, name: string, tenantId?: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'user';
  let index = 1;
  let candidate = `${base}${index}`;
  const checkSql = tenantId
    ? 'SELECT 1 FROM platform_tenant_users WHERE tenant_id = ? AND username = ?'
    : 'SELECT 1 FROM platform_staff WHERE username = ?';
  const checkParams = tenantId ? [tenantId, candidate] : [candidate];
  while (db.query(checkSql, checkParams).length) {
    index++;
    candidate = `${base}${index}`;
  }
  return candidate;
}

export function getActiveLicenseKey(db: DatabaseManager, tenantId: string): string | null {
  const row = db.query<any>(
    `SELECT license_key FROM platform_licenses
     WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED')
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId]
  )[0];
  return row?.license_key ?? row?.licenseKey ?? null;
}

export function getPlanModules(db: DatabaseManager, planId: string): string[] {
  const plan = db.query<any>('SELECT included_modules FROM platform_plans WHERE id = ?', [planId])[0];
  return plan ? safeJsonArray(plan.included_modules) : [];
}
