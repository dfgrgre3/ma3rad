import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Header } from '../components/Header';
import { NotificationService } from '../services/NotificationService';
import { PermissionService } from '../services/PermissionService';
import { NavigationService } from '../services/NavigationService';
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
      </div>
    </LayoutContext.Provider>
  );
};
