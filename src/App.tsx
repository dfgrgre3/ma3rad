import React, { useState, useEffect } from 'react';
import { HashRouter } from 'react-router-dom';
import { DatabaseManager } from './database/db';
import { AuthService } from './services/AuthService';
import { PermissionService } from './services/PermissionService';
import { User } from './types';

// ─── Stub system user (no login screen yet) ───────────────────────────────────
const SYSTEM_USER: User = {
  id: 'usr_admin',
  username: 'system',
  fullName: 'مستخدم النظام',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

// ─── App ──────────────────────────────────────────────────────────────────────
export const App: React.FC = () => {
  const [dbReady, setDbReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('ceramisys_dark') === 'true';
  });
  const [currentUser] = useState<User>(SYSTEM_USER);

  // ── DB Init ─────────────────────────────────────────────────────────────────
  const initDb = () => {
    setInitError(null);
    DatabaseManager.getInstance()
      .initialize()
      .then(() => {
        PermissionService.seed();
        AuthService.setCurrentUser(SYSTEM_USER);
        setDbReady(true);
      })
      .catch((err) => {
        console.error('Failed to initialize SQLite Database:', err);
        setInitError(err?.message || 'حدث خطأ أثناء تحميل قاعدة البيانات');
      });
  };

  useEffect(() => {
    initDb();
  }, []);

  // ── Dark Mode ───────────────────────────────────────────────────────────────
  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('ceramisys_dark', String(next));
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Apply saved dark mode on mount
  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading / Error Screen ──────────────────────────────────────────────────
  if (!dbReady) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-white select-none px-4">
        {/* Logo */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-sky-500/30 text-3xl font-black">
            C
          </div>
          {!initError && (
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 animate-ping opacity-20" />
          )}
        </div>

        <h1 className="text-xl font-black tracking-wide text-white mb-1">CeramiSys ERP</h1>
        <p className="text-sm text-slate-400 mb-4">نظام إدارة معارض السيراميك ومواد التشطيب</p>

        {initError ? (
          <div className="flex flex-col items-center gap-3">
            <div className="text-sm text-red-400 bg-red-950/60 border border-red-500/30 px-5 py-3 rounded-xl text-center max-w-sm">
              {initError}
            </div>
            <button
              onClick={initDb}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold shadow-lg transition-all active:scale-95"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <p className="text-xs text-sky-400 font-medium animate-pulse">
            جاري تهيئة قاعدة بيانات SQLite...
          </p>
        )}
      </div>
    );
  }

  // ── Main App with Router ────────────────────────────────────────────────────
  // HashRouter works under Electron's file:// protocol and, unlike MemoryRouter,
  // survives reloads and supports deep links (e.g. #/products/123).
  // The "/" index route redirects to /dashboard.
  return (
    <HashRouter>
      <AppRouterWithProps
        currentUser={currentUser}
        darkMode={darkMode}
        onToggleDark={toggleDarkMode}
      />
    </HashRouter>
  );
};

// ─── Inner component that has access to router context ────────────────────────
// We need to pass currentUser/darkMode down to MainLayout via a wrapper
// because AppRouter renders MainLayout as the root route element.
import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { lazy, Suspense } from 'react';

const PageLoader: React.FC = () => (
  <div className="flex-1 flex items-center justify-center h-full">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 rounded-xl bg-sky-600 animate-bounce shadow-lg shadow-sky-500/20" />
      <p className="text-xs text-slate-400 font-medium">جاري التحميل...</p>
    </div>
  </div>
);

