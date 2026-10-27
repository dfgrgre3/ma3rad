import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const [toolsPosition, setToolsPosition] = useState<{ left: number; top: number } | null>(null);
  const [toolsMenuAbove, setToolsMenuAbove] = useState(false);
  const [toolsMenuLeftOffset, setToolsMenuLeftOffset] = useState(0);
  const toolsDragStart = useRef<{ pointerX: number; pointerY: number; left: number; top: number } | null>(null);
  const toolsDragged = useRef(false);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
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

  useLayoutEffect(() => {
    if (!toolsMenuOpen) return;

    const positionMenu = () => {
      const button = toolsButtonRef.current?.getBoundingClientRect();
      const menu = toolsMenuRef.current?.getBoundingClientRect();
      if (!button || !menu) return;

      const belowSpace = window.innerHeight - button.bottom - 8;
      const aboveSpace = button.top - 8;
      setToolsMenuAbove(menu.height > belowSpace && aboveSpace > belowSpace);
      setToolsMenuLeftOffset(Math.min(0, window.innerWidth - menu.width - button.left));
    };

    positionMenu();
    window.addEventListener('resize', positionMenu);
    return () => window.removeEventListener('resize', positionMenu);
  }, [toolsMenuOpen, toolsPosition]);

  return (
    <LayoutContext.Provider value={{ currentUser }}>
      <div className="app-shell flex flex-col h-screen w-full min-w-0 overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100" dir="rtl">
        {/* ── Header with Mega Menu ───────────────────────────────────────────── */}
        <Header
          currentUser={currentUser}
          unreadNotifications={unreadNotifications}
          onLogout={onLogout}
        />

        {/* ── Page Content ────────────────────────────────────────────────── */}
        <main className="app-main min-w-0 flex-1 overflow-hidden">
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
        <div
          className={`fixed z-[80] h-12 w-12 ${toolsPosition ? '' : 'bottom-5 left-5'}`}
          style={toolsPosition ? { left: toolsPosition.left, top: toolsPosition.top } : undefined}
          dir="rtl"
        >
          <button
            ref={toolsButtonRef}
            onPointerDown={(event) => {
              if (!event.isPrimary) return;
              const rect = event.currentTarget.getBoundingClientRect();
              toolsDragStart.current = {
                pointerX: event.clientX,
                pointerY: event.clientY,
                left: rect.left,
                top: rect.top,
              };
              toolsDragged.current = false;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const start = toolsDragStart.current;
              if (!start) return;
              const deltaX = event.clientX - start.pointerX;
              const deltaY = event.clientY - start.pointerY;
              if (!toolsDragged.current && Math.hypot(deltaX, deltaY) < 5) return;
              toolsDragged.current = true;
              setToolsPosition({
                left: Math.max(0, Math.min(window.innerWidth - 48, start.left + deltaX)),
                top: Math.max(0, Math.min(window.innerHeight - 48, start.top + deltaY)),
              });
            }}
            onPointerUp={() => { toolsDragStart.current = null; }}
            onPointerCancel={() => { toolsDragStart.current = null; }}
            onClick={(event) => {
              if (toolsDragged.current) {
                toolsDragged.current = false;
                event.preventDefault();
                return;
              }
              setToolsMenuOpen((open) => !open);
            }}
            aria-label={toolsMenuOpen ? 'إغلاق قائمة الأدوات' : 'فتح قائمة الأدوات'}
            aria-expanded={toolsMenuOpen}
            title="اسحب لتحريك زر الأدوات"
            className="flex h-12 w-12 touch-none cursor-grab select-none items-center justify-center rounded-full bg-sky-600 text-white shadow-lg shadow-sky-900/25 transition hover:bg-sky-700 active:cursor-grabbing focus:outline-none focus:ring-4 focus:ring-sky-300"
          >
            {toolsMenuOpen ? <X className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
          </button>
          {toolsMenuOpen && (
            <div
              ref={toolsMenuRef}
              className="absolute min-w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
              style={{
                left: toolsMenuLeftOffset,
                top: toolsMenuAbove ? undefined : 'calc(100% + 8px)',
                bottom: toolsMenuAbove ? 'calc(100% + 8px)' : undefined,
              }}
            >
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
