/**
 * ScreenRegistry — المصدر الموحد الوحيد لتعريف الشاشات (المسارات).
 * ------------------------------------------------------------------
 * يدمج مصادر الصلاحيات الثلاثة التي كانت متفرقة:
 *   1) ROUTE_PERMISSIONS        — قواعد المسارات (all/any)
 *   2) عناصر NAV_GROUPS         — صلاحيات عناصر القوائم (نفس منطق
 *      NavigationService.permissionRoutes: صلاحيات العنصر تتقدم على
 *      صلاحيات المجموعة، وأول قاعدة لنفس المسار تكسب)
 *   3) PAGE_VIEW_PERMISSIONS    — صلاحية عرض الصفحة ui.* الدقيقة
 *
 * الدلالة الموحدة (مطابقة للسلوك الحالي):
 *   - قاعدة المسار: كل `all` + واحد على الأقل من `any` (أطول مسار مطابق).
 *   - صلاحية الصفحة: كود ui.* واحد (أدق نمط مطابق، يدعم :param).
 *   - RequirementFor = AND بينهما — تماماً ما يفرضه RouteGuard +
 *     useRouteAccess اليوم، لكن من نقطة واحدة.
 *
 * تُبذر النتيجة في جدول screen_permissions عبر PermissionSeeder،
 * ويقيّمها AuthorizationService كبُعد `screen`.
 */
import { NAV_GROUPS } from './navigation';
import { PAGE_VIEW_PERMISSIONS, GRANULAR_PERMISSIONS } from './permissionMatrix';
import { ROUTE_PERMISSIONS } from './routePermissions';

export interface ScreenRequirement {
  /** كل هذه الأكواد يجب أن تتحقق (hasRoleGrant). */
  all: string[];
  /** إذا لم تكن فارغة، يكفي تحقق واحد منها. */
  any: string[];
  /** نمط المسار الذي ساهم في القاعدة (لأغراض التدقيق). */
  pathPattern: string | null;
}

export interface ScreenDef {
  screenKey: string;
  pathPattern: string;
  tabKey: string | null;
  requiredAll: string[];
  requiredAny: string[];
  labelAr: string | null;
  sources: Array<'route' | 'nav' | 'page'>;
}

interface RouteRule {
  path: string;
  all: string[];
  any: string[];
  source: 'route' | 'nav';
}

interface PageRule {
  pathPattern: string;
  code: string;
  label: string | null;
}

// ─── قواعد المسارات (ROUTE_PERMISSIONS ثم عناصر القوائم) ─────────────────────
const routeRules: RouteRule[] = [];
const seenRulePaths = new Set<string>();

const addRouteRule = (path: string, all: string[], any: string[], source: 'route' | 'nav'): void => {
  if (seenRulePaths.has(path)) return; // أول قاعدة تفوز — مثل NavigationService
  seenRulePaths.add(path);
  routeRules.push({ path, all: [...all], any: [...any], source });
};

for (const rule of ROUTE_PERMISSIONS) {
  addRouteRule(rule.path, rule.all ?? [], rule.any ?? [], 'route');
}

for (const group of NAV_GROUPS) {
  for (const item of group.items) {
    const itemPermissions = [...(item.perms ?? []), ...(item.perm ? [item.perm] : [])];
    const itemAny = item.anyPerms ?? [];
    const groupPermissions = [...(group.perms ?? []), ...(group.perm ? [group.perm] : [])];
    const all = itemPermissions.length || itemAny.length ? itemPermissions : groupPermissions;
    const any = itemAny.length ? itemAny : group.anyPerms ?? [];
    if (all.length || any.length) addRouteRule(item.to, all, any, 'nav');
  }
}

// ─── قواعد عرض الصفحة (PAGE_VIEW_PERMISSIONS) ────────────────────────────────
const pageLabelByCode = new Map(
  GRANULAR_PERMISSIONS.filter((p) => p.kind === 'page').map((p) => [p.code, p.group])
);
const navLabelByPath = new Map(
  NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.to, item.label] as const))
);

const pageRules: PageRule[] = Object.entries(PAGE_VIEW_PERMISSIONS).map(([pathPattern, code]) => ({
  pathPattern,
  code,
  label: pageLabelByCode.get(code) ?? navLabelByPath.get(pathPattern) ?? null,
}));

