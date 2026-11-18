import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionChecker } from '../../../services/domains/auth/permissions/permissionChecker';
import {
  screenPermissionBase,
  screenRequirementFor,
  tabPermissionCode,
} from '../../../config/screenRegistry';
import type { User } from '../../../types';

export interface ScreenAccess {
  allowed: boolean;
  /** أكواد المتطلب الموحّد التي لم تتحقق (للعرض/التفسير). */
  missing: string[];
}

const evaluateRequirement = (
  requirement: ReturnType<typeof screenRequirementFor>,
  subject: User | null
): ScreenAccess => {
  if (!requirement) return { allowed: true, missing: [] };
  const missing = requirement.all.filter((code) => !PermissionChecker.hasRoleGrant(subject, code));
  const anyMissing =
    requirement.any.length > 0 &&
    !requirement.any.some((code) => PermissionChecker.hasRoleGrant(subject, code));
  if (anyMissing) missing.push(...requirement.any);
  return { allowed: missing.length === 0 && !anyMissing, missing };
};

/**
 * فحص الوصول الموحّد لشاشة/مسار — نفس قاعدة AuthorizationService.checkScreen:
 * قاعدة المسار (all/any) + صلاحية عرض الصفحة ui.* معاً، من ScreenRegistry.
 *
 *   const screen = useScreenPermission('/inventory/transfers');
 *   {screen.allowed ? <Page/> : <NoAccess/>}
 */
export function useScreenPermission(path: string, user?: User | null): ScreenAccess {
  const subject = user ?? AuthService.getCurrentUser();
  return evaluateRequirement(screenRequirementFor(path), subject);
}

/**
 * فحص شاشة + تبويب/قسم في آن واحد. التبويب يُقيَّد فقط إذا كانت صلاحية
 * قسمه معرّفة في المصفوفة (ui.<module>.<page>.section.<tab>.view) —
 * المفاتيح غير المعرّفة لا تُخفى (fail-open) لتفادي كسر تبويبات قائمة.
 *
 *   const tab = useScreenTabPermission('/sales', 'payments');
 *   {tab.allowed && <PaymentsTab/>}
 */
export function useScreenTabPermission(
  path: string,
  tabKey: string,
  user?: User | null
): ScreenAccess {
  const subject = user ?? AuthService.getCurrentUser();
  const screen = evaluateRequirement(screenRequirementFor(path), subject);
  if (!screen.allowed) return screen;
  const base = screenPermissionBase(path);
  const tabCode = base ? tabPermissionCode(base, tabKey) : null;
  if (tabCode && !PermissionChecker.hasRoleGrant(subject, tabCode)) {
    return { allowed: false, missing: [tabCode] };
  }
  return { allowed: true, missing: [] };
}

export default useScreenPermission;
