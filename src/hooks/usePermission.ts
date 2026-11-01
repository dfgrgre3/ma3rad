import { useCallback, useEffect, useState } from 'react';
import { AuthService } from '../services/AuthService';
import { PermissionService } from '../services/PermissionService';
import { CENTRAL_CONFIG_CHANGED_EVENT } from '../services/CentralLicenseService';
import type { User } from '../types';

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
    (code: string) => PermissionService.can(subject, code),
    // PermissionService caches per user; role changes invalidate the cache.
    // revision يضمن إعادة التقييم عند وصول قيود مركزية جديدة.
    [subject?.id, subject?.role, revision]
  );
}

export function useAnyPermission(user?: User | null) {
  const subject = user ?? AuthService.getCurrentUser();
  const revision = useCentralRevision();
  return useCallback(
    (codes: string[]) => PermissionService.canAny(subject, codes),
    [subject?.id, subject?.role, revision]
  );
}
