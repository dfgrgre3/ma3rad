import { canonicalNavigationPath } from '../../router/navigationShortcuts';
import type { NavGroupDef } from '../../types/config/navigation';
import { NavigationService } from '../../services/config/NavigationService';
import type { User } from '../../types';

export interface PageBreadcrumb {
  label: string;
  path?: string;
}

export interface ResolvedPageTitle {
  title: string;
  group: string;
  breadcrumbs: PageBreadcrumb[];
}

const DETAIL_ROUTES = [
  { pattern: /^\/customers\/[^/]+$/, parent: '/customers', label: 'تفاصيل العميل' },
  { pattern: /^\/customers\/[^/]+\/imported-products$/, parent: '/customers', label: 'منتجات العميل' },
  { pattern: /^\/products\/[^/]+$/, parent: '/products', label: 'تفاصيل المنتج' },
  { pattern: /^\/suppliers\/[^/]+$/, parent: '/suppliers', label: 'تفاصيل المورد' },
  { pattern: /^\/projects\/[^/]+$/, parent: '/projects', label: 'تفاصيل المشروع' },
] as const;

/** Build a breadcrumb trail only from labels and primary destinations available to this user. */
export function resolveNavigationBreadcrumbs(pathname: string, groups: NavGroupDef[]): ResolvedPageTitle {
  const paths = groups.flatMap((group) => group.items.map((item) => item.to));
  const resolvedPath = canonicalNavigationPath(pathname, paths) ?? pathname;
  const detail = DETAIL_ROUTES.find(({ pattern }) => pattern.test(resolvedPath));
  if (detail) {
    const parent = groups.flatMap((group) => group.items.map((item) => ({ group, item })))
      .find(({ item }) => item.to === detail.parent);
    if (parent) {
      return {
        title: detail.label,
        group: parent.group.label,
        breadcrumbs: [
          { label: parent.group.label },
          { label: parent.item.label, path: parent.item.to },
          { label: detail.label },
        ],
      };
    }
  }

  let best: { title: string; group: string; length: number } | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      const matches = resolvedPath === item.to || (item.to !== '/' && resolvedPath.startsWith(`${item.to}/`));
      if (matches && item.to.length > (best?.length ?? -1)) {
        best = { title: item.label, group: group.label, length: item.to.length };
      }
    }
  }

  if (best) {
    return {
      title: best.title,
      group: best.group,
      breadcrumbs: [{ label: best.group }, { label: best.title }],
    };
  }
  return {
    title: 'سيراميسيس',
    group: 'سيراميسيس',
    breadcrumbs: [{ label: 'سيراميسيس' }],
  };
}

/** Resolve the current page title from the accessible navigation structure. */
export function resolvePageTitle(
  pathname: string,
  user?: User | null,
  groups: NavGroupDef[] = NavigationService.getNavigationGroups(user ?? null)
): ResolvedPageTitle {
  return resolveNavigationBreadcrumbs(pathname, groups);
}
