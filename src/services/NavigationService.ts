import { NAV_GROUPS, NAV_STORAGE_KEYS, type NavGroupDef } from '../config/navigation';
import { SettingsService } from './SettingsService';
import { PermissionService } from './PermissionService';
import type { User } from '../types';

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
  private static readonly routePermissions: Array<[string, string]> = [
    ['/admin/data-deletion', 'admin.data'],
    ['/data-import/types', 'settings.view'],
    ['/finance/debts', 'finance.debts.view'],
    ['/crm', 'crm.view'],
    ['/dashboard/executive', 'dashboard.view'],
  ];

  public static getRequiredPermission(pathname: string): string | null {
    const routes = [
      ...NAV_GROUPS.flatMap((group) =>
        group.items.flatMap((item) => item.perm ? [[item.to, item.perm] as [string, string]] : [])
      ),
      ...NavigationService.routePermissions,
    ];
    const match = routes
      .filter(([path]) => pathname === path || pathname.startsWith(`${path}/`))
      .sort((a, b) => b[0].length - a[0].length)[0];
    return match?.[1] ?? null;
  }

  public static getOverrides(): NavOverrides {
    return {
      hidden: parseJson<string[]>(SettingsService.getValue(NAV_STORAGE_KEYS.hidden), []),
      labels: parseJson<Record<string, string>>(SettingsService.getValue(NAV_STORAGE_KEYS.labels), {}),
      groupsOrder: parseJson<string[]>(SettingsService.getValue(NAV_STORAGE_KEYS.groupsOrder), []),
      itemsOrder: parseJson<Record<string, string[]>>(SettingsService.getValue(NAV_STORAGE_KEYS.itemsOrder), {}),
    };
  }

  /** Full merged structure (before permission filtering). */
  public static getGroups(): NavGroupDef[] {
    return NavigationService.merge(NavigationService.getOverrides());
  }

  public static merge(source: NavOverrides): NavGroupDef[] {
    const { hidden, labels, groupsOrder, itemsOrder } = source;
    const hiddenSet = new Set(hidden);

    const merged = NAV_GROUPS.map((group) => {
      const order = itemsOrder[group.id] || [];
      const rank = new Map(order.map((path, index) => [path, index]));
      const items = group.items
        .filter((item) => !hiddenSet.has(item.to))
        .map((item) => ({ ...item, label: labels[item.to] || item.label }))
        .sort((a, b) => {
          const ra = rank.has(a.to) ? rank.get(a.to)! : 9999;
          const rb = rank.has(b.to) ? rank.get(b.to)! : 9999;
          return ra - rb;
        });
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
    NavigationService.saveOverrides({ hidden: [], labels: {}, groupsOrder: [], itemsOrder: {} });
  }

  public static getFlatItems(): { groupId: string; label: string; to: string; perm?: string }[] {
    return NavigationService.getGroups().flatMap((group) =>
      group.items.map((item) => ({ groupId: group.id, label: item.label, to: item.to, perm: item.perm }))
    );
  }
}
