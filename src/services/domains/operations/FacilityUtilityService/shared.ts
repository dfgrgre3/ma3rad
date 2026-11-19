import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { BranchAccessService } from '../../auth/BranchAccessService';
import { ModuleRegistryService } from '../../config/ModuleRegistryService';

export const db = DatabaseManager.getInstance();
export const branchAccess = new BranchAccessService();

export function requireView() {
  const actor = AuthService.requireAuth();
  PermissionService.requireAny(actor, [
    'operations.view', 'facility_management.view',
  ]);
  return actor;
}

export function requireManage() {
  const actor = AuthService.requireAuth();
  ModuleRegistryService.assertModuleEnabled('hr');
  PermissionService.requireAny(actor, [
    'operations.update', 'facility_management.manage',
  ]);
  return actor;
}

export function currentCompanyId(actor = AuthService.requireAuth()): string {
  const branchId = branchAccess.getCurrentBranchId(actor);
  const row = db.query<{ companyId: string | null }>(
    'SELECT company_id AS companyId FROM branches WHERE id = ?',
    [branchId]
  )[0];
  if (!row?.companyId) throw new Error('فرع العمل الحالي غير مرتبط بشركة.');
  return row.companyId;
}

export function auditActor(actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void {
  db.run(
    `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
     VALUES (?, ?, ?, ?, 'OPERATIONS', ?, ?)`,
    [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
      JSON.stringify(values)]
  );
}

export function auditDB(dbHandle: any, actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void {
  dbHandle.run(
    `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
     VALUES (?, ?, ?, ?, 'OPERATIONS', ?, ?)`,
    [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
      JSON.stringify(values)]
  );
}

export function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isValidDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
