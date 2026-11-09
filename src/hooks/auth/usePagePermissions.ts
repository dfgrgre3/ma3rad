import { useCallback, useMemo } from 'react';
import { usePermission } from './usePermission';
import { AuthService } from '../../services/auth/AuthService';
import { PermissionService } from '../../services/auth/PermissionService';
import type { User } from '../../types';

/**
 * واجهة موحّدة لصلاحيات صفحة معيّنة:
 *
 *   const perm = usePagePermissions('ui.sales.invoices');
 *   {perm.action('create') && <button>إضافة</button>}
 *   {perm.section('totals') && <TotalsSection />}
 *   onClick={() => perm.assert('delete')}
 *
 * `base` هو بادئة الصلاحية المولّدة من permissionMatrix، مثل
 * `ui.sales.invoices` أو `ui.inventory.counts`.
 */
export function usePagePermissions(base: string, user?: User | null) {
  const can = usePermission(user);
  const subject = user ?? AuthService.getCurrentUser();

  const action = useCallback((name: string) => can(`${base}.${name}`), [base, can]);
  const section = useCallback(
    (name: string, name2 = 'view') => can(`${base}.section.${name}.${name2}`),
    [base, can]
  );
  const view = useCallback(() => can(`${base}.view`), [base, can]);
  const any = useCallback(
    (codes: string[]) => codes.some((code) => can(code.startsWith('ui.') ? code : `${base}.${code}`)),
    [base, can]
  );
  const all = useCallback(
    (codes: string[]) => codes.every((code) => can(code.startsWith('ui.') ? code : `${base}.${code}`)),
    [base, can]
  );

  /** يرمي خطأً موحّداً إذا لم تتوفر الصلاحية (للأزرار الحساسة). */
  const assert = useCallback(
    (name: string) => PermissionService.require(subject ?? null, `${base}.${name ?? 'view'}`),
    [base, subject]
  );

  return useMemo(
    () => ({ can, view, action, section, any, all, assert, base }),
    [can, view, action, section, any, all, assert, base]
  );
}
