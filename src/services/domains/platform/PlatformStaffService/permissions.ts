import { AuthService } from '../../auth/AuthService';
import { PlatformAuthorizationService, PLATFORM_ROLE_DEFINITIONS, PLATFORM_PERMISSION_SECTIONS_FOR_UI as PLATFORM_PERMISSION_SECTIONS } from '../PlatformAuthorizationService';
import { STANDARD_ACTION_LABELS } from '../platformPermissionCatalog';
import type {
  PlatformStaff,
  PlatformStaffDataScopeState,
  PlatformRoleMatrix,
} from '../platformTypes';
import { nowIso, safeJsonArray } from '../platformUtils';
import type { StaffServiceContext } from './context';

export function getStaffDataScope(ctx: StaffServiceContext, id: string): PlatformStaffDataScopeState {
  ctx.requirePlatformAccess('staff', 'platform.staff.view');

  const staff = ctx.getPlatformStaff(id);
  if (!staff) throw new Error('الموظف غير موجود.')

  return { staffId: id, scope: staff.dataScope ?? 'ALL', tenantIds: staff.dataScopeTenantIds ?? [] };
}

export function setStaffDataScope(ctx: StaffServiceContext, id: string, scope: 'ALL' | 'LIMITED', tenantIds: string[] = []): void {
  ctx.requirePlatformAccess('staff', 'platform.staff.update');

  const staff = ctx.getPlatformStaff(id);
  if (!staff) throw new Error('الموظف غير موجود.')

  const now = nowIso();
  ctx.db.run(
    'UPDATE platform_staff SET data_scope = ?, data_scope_tenant_ids = ?, updated_at = ? WHERE id = ?',
    [scope, scope === 'LIMITED' ? JSON.stringify(tenantIds) : null, now, id]
  );

  ctx.audit('تعيين نطاق بيانات موظف', 'STAFF', id, { scope, tenantIds });
}

export function getRolePermissionMatrix(ctx: StaffServiceContext): PlatformRoleMatrix {
  ctx.requirePlatformAccess('staff', 'platform.staff.permissions');

  const matrix: Record<string, string[]> = {};

  for (const [role, def] of Object.entries(PLATFORM_ROLE_DEFINITIONS)) {
    const permissions = (def as any).permissions ?? [];
    const rows = ctx.db.query<any>('SELECT permission_codes FROM platform_role_permissions WHERE role = ?', [role])[0];
    const customCodes = rows ? safeJsonArray(rows.permission_codes) : [];
    matrix[role] = [...new Set([...permissions, ...customCodes])].sort();
  }

  // Build sections from PLATFORM_PERMISSION_SECTIONS
  const sections = Object.entries(PLATFORM_PERMISSION_SECTIONS).map(([module, section]: [string, any]) => ({
    module,
    title: section.title,
    standardActions: section.actions ?? [],
    permissions: (section.permissions ?? []).map((code: string) => ({
      code,
      action: code.split('.').pop() ?? '',
      name: STANDARD_ACTION_LABELS[code] ?? code,
    })),
  }));

  return {
    matrix,
    sections,
    standardActionLabels: STANDARD_ACTION_LABELS,
    fetchedAt: nowIso(),
  };
}

export function setRolePermissions(ctx: StaffServiceContext, role: string, permissionCodes: string[]): void {
  const actor = AuthService.getCurrentUser();
  if (role === 'SUPER_ADMIN' && actor?.role !== 'SUPER_ADMIN') {
    throw new Error('مصفوفة صلاحيات مالك المنصة لا يمكن تعديلها إلا من قبل مالك المنصة.');
  }

  ctx.requirePlatformAccess('staff', 'platform.staff.permissions');

  PlatformAuthorizationService.setRolePermissions(role, permissionCodes);

  ctx.audit('تعيين صلاحيات دور', 'ROLE_PERMISSIONS', null, { role, count: permissionCodes.length });
}

export function transferStaffPermissions(ctx: StaffServiceContext, fromStaffId: string, toStaffId: string, note?: string): PlatformStaff {
  ctx.requirePlatformAccess('staff', 'platform.staff.update');

  if (String(fromStaffId) === String(toStaffId)) {
    throw new Error('لا يمكن نقل الصلاحيات إلى نفس الموظف.');
  }

  const fromStaff = ctx.getPlatformStaff(fromStaffId);
  if (!fromStaff) throw new Error('موظف المصدر غير موجود.')

  const toStaff = ctx.getPlatformStaff(toStaffId);
  if (!toStaff) throw new Error('موظف الهدف غير موجود.')

  const actor = AuthService.getCurrentUser();
  if (fromStaff.role === 'SUPER_ADMIN' && actor?.role !== 'SUPER_ADMIN') {
    throw new Error('لا يمكن نقل صلاحيات حساب مالك المنصة إلا من قبل مالك المنصة.');
  }

  const now = nowIso();
  ctx.db.run(
    'UPDATE platform_staff SET role = ?, data_scope = ?, data_scope_tenant_ids = ?, updated_at = ? WHERE id = ?',
    [fromStaff.role, fromStaff.dataScope, fromStaff.dataScopeTenantIds ? JSON.stringify(fromStaff.dataScopeTenantIds) : null, now, toStaffId]
  );
  ctx.db.run('DELETE FROM platform_staff_sessions WHERE staff_id = ?', [toStaffId]);

  ctx.audit('نقل صلاحيات موظف', 'STAFF', toStaffId, { fromStaffId, note });

  const updated = ctx.getPlatformStaff(toStaffId);
  if (!updated) throw new Error('فشل نقل الصلاحيات.')
  return updated;
}
