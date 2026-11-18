import { useCallback } from 'react';
import { useAnyPermission } from './usePermission';
import type { User } from '../../../types';

/**
 * يقيّم صلاحيات تبويبات شاشة واحدة بشكل موحّد.
 *
 * كل تبويب يُربط بقائمة أكواد صلاحيات موجودة فعلاً في كتالوج الصلاحيات:
 *   - قائمة فارغة = تبويب عام ضمن شاشة محمية أصلاً (لا تقييد إضافي).
 *   - غير فارغة = يجب تحقق أحد الأكواد (canAny) لعرض التبويب أو تحميل بياناته.
 *
 * الغرض: إخفاء التبويبات الحساسة (رواتب/مالية/مستندات/تأمينات…) عن الأدوار
 * التي لا تملك صلاحية نطاقها، ومنع جلب بياناتها حتى لو طُلب التبويب برمجياً.
 * الإخفاء هنا طبقة عرض فقط — الإنفاذ الحقيقي يبقى في خدمات الـ API.
 *
 *   const TAB_PERMISSIONS = { payroll: ['hr.payroll.view'], documents: ['hr.documents.view'] } as const;
 *   const canTab = useTabPermissions(TAB_PERMISSIONS);
 *   const visibleTabs = tabs.filter((t) => canTab(t.id));
 */
export function useTabPermissions<T extends string>(
  requirements: Record<T, readonly string[]>,
  user?: User | null,
): (tab: T) => boolean {
  const canAny = useAnyPermission(user);
  return useCallback(
    (tab: T): boolean => {
      const codes = requirements[tab];
      return !codes || codes.length === 0 || canAny([...codes]);
    },
    // `requirements` تُمرَّر عادة كثابت على مستوى الوحدة؛ canAny تتغير فقط
    // عند تغيّر المستخدم أو التكوين المركزي.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canAny],
  );
}

export default useTabPermissions;