// Lazy pages
const DashboardView          = lazy(() => import('./components/DashboardView').then(m => ({ default: m.DashboardView })));
const ExecutiveDashboard     = lazy(() => import('./pages/dashboard/ExecutiveDashboard').then(m => ({ default: m.ExecutiveDashboard })));
const PosView                = lazy(() => import('./components/PosView').then(m => ({ default: m.PosView })));
const SalesView              = lazy(() => import('./components/SalesView').then(m => ({ default: m.SalesView })));
const QuotationsPage         = lazy(() => import('./pages/sales/QuotationsPage').then(m => ({ default: m.QuotationsPage })));
const OrdersPage             = lazy(() => import('./pages/sales/OrdersPage').then(m => ({ default: m.OrdersPage })));
const ReturnsPage            = lazy(() => import('./pages/sales/ReturnsPage').then(m => ({ default: m.ReturnsPage })));
const ProductsView           = lazy(() => import('./components/ProductsView').then(m => ({ default: m.ProductsView })));
const ProductDetailPage      = lazy(() => import('./pages/products/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })));
const ProductAttributesPage  = lazy(() => import('./pages/products/ProductAttributesPage').then(m => ({ default: m.ProductAttributesPage })));
const BarcodesPrintPage      = lazy(() => import('./pages/products/BarcodesPrintPage').then(m => ({ default: m.BarcodesPrintPage })));
const CategoriesView         = lazy(() => import('./components/CategoriesView').then(m => ({ default: m.CategoriesView })));
const BrandsView             = lazy(() => import('./components/BrandsView').then(m => ({ default: m.BrandsView })));
const PricingPage            = lazy(() => import('./pages/pricing/PricingPage').then(m => ({ default: m.PricingPage })));
const PromotionsPage         = lazy(() => import('./pages/pricing/PromotionsPage').then(m => ({ default: m.PromotionsPage })));
const InventoryView          = lazy(() => import('./components/InventoryView').then(m => ({ default: m.InventoryView })));
const StockLedgerPage        = lazy(() => import('./pages/inventory/StockLedgerPage').then(m => ({ default: m.StockLedgerPage })));
const StockTransfersView     = lazy(() => import('./components/StockTransfersView').then(m => ({ default: m.StockTransfersView })));
const InventoryCountPage     = lazy(() => import('./pages/inventory/InventoryCountPage').then(m => ({ default: m.InventoryCountPage })));
const InventoryValuationPage = lazy(() => import('./pages/inventory/InventoryValuationPage').then(m => ({ default: m.InventoryValuationPage })));
const InventoryAdjustmentsPage = lazy(() => import('./pages/inventory/InventoryAdjustmentsPage').then(m => ({ default: m.InventoryAdjustmentsPage })));
const BranchesPage           = lazy(() => import('./pages/operations/BranchesPage').then(m => ({ default: m.BranchesPage })));
const WarehousesPage         = lazy(() => import('./pages/operations/WarehousesPage').then(m => ({ default: m.WarehousesPage })));
const CustomersView          = lazy(() => import('./components/CustomersView').then(m => ({ default: m.CustomersView })));
const CustomerDetailPage     = lazy(() => import('./pages/customers/CustomerDetailPage').then(m => ({ default: m.CustomerDetailPage })));
const LeadsPage              = lazy(() => import('./pages/crm/LeadsPage').then(m => ({ default: m.LeadsPage })));
const PipelinePage           = lazy(() => import('./pages/crm/PipelinePage').then(m => ({ default: m.PipelinePage })));
const CrmActivitiesPage      = lazy(() => import('./pages/crm/CrmActivitiesPage').then(m => ({ default: m.CrmActivitiesPage })));
const SuppliersView          = lazy(() => import('./components/SuppliersView').then(m => ({ default: m.SuppliersView })));
const PurchasesView          = lazy(() => import('./components/PurchasesView').then(m => ({ default: m.PurchasesView })));
const PurchaseRequestsPage   = lazy(() => import('./pages/purchasing/PurchaseRequestsPage').then(m => ({ default: m.PurchaseRequestsPage })));
const CashierView            = lazy(() => import('./components/CashierView').then(m => ({ default: m.CashierView })));
const FinanceOverviewPage    = lazy(() => import('./pages/finance/FinanceOverviewPage').then(m => ({ default: m.FinanceOverviewPage })));
const DebtsDashboardPage     = lazy(() => import('./pages/finance/DebtsDashboardPage').then(m => ({ default: m.DebtsDashboardPage })));
const InstallmentsPage       = lazy(() => import('./pages/finance/InstallmentsPage').then(m => ({ default: m.InstallmentsPage })));
const ExpensesPage           = lazy(() => import('./pages/finance/ExpensesPage').then(m => ({ default: m.ExpensesPage })));
const ProjectsPage           = lazy(() => import('./pages/projects/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const ProjectDetailPage      = lazy(() => import('./pages/projects/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));
const DeliveriesPage         = lazy(() => import('./pages/operations/DeliveriesPage').then(m => ({ default: m.DeliveriesPage })));
const DriversPage            = lazy(() => import('./pages/operations/DriversPage').then(m => ({ default: m.DriversPage })));
const VehiclesPage           = lazy(() => import('./pages/operations/VehiclesPage').then(m => ({ default: m.VehiclesPage })));
const EmployeesPage          = lazy(() => import('./pages/operations/EmployeesPage').then(m => ({ default: m.EmployeesPage })));
const ReportsView            = lazy(() => import('./components/ReportsView').then(m => ({ default: m.ReportsView })));
const ApprovalsPage          = lazy(() => import('./pages/approvals/ApprovalsPage').then(m => ({ default: m.ApprovalsPage })));
const NotificationsView      = lazy(() => import('./components/NotificationsView').then(m => ({ default: m.NotificationsView })));
const AuditLogView           = lazy(() => import('./components/AuditLogView').then(m => ({ default: m.AuditLogView })));
const SettingsView           = lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));
const UsersView              = lazy(() => import('./components/UsersView').then(m => ({ default: m.UsersView })));
const BackupPage             = lazy(() => import('./pages/settings/BackupPage').then(m => ({ default: m.BackupPage })));
const SystemHealthPage       = lazy(() => import('./pages/settings/SystemHealthPage').then(m => ({ default: m.SystemHealthPage })));
const CloudSyncPage          = lazy(() => import('./pages/settings/CloudSyncPage').then(m => ({ default: m.CloudSyncPage })));

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

