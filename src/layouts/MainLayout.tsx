import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, ShieldAlert } from 'lucide-react';
import { Header } from '../components/Header';
import { GlobalSearch } from '../components/GlobalSearch';
import { NotificationService } from '../services/NotificationService';
import { PermissionService } from '../services/PermissionService';
import { User } from '../types';

interface MainLayoutProps {
  currentUser?: User | null;
  onLogout?: () => void;
}

// Route prefix -> permission required. Longest prefix wins.
const ROUTE_PERMISSIONS: Array<[string, string]> = [
  ['/data-import', 'settings.view'],
  ['/dashboard/executive', 'dashboard.view'],
  ['/dashboard', 'dashboard.view'],
  ['/daily/sales', 'sales.view'],
  ['/daily/purchases', 'purchases.view'],
  ['/daily/expenses', 'cashier.expense'],
  ['/daily/debts', 'finance.debts.view'],
  ['/pos', 'sales.create'],
  ['/quotations', 'quotations.view'],
  ['/orders', 'orders.view'],
  ['/returns', 'returns.view'],
  ['/sales', 'sales.view'],
  ['/products/attributes', 'products.view'],
  ['/products/barcodes', 'products.view'],
  ['/products', 'products.view'],
  ['/categories', 'categories.view'],
  ['/brands', 'brands.view'],
  ['/pricing', 'pricing.view'],
  ['/promotions', 'promotions.view'],
  ['/inventory/transfers', 'inventory.transfer'],
  ['/inventory/counts', 'inventory.count'],
  ['/inventory/adjustments', 'inventory.adjust'],
  ['/inventory/ledger', 'inventory.view'],
  ['/inventory/valuation', 'inventory.view'],
  ['/inventory', 'inventory.view'],
  ['/branches', 'branches.view'],
  ['/warehouses', 'warehouses.view'],
  ['/employees', 'employees.view'],
  ['/deliveries', 'deliveries.view'],
  ['/drivers', 'drivers.view'],
  ['/vehicles', 'vehicles.view'],
  ['/customers', 'customers.view'],
  ['/crm', 'crm.view'],
  ['/projects', 'projects.view'],
  ['/suppliers', 'suppliers.view'],
  ['/purchases/requests', 'purchases.view'],
  ['/purchases/orders', 'purchases.view'],
  ['/purchases/returns', 'purchases.return'],
  ['/purchases', 'purchases.view'],
  ['/cashboxes', 'cashier.view'],
  ['/finance/expenses', 'cashier.expense'],
  ['/finance/debts', 'finance.debts.view'],
  ['/finance/installments', 'finance.installments.view'],
  ['/finance', 'finance.view'],
  ['/reports', 'reports.view'],
  ['/approvals', 'approvals.view'],
  ['/notifications', 'notifications.view'],
  ['/audit', 'audit.view'],
  ['/security', 'users.view'],
  ['/users', 'users.view'],
  ['/backup', 'settings.backup'],
  ['/system-health', 'settings.view'],
  ['/admin', 'admin.view'],
  ['/settings', 'settings.view'],
];

function requiredPermission(pathname: string): string | null {
  const match = ROUTE_PERMISSIONS.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/')
  );
  return match ? match[1] : null;
}

