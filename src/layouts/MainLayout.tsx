import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sun, Moon, User as UserIcon, Search, Bell, ChevronLeft } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { GlobalSearch } from '../components/GlobalSearch';
import { NotificationService } from '../services/NotificationService';
import { User } from '../types';

interface MainLayoutProps {
  currentUser?: User | null;
  darkMode?: boolean;
  onToggleDark?: () => void;
}

// ─── Page title map (Arabic) ──────────────────────────────────────────────────
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'لوحة المعلومات',
  '/dashboard/executive': 'Executive Dashboard — نظرة تنفيذية شاملة',
  '/pos': 'نقطة البيع السريع (POS)',
  '/sales': 'فواتير المبيعات والمرتجع',
  '/quotations': 'عروض الأسعار',
  '/orders': 'الطلبات',
  '/returns': 'المرتجعات',
  '/products': 'دليل الأصناف والسيراميك',
  '/products/attributes': 'الخصائص الديناميكية',
  '/products/barcodes': 'طباعة الباركود',
  '/categories': 'التصنيفات والفئات',
  '/brands': 'الماركات والعلامات التجارية',
  '/pricing': 'قوائم الأسعار',
  '/promotions': 'العروض والخصومات',
  '/inventory': 'المخازن وحركات المخزون',
  '/inventory/ledger': 'سجل المخزون (Stock Ledger)',
  '/inventory/transfers': 'التحويلات المخزنية',
  '/inventory/counts': 'جرد المخزون',
  '/inventory/valuation': 'تقييم المخزون',
  '/inventory/adjustments': 'تسويات المخزون',
  '/branches': 'الفروع',
  '/warehouses': 'المخازن والمستودعات',
  '/customers': 'حسابات العملاء',
  '/crm/leads': 'العملاء المحتملون (Leads)',
  '/crm/pipeline': 'Pipeline المبيعات',
  '/crm/activities': 'الأنشطة والمتابعة',
  '/suppliers': 'حسابات الموردين والمصانع',
  '/purchases': 'فواتير الشراء والتوريدات',
  '/purchases/requests': 'طلبات الشراء',
  '/cashboxes': 'الخزائن النقدية والورديات',
  '/finance': 'المالية — نظرة عامة',
  '/finance/debts': 'الديون والذمم المدينة',
  '/finance/installments': 'جدول الأقساط',
  '/finance/expenses': 'المصروفات',
  '/projects': 'مشاريع المقاولين والعملاء',
  '/deliveries': 'إدارة التوصيل',
  '/drivers': 'السائقون',
  '/vehicles': 'المركبات',
  '/employees': 'الموظفون',
  '/reports': 'مركز التقارير',
  '/approvals': 'صندوق الموافقات',
  '/notifications': 'الإشعارات والتنبيهات',
  '/audit': 'سجل المراجعة (Audit Log)',
  '/users': 'المستخدمون والصلاحيات',
  '/backup': 'النسخ الاحتياطي',
  '/system-health': 'صحة النظام',
  '/cloud-sync': 'مركز المزامنة السحابية وربط الفروع',
  '/settings': 'إعدادات النظام',
};

function getPageTitle(pathname: string): string {
  // Exact match
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Dynamic routes: /products/123, /customers/456, /projects/789
  if (/^\/products\/[^/]+$/.test(pathname)) return 'تفاصيل المنتج';
  if (/^\/customers\/[^/]+$/.test(pathname)) return 'ملف العميل — Customer 360';
  if (/^\/projects\/[^/]+$/.test(pathname)) return 'تفاصيل المشروع';
  if (/^\/suppliers\/[^/]+$/.test(pathname)) return 'ملف المورد';
  return 'CeramiSys ERP';
}

// ─── Context for sharing user across layout ───────────────────────────────────
export const LayoutContext = React.createContext<{
  currentUser: User | null;
  darkMode: boolean;
}>({ currentUser: null, darkMode: false });

// ─── MainLayout ───────────────────────────────────────────────────────────────
export const MainLayout: React.FC<MainLayoutProps> = ({
  currentUser = null,
  darkMode = false,
  onToggleDark,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const pageTitle = getPageTitle(location.pathname);
  const [searchOpen, setSearchOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    const refreshNotifications = () => {
      try { setUnreadNotifications(new NotificationService().getUnreadCount(currentUser?.id)); } catch { setUnreadNotifications(0); }
    };
    refreshNotifications();
    const timer = window.setInterval(refreshNotifications, 30000);
    return () => window.clearInterval(timer);
  }, [currentUser?.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const canGoBack = location.pathname !== '/dashboard';

  return (
    <LayoutContext.Provider value={{ currentUser, darkMode }}>
      <div className={`flex h-screen w-screen overflow-hidden ${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`} dir="rtl">
        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <Sidebar currentUser={currentUser} />

        {/* ── Main Content ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
          {/* ── Top Header ──────────────────────────────────────────────────── */}
          <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-5 select-none shrink-0 gap-3">
            {/* Left: Back button + Page title */}
            <div className="flex items-center gap-2.5 min-w-0">
              {canGoBack && (
                <button
                  onClick={() => navigate(-1)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  title="رجوع"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <h2 className="text-sm font-extrabold text-slate-800 dark:text-white truncate">
                {pageTitle}
              </h2>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Global Search hint */}
              <button
                onClick={() => setSearchOpen(true)}
                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition"
                title="البحث العام (Ctrl+K)"
              >
                <Search className="w-3.5 h-3.5" />
                <span>بحث...</span>
                <kbd className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono text-slate-500 dark:text-slate-400">Ctrl K</kbd>
              </button>

              {/* Dark Mode Toggle */}
              <button
                onClick={onToggleDark}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title="تبديل السمة"
              >
                {darkMode
                  ? <Sun className="w-4 h-4 text-amber-400" />
                  : <Moon className="w-4 h-4" />
                }
              </button>

              {/* Notifications bell */}
              <button
                onClick={() => navigate('/notifications')}
                className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title={unreadNotifications ? `لديك ${unreadNotifications} إشعار غير مقروء` : 'الإشعارات'}
                aria-label="الإشعارات"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[17px] rounded-full bg-red-500 px-1 text-center text-[9px] font-black leading-[17px] text-white shadow-sm">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}
              </button>

              {/* Current User Pill */}
              {currentUser && (
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="w-6 h-6 rounded-lg bg-sky-600 text-white flex items-center justify-center text-xs font-bold">
                    <UserIcon className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{currentUser.fullName}</div>
                    <div className="text-[10px] text-sky-600 font-extrabold">
                      {currentUser.role === 'ADMIN' ? 'مدير النظام' : currentUser.role}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* ── Page Content ────────────────────────────────────────────────── */}
          <main className="flex-1 overflow-hidden">
            <Outlet />
          </main>
          <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
        </div>
      </div>
    </LayoutContext.Provider>
  );
};