// ─── المطابقة (نفس دلالات PermissionChecker/NavigationService) ────────────────
const pagePatternMatches = (pattern: string, pathname: string): boolean => {
  if (pattern === pathname) return true;
  if (pattern.includes(':')) {
    return new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`).test(pathname);
  }
  return pathname.startsWith(`${pattern}/`);
};

const longestMatch = <T extends { path: string }>(rules: T[], pathname: string): T | null => {
  let best: T | null = null;
  for (const rule of rules) {
    if (pathname === rule.path || pathname.startsWith(`${rule.path}/`)) {
      if (!best || rule.path.length > best.path.length) best = rule;
    }
  }
  return best;
};

const longestPageMatch = (pathname: string): PageRule | null => {
  let best: PageRule | null = null;
  for (const rule of pageRules) {
    if (!pagePatternMatches(rule.pathPattern, pathname)) continue;
    if (!best || rule.pathPattern.length > best.pathPattern.length) best = rule;
  }
  return best;
};

/**
 * المتطلب الموحّد لمسار معيّن: قاعدة المسار (أطول مطابقة) + صلاحية الصفحة
 * (أدق نمط). null = لا شاشة معرّفة → لا تقييد من بُعد screen.
 */
export function screenRequirementFor(pathname: string | null | undefined): ScreenRequirement | null {
  if (!pathname) return null;
  const rule = longestMatch(routeRules, pathname);
  const page = longestPageMatch(pathname);
  const all = new Set<string>(rule?.all ?? []);
  if (page) all.add(page.code);
  const any = rule?.any ?? [];
  if (all.size === 0 && any.length === 0) return null;
  return {
    all: [...all],
    any: [...any],
    pathPattern: rule?.path ?? page?.pathPattern ?? null,
  };
}

/** كل الشاشات المعرفة — تُستخدم لبذر screen_permissions وللعرض في مصفوفة الأدوار. */
export function listScreens(): ScreenDef[] {
  const patterns = new Set<string>([
    ...routeRules.map((rule) => rule.path),
    ...pageRules.map((rule) => rule.pathPattern),
  ]);
  return [...patterns].map((pattern) => {
    const rule = routeRules.find((r) => r.path === pattern) ?? null;
    const page = pageRules.find((p) => p.pathPattern === pattern) ?? null;
    const sources: ScreenDef['sources'] = [];
    if (rule) sources.push(rule.source);
    if (page) sources.push('page');
    const all = new Set<string>(rule?.all ?? []);
    if (page) all.add(page.code);
    return {
      screenKey: pattern,
      pathPattern: pattern,
      tabKey: null,
      requiredAll: [...all],
      requiredAny: [...(rule?.any ?? [])],
      labelAr: page?.label ?? navLabelByPath.get(pattern) ?? null,
      sources,
    };
  });
}

const SECTION_VIEW_CODES = new Set(
  GRANULAR_PERMISSIONS.filter((p) => p.kind === 'section').map((p) => p.code)
);

/** بادئة صلاحيات الصفحة الدقيقة لمسار معيّن (مثل ui.sales.invoices) أو null. */
export function screenPermissionBase(pathname: string | null | undefined): string | null {
  const page = pathname ? longestPageMatch(pathname) : null;
  if (!page || !page.code.endsWith('.view')) return null;
  return page.code.slice(0, -'.view'.length);
}

/**
 * هل معرّفة صلاحية عرض لقسم/تبويب بهذا المفتاح داخل الشاشة؟
 * يُستخدم حتى لا نخفي تبويباً غير معرّف في المصفوفة (fail-open على المفاتيح
 * غير المعروفة، fail-closed على المعرّفة).
 */
export function hasTabPermission(base: string, tabKey: string): boolean {
  return SECTION_VIEW_CODES.has(`${base}.section.${tabKey}.view`);
}

/** كود صلاحية عرض قسم/تبويب — null إذا لم يكن معرّفاً في المصفوفة. */
export function tabPermissionCode(base: string, tabKey: string): string | null {
  const code = `${base}.section.${tabKey}.view`;
  return SECTION_VIEW_CODES.has(code) ? code : null;
}
