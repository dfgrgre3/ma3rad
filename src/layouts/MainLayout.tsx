import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Calculator, NotebookPen, ShieldAlert, X } from 'lucide-react';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { NotificationService } from '../services/NotificationService';
import { PermissionService } from '../services/PermissionService';
import { NavigationService } from '../services/NavigationService';
import { CalculatorPanel } from '../components/CalculatorPanel';
import { NotesPanel } from '../components/NotesPanel';
import { useTheme } from '../contexts/ThemeContext';
import { User } from '../types';

interface MainLayoutProps {
  currentUser?: User | null;
  onLogout?: () => void;
}

// ─── Context for sharing user across layout ───────────────────────────────────
export const LayoutContext = React.createContext<{
  currentUser: User | null;
}>({ currentUser: null });

// ─── MainLayout ───────────────────────────────────────────────────────────────
export const MainLayout: React.FC<MainLayoutProps> = ({
  currentUser = null,
  onLogout,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useTheme();
  const navigationLayout = settings.navigationLayout === 'header' ? 'header' : 'sidebar';
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [floatingCalculatorOpen, setFloatingCalculatorOpen] = useState(false);
  const [floatingNotesOpen, setFloatingNotesOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const required = NavigationService.getRequiredPermission(location.pathname);
  const isAllowed = !required || PermissionService.can(currentUser, required);

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

  return (
    <LayoutContext.Provider value={{ currentUser }}>
      <div className="app-shell win-app flex h-screen w-full min-w-0 flex-col overflow-hidden bg-[#f3f3f3] text-[#1b1b1b] dark:bg-[#1f1f1f] dark:text-[#f0f0f0]" dir="rtl">
        {/* ── Top bar ──────────────────────────────────────────────────────────── */}
        <Header
          currentUser={currentUser}
          unreadNotifications={unreadNotifications}
          onLogout={onLogout}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
          navigationLayout={navigationLayout}
        />

        <div className="flex min-h-0 flex-1">
          {/* ── Desktop sidebar (hidden when navigation lives in the header) ────── */}
          {navigationLayout === 'sidebar' && (
            <div className="hidden shrink-0 lg:block">
              <Sidebar
                currentUser={currentUser}
                collapsed={sidebarCollapsed}
                onToggleCollapsed={toggleSidebar}
              />
            </div>
          )}

          {/* ── Page content ────────────────────────────────────────────────────── */}
          <main className="app-main min-w-0 flex-1 overflow-hidden">
            {isAllowed ? (
              <Outlet />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-[2px] border border-[#e5b8b3] bg-[#fdf3f2]">
                  <ShieldAlert className="h-6 w-6 text-[#c42b1c]" />
                </div>
                <h2 className="text-base font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">غير مصرح لك بالوصول</h2>
                <p className="max-w-sm text-[12px] text-[#4d4d4d] dark:text-[#c8c8c8]">
                  حسابك الحالي لا يملك الصلاحية المطلوبة لعرض هذه الصفحة ({required}).
                  تواصل مع مدير النظام لمنحك الصلاحية المناسبة.
                </p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="win-btn win-btn--primary mt-2"
                >
                  العودة إلى لوحة المعلومات
                </button>
              </div>
            )}
          </main>
        </div>

        {/* ── Status bar ───────────────────────────────────────────────────────── */}
        <footer className="win-statusbar flex h-6 shrink-0 items-center gap-3 px-3">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#107c10]" />
            قاعدة البيانات متصلة
          </span>
          <span className="hidden text-[#767676] dark:text-[#a6a6a6] sm:inline">
            {new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
          </span>
          <span className="mr-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFloatingCalculatorOpen(true)}
              className="flex h-6 w-6 items-center justify-center rounded-[2px] text-[#4d4d4d] hover:bg-[#e5f1fb] hover:text-[#005a9e] dark:text-[#c8c8c8] dark:hover:bg-[#0f3550]"
              title="الآلة الحاسبة"
              aria-label="فتح الآلة الحاسبة"
            >
              <Calculator className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setFloatingNotesOpen(true)}
              className="flex h-6 w-6 items-center justify-center rounded-[2px] text-[#4d4d4d] hover:bg-[#e5f1fb] hover:text-[#005a9e] dark:text-[#c8c8c8] dark:hover:bg-[#0f3550]"
              title="الملاحظات"
              aria-label="فتح الملاحظات"
            >
              <NotebookPen className="h-3.5 w-3.5" />
            </button>
            <span aria-hidden="true" className="h-3 w-px bg-[#c8c8c8] dark:bg-[#4a4a4a]" />
            {currentUser && <span className="truncate">{currentUser.fullName}</span>}
            <span className="hidden sm:inline">CeramiSys ERP</span>
          </span>
        </footer>
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-[95] lg:hidden" dir="rtl">
            <button
              type="button"
              aria-label="إغلاق القائمة الجانبية"
              className="absolute inset-0 h-full w-full bg-black/35"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="absolute inset-y-0 right-0 flex h-full w-[264px] max-w-[85vw] flex-col border-l border-[#d9d9d9] bg-white dark:border-[#3d3d3d] dark:bg-[#2b2b2b]">
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#d9d9d9] px-3 dark:border-[#3d3d3d]">
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
                <Sidebar
                  currentUser={currentUser}
                  mobile
                  onNavigate={() => setMobileSidebarOpen(false)}
                />
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
