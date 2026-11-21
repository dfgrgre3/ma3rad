import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CentralFeaturePermissionService } from '../../../services/domains/licensing/CentralFeaturePermissionService';
import { CENTRAL_CONFIG_CHANGED_EVENT } from '../../../services/domains/licensing/CentralLicenseService';

export interface PageAccess {
  /** Page is neither hidden by menu config nor disabled by its feature flag. */
  visible: boolean;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExportPrint: boolean;
  /**
   * Central-config check for an arbitrary permission code (granular `ui.*` or
   * legacy). False when the code is centrally disabled or its action category
   * is disallowed on this page (view-only / canEdit=false / etc.).
   */
  allows: (code: string) => boolean;
  /** Central action-level check independent of role grants. */
  actionAllowed: (action: 'view' | 'create' | 'edit' | 'delete' | 'export') => boolean;
}

/**
 * Page-level access derived from the signed central configuration. Re-evaluates
 * when a new central config arrives (CENTRAL_CONFIG_CHANGED_EVENT) or the window
 * regains focus, so admin changes propagate without a reload.
 */
export function usePageAccess(pathname?: string): PageAccess {
  const location = useLocation();
  const path = pathname || location.pathname;
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((r) => r + 1);
    window.addEventListener(CENTRAL_CONFIG_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(CENTRAL_CONFIG_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return useMemo(() => {
    void revision;
    return {
      visible: CentralFeaturePermissionService.isPageVisible(path),
      canView: CentralFeaturePermissionService.canView(path),
      canEdit: CentralFeaturePermissionService.canEdit(path),
      canDelete: CentralFeaturePermissionService.canDelete(path),
      canExportPrint: CentralFeaturePermissionService.canExportPrint(path),
      allows: (code: string) => CentralFeaturePermissionService.allowsPermission(code, path),
      actionAllowed: (action) => CentralFeaturePermissionService.isActionAllowed(path, action),
    };
  }, [path, revision]);
}

export default usePageAccess;
