import { NAV_GROUPS, NAV_STORAGE_KEYS, type NavGroupDef } from '../../../config/navigation';
import { getModulePathOwner } from '../../../config/moduleRegistry';
import { ModuleRegistryService } from './ModuleRegistryService';
import { SettingsService } from './SettingsService';
import { PermissionService } from '../auth/PermissionService';
import { AuthService } from '../auth/AuthService';
import type { User } from '../../../types';
import { resolveBusinessTerm, type BusinessTermKey } from '../../../config/businessTerminology';
import { TerminologyService } from './TerminologyService';
import { AppConfigService } from './AppConfigService';
import { CentralLicenseService } from '../licensing/CentralLicenseService';
import { CentralFeaturePermissionService } from '../licensing/CentralFeaturePermissionService';
import { ROUTE_PERMISSIONS } from '../../../config/routePermissions';

export interface NavOverrides {
  hidden: string[];
  labels: Record<string, string>;
  groupsOrder: string[];
  itemsOrder: Record<string, string[]>;
  groupAssignments: Record<string, string>;
}

const LEGACY_GROUP_IDS: Record<string, string> = {
  products: 'inventory',
  partners: 'crm',
  approvals: 'documents',
};

const LEGACY_PATHS: Record<string, string> = {
  '/sales/reservations': '/sales/orders-deposits',
};

const LEGACY_DEFAULT_GROUP_ORDER = [
  'dashboard', 'daily', 'sales', 'inventory', 'products', 'crm', 'purchasing',
  'partners', 'finance', 'operations', 'reports', 'approvals', 'documents', 'system',
];

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseGroupAssignments(raw: string | undefined): Record<string, string> {
  const parsed = parseJson<unknown>(raw, {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const knownGroups = new Set(NAV_GROUPS.map((group) => group.id));
  const knownPaths = new Set(NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to)));

  return Object.entries(parsed).reduce<Record<string, string>>((assignments, [savedPath, savedGroupId]) => {
    const path = LEGACY_PATHS[savedPath] ?? savedPath;
    const groupId = typeof savedGroupId === 'string' ? LEGACY_GROUP_IDS[savedGroupId] ?? savedGroupId : '';
    if (knownPaths.has(path) && knownGroups.has(groupId)) {
      assignments[path] = groupId;
    }
    return assignments;
  }, {});
}

function normalizeGroupsOrder(saved: string[]): string[] {
  if (
    saved.length === LEGACY_DEFAULT_GROUP_ORDER.length
    && saved.every((groupId, index) => groupId === LEGACY_DEFAULT_GROUP_ORDER[index])
  ) return [];
  return [...new Set(saved.map((groupId) => LEGACY_GROUP_IDS[groupId] ?? groupId))];
}

function normalizeItemsOrder(saved: Record<string, string[]>): Record<string, string[]> {
  return Object.entries(saved).reduce<Record<string, string[]>>((orders, [savedGroupId, paths]) => {
    const groupId = LEGACY_GROUP_IDS[savedGroupId] ?? savedGroupId;
    if (!Array.isArray(paths)) return orders;
    const normalizedPaths = paths.map((path) => LEGACY_PATHS[path] ?? path);
    orders[groupId] = [...new Set([...(orders[groupId] ?? []), ...normalizedPaths])];
    return orders;
  }, {});
}

function normalizeLabels(saved: Record<string, string>): Record<string, string> {
  const labels = { ...saved };
  for (const [legacyGroupId, groupId] of Object.entries(LEGACY_GROUP_IDS)) {
    const legacyLabel = labels[`group:${legacyGroupId}`];
    if (legacyLabel !== undefined && labels[`group:${groupId}`] === undefined) {
      labels[`group:${groupId}`] = legacyLabel;
    }
  }
  for (const [legacyPath, path] of Object.entries(LEGACY_PATHS)) {
    if (labels[legacyPath] !== undefined && labels[path] === undefined) labels[path] = labels[legacyPath];
  }
  return labels;
}

function appendLegacyGroupAliases(
  merged: NavGroupDef[],
  labels: Record<string, string>,
): NavGroupDef[] {
  const aliases: NavGroupDef[] = [];
  for (const [legacyGroupId, canonicalGroupId] of Object.entries(LEGACY_GROUP_IDS)) {
    const legacyLabel = labels[`group:${legacyGroupId}`];
    if (legacyLabel === undefined) continue;

    const canonicalGroup = merged.find((group) => group.id === canonicalGroupId);
    if (!canonicalGroup) continue;

    const itemPaths = new Set<string>();
    for (const item of canonicalGroup.items) {
      if (legacyGroupId === 'products' && item.to === '/products') itemPaths.add(item.to);
      else if (legacyGroupId === 'partners' && item.to === '/partners') itemPaths.add(item.to);
      else if (legacyGroupId === 'approvals' && item.to === '/approvals') itemPaths.add(item.to);
      else if (legacyGroupId === 'products' && item.to.startsWith('/products/')) itemPaths.add(item.to);
      else if (legacyGroupId === 'partners' && item.to.startsWith('/partners/')) itemPaths.add(item.to);
      else if (legacyGroupId === 'approvals' && item.to.startsWith('/approvals/')) itemPaths.add(item.to);
    }

    const legacyItems = canonicalGroup.items.filter((item) => itemPaths.has(item.to));
    if (legacyItems.length === 0) continue;

    aliases.push({
      ...canonicalGroup,
      id: legacyGroupId,
      label: legacyLabel,
      items: legacyItems.map((item) => ({
        ...item,
        label: labels[item.to] ?? item.label,
      })),
    });
  }

  return [...merged, ...aliases];
}

