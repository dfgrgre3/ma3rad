import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Menu, Search } from 'lucide-react';
import type { User } from '../types';
import { BranchAccessService } from '../services/BranchAccessService';
import { PermissionService } from '../services/PermissionService';
import { useTheme } from '../contexts/useTheme';
import { resolvePageTitle } from '../utils/resolvePageTitle';
import { ProfileMenu } from './ui/ProfileMenu';
import { GlobalSearch } from './GlobalSearch';
import { HeaderNav } from './HeaderNav';
import { useToast } from './ui/Toast';

interface HeaderProps {
  currentUser: User | null;
  unreadNotifications?: number;
  onLogout?: () => void;
  onSwitchUser?: (userId: string) => void;
  onOpenSidebar?: () => void;
  /** `header` moves the main navigation into the top bar on large screens. */
  navigationLayout?: 'sidebar' | 'header';
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  unreadNotifications = 0,
  onLogout,
  onSwitchUser,
  onOpenSidebar,
  navigationLayout = 'sidebar',
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const { settings } = useTheme();
  const toast = useToast();
  const branchAccess = useMemo(() => new BranchAccessService(), []);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [activeBranchId, setActiveBranchId] = useState('');
  const isTopNav = navigationLayout === 'header';

  const page = useMemo(
    () => resolvePageTitle(location.pathname, currentUser),
    [currentUser, location.pathname]
  );

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

  useEffect(() => {
    if (!currentUser || !PermissionService.can(currentUser, 'ui.branches.branches.view')) {
      setBranches([]);
      setActiveBranchId('');
      return;
    }
    try {
      const available = branchAccess.getSelectableBranches(currentUser);
      setBranches(available);
      setActiveBranchId(branchAccess.getCurrentBranchId(currentUser));
    } catch (error) {
      toast.error('تعذر تحديد الفرع النشط', error instanceof Error ? error.message : String(error));
    }
  }, [branchAccess, currentUser?.id, toast]);

  const switchBranch = (branchId: string) => {
    if (!branchId || branchId === activeBranchId) return;
    try {
      branchAccess.setCurrentBranchId(branchId, currentUser || undefined);
      window.location.reload();
    } catch (error) {
      toast.error('تعذر التبديل بين الفروع', error instanceof Error ? error.message : String(error));
    }
  };

  const closeSearch = () => {
    setSearchOpen(false);
  };

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

      {/* Brand identity and header navigation */}
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
        <HeaderNav currentUser={currentUser} onOpenQuickCommand={() => setSearchOpen(true)} />
      ) : (
        /* Current page */
        <div className="flex min-w-0 flex-col justify-center leading-tight">
          <h1 className="truncate text-[13px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">{page.title}</h1>
          <span className="hidden truncate text-[10px] text-[#767676] sm:block">{page.group}</span>
        </div>
      )}

      {/* Actions */}
      <div className="mr-auto flex shrink-0 flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className={`flex min-h-8 items-center gap-2 rounded-[2px] border border-[#a6a6a6] bg-white px-2.5 text-[12px] text-[#4d4d4d] hover:border-[#0078d4] hover:bg-[#f2f8fd] dark:border-[#565656] dark:bg-[#333] dark:text-[#d0d0d0] dark:hover:bg-[#3d3d3d] ${
            isTopNav ? 'lg:hidden' : ''
          }`}
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
          onClick={() => navigate('/notifications')}
          className="win-btn win-btn--ghost relative hidden !min-h-8 !px-2 sm:flex"
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

        {currentUser && (
          <ProfileMenu
            currentUser={currentUser}
            unreadNotifications={unreadNotifications}
            onLogout={onLogout}
            onSwitchUser={onSwitchUser}
            branches={branches}
            activeBranchId={activeBranchId}
            onBranchChange={switchBranch}
          />
        )}
      </div>

      <GlobalSearch
        open={searchOpen}
        onClose={closeSearch}
        currentUser={currentUser}
      />
    </header>
  );
};
