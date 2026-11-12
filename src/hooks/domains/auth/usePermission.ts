import { useCallback, useEffect, useState } from 'react';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { CENTRAL_CONFIG_CHANGED_EVENT } from '../../../services/domains/licensing/CentralLicenseService';
import type { User } from '../../../types';

/**
 * رقم مراجعة يتغيّر عند وصول تكوين مركزي جديد، لإعادة تقييم الصلاحيات
 * وإخفاء/إظهار الأزرار المرتبطة بها دون إعادة تحميل التطبيق.
 */
function useCentralRevision(): number {
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
  return revision;
}

/**
 * Returns a stable `can(code)` checker bound to the current user (or an
 * explicit one). Use it for conditional rendering of buttons and fields.
 */
export function usePermission(user?: User | null) {
  const subject = user ?? AuthService.getCurrentUser();
  const revision = useCentralRevision();
  return useCallback(
    (code: string) => {
      void revision; // Re-evaluate when central config changes
      return PermissionService.can(subject, code);
    },
    [subject, revision]
  );
}

export function useAnyPermission(user?: User | null) {
  const subject = user ?? AuthService.getCurrentUser();
  const revision = useCentralRevision();
  return useCallback(
    (codes: string[]) => {
      void revision; // Re-evaluate when central config changes
      return PermissionService.canAny(subject, codes);
    },
    [subject, revision]
  );
}
