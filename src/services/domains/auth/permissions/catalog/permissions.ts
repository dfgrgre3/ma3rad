import type { PermissionDef } from '../types';
import { GRANULAR_PERMISSIONS } from '../../../../../config/permissionMatrix';
import { BASE_PERMISSIONS } from './basePermissions';

/**
 * الكتالوج الكامل = الصلاحيات الأساسية + آلاف الصلاحيات الدقيقة المولّدة من
 * مصفوفة الصفحات والأقسام والأزرار (permissionMatrix).
 */
export const PERMISSIONS: PermissionDef[] = [
  ...BASE_PERMISSIONS,
  ...GRANULAR_PERMISSIONS.map((permission) => ({ ...permission })),
];
