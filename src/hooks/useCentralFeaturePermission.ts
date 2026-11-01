import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CentralFeaturePermissionService } from '../services/CentralFeaturePermissionService';
import { CENTRAL_CONFIG_CHANGED_EVENT } from '../services/CentralLicenseService';

export function useCentralFeaturePermission(pathname?: string) {
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

  return useMemo(() => ({
    visible: CentralFeaturePermissionService.isPageVisible(path),
    canView: CentralFeaturePermissionService.canView(path),
    canEdit: CentralFeaturePermissionService.canEdit(path),
    canDelete: CentralFeaturePermissionService.canDelete(path),
    canExportPrint: CentralFeaturePermissionService.canExportPrint(path),
  }), [path, revision]);
}
