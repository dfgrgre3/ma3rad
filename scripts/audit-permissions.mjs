/**
 * audit-permissions.mjs — المرحلة 0 من توحيد الصلاحيات (البند 1.3)
 *
 * يقارن ثلاثة مصادر مستقلة لحقيقة «من يفتح أي مسار»:
 *   1) RouteGuard → PAGE_VIEW_PERMISSIONS (أكواد ui.* الدقيقة من permissionMatrix)
 *   2) ROUTE_PERMISSIONS (أكواد legacy في routePermissions.ts)
 *   3) عناصر القوائم NAV_GROUPS (perm/perms/anyPerms — تُدمج مع ROUTE_PERMISSIONS
 *      داخل NavigationService.permissionRoutes وتُستخدم من useRouteAccess للتبويبات)
 *
 * ويقارنها بالمسارات المعلنة فعلياً في routesList.tsx، ويمسح صفحات التبويبات
 * لتصنيفها: تبويبات مفلترة بالصلاحيات (useRouteAccess/WorkspaceHub) مقابل
 * تبويبات داخلية بلا فحص.
 *
 * الناتج: docs/reports/permissions-audit-report.md + .json
 *
 * التشغيل:  node scripts/audit-permissions.mjs
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const OUT_DIR = join(ROOT, 'docs', 'reports');
const TMP = join(tmpdir(), `perm-audit-${process.pid}`);
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

// ─── 1) Bundle config modules so we can import real data, not regex guesses ──
const entries = {
  permissionMatrix: join(SRC, 'config/permissionMatrix.ts'),
  routePermissions: join(SRC, 'config/routePermissions.ts'),
  navigation: join(SRC, 'config/navigation.tsx'),
};
await build({
  entryPoints: Object.values(entries),
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: TMP,
  outExtension: { '.js': '.mjs' },
  logLevel: 'silent',
});

const matrix = await import(pathToFileURL(join(TMP, 'permissionMatrix.mjs')).href);
const routePerms = await import(pathToFileURL(join(TMP, 'routePermissions.mjs')).href);
const navMod = await import(pathToFileURL(join(TMP, 'navigation.mjs')).href);

const { PAGE_VIEW_PERMISSIONS, GRANULAR_PERMISSIONS, GRANULAR_LEGACY_MAP, GRANULAR_LEGACY_ALIASES } = matrix;
const { ROUTE_PERMISSIONS } = routePerms;
const { NAV_GROUPS } = navMod;

// ─── 2) Canonicalisation: every code → set of "grant tokens" that satisfy it ──
// hasRoleGrant semantics: a grant G satisfies required R iff G === R, or
// G ∈ legacyCodes(R) (legacy + legacyAliases), or module wildcards. We ignore
// wildcards here (they satisfy everything) and compare exact-code equivalence.
const legacyCodesOf = (code) => {
  const set = new Set([code]);
  const legacy = GRANULAR_LEGACY_MAP[code];
  if (legacy) set.add(legacy);
  for (const a of GRANULAR_LEGACY_ALIASES[code] ?? []) set.add(a);
  return set;
};
const canonicalOf = (code) => {
  // canonical token = first legacy code (stable across granular/legacy spellings)
  const legacy = GRANULAR_LEGACY_MAP[code];
  if (legacy) return legacy;
  const aliases = GRANULAR_LEGACY_ALIASES[code];
  if (aliases?.length) return aliases[0];
  return code;
};
const acceptTokens = (code) => {
  // tokens that would satisfy this required code when granted literally
  return new Set(legacyCodesOf(code));
};

// ─── 3) Merge route rules exactly like NavigationService.permissionRoutes ────
const navRules = NAV_GROUPS.flatMap((group) =>
  group.items.flatMap((item) => {
    const itemAll = [...(item.perms ?? []), ...(item.perm ? [item.perm] : [])];
    const itemAny = item.anyPerms ?? [];
    const groupAll = [...(group.perms ?? []), ...(group.perm ? [group.perm] : [])];
    const all = itemAll.length || itemAny.length ? itemAll : groupAll;
    const any = itemAny.length ? itemAny : group.anyPerms ?? [];
    return all.length || any.length ? [{ path: item.to, all, any, label: item.label }] : [];
  })
);
const mergedRules = [...ROUTE_PERMISSIONS.map((r) => ({ ...r, label: null })), ...navRules];

const matchRule = (pathname) => {
  let best = null;
  for (const r of mergedRules) {
    if ((pathname === r.path || pathname.startsWith(`${r.path}/`)) && r.path.length > (best?.path.length ?? -1)) {
      best = r;
    }
  }
  return best;
};

// PAGE_VIEW_PERMISSIONS supports ':param' patterns; mirror getPagePermission
const pageViewFor = (pathname) => {
  let best = null;
  for (const [route, perm] of Object.entries(PAGE_VIEW_PERMISSIONS)) {
    let matched = route === pathname;
    if (!matched && route.includes(':')) {
      matched = new RegExp(`^${route.replace(/:[^/]+/g, '[^/]+')}$`).test(pathname);
    } else if (!matched) {
      matched = pathname.startsWith(`${route}/`);
    }
    if (matched && (!best || route.length > best.route.length)) best = { route, perm };
  }
  return best?.perm ?? null;
};

// ─── 4) Declared routes from routesList.tsx ──────────────────────────────────
const routesSrc = readFileSync(join(SRC, 'router/routesList.tsx'), 'utf8');
const declaredPaths = [...routesSrc.matchAll(/path:\s*'([^']+)'/g)].map((m) => `/${m[1]}`);

// ─── 5) Tab scan over src/pages ───────────────────────────────────────────────
const pagesDir = join(SRC, 'pages');
const tabFiles = [];
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e)) {
      const src = readFileSync(p, 'utf8');
      const hasTabs = /activeTab|setActiveTab|currentTab|WorkspaceHub|TabsTrigger|tab ===|tab===/.test(src);
      if (!hasTabs) continue;
      const mechanisms = [];
      if (/useRouteAccess/.test(src)) mechanisms.push('useRouteAccess');
      if (/WorkspaceHub/.test(src)) mechanisms.push('WorkspaceHub');
      if (/canPlatform|usePlatformPermission|PlatformAuthorizationService|PlatformStaffAuthService/.test(src)) {
        mechanisms.push('platform-rbac');
      }
      if (/PermissionService|usePermission|usePagePermissions|PermissionGate/.test(src)) mechanisms.push('permission-checks');
      if (/useRouteAccess|WorkspaceHub/.test(src) && !/PermissionService|usePermission|usePagePermissions|PermissionGate|canPlatform|usePlatformPermission|PlatformAuthorizationService|PlatformStaffAuthService/.test(src)) {
        mechanisms.push('route-rules-only');
      }
      // extract WorkspaceHub tab paths
      const tabPaths = [...src.matchAll(/path:\s*'(\/[^']+)'/g)].map((m) => m[1]);
      tabFiles.push({
        file: relative(ROOT, p).replace(/\\/g, '/'),
        mechanisms,
        guarded: mechanisms.length > 0,
        tabPaths: [...new Set(tabPaths)],
      });
    }
  }
};
walk(pagesDir);

// ─── 6) Per-path comparison ───────────────────────────────────────────────────
const allPaths = new Set([
  ...Object.keys(PAGE_VIEW_PERMISSIONS),
  ...ROUTE_PERMISSIONS.map((r) => r.path),
  ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to)),
  ...declaredPaths,
]);
// '/*' هو مسار NotFound catch-all في routesList — ليس صفحة صلاحيات.
allPaths.delete('/*');

const rows = [];
for (const path of [...allPaths].sort()) {
  const guardPerm = pageViewFor(path); // may be a param-pattern perm for concrete paths
  const exactGuard = PAGE_VIEW_PERMISSIONS[path] ?? null;
  const rule = matchRule(path);
  const navItem = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === path);

  const guardCodes = guardPerm ? [guardPerm] : [];
  const ruleAll = rule?.all ?? [];
  const ruleAny = rule?.any ?? [];
  const ruleCodes = [...ruleAll, ...ruleAny];
  const navCodes = navItem
    ? [...(navItem.perms ?? []), ...(navItem.perm ? [navItem.perm] : []), ...(navItem.anyPerms ?? [])]
    : [];

  const inDeclared = declaredPaths.includes(path)
    || declaredPaths.some((d) => d.includes(':') && new RegExp(`^${d.replace(/:[^/]+/g, '[^/]+')}$`).test(path));

  const flags = [];
  if (!exactGuard && !guardPerm) flags.push('NO_GUARD_PERMISSION');
  else if (!exactGuard && guardPerm) flags.push('GUARD_VIA_PATTERN_ONLY');
  if (!rule) flags.push('NO_ROUTE_RULE');
  if (!navItem) flags.push('NOT_IN_NAV');
  if (!inDeclared) flags.push('NOT_A_DECLARED_ROUTE');

  // divergence: guard requires a code the merged rules would never accept
  if (guardPerm && ruleCodes.length) {
    const guardAccept = acceptTokens(guardPerm);
    const ruleAccept = new Set(ruleCodes.flatMap((c) => [...acceptTokens(c)]));
    let shared = false;
    for (const t of guardAccept) if (ruleAccept.has(t)) { shared = true; break; }
    if (!shared) flags.push('GUARD_VS_RULES_DIVERGE');
  }

  rows.push({
    path,
    guard: guardPerm,
    guardLegacy: guardPerm ? canonicalOf(guardPerm) : null,
    rule: rule ? { all: ruleAll, any: ruleAny, source: rule.label ? 'nav' : 'routePermissions', path: rule.path } : null,
    navPerms: navCodes.length ? navCodes : null,
    declared: inDeclared,
    flags,
  });
}

// routes declared but matched by nothing
const uncovered = rows.filter((r) => r.flags.includes('NO_GUARD_PERMISSION') && r.flags.includes('NO_ROUTE_RULE'));

// ─── 7) Report ────────────────────────────────────────────────────────────────
const diverged = rows.filter((r) => r.flags.includes('GUARD_VS_RULES_DIVERGE'));
const noGuard = rows.filter((r) => r.flags.includes('NO_GUARD_PERMISSION'));
const noRule = rows.filter((r) => r.flags.includes('NO_ROUTE_RULE'));
const tabbedUnguarded = tabFiles.filter((t) => !t.guarded);
const tabbedGuarded = tabFiles.filter((t) => t.guarded);

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    totalPathsCompared: rows.length,
    declaredRoutes: declaredPaths.length,
    pageViewEntries: Object.keys(PAGE_VIEW_PERMISSIONS).length,
    routePermissionRules: ROUTE_PERMISSIONS.length,
    navItems: NAV_GROUPS.reduce((n, g) => n + g.items.length, 0),
    granularPermissions: GRANULAR_PERMISSIONS.length,
    sectionPermissions: GRANULAR_PERMISSIONS.filter((p) => p.code.includes('.section.')).length,
    pagesWithTabs: tabFiles.length,
    tabbedPagesGuarded: tabbedGuarded.length,
    tabbedPagesUnguarded: tabbedUnguarded.length,
    pathsGuardVsRulesDiverge: diverged.length,
    pathsNoGuardPermission: noGuard.length,
    pathsNoRouteRule: noRule.length,
    pathsUncoveredByAnything: uncovered.length,
  },
  divergences: diverged,
  noGuardPermission: noGuard,
  noRouteRule: noRule,
  uncoveredPaths: uncovered,
  tabbedPages: { guarded: tabbedGuarded, unguarded: tabbedUnguarded },
  allRows: rows,
};

writeFileSync(join(OUT_DIR, 'permissions-audit-report.json'), JSON.stringify(report, null, 2));

const md = [];
md.push('# تدقيق توحيد الصلاحيات — المرحلة 0');
md.push('');
md.push(`تاريخ التوليد: ${report.generatedAt}`);
md.push('');
md.push('## الملخص');
md.push('');
md.push('| المقياس | القيمة |');
md.push('|---|---|');
for (const [k, v] of Object.entries(report.summary)) md.push(`| ${k} | ${v} |`);
md.push('');
md.push('## المسارات المتضاربة (حارس المسار ≠ قواعد المسار/التبويبات)');
md.push('');
if (!diverged.length) md.push('_لا يوجد._');
for (const r of diverged) {
  md.push(`- \`${r.path}\` — الحارس: \`${r.guard}\` (legacy: ${r.guardLegacy}) | القاعدة: all=${JSON.stringify(r.rule?.all)} any=${JSON.stringify(r.rule?.any)}`);
}
md.push('');
md.push('## مسارات بلا صلاحية حارس (PAGE_VIEW_PERMISSIONS)');
md.push('');
for (const r of noGuard) md.push(`- \`${r.path}\` ${r.flags.join(', ')}`);
md.push('');
md.push('## مسارات بلا قاعدة مسار/تبويب (ROUTE_PERMISSIONS + القوائم)');
md.push('');
for (const r of noRule) md.push(`- \`${r.path}\` ${r.flags.join(', ')}`);
md.push('');
md.push('## صفحات التبويبات');
md.push('');
md.push(`صفحات تحوي تبويبات: ${tabFiles.length} — مفلترة بالصلاحيات: ${tabbedGuarded.length} — بلا فحص: ${tabbedUnguarded.length}`);
md.push('');
md.push('### تبويبات بلا أي فحص صلاحيات');
md.push('');
for (const t of tabbedUnguarded) md.push(`- \`${t.file}\``);
md.push('');
md.push('### تبويبات مفلترة');
md.push('');
for (const t of tabbedGuarded) md.push(`- \`${t.file}\` — ${t.mechanisms.join(' + ')}`);
md.push('');
writeFileSync(join(OUT_DIR, 'permissions-audit-report.md'), md.join('\n'));

console.log(JSON.stringify(report.summary, null, 2));
console.log(`\nReport: ${join(OUT_DIR, 'permissions-audit-report.md')}`);