const AppRouterWithProps: React.FC<{
  currentUser: User;
  darkMode: boolean;
  onToggleDark: () => void;
}> = ({ currentUser, darkMode, onToggleDark }) => (
  <Routes>
    <Route
      path="/"
      element={
        <MainLayout
          currentUser={currentUser}
          darkMode={darkMode}
          onToggleDark={onToggleDark}
        />
      }
    >
      <Route index element={<Navigate to="/dashboard" replace />} />

      {/* Dashboard */}
      <Route path="dashboard" element={<S><DashboardView /></S>} />
      <Route path="dashboard/executive" element={<S><ExecutiveDashboard /></S>} />

      {/* Sales / POS */}
      <Route path="pos" element={<S><PosView /></S>} />
      <Route path="sales" element={<S><SalesView /></S>} />
      <Route path="quotations" element={<S><QuotationsPage /></S>} />
      <Route path="orders" element={<S><OrdersPage /></S>} />
      <Route path="returns" element={<S><ReturnsPage /></S>} />

      {/* Products */}
      <Route path="products" element={<S><ProductsView /></S>} />
      <Route path="products/attributes" element={<S><ProductAttributesPage /></S>} />
      <Route path="products/barcodes" element={<S><BarcodesPrintPage /></S>} />
      <Route path="products/:id" element={<S><ProductDetailPage /></S>} />
      <Route path="categories" element={<S><CategoriesView /></S>} />
      <Route path="brands" element={<S><BrandsView /></S>} />

      {/* Pricing */}
      <Route path="pricing" element={<S><PricingPage /></S>} />
      <Route path="promotions" element={<S><PromotionsPage /></S>} />

      {/* Inventory */}
      <Route path="inventory" element={<S><InventoryView /></S>} />
      <Route path="inventory/ledger" element={<S><StockLedgerPage /></S>} />
      <Route path="inventory/transfers" element={<S><StockTransfersView /></S>} />
      <Route path="inventory/counts" element={<S><InventoryCountPage /></S>} />
      <Route path="inventory/valuation" element={<S><InventoryValuationPage /></S>} />
      <Route path="inventory/adjustments" element={<S><InventoryAdjustmentsPage /></S>} />

      {/* Branches / Warehouses */}
      <Route path="branches" element={<S><BranchesPage /></S>} />
      <Route path="warehouses" element={<S><WarehousesPage /></S>} />

      {/* CRM */}
      <Route path="customers" element={<S><CustomersView /></S>} />
      <Route path="customers/:id" element={<S><CustomerDetailPage /></S>} />
      <Route path="crm/leads" element={<S><LeadsPage /></S>} />
      <Route path="crm/pipeline" element={<S><PipelinePage /></S>} />
      <Route path="crm/activities" element={<S><CrmActivitiesPage /></S>} />

      {/* Purchasing */}
      <Route path="suppliers" element={<S><SuppliersView /></S>} />
      <Route path="purchases" element={<S><PurchasesView /></S>} />
      <Route path="purchases/requests" element={<S><PurchaseRequestsPage /></S>} />

      {/* Finance */}
      <Route path="cashboxes" element={<S><CashierView /></S>} />
      <Route path="finance" element={<S><FinanceOverviewPage /></S>} />
      <Route path="finance/debts" element={<S><DebtsDashboardPage /></S>} />
      <Route path="finance/installments" element={<S><InstallmentsPage /></S>} />
      <Route path="finance/expenses" element={<S><ExpensesPage /></S>} />

      {/* Projects */}
      <Route path="projects" element={<S><ProjectsPage /></S>} />
      <Route path="projects/:id" element={<S><ProjectDetailPage /></S>} />

      {/* Operations */}
      <Route path="deliveries" element={<S><DeliveriesPage /></S>} />
      <Route path="drivers" element={<S><DriversPage /></S>} />
      <Route path="vehicles" element={<S><VehiclesPage /></S>} />
      <Route path="employees" element={<S><EmployeesPage /></S>} />

      {/* Reports */}
      <Route path="reports" element={<S><ReportsView /></S>} />

      {/* Approvals */}
      <Route path="approvals" element={<S><ApprovalsPage /></S>} />

      {/* Notifications & Audit */}
      <Route path="notifications" element={<S><NotificationsView /></S>} />
      <Route path="audit" element={<S><AuditLogView /></S>} />

      {/* Settings */}
      <Route path="settings" element={<S><SettingsView /></S>} />
      <Route path="users" element={<S><UsersView /></S>} />
      <Route path="backup" element={<S><BackupPage /></S>} />
      <Route path="system-health" element={<S><SystemHealthPage /></S>} />
      <Route path="cloud-sync" element={<S><CloudSyncPage /></S>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Route>
  </Routes>
);

export default App;
