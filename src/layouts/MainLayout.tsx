import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Calculator, NotebookPen, X } from 'lucide-react';
import { Header } from '../components/shared/Header';
import { Sidebar } from '../components/shared/Sidebar';
import { NotificationService } from '../services/domains/notifications/NotificationService';
import { PermissionService } from '../services/domains/auth/PermissionService';
import { NavigationService } from '../services/domains/config/NavigationService';
import { NavigationGroupsProvider, useNavigationGroups } from '../hooks/domains/config/useNavigationGroups';
import { CalculatorPanel } from '../components/products/CalculatorPanel';
import { NotesPanel } from '../components/shared/NotesPanel';
import { AppConfigRuntime } from '../components/config/AppConfigRuntime';
import { ConfigSection } from '../components/config/ConfigSection';
import { ConfigText } from '../components/config/ConfigText';
import { useTheme } from '../contexts/useTheme';
import { LayoutContext } from '../contexts/LayoutContext';
import {
  getPersistedScrollPosition,
  saveNavigationLocation,
  saveNavigationScrollPosition,
} from '../router/navigationPersistence';
import { recordRecentNavigation } from '../router/navigationShortcuts';
import { User } from '../types';

interface MainLayoutProps {
  currentUser?: User | null;
  onLogout?: () => void;
  onSwitchUser?: (userId: string) => void;
}