export class NavigationService {
  private static readonly pathTerms: Partial<Record<string, BusinessTermKey>> = {
    '/customers': 'entities.customers.plural',
    '/products': 'entities.products.plural',
    '/suppliers': 'entities.suppliers.plural',
    '/inventory': 'modules.inventory',
    '/sales': 'documents.salesInvoices',
  };

  private static readonly routePermissions: Array<{ path: string; all?: string[]; any?: string[] }> = [
    ...ROUTE_PERMISSIONS,
  ];

  private static readonly permissionRoutes: Array<{ path: string; all?: string[]; any?: string[] }> = [
    ...NavigationService.routePermissions,
    ...NAV_GROUPS.flatMap((group) =>
      group.items.flatMap((item) => {
        const itemPermissions = [...(item.perms ?? []), ...(item.perm ? [item.perm] : [])];
        const itemAny = item.anyPerms ?? [];
        const groupPermissions = [...(group.perms ?? []), ...(group.perm ? [group.perm] : [])];
        const all = itemPermissions.length || itemAny.length ? itemPermissions : groupPermissions;
        const any = itemAny.length ? itemAny : group.anyPerms ?? [];
        return all.length || any.length
          ? [{ path: item.to, all, any }]
          : [];
      })
    ),
  ];

  public static getRequiredPermission(pathname: string): string | null {
    const groups = NavigationService.getRequiredPermissionGroups(pathname);
    // بعض المسارات تُحمى بأيٍّ من عدة صلاحيات (`any`) بلا صلاحية إلزامية
    // (`all`)، لذا نُعيد أول بديل متاح بدل إرجاع null يوهم بأن المسار غير محمي.
    return groups?.all[0] ?? groups?.any[0] ?? null;
  }

  public static getRequiredPermissions(pathname: string): string[] | null {
    return NavigationService.getRequiredPermissionGroups(pathname)?.all ?? null;
  }

  public static getRequiredPermissionGroups(pathname: string): { all: string[]; any: string[] } | null {
    let match: (typeof NavigationService.permissionRoutes)[number] | undefined;
    for (const route of NavigationService.permissionRoutes) {
      if (
        (pathname === route.path || pathname.startsWith(`${route.path}/`))
        && route.path.length > (match?.path.length ?? -1)
      ) {
        match = route;
      }
    }

    return match
      ? { all: [...(match.all ?? [])], any: [...(match.any ?? [])] }
      : null;
  }

  public static getOverrides(): NavOverrides {
    const manualHiddenRaw = SettingsService.getValue(NAV_STORAGE_KEYS.hidden);
    const legacyHidden = parseJson<string[]>(SettingsService.getValue('nav.hidden'), []);
    const enabledModules = ModuleRegistryService.getEnabledModuleIds();
    const savedHidden = manualHiddenRaw !== undefined
      ? parseJson<string[]>(manualHiddenRaw, [])
      : legacyHidden.filter((path) => {
          const owner = getModulePathOwner(path);
          return !owner || enabledModules.includes(owner);
        });
    const hidden = [...new Set(savedHidden.map((path) => LEGACY_PATHS[path] ?? path))];
    const savedLabels = parseJson<Record<string, string>>(SettingsService.getValue(NAV_STORAGE_KEYS.labels), {});
    const savedGroupsOrder = parseJson<string[]>(SettingsService.getValue(NAV_STORAGE_KEYS.groupsOrder), []);
    const savedItemsOrder = parseJson<Record<string, string[]>>(SettingsService.getValue(NAV_STORAGE_KEYS.itemsOrder), {});
    return {
      hidden,
      labels: normalizeLabels(savedLabels),
      groupsOrder: normalizeGroupsOrder(savedGroupsOrder),
      itemsOrder: normalizeItemsOrder(savedItemsOrder),
      groupAssignments: parseGroupAssignments(SettingsService.getValue(NAV_STORAGE_KEYS.groupAssignments)),
    };
  }

  /** Full merged structure (before permission filtering). */
  public static getGroups(): NavGroupDef[] {
    return NavigationService.merge(NavigationService.getOverrides());
  }

