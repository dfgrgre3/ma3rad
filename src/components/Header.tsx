import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Menu, Moon, Search, Sun } from 'lucide-react';
import type { User } from '../types';
import { NavigationService } from '../services/NavigationService';
import { useTheme } from '../contexts/ThemeContext';
import { ProfileMenu } from './ui/ProfileMenu';
import { GlobalSearch } from './GlobalSearch';
import { HeaderNav } from './HeaderNav';

interface HeaderProps {
  currentUser: User | null;
  unreadNotifications?: number;
  onLogout?: () => void;
  onOpenSidebar?: () => void;
  /** `header` moves the main navigation into the top bar on large screens. */
  navigationLayout?: 'sidebar' | 'header';
}

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
export function resolvePageTitle(pathname: string): { title: string; group: string } {
  let best: { title: string; group: string; length: number } | null = null;

  for (const group of NavigationService.getGroups()) {
    for (const item of group.items) {
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

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  unreadNotifications = 0,
  onLogout,
  onOpenSidebar,
  navigationLayout = 'sidebar',
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const { settings, resolvedMode, toggleMode } = useTheme();
  const isTopNav = navigationLayout === 'header';

  const page = useMemo(() => resolvePageTitle(location.pathname), [location.pathname]);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleSearchShortcut);
    return () => window.removeEventListener('keydown', handleSearchShortcut);
  }, []);

  const brandName = settings.brandName || 'سيراميسيس';
  const shortName = settings.brandShortName === 'C' ? 'س' : settings.brandShortName || 'س';

  return (
    <header className="app-header win-header flex h-12 shrink-0 select-none items-center gap-2 px-2 sm:px-3">
      {/* Sidebar toggle (compact screens) */}
      <button
        type="button"
        onClick={onOpenSidebar}
        className="win-btn win-btn--ghost lg:hidden !min-h-8 !px-2"
        aria-label="فتح القائمة الجانبية"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Brand */}
      <NavLink to="/dashboard" className="flex min-w-0 shrink-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[2px] bg-[#0078d4] text-xs font-bold text-white">
          {settings.brandLogoDataUrl ? (
            <img src={settings.brandLogoDataUrl} alt="الشعار" className="h-full w-full object-cover" />
          ) : (
            shortName.slice(0, 2)
          )}
        </span>
        <span
          className={`truncate text-[13px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0] ${
            isTopNav ? 'hidden xl:block' : 'hidden sm:block'
          }`}
        >
          {brandName}
        </span>
      </NavLink>

      <span aria-hidden="true" className="mx-1 hidden h-4 w-px bg-[#d9d9d9] dark:bg-[#3d3d3d] sm:block" />

      {isTopNav ? (
        /* Main navigation moved into the header (large screens only). */
        <HeaderNav currentUser={currentUser} />
      ) : (
        /* Current page */
        <div className="flex min-w-0 flex-col justify-center leading-tight">
          <h1 className="truncate text-[13px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">{page.title}</h1>
          <span className="hidden truncate text-[10px] text-[#767676] sm:block">{page.group}</span>
        </div>
      )}

      {/* Actions */}
      <div className="mr-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex min-h-8 items-center gap-2 rounded-[2px] border border-[#a6a6a6] bg-white px-2.5 text-[12px] text-[#4d4d4d] hover:border-[#0078d4] hover:bg-[#f2f8fd] dark:border-[#565656] dark:bg-[#333] dark:text-[#d0d0d0] dark:hover:bg-[#3d3d3d]"
          title="بحث شامل (Ctrl+K)"
          aria-label="بحث شامل"
          aria-haspopup="dialog"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">بحث</span>
          <kbd className="hidden rounded-[2px] border border-[#d9d9d9] px-1 text-[10px] text-[#767676] dark:border-[#565656] dark:text-[#a6a6a6] xl:inline">
            Ctrl K
          </kbd>
        </button>

        <button
          type="button"
          onClick={toggleMode}
          className="win-btn win-btn--ghost !min-h-8 !px-2"
          title={resolvedMode === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
          aria-label={resolvedMode === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
        >
          {resolvedMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={() => navigate('/notifications')}
          className="win-btn win-btn--ghost relative !min-h-8 !px-2"
          title={unreadNotifications ? `لديك ${unreadNotifications} إشعار غير مقروء` : 'الإشعارات'}
          aria-label="الإشعارات"
        >
          <Bell className="h-4 w-4" />
          {unreadNotifications > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-[#c42b1c] px-1 text-center text-[9px] font-bold leading-[16px] text-white">
              {unreadNotifications > 99 ? '99+' : unreadNotifications}
            </span>
          )}
        </button>

        {currentUser && <ProfileMenu currentUser={currentUser} onLogout={onLogout} />}
      </div>

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        currentUser={currentUser}
      />
    </header>
  );
};
