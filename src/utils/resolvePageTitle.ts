import { NavigationService } from '../services/NavigationService';
import { CentralFeaturePermissionService } from '../services/CentralFeaturePermissionService';
import { OPEN_ALL_PAGES } from '../config/setupLifecycle';
import type { User } from '../types';

const EXTRA_TITLES: Record<string, string> = {
  '/dashboard': 'لوحة المعلومات',
  '/dashboard/executive': 'الأداء التنفيذي',
  '/notifications': 'الإشعارات',
  '/tools': 'الأدوات السريعة',
  '/audit': 'سجل التدقيق',
  '/security': 'مركز الأمان',
  '/admin': 'إدارة النظام',
  '/admin/data-deletion': 'إدارة وحذف البيانات',
  '/users': 'المستخدمون',
  '/settings': 'الإعدادات',
  '/backup': 'النسخ الاحتياطي',
  '/system-health': 'صحة النظام',
  '/data-import': 'استيراد البيانات',
  '/data-import/types': 'أنواع البيانات الديناميكية',
};

/** Resolve the current page title from the navigation structure. */
export function resolvePageTitle(pathname: string, user?: User | null): { title: string; group: string } {
  const isHidden = (path: string) => !OPEN_ALL_PAGES && !CentralFeaturePermissionService.isPageVisible(path);

  let best: { title: string; group: string; length: number } | null = null;
  for (const group of NavigationService.getNavigationGroups(user ?? null)) {
    for (const item of group.items) {
      if (isHidden(item.to)) continue;
      const matches = pathname === item.to || (item.to !== '/' && pathname.startsWith(`${item.to}/`));
      if (matches && item.to.length > (best?.length ?? -1)) {
        best = { title: item.label, group: group.label, length: item.to.length };
      }
    }
  }

  if (best) return { title: best.title, group: best.group };

  let closest: { title: string; length: number } | null = null;
  for (const [path, title] of Object.entries(EXTRA_TITLES)) {
    if ((pathname === path || pathname.startsWith(`${path}/`)) && path.length > (closest?.length ?? -1)) {
      closest = { title, length: path.length };
    }
  }
  return { title: closest?.title ?? 'سيراميسيس', group: 'سيراميسيس' };
}
