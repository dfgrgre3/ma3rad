import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Calculator, NotebookPen, ShieldAlert, Wrench, X } from 'lucide-react';
import { Header } from '../components/Header';
import { NotificationService } from '../services/NotificationService';
import { PermissionService } from '../services/PermissionService';
import { NavigationService } from '../services/NavigationService';
import { CalculatorPanel } from '../components/CalculatorPanel';
import { NotesPanel } from '../components/NotesPanel';
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
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [floatingCalculatorOpen, setFloatingCalculatorOpen] = useState(false);
  const [floatingNotesOpen, setFloatingNotesOpen] = useState(false);
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

  useEffect(() => { setToolsMenuOpen(false); }, [location.pathname, location.search]);

  return (
    <LayoutContext.Provider value={{ currentUser }}>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100" dir="rtl">
        {/* ── Header with Mega Menu ───────────────────────────────────────────── */}
        <Header
          currentUser={currentUser}
          unreadNotifications={unreadNotifications}
          onLogout={onLogout}
        />

        {/* ── Page Content ────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-hidden">
          {isAllowed ? (
            <Outlet />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center">
                <ShieldAlert className="w-8 h-8 text-rose-500" />
              </div>
              <h2 className="text-lg font-black text-slate-900">غير مصرح لك بالوصول</h2>
              <p className="text-sm text-slate-500 max-w-sm">
                حسابك الحالي لا يملك الصلاحية المطلوبة لعرض هذه الصفحة ({required}).
                تواصل مع مدير النظام لمنحك الصلاحية المناسبة.
              </p>
              <button
                onClick={() => navigate('/dashboard')}
                className="mt-2 px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-bold transition"
              >
                العودة إلى لوحة المعلومات
              </button>
            </div>
          )}
        </main>
        <div className="fixed bottom-5 left-5 z-[80] flex flex-col items-start gap-2" dir="rtl">
          {toolsMenuOpen && (
            <div className="mb-1 min-w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <button onClick={() => { setFloatingNotesOpen(true); setToolsMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                <NotebookPen className="h-4 w-4 text-sky-600" /> الملاحظات
              </button>
              <button onClick={() => navigate('/tools?tool=notes')} className="w-full rounded-lg px-3 py-2 text-right text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                فتح صفحة الملاحظات
              </button>
              <button onClick={() => { setFloatingCalculatorOpen(true); setToolsMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                <Calculator className="h-4 w-4 text-indigo-600" /> الآلة الحاسبة
              </button>
              <button onClick={() => navigate('/tools?tool=calculator')} className="w-full rounded-lg px-3 py-2 text-right text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                فتح صفحة الآلة الحاسبة
              </button>
            </div>
          )}
          <button onClick={() => setToolsMenuOpen((open) => !open)} aria-label={toolsMenuOpen ? 'إغلاق قائمة الأدوات' : 'فتح قائمة الأدوات'} aria-expanded={toolsMenuOpen} className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg shadow-sky-900/25 transition hover:bg-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-300">
            {toolsMenuOpen ? <X className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
          </button>
        </div>
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
