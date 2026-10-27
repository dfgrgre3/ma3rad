import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown, ChevronUp, Bell, Menu, X,
  Search,
} from 'lucide-react';
import type { User } from '../types';
import { PermissionService } from '../services/PermissionService';
import { NavigationService } from '../services/NavigationService';
import { useTheme } from '../contexts/ThemeContext';
import { ProfileMenu } from './ui/ProfileMenu';
import { GlobalSearch } from './GlobalSearch';

interface HeaderProps {
  currentUser: User | null;
  unreadNotifications?: number;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  unreadNotifications = 0,
  onLogout,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const { settings } = useTheme();

  const visibleGroups = useMemo(() => {
    return NavigationService.getGroups()
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.perm || PermissionService.can(currentUser, item.perm)),
      }))
      .filter((group) => group.items.length > 0);
  }, [currentUser, settings]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !mobileMenuRef.current?.contains(target)
      ) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
    setOpenMenu(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileMenuOpen]);

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

  const toggleMenu = (groupId: string) => {
    setOpenMenu(openMenu === groupId ? null : groupId);
  };

  const brandPrimary = 'var(--brand-primary, #0284c7)';
  const brandAccent = 'var(--brand-accent, #4f46e5)';
  const shortName = settings.brandShortName || 'C';
  const brandName = settings.brandName || 'CeramiSys ERP';

  const Logo = (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg text-white font-black text-lg shrink-0 overflow-hidden"
      style={{ background: `linear-gradient(to top right, ${brandPrimary}, ${brandAccent})` }}
    >
      {settings.brandLogoDataUrl ? (
        <img src={settings.brandLogoDataUrl} alt="logo" className="w-full h-full object-cover" />
      ) : (
        shortName.slice(0, 2)
      )}
    </div>
  );

  return (
    <header className="app-header h-16 border-b bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700 flex items-center justify-between px-3 sm:px-4 lg:px-6 select-none shrink-0 gap-2 sm:gap-4">
      {/* ── Logo & Brand ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 min-w-0">
        <NavLink to="/dashboard" className="flex items-center gap-3 min-w-0">
          {Logo}
          {settings.showBrandText !== false && (
            <div className="hidden sm:block min-w-0">
              <h1 className="font-extrabold text-base text-slate-900 dark:text-slate-100 tracking-wide truncate">{brandName}</h1>
              <p className="text-[10px] text-sky-600 dark:text-sky-400 font-medium truncate">
                {settings.showroomName || 'نظام معارض السيراميك المتكامل'}
              </p>
            </div>
          )}
        </NavLink>
      </div>

      {/* ── Desktop Mega Menu ─────────────────────────────────────────────────── */}
      <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center" dir="rtl">
        {visibleGroups.map((group) => {
          const isOpen = openMenu === group.id;
          const isGroupActive = group.items.some(
            (item) => location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/'))
          );

          return (
            <div key={group.id} className="relative" ref={isOpen ? menuRef : null}>
              <button
                onClick={() => toggleMenu(group.id)}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  isGroupActive || isOpen
                    ? 'bg-sky-50 text-sky-600 dark:bg-slate-800 dark:text-sky-400'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <span>{group.label}</span>
                {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {isOpen && (
                <div className="absolute top-full right-0 mt-1 w-96 p-4 rounded-xl shadow-2xl border z-50 bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700">
                  <div className="grid grid-cols-1 gap-1">
                    {group.items.map((item) => {
                      return (
                        <NavLink
                          key={item.to + item.label}
                          to={item.to}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                              isActive
                                ? 'bg-sky-600 text-white font-semibold shadow-sm shadow-sky-600/20'
                                : item.highlight
                                  ? 'text-emerald-700 hover:bg-emerald-50 font-semibold dark:text-emerald-400 dark:hover:bg-emerald-500/10'
                                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                            }`
                          }
                        >
                          <span className="truncate">{item.label}</span>
                          {item.badge && item.badge > 0 && (
                            <span className="mr-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                              {item.badge > 99 ? '99+' : item.badge}
                            </span>
                          )}
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── Right Actions ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-sky-400"
          title="بحث شامل (Ctrl+K)"
          aria-label="بحث شامل"
          aria-haspopup="dialog"
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">بحث شامل</span>
          <kbd className="hidden xl:inline rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400 dark:border-slate-600">Ctrl K</kbd>
        </button>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
          aria-label="القائمة"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        <button
          onClick={() => navigate('/notifications')}
          className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
          title={unreadNotifications ? `لديك ${unreadNotifications} إشعار غير مقروء` : 'الإشعارات'}
          aria-label="الإشعارات"
        >
          <Bell className="w-4 h-4" />
          {unreadNotifications > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[17px] rounded-full bg-red-500 px-1 text-center text-[9px] font-black leading-[17px] text-white shadow-sm">
              {unreadNotifications > 99 ? '99+' : unreadNotifications}
            </span>
          )}
        </button>

        {currentUser && <ProfileMenu currentUser={currentUser} onLogout={onLogout} />}
      </div>

      {/* ── Mobile Menu ───────────────────────────────────────────────────────── */}
      {mobileMenuOpen && createPortal(
        <div id="mobile-navigation-menu" className="lg:hidden fixed inset-0 z-[100]" dir="rtl">
          <button
          type="button"
          aria-label="إغلاق القائمة"
          className="absolute inset-0 h-full w-full bg-slate-950/50"
          onClick={() => setMobileMenuOpen(false)}
          />
          <aside
          ref={mobileMenuRef}
          role="dialog"
          aria-modal="true"
          aria-label="القائمة الرئيسية"
          className="absolute inset-y-0 right-0 flex h-full w-80 max-w-[85vw] flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-700">
            <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">القائمة الرئيسية</h2>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="إغلاق القائمة"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4" aria-label="التنقل الرئيسي">
            <button
              onClick={() => { setMobileMenuOpen(false); setSearchOpen(true); }}
              className="w-full rounded-lg px-4 py-3 text-right text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              بحث شامل
            </button>
            {visibleGroups.map((group) => {
              const isOpen = openMenu === group.id;
              return (
                <div key={group.id}>
                  <button
                    onClick={() => toggleMenu(group.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all ${
                      isOpen
                        ? 'bg-sky-50 text-sky-600 dark:bg-slate-800 dark:text-sky-400'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                    aria-expanded={isOpen}
                  >
                    <span className="flex-1 text-right">{group.label}</span>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {isOpen && (
                    <div className="mr-4 mt-1 space-y-1">
                      {group.items.map((item) => (
                        <NavLink
                          key={item.to + item.label}
                          to={item.to}
                          onClick={() => setMobileMenuOpen(false)}
                          className={({ isActive }) =>
                            `flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-all ${
                              isActive
                                ? 'bg-sky-600 font-semibold text-white'
                                : 'font-medium text-slate-600 dark:text-slate-300'
                            }`
                          }
                        >
                          <span className="truncate">{item.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          </aside>
        </div>,
        document.body,
      )}
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        currentUser={currentUser}
      />
    </header>
  );
};