// ─── MainLayout ───────────────────────────────────────────────────────────────
export const MainLayout: React.FC<MainLayoutProps> = ({
  currentUser = null,
  onLogout,
  onSwitchUser,
}) => {
  const location = useLocation();
  const accessibleGroups = useNavigationGroups(currentUser);
  const accessibleNavigationPaths = useMemo(
    () => accessibleGroups.flatMap((group) => group.items.map((item) => item.to)),
    [accessibleGroups]
  );
  const mainRef = useRef<HTMLElement>(null);
  const { settings } = useTheme();
  const navigationLayout = settings.navigationLayout === 'header' ? 'header' : 'sidebar';
  const interfaceDirection = settings.interfaceDirection === 'ltr' ? 'ltr' : 'rtl';
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [floatingCalculatorOpen, setFloatingCalculatorOpen] = useState(false);
  const [floatingNotesOpen, setFloatingNotesOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const required = NavigationService.getRequiredPermissionGroups(location.pathname);
  // الصلاحيات تُطبَّق دائماً على مستوى المسار: حتى في وضع «فتح كل الصفحات»
  // (الذي يتجاوز الوحدات/المظهر/قيود المنصة) لا يمكن تجاوز صلاحيات المستخدم.
  // حارس المسار الأساسي (خريطة ROUTE_PERMISSIONS + صلاحيات عناصر القوائم).
  // الصلاحيات الدقيقة للصفحة/القسم/الزر متاحة أيضاً عبر canAccessPage
  // وusePagePermissions وتُطبّق في الواجهات الحساسة.
  const isAllowed = !required
    || required.all.every((permission) => PermissionService.can(currentUser, permission))
      && (!required.any.length || required.any.some((permission) => PermissionService.can(currentUser, permission)));
  const fallbackPath = isAllowed ? null : NavigationService.getFirstAccessiblePath(currentUser) ?? '/not-found';
  const persistedLocation = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    if (!currentUser?.id || !isAllowed || location.pathname === '/') return;
    saveNavigationLocation(currentUser.id, persistedLocation);
    recordRecentNavigation(currentUser.id, location.pathname, accessibleNavigationPaths);
    if (mainRef.current) {
      mainRef.current.scrollTop = getPersistedScrollPosition(currentUser.id, persistedLocation);
    }
  }, [accessibleNavigationPaths, currentUser?.id, isAllowed, location.pathname, persistedLocation]);

  useEffect(() => {
    const userId = currentUser?.id;
    const main = mainRef.current;
    if (!userId || !isAllowed || !main || location.pathname === '/') return;

    const savePosition = () => {
      saveNavigationScrollPosition(userId, persistedLocation, main.scrollTop);
    };
    let timer: number | null = null;
    const handleScroll = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(savePosition, 250);
    };

    main.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pagehide', savePosition);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      savePosition();
      main.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pagehide', savePosition);
    };
  }, [currentUser?.id, isAllowed, location.pathname, persistedLocation]);

  useEffect(() => {
    const refreshNotifications = () => {
      try { setUnreadNotifications(new NotificationService().getUnreadCount(currentUser?.id)); } catch { setUnreadNotifications(0); }
    };
    refreshNotifications();
    const timer = window.setInterval(refreshNotifications, 30000);
    return () => window.clearInterval(timer);
  }, [currentUser?.id]);

  useEffect(() => { setMobileSidebarOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileSidebarOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileSidebarOpen]);

  const toggleSidebar = () => {
    setSidebarCollapsed((value) => {
      const next = !value;
      try { localStorage.setItem('sidebar_collapsed', String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  if (!isAllowed) {
    return <Navigate to={fallbackPath ?? '/not-found'} replace />;
  }

  return (
    <LayoutContext.Provider value={{ currentUser }}>
      <AppConfigRuntime />
      <div className="app-shell win-app flex h-screen w-full min-w-0 flex-col overflow-hidden bg-[var(--win-canvas)] text-[var(--win-text)]" dir={interfaceDirection}>
        {/* ── Top bar ──────────────────────────────────────────────────────────── */}
        <NavigationGroupsProvider groups={accessibleGroups}>
          <Header
            currentUser={currentUser}
            unreadNotifications={unreadNotifications}
            onLogout={onLogout}
            onSwitchUser={onSwitchUser}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            navigationLayout={navigationLayout}
          />
        </NavigationGroupsProvider>

        <div className="flex min-h-0 min-w-0 w-full flex-1">
          {/* ── Desktop sidebar (hidden when navigation lives in the header) ────── */}
          {navigationLayout === 'sidebar' && (
            <div className="hidden shrink-0 lg:block">
              <NavigationGroupsProvider groups={accessibleGroups}>
                <Sidebar
                  collapsed={sidebarCollapsed}
                  onToggleCollapsed={toggleSidebar}
                />
              </NavigationGroupsProvider>
            </div>
          )}

          {/* ── Page content ────────────────────────────────────────────────────── */}
          <main ref={mainRef} data-app-config-scope className="app-main min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <Outlet />
          </main>
        </div>

        {/* ── Status bar ───────────────────────────────────────────────────────── */}
        <ConfigSection id="statusbar" title="شريط الحالة السفلي">
          <footer className="win-statusbar flex h-6 shrink-0 items-center gap-3 px-3">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#107c10]" />
              <ConfigText k="shell.status.database" fallback="قاعدة البيانات متصلة" />
            </span>
          <span className="hidden text-[var(--win-text-muted)] sm:inline">
            {new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
          </span>
          <span className="ms-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFloatingCalculatorOpen(true)}
              className="flex h-6 w-6 items-center justify-center rounded-[var(--ui-radius-sm)] text-[var(--win-text-secondary)] hover:bg-[var(--win-accent-soft)] hover:text-[var(--win-accent-readable)]"
              title="الآلة الحاسبة"
              aria-label="فتح الآلة الحاسبة"
            >
              <Calculator className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setFloatingNotesOpen(true)}
              className="flex h-6 w-6 items-center justify-center rounded-[var(--ui-radius-sm)] text-[var(--win-text-secondary)] hover:bg-[var(--win-accent-soft)] hover:text-[var(--win-accent-readable)]"
              title="الملاحظات"
              aria-label="فتح الملاحظات"
            >
              <NotebookPen className="h-3.5 w-3.5" />
            </button>
            <span aria-hidden="true" className="h-3 w-px bg-[var(--win-border)]" />
            {currentUser && <span className="truncate">{currentUser.fullName}</span>}
            <span className="hidden sm:inline">
              <ConfigText k="shell.brand.name" fallback="سيراميسيس" />
            </span>
          </span>
          </footer>
        </ConfigSection>
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-[95] lg:hidden">
            <button
              type="button"
              aria-label="إغلاق القائمة الجانبية"
              className="absolute inset-0 h-full w-full bg-black/35"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div
              className="absolute inset-y-0 flex h-full w-[280px] max-w-[85vw] flex-col bg-[var(--win-surface)]"
              style={{ insetInlineStart: 0, borderInlineEnd: '1px solid var(--win-border)' }}
            >
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--win-border)] px-3">
                <span className="text-[12px] font-semibold">القائمة الرئيسية</span>
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(false)}
                  className="win-btn win-btn--ghost !min-h-7 !px-1.5"
                  aria-label="إغلاق"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <NavigationGroupsProvider groups={accessibleGroups}>
                  <Sidebar
                    mobile
                    onNavigate={() => setMobileSidebarOpen(false)}
                  />
                </NavigationGroupsProvider>
              </div>
            </div>
          </div>
        )}
        {floatingCalculatorOpen && (
          <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="pointer-events-auto" role="dialog" aria-label="آلة حاسبة عائمة">
              <CalculatorPanel floating onClose={() => setFloatingCalculatorOpen(false)} />
            </div>
          </div>
        )}
        {floatingNotesOpen && (
          <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="pointer-events-auto" role="dialog" aria-label="ملاحظات عائمة">
              <NotesPanel onClose={() => setFloatingNotesOpen(false)} />
            </div>
          </div>
        )}
      </div>
    </LayoutContext.Provider>
  );
};
