import { getCachedDisabledPermissions } from './centralConfigStore';
import { forPath, isPageVisible, getCurrentPath } from './CentralFeaturePermissionService_part01';
import type { CentralFeaturePermission, CentralAction } from './CentralFeaturePermissionService';

const ACTION_BY_SUFFIX: Record<string, CentralAction> = {
  view: 'view', read: 'view', list: 'view', show: 'view', open: 'view',
  create: 'create', add: 'create', new: 'create', insert: 'create',
  update: 'edit', edit: 'edit', save: 'edit', post: 'edit', adjust: 'edit',
  transfer: 'edit', approve: 'edit', reject: 'edit', void: 'edit', cancel: 'edit',
  send: 'edit', process: 'edit', manage: 'edit', assign: 'edit', close: 'edit', reopen: 'edit',
  delete: 'delete', remove: 'delete', destroy: 'delete',
  export: 'export', print: 'export', download: 'export',
};

export function canEdit(pathname: string): boolean {
  return isActionAllowed(pathname, 'edit');
}

export function canDelete(pathname: string): boolean {
  return isActionAllowed(pathname, 'delete');
}

export function canExportPrint(pathname: string): boolean {
  return isActionAllowed(pathname, 'export');
}

export function actionOf(permissionCode: string): CentralAction {
  const suffix = String(permissionCode || '').split('.').pop()?.toLowerCase() || '';
  return ACTION_BY_SUFFIX[suffix] || 'edit';
}

export function isActionAllowed(pathname: string, action: CentralAction): boolean {
  if (!isPageVisible(pathname)) return false;
  const fp = forPath(pathname);
  if (!fp) return true;
  if (action === 'view') return true;
  if (fp.allowViewOnly) return false;
  if (action === 'delete') return fp.canDelete !== false;
  if (action === 'export') return fp.canExportPrint !== false;
  return fp.canEdit !== false;
}

export function disabledPermissions(): string[] {
  return getCachedDisabledPermissions();
}

export function isPermissionDisabled(permissionCode: string): boolean {
  const code = String(permissionCode || '');
  if (!code || code === '*') return false;
  return disabledPermissions().includes(code);
}

export function allowsPermission(permissionCode: string, pathname?: string): boolean {
  const code = String(permissionCode || '');
  if (isPermissionDisabled(code)) return false;
  if (!code || code === '*' || !code.includes('.')) return true;
  const path = pathname ?? getCurrentPath();
  return isActionAllowed(path, actionOf(code));
}
