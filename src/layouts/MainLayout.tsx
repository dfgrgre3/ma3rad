import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Header } from '../components/Header';
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
  ['/sales/analytics', 'sales.view'],
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
  ['/inventory/damage-quarantine', 'inventory.adjust'],
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
  ['/fleet/dashboard', 'deliveries.view'],
  ['/hr/dashboard', 'employees.view'],
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
