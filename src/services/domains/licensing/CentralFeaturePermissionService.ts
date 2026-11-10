import {
  setCurrentPath as _setCurrentPath,
  getCurrentPath as _getCurrentPath,
  list as _list,
  forPath as _forPath,
  isPageVisible as _isPageVisible,
  canView as _canView,
} from './CentralFeaturePermissionService_part01';
import {
  canEdit as _canEdit,
  canDelete as _canDelete,
  canExportPrint as _canExportPrint,
  actionOf as _actionOf,
  isActionAllowed as _isActionAllowed,
  disabledPermissions as _disabledPermissions,
  isPermissionDisabled as _isPermissionDisabled,
  allowsPermission as _allowsPermission,
} from './CentralFeaturePermissionService_part02';

export interface CentralFeaturePermission {
  id?: string;
  section?: string;
  featureName?: string;
  pageUrl?: string;
  pageVisible?: boolean;
  featureEnabled?: boolean;
  allowViewOnly?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canExportPrint?: boolean;
}

/** Central action categories derived from permission-code suffixes. */
export type CentralAction = 'view' | 'create' | 'edit' | 'delete' | 'export';

export class CentralFeaturePermissionService {
  static setCurrentPath(pathname: string): void { _setCurrentPath(pathname); }
  static getCurrentPath(): string { return _getCurrentPath(); }
  static list(): CentralFeaturePermission[] { return _list(); }
  static forPath(pathname: string): CentralFeaturePermission | undefined { return _forPath(pathname); }
  static isPageVisible(pathname: string): boolean { return _isPageVisible(pathname); }
  static canView(pathname: string): boolean { return _canView(pathname); }
  static canEdit(pathname: string): boolean { return _canEdit(pathname); }
  static canDelete(pathname: string): boolean { return _canDelete(pathname); }
  static canExportPrint(pathname: string): boolean { return _canExportPrint(pathname); }
  static actionOf(permissionCode: string): CentralAction { return _actionOf(permissionCode); }
  static isActionAllowed(pathname: string, action: CentralAction): boolean { return _isActionAllowed(pathname, action); }
  static disabledPermissions(): string[] { return _disabledPermissions(); }
  static isPermissionDisabled(permissionCode: string): boolean { return _isPermissionDisabled(permissionCode); }
  static allowsPermission(permissionCode: string, pathname?: string): boolean { return _allowsPermission(permissionCode, pathname); }
}