  public static getAccessibleGroups(user: User | null): NavGroupDef[] {
    const centralCfg = CentralLicenseService.getCachedConfig();
    const enabledModules = new Set(ModuleRegistryService.getEnabledModuleIds());
    // Single source of truth for per-page visibility (hidden menus + feature flags).
    const isCentralHidden = (path: string) => !CentralFeaturePermissionService.isPageVisible(path);
    const centralAllowed: string[] | null = Array.isArray(centralCfg?.config?.allowedModules)
      ? (centralCfg!.config.allowedModules as string[])
      : null;
    const isModuleAllowed = (path: string) => {
      const localOwner = getModulePathOwner(path);
      if (localOwner && !enabledModules.has(localOwner)) return false;
      if (!centralAllowed) return true;
      const owner = getModulePathOwner(path);
      if (!owner) return true;
      return centralAllowed.includes(owner);
    };


    return NavigationService.getGroups()
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (isCentralHidden(item.to)) return false;
          if (!isModuleAllowed(item.to)) return false;
          const required = NavigationService.getRequiredPermissionGroups(item.to);
          return !required
            || required.all.every((permission) => PermissionService.can(user, permission))
              && (!required.any.length || required.any.some((permission) => PermissionService.can(user, permission)));
        }),
      }))
      .filter((group) => group.items.length > 0);
  }

  public static getNavigationGroups(user: User | null): NavGroupDef[] {
    return NavigationService.getAccessibleGroups(user);
  }

  public static getFirstAccessiblePath(user: User | null): string | null {
    return NavigationService.getAccessibleGroups(user)[0]?.items[0]?.to ?? null;
  }

  public static merge(
    source: NavOverrides,
    options: { includeHidden?: boolean } = {}
  ): NavGroupDef[] {
    const { hidden, labels, groupsOrder, itemsOrder } = source;
    const groupAssignments = source.groupAssignments ?? {};
    const hiddenSet = new Set(hidden);
    const businessType = ModuleRegistryService.getBusinessType();
    const termOverrides = TerminologyService.getOverrides();
    const term = (key: BusinessTermKey) => resolveBusinessTerm(key, {
      businessType,
      language: 'ar',
      overrides: termOverrides,
    });

    const assignedItems = NAV_GROUPS.flatMap((defaultGroup) =>
      defaultGroup.items.map((item) => ({
        item,
        groupId: groupAssignments[item.to] ?? defaultGroup.id,
      }))
    );

    const merged = NAV_GROUPS.map((group) => {
      const order = itemsOrder[group.id] || [];
      const rank = new Map(order.map((path, index) => [path, index]));
      const items = assignedItems
        .filter(({ item, groupId }) =>
          groupId === group.id && (options.includeHidden || !hiddenSet.has(item.to))
        )
        .map(({ item }) => item)
        .map((item) => {
          const page = AppConfigService.getPage(item.to);
          return {
            ...item,
            label: labels[item.to] || page.label || (NavigationService.pathTerms[item.to]
              ? term(NavigationService.pathTerms[item.to]!)
              : item.label),
            __enabled: page.enabled,
            __order: page.order,
          };
        })
        .filter((item) => item.__enabled)
        .sort((a, b) => {
          const ra = a.__order ?? (rank.has(a.to) ? rank.get(a.to)! : 9999);
          const rb = b.__order ?? (rank.has(b.to) ? rank.get(b.to)! : 9999);
          return ra - rb;
        })
        .map(({ __enabled, __order, ...item }) => item);
      return {
        ...group,
        label: labels[`group:${group.id}`] || group.label,
        items,
      };
    });

    if (groupsOrder.length > 0) {
      const groupRank = new Map(groupsOrder.map((id, index) => [id, index]));
      merged.sort((a, b) => {
        const ra = groupRank.has(a.id) ? groupRank.get(a.id)! : 9999;
        const rb = groupRank.has(b.id) ? groupRank.get(b.id)! : 9999;
        return ra - rb;
      });
    }

    return appendLegacyGroupAliases(merged, labels);
  }

  public static saveOverrides(next: NavOverrides, actor?: User | null): void {
    PermissionService.require(actor ?? null, 'admin.navigation');
    SettingsService.update(
      {
        [NAV_STORAGE_KEYS.hidden]: JSON.stringify(Array.from(new Set(next.hidden))),
        [NAV_STORAGE_KEYS.labels]: JSON.stringify(next.labels),
        [NAV_STORAGE_KEYS.groupsOrder]: JSON.stringify(next.groupsOrder),
        [NAV_STORAGE_KEYS.itemsOrder]: JSON.stringify(next.itemsOrder),
        [NAV_STORAGE_KEYS.groupAssignments]: JSON.stringify(next.groupAssignments),
      },
      actor
    );
  }

  public static reset(): void {
    const actor = AuthService.requireAuth();
    NavigationService.saveOverrides({
      hidden: [],
      labels: {},
      groupsOrder: [],
      itemsOrder: {},
      groupAssignments: {},
    }, actor);
  }

  public static getFlatItems(): { groupId: string; label: string; to: string; perm?: string; perms?: string[] }[] {
    return NavigationService.getGroups().flatMap((group) =>
      group.items.map((item) => ({
        groupId: group.id,
        label: item.label,
        to: item.to,
        perm: item.perm,
        perms: item.perms,
        anyPerms: item.anyPerms,
      }))
    );
  }
}
