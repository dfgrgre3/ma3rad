import { NAV_GROUPS, NAV_STORAGE_KEYS, type NavGroupDef } from '../config/navigation';
import { getModulePathOwner } from '../config/moduleRegistry';
import { ModuleRegistryService } from './ModuleRegistryService';
import { SettingsService } from './SettingsService';
import { PermissionService } from './PermissionService';
import { AuthService } from './AuthService';
import type { User } from '../types';
import { resolveBusinessTerm, type BusinessTermKey } from '../config/businessTerminology';
import { TerminologyService } from './TerminologyService';
import { AppConfigService } from './AppConfigService';
import { CentralLicenseService } from './CentralLicenseService';
import { CentralFeaturePermissionService } from './CentralFeaturePermissionService';
import { OPEN_ALL_PAGES } from '../config/setupLifecycle';

export interface NavOverrides {
  hidden: string[];
  labels: Record<string, string>;
  groupsOrder: string[];
  itemsOrder: Record<string, string[]>;
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class NavigationService {
  private static readonly groupTerms: Partial<Record<string, BusinessTermKey>> = {
    sales: 'modules.sales',
    inventory: 'modules.inventory',
    products: 'entities.products.plural',
    crm: 'entities.customers.plural',
    purchasing: 'modules.purchasing',
    operations: 'modules.operations',
    reports: 'modules.reports',
  };

  private static readonly pathTerms: Partial<Record<string, BusinessTermKey>> = {
    '/customers': 'entities.customers.plural',
    '/products': 'entities.products.plural',
    '/suppliers': 'entities.suppliers.plural',
    '/inventory': 'modules.inventory',
    '/sales': 'documents.salesInvoices',
  };

  private static readonly routePermissions: Array<{ path: string; all?: string[]; any?: string[] }> = [
    { path: '/admin/data-deletion', all: ['admin.data.delete'] },
    { path: '/admin/sync-conflicts', all: ['admin.view'] },
    { path: '/central-activation', all: ['admin.license.manage'] },
    { path: '/data-import/types', all: ['settings.view'] },
    { path: '/finance/debts', all: ['finance.debts.view'] },
    { path: '/finance/receivables', any: ['finance.debts.view', 'finance.receivables.view', 'finance.installments.view', 'finance.installments.manage'] },
    { path: '/finance/other-receivables', any: ['finance.view', 'finance.receivables.view'] },
    { path: '/finance/installments', any: ['finance.view', 'finance.installments.view', 'finance.installments.manage'] },
    { path: '/crm', all: ['crm.view'] },
    { path: '/dashboard/executive', all: ['dashboard.view'] },
    { path: '/tools', all: ['dashboard.view'] },
  ];

  public static getRequiredPermission(pathname: string): string | null {
    return NavigationService.getRequiredPermissions(pathname)?.[0] ?? null;
  }

  public static getRequiredPermissions(pathname: string): string[] | null {
    return NavigationService.getRequiredPermissionGroups(pathname)?.all ?? null;
  }

  public static getRequiredPermissionGroups(pathname: string): { all: string[]; any: string[] } | null {
    const routes = [
      ...NAV_GROUPS.flatMap((group) =>
        group.items.flatMap((item) => {
          const permissions = [...(item.perms ?? []), ...(item.perm ? [item.perm] : [])];
          return permissions.length || item.anyPerms?.length
            ? [{ path: item.to, all: permissions, any: item.anyPerms ?? [] }]
            : [];
        })
      ),
      ...NavigationService.routePermissions,
    ];
    const match = routes
      .filter(({ path }) => pathname === path || pathname.startsWith(`${path}/`))
      .sort((a, b) => b.path.length - a.path.length)[0];
    return match ? { all: match.all ?? [], any: match.any ?? [] } : null;
  }

  public static getOverrides(): NavOverrides {
    const manualHiddenRaw = SettingsService.getValue(NAV_STORAGE_KEYS.hidden);
    const legacyHidden = parseJson<string[]>(SettingsService.getValue('nav.hidden'), []);
    const enabledModules = ModuleRegistryService.getEnabledModuleIds();
    const hidden = manualHiddenRaw !== undefined
      ? parseJson<string[]>(manualHiddenRaw, [])
      : legacyHidden.filter((path) => {
          const owner = getModulePathOwner(path);
          return !owner || enabledModules.includes(owner);
        });
    return {
      hidden,
      labels: parseJson<Record<string, string>>(SettingsService.getValue(NAV_STORAGE_KEYS.labels), {}),
      groupsOrder: parseJson<string[]>(SettingsService.getValue(NAV_STORAGE_KEYS.groupsOrder), []),
      itemsOrder: parseJson<Record<string, string[]>>(SettingsService.getValue(NAV_STORAGE_KEYS.itemsOrder), {}),
    };
  }

  /** Full merged structure (before permission filtering). */
  public static getGroups(): NavGroupDef[] {
    return NavigationService.merge(NavigationService.getOverrides());
  }

  public static getAccessibleGroups(user: User | null): NavGroupDef[] {
    const centralCfg = CentralLicenseService.getCachedConfig();
    // Single source of truth for per-page visibility (hidden menus + feature flags).
    const isCentralHidden = (path: string) => !CentralFeaturePermissionService.isPageVisible(path);
    const centralAllowed: string[] | null = Array.isArray(centralCfg?.config?.allowedModules)
      ? (centralCfg!.config.allowedModules as string[])
      : null;
    const isModuleAllowed = (path: string) => {
      const localOwner = getModulePathOwner(path);
      if (localOwner && !ModuleRegistryService.isModuleEnabled(localOwner)) return false;
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
          const required = [...(item.perms ?? []), ...(item.perm ? [item.perm] : [])];
          return required.every((permission) => PermissionService.can(user, permission))
            && (!item.anyPerms?.length || item.anyPerms.some((permission) => PermissionService.can(user, permission)));
        }),
      }))
      .filter((group) => group.items.length > 0);
  }

  public static getNavigationGroups(user: User | null): NavGroupDef[] {
    return OPEN_ALL_PAGES ? NAV_GROUPS : NavigationService.getAccessibleGroups(user);
  }

  public static getFirstAccessiblePath(user: User | null): string | null {
    return NavigationService.getAccessibleGroups(user)[0]?.items[0]?.to ?? null;
  }

  public static merge(source: NavOverrides): NavGroupDef[] {
    const { hidden, labels, groupsOrder, itemsOrder } = source;
    const hiddenSet = new Set(hidden);
    const businessType = SettingsService.getValue('businessType') || 'ceramics';
    const termOverrides = TerminologyService.getOverrides();
    const term = (key: BusinessTermKey) => resolveBusinessTerm(key, {
      businessType,
      language: 'ar',
      overrides: termOverrides,
    });

    const merged = NAV_GROUPS.map((group) => {
      const order = itemsOrder[group.id] || [];
      const rank = new Map(order.map((path, index) => [path, index]));
      const items = group.items
        .filter((item) => !hiddenSet.has(item.to))
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
        label: labels[`group:${group.id}`]
          || (NavigationService.groupTerms[group.id]
            ? term(NavigationService.groupTerms[group.id]!)
            : group.label),
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

    return merged;
  }

  public static saveOverrides(next: NavOverrides, actor?: User | null): void {
    PermissionService.require(actor ?? null, 'admin.navigation');
    SettingsService.update(
      {
        [NAV_STORAGE_KEYS.hidden]: JSON.stringify(Array.from(new Set(next.hidden))),
        [NAV_STORAGE_KEYS.labels]: JSON.stringify(next.labels),
        [NAV_STORAGE_KEYS.groupsOrder]: JSON.stringify(next.groupsOrder),
        [NAV_STORAGE_KEYS.itemsOrder]: JSON.stringify(next.itemsOrder),
      },
      actor
    );
  }

  public static reset(): void {
    const actor = AuthService.requireAuth();
    NavigationService.saveOverrides({ hidden: [], labels: {}, groupsOrder: [], itemsOrder: {} }, actor);
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