// ─── Page title map (Arabic) ──────────────────────────────────────────────────
const PAGE_TITLES: Record<string, string> = {
  '/data-import': 'مركز استيراد البيانات',
  '/dashboard': 'لوحة المعلومات',
  '/dashboard/executive': 'Executive Dashboard — نظرة تنفيذية شاملة',
  '/pos': 'نقطة البيع السريع (POS)',
  '/daily/sales': 'مبيعات اليوم',
  '/daily/purchases': 'مشتريات اليوم',
  '/daily/expenses': 'منصرف اليوم',
  '/daily/debts': 'ديون اليوم',
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
  '/inventory/warehouse-stock': 'الأصناف الموجودة في المخزن',
  '/inventory/showroom-stock': 'مقارنة مخزون المعرض والمخزن',
  '/inventory/ledger': 'سجل المخزون (Stock Ledger)',
  '/inventory/transfers': 'التحويلات المخزنية',
  '/inventory/counts': 'جرد المخزون',
  '/inventory/valuation': 'تقييم المخزون',
  '/inventory/adjustments': 'تسويات المخزون',
  '/inventory/reservations': 'حجوزات المخزون',
  '/branches': 'الفروع',
  '/warehouses': 'المخازن والمستودعات',
  '/customers': 'حسابات العملاء',
  '/crm/leads': 'العملاء المحتملون (Leads)',
  '/crm/pipeline': 'Pipeline المبيعات',
  '/crm/activities': 'الأنشطة والمتابعة',
  '/crm/campaigns': 'الحملات التسويقية',
  '/suppliers': 'حسابات الموردين والمصانع',
  '/purchases': 'فواتير الشراء والتوريدات',
  '/purchases/requests': 'طلبات الشراء',
  '/purchases/orders': 'أوامر الشراء',
  '/purchases/returns': 'مرتجعات الشراء',
  '/cashboxes': 'الخزائن النقدية والورديات',
  '/finance': 'المالية — نظرة عامة',
  '/finance/debts': 'الديون والذمم المدينة',
  '/finance/installments': 'جدول الأقساط',
  '/finance/expenses': 'المصروفات',
  '/finance/accounts': 'دليل الحسابات العام',
  '/finance/journal': 'القيود اليومية وميزان المراجعة',
  '/finance/cheques': 'إدارة الشيكات',
  '/finance/assets': 'الأصول الثابتة والإهلاك',
  '/projects': 'مشاريع المقاولين والعملاء',
  '/deliveries': 'إدارة التوصيل',
  '/drivers': 'السائقون',
  '/vehicles': 'المركبات',
  '/employees': 'الموظفون',
  '/employees/attendance': 'الحضور والانصراف',
  '/employees/payroll': 'الرواتب والمسحوبات',
  '/employees/commissions': 'عمولات المبيعات',
  '/reports': 'مركز التقارير',
  '/reports/statements': 'القوائم المالية',
  '/reports/profit-loss': 'قائمة الأرباح والخسائر',
  '/reports/tax': 'تقرير ضريبة القيمة المضافة',
  '/approvals': 'صندوق الموافقات',
  '/notifications': 'الإشعارات والتنبيهات',
  '/audit': 'سجل المراجعة (Audit Log)',
  '/security': 'مركز الأمان',
  '/users': 'المستخدمون والصلاحيات',
  '/backup': 'النسخ الاحتياطي',
  '/system-health': 'صحة النظام',
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
}>({ currentUser: null });

// ─── MainLayout ───────────────────────────────────────────────────────────────
export const MainLayout: React.FC<MainLayoutProps> = ({
  currentUser = null,
  onLogout,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const pageTitle = getPageTitle(location.pathname);
  const [searchOpen, setSearchOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const required = requiredPermission(location.pathname);
  const isAllowed = !required || PermissionService.can(currentUser, required);

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
    <LayoutContext.Provider value={{ currentUser }}>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100" dir="rtl">
        {/* ── Header with Mega Menu ───────────────────────────────────────────── */}
        <Header
          currentUser={currentUser}
          unreadNotifications={unreadNotifications}
          onLogout={onLogout}
        />

        {/* ── Sub Header (Page Title + Search) ─────────────────────────────────── */}
        <div className="h-12 border-b bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700 flex items-center justify-between px-4 lg:px-6 select-none shrink-0 gap-4">
          {/* Left: Back button + Page title */}
          <div className="flex items-center gap-2.5 min-w-0">
            {canGoBack && (
              <button
                onClick={() => navigate(-1)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition"
                title="رجوع"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 truncate">
              {pageTitle}
            </h2>
          </div>

          {/* Right: Global Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-500 bg-slate-50 border border-slate-200 hover:border-slate-300 transition"
            title="البحث العام (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5" />
            <span>بحث...</span>
            <kbd className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded font-mono text-slate-500">Ctrl K</kbd>
          </button>
        </div>

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
        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </LayoutContext.Provider>
  );
};
