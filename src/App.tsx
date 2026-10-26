import React, { useState, useEffect, useRef } from 'react';
import { HashRouter } from 'react-router-dom';
import { DatabaseManager } from './database/db';
import { AuthService } from './services/AuthService';
import { PermissionService } from './services/PermissionService';
import { SettingsService } from './services/SettingsService';
import { User } from './types';
import { LoginPage } from './pages/auth/LoginPage';
import { SetupWizard } from './components/SetupWizard';
import { ForcePasswordChangeModal } from './components/ForcePasswordChangeModal';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

const RUNTIME_SESSION_KEY = 'ceramisys_runtime_initialized';

function hasRuntimeSession(): boolean {
  try {
    return sessionStorage.getItem(RUNTIME_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markRuntimeSession(): void {
  try {
    sessionStorage.setItem(RUNTIME_SESSION_KEY, '1');
  } catch {
    // Session storage may be unavailable in restricted browser contexts.
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────
export const App: React.FC = () => {
  const backupTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dbReady, setDbReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    try {
      const completed = SettingsService.getValue('setup_completed') === '1';
      const db = DatabaseManager.getInstance();
      const products = db.query<{ count: number }>('SELECT COUNT(*) AS count FROM products')[0]?.count || 0;
      const invoices = db.query<{ count: number }>('SELECT COUNT(*) AS count FROM sales_invoices')[0]?.count || 0;
      setShowSetup(!completed && products === 0 && invoices === 0);
    } catch {
      setShowSetup(false);
    }
  }, [currentUser?.id]);

  // ── DB Init ─────────────────────────────────────────────────────────────────
  const initDb = () => {
    setInitError(null);
    setRecoveryRequired(false);
    DatabaseManager.getInstance()
      .initialize()
      .then(() => {
        const restoreCurrentRuntimeSession = hasRuntimeSession();
        if (!restoreCurrentRuntimeSession) AuthService.clearPersistedSession();
        markRuntimeSession();

        PermissionService.seed();
        setCurrentUser(restoreCurrentRuntimeSession ? AuthService.restoreSession() : null);
        setDbReady(true);
        // Check the configured interval throughout the desktop session.
        void import('./services/BackupService').then(({ BackupService }) => {
          const runBackupCheck = () => {
            try {
              const interval = SettingsService.getSettings().autoBackupIntervalHours || 24;
              void new BackupService().runAutoBackupIfDue(interval).then((result) => {
                if (result.error) console.warn('Auto backup failed:', result.error);
              });
            } catch (e) {
              console.warn('Auto backup skipped:', e);
            }
          };
          if (backupTimer.current) clearInterval(backupTimer.current);
          runBackupCheck();
          backupTimer.current = setInterval(runBackupCheck, 15 * 60 * 1000);
        });
        // Scheduled business alerts (low stock, dues, pending approvals).
        void import('./services/NotificationService').then(({ NotificationService }) => {
          try {
            new NotificationService().runScheduledChecks();
          } catch (e) {
            console.warn('Scheduled notifications skipped:', e);
          }
        });
      })
      .catch((err) => {
        console.error('Failed to initialize SQLite Database:', err);
        setInitError(err?.message || 'حدث خطأ أثناء تحميل قاعدة البيانات');
        setRecoveryRequired(err?.code === 'DATABASE_RECOVERY_REQUIRED');
      });
  };

  const createFreshDatabase = async () => {
    const confirmed = window.confirm(
      'سيتم أرشفة ملف قاعدة البيانات الحالي وبدء قاعدة جديدة فارغة. لن تُحذف النسخة السابقة. هل تريد المتابعة؟'
    );
    if (!confirmed) return;
    setRecoveryBusy(true);
    try {
      await DatabaseManager.getInstance().createFreshAfterRecovery();
      initDb();
    } catch (error) {
      setInitError(error instanceof Error ? error.message : String(error));
    } finally {
      setRecoveryBusy(false);
    }
  };

  useEffect(() => {
    initDb();
    return () => {
      if (backupTimer.current) clearInterval(backupTimer.current);
    };
  }, []);

  // Ensure the latest snapshot reaches disk before the window closes.
  useEffect(() => {
    // 1. Electron-controlled graceful shutdown: ensures pending disk writes finish before destroying the window
    if (typeof window !== 'undefined' && window.ceramisys?.app?.onBeforeClose) {
      const unsubscribe = window.ceramisys.app.onBeforeClose(async () => {
        try {
          await DatabaseManager.getInstance().flush();
        } catch (err) {
          console.error('Failed to flush database on app close:', err);
        } finally {
          window.ceramisys?.app?.notifyCloseReady?.();
        }
      });
      return unsubscribe;
    }

    // 2. Browser fallback for web/tab close
    const onBeforeUnload = () => {
      try {
        void DatabaseManager.getInstance().flush();
      } catch (err) {
        console.error('Error during database flush attempt:', err);
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // ── Idle session timeout (configured in Admin → Settings → Security) ────────
  useEffect(() => {
    if (!currentUser) return;
    let lastActivity = Date.now();
    const bump = () => { lastActivity = Date.now(); };
    const events: Array<keyof WindowEventMap> = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
    events.forEach((event) => window.addEventListener(event, bump, { passive: true }));

    const timer = window.setInterval(() => {
      let limitMinutes = 480;
      try {
        limitMinutes = SettingsService.getSettings().sessionTimeoutMinutes ?? 480;
      } catch {
        // keep the safe default
      }
      if (!limitMinutes || limitMinutes <= 0) return;
      if (Date.now() - lastActivity >= limitMinutes * 60_000) {
        AuthService.logout();
        setCurrentUser(null);
      }
    }, 30_000);

    return () => {
      events.forEach((event) => window.removeEventListener(event, bump));
      window.clearInterval(timer);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!dbReady || !currentUser) return;
    let isChecking = false;
    const checkScheduledShiftClosures = () => {
      if (isChecking) return;
      isChecking = true;
      void import('./services/CashierService')
        .then(({ CashierService }) => {
          const closedShifts = new CashierService().closeScheduledShifts();
          if (closedShifts.length > 0) {
            window.dispatchEvent(new CustomEvent('cash-shift-auto-closed', { detail: closedShifts }));
          }
        })
        .catch((error) => console.error('Scheduled cashier shift closure failed:', error))
        .finally(() => { isChecking = false; });
    };
    checkScheduledShiftClosures();
    const timer = window.setInterval(checkScheduledShiftClosures, 30_000);
    return () => window.clearInterval(timer);
  }, [dbReady, currentUser?.id]);

  // ── Session heartbeat + periodic business alerts ─────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const heartbeat = window.setInterval(() => AuthService.touchSession(), 5 * 60_000);
    const alerts = window.setInterval(() => {
      void import('./services/NotificationService').then(({ NotificationService }) => {
        try { new NotificationService().runScheduledChecks(); } catch { /* ignore */ }
      });
    }, 30 * 60_000);
    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(alerts);
    };
  }, [currentUser?.id]);

  // ── Loading / Error Screen ──────────────────────────────────────────────────
  if (!dbReady) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-100 text-slate-900 select-none px-4">
        {/* Logo */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-sky-500/30 text-3xl font-black">
            C
          </div>
          {!initError && (
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 animate-ping opacity-20" />
          )}
        </div>

        <h1 className="text-xl font-black tracking-wide text-slate-900 mb-1">CeramiSys ERP</h1>
        <p className="text-sm text-slate-600 mb-4">نظام إدارة معارض السيراميك ومواد التشطيب</p>

        {initError ? (
          <div className="flex flex-col items-center gap-3">
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-5 py-3 rounded-xl text-center max-w-sm">
              {initError}
            </div>
            <button
              onClick={initDb}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold shadow-lg transition-all active:scale-95"
            >
              إعادة المحاولة
            </button>
            {recoveryRequired && window.ceramisys?.db?.createFreshAfterRecovery && (
              <button
                onClick={() => void createFreshDatabase()}
                disabled={recoveryBusy}
                className="px-6 py-2.5 bg-rose-700 hover:bg-rose-600 text-white rounded-xl text-sm font-bold shadow-lg transition-all disabled:opacity-50"
              >
                {recoveryBusy ? 'جارٍ أرشفة القاعدة...' : 'أرشفة القاعدة وبدء قاعدة جديدة'}
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-sky-600 font-medium animate-pulse">
            جاري تهيئة قاعدة بيانات SQLite...
          </p>
        )}
      </div>
    );
  }

  // ── Login gate ──────────────────────────────────────────────────────────────
  if (!currentUser) {
    return <LoginPage onSuccess={setCurrentUser} />;
  }

  const handleLogout = () => {
    AuthService.logout();
    setCurrentUser(null);
  };

  // ── Main App with Router ────────────────────────────────────────────────────
  // HashRouter works under Electron's file:// protocol and, unlike MemoryRouter,
  // survives reloads and supports deep links (e.g. #/products/123).
  // The "/" index route redirects to /dashboard.
  return (
    <ThemeProvider>
      <ToastProvider>
        <ErrorBoundary>
          {currentUser?.mustChangePassword && (
            <ForcePasswordChangeModal
              user={currentUser}
              onSuccess={(updated) => setCurrentUser(updated)}
            />
          )}
          {showSetup ? (
            <SetupWizard onComplete={() => setShowSetup(false)} />
          ) : (
            <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AppRouterWithProps
                currentUser={currentUser}
                onLogout={handleLogout}
              />
            </HashRouter>
          )}
        </ErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
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
 <p className="text-xs text-slate-500 font-medium">جاري التحميل...</p>
 </div>
 </div>
);

// Lazy pages
const DashboardView = lazy(() => import('./components/DashboardView').then(m => ({ default: m.DashboardView })));
const DataImportPage = lazy(() => import('./pages/settings/DataImportPage').then(m => ({ default: m.DataImportPage })));
const DynamicDataPage = lazy(() => import('./pages/settings/DynamicDataPage').then(m => ({ default: m.DynamicDataPage })));
const ExecutiveDashboard     = lazy(() => import('./pages/dashboard/ExecutiveDashboard').then(m => ({ default: m.ExecutiveDashboard })));
const PosView                = lazy(() => import('./components/PosView').then(m => ({ default: m.PosView })));
const SalesView              = lazy(() => import('./components/SalesView').then(m => ({ default: m.SalesView })));
const TodaySalesPage         = lazy(() => import('./pages/daily/DailyPage').then(m => ({ default: m.TodaySalesPage })));
const TodayPurchasesPage     = lazy(() => import('./pages/daily/DailyPage').then(m => ({ default: m.TodayPurchasesPage })));
const TodayExpensesPage      = lazy(() => import('./pages/daily/DailyPage').then(m => ({ default: m.TodayExpensesPage })));
const TodayDebtsPage         = lazy(() => import('./pages/daily/DailyPage').then(m => ({ default: m.TodayDebtsPage })));
const QuotationsPage         = lazy(() => import('./pages/sales/QuotationsPage').then(m => ({ default: m.QuotationsPage })));
const OrdersPage             = lazy(() => import('./pages/sales/OrdersPage').then(m => ({ default: m.OrdersPage })));
const ReturnsPage            = lazy(() => import('./pages/sales/ReturnsPage').then(m => ({ default: m.ReturnsPage })));
const SalesAnalyticsPage     = lazy(() => import('./pages/sales/SalesAnalyticsPage').then(m => ({ default: m.SalesAnalyticsPage })));
const InvoiceCyclePage        = lazy(() => import('./pages/sales/InvoiceCyclePage').then(m => ({ default: m.InvoiceCyclePage })));
const CustomerStatementPage   = lazy(() => import('./pages/sales/CustomerStatementPage').then(m => ({ default: m.CustomerStatementPage })));
const ReservationsDepositPage = lazy(() => import('./pages/sales/ReservationsDepositPage').then(m => ({ default: m.ReservationsDepositPage })));
const AfterSalesPage          = lazy(() => import('./pages/sales/AfterSalesPage').then(m => ({ default: m.AfterSalesPage })));
const ProductsView           = lazy(() => import('./components/ProductsView').then(m => ({ default: m.ProductsView })));
const ProductDetailPage      = lazy(() => import('./pages/products/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })));
const ProductAttributesPage  = lazy(() => import('./pages/products/ProductAttributesPage').then(m => ({ default: m.ProductAttributesPage })));
const BarcodesPrintPage      = lazy(() => import('./pages/products/BarcodesPrintPage').then(m => ({ default: m.BarcodesPrintPage })));
const CategoriesView         = lazy(() => import('./components/CategoriesView').then(m => ({ default: m.CategoriesView })));
const BrandsView             = lazy(() => import('./components/BrandsView').then(m => ({ default: m.BrandsView })));
const PricingPage            = lazy(() => import('./pages/pricing/PricingPage').then(m => ({ default: m.PricingPage })));
const PromotionsPage         = lazy(() => import('./pages/pricing/PromotionsPage').then(m => ({ default: m.PromotionsPage })));
const InventoryView          = lazy(() => import('./components/InventoryView').then(m => ({ default: m.InventoryView })));
const LocationStockPage      = lazy(() => import('./pages/inventory/LocationStockPage').then(m => ({ default: m.LocationStockPage })));
const StockLedgerPage        = lazy(() => import('./pages/inventory/StockLedgerPage').then(m => ({ default: m.StockLedgerPage })));
const StockTransfersView     = lazy(() => import('./components/StockTransfersView').then(m => ({ default: m.StockTransfersView })));
const InventoryCountPage     = lazy(() => import('./pages/inventory/InventoryCountPage').then(m => ({ default: m.InventoryCountPage })));
const InventoryValuationPage = lazy(() => import('./pages/inventory/InventoryValuationPage').then(m => ({ default: m.InventoryValuationPage })));
const InventoryAdjustmentsPage = lazy(() => import('./pages/inventory/InventoryAdjustmentsPage').then(m => ({ default: m.InventoryAdjustmentsPage })));
const ReservationsPage       = lazy(() => import('./pages/inventory/ReservationsPage').then(m => ({ default: m.ReservationsPage })));
const ReorderPlanningPage    = lazy(() => import('./pages/inventory/ReorderPlanningPage').then(m => ({ default: m.ReorderPlanningPage })));
const WarehouseLocationsPage = lazy(() => import('./pages/inventory/WarehouseLocationsPage').then(m => ({ default: m.WarehouseLocationsPage })));
const DamageQuarantinePage   = lazy(() => import('./pages/inventory/DamageQuarantinePage').then(m => ({ default: m.DamageQuarantinePage })));
const InventoryReconciliationPage = lazy(() => import('./pages/inventory/InventoryReconciliationPage').then(m => ({ default: m.InventoryReconciliationPage })));
const BranchesPage           = lazy(() => import('./pages/operations/BranchesPage').then(m => ({ default: m.BranchesPage })));
const WarehousesPage         = lazy(() => import('./pages/operations/WarehousesPage').then(m => ({ default: m.WarehousesPage })));
const CustomersView          = lazy(() => import('./components/CustomersView').then(m => ({ default: m.CustomersView })));
const CustomerDetailPage     = lazy(() => import('./pages/customers/CustomerDetailPage').then(m => ({ default: m.CustomerDetailPage })));
const LeadsPage              = lazy(() => import('./pages/crm/LeadsPage').then(m => ({ default: m.LeadsPage })));
const PipelinePage           = lazy(() => import('./pages/crm/PipelinePage').then(m => ({ default: m.PipelinePage })));
const CrmActivitiesPage      = lazy(() => import('./pages/crm/CrmActivitiesPage').then(m => ({ default: m.CrmActivitiesPage })));
const CrmDashboardPage       = lazy(() => import('./pages/crm/CrmDashboardPage').then(m => ({ default: m.CrmDashboardPage })));
const SuppliersView          = lazy(() => import('./components/SuppliersView').then(m => ({ default: m.SuppliersView })));
const SupplierDetailPage    = lazy(() => import('./pages/purchasing/SupplierDetailPage').then(m => ({ default: m.SupplierDetailPage })));
const PurchasesView          = lazy(() => import('./components/PurchasesView').then(m => ({ default: m.PurchasesView })));
const PurchaseRequestsPage   = lazy(() => import('./pages/purchasing/PurchaseRequestsPage').then(m => ({ default: m.PurchaseRequestsPage })));
const PurchaseOrdersPage     = lazy(() => import('./pages/purchasing/PurchaseOrdersPage').then(m => ({ default: m.PurchaseOrdersPage })));
const IncomingProductsPage   = lazy(() => import('./pages/purchasing/IncomingProductsPage').then(m => ({ default: m.IncomingProductsPage })));
const CustomerImportedProductsPage = lazy(() => import('./pages/customers/CustomerImportedProductsPage').then(m => ({ default: m.CustomerImportedProductsPage })));
const ReadyDeliveriesPage    = lazy(() => import('./pages/customers/ReadyDeliveriesPage').then(m => ({ default: m.ReadyDeliveriesPage })));
const PurchaseReturnsPage    = lazy(() => import('./pages/purchasing/PurchaseReturnsPage').then(m => ({ default: m.PurchaseReturnsPage })));
const SupplierQuotationsPage = lazy(() => import('./pages/purchasing/SupplierQuotationsPage').then(m => ({ default: m.SupplierQuotationsPage })));
const GoodsReceiptsPage      = lazy(() => import('./pages/purchasing/GoodsReceiptsPage').then(m => ({ default: m.GoodsReceiptsPage })));
const SupplierClaimsPage     = lazy(() => import('./pages/purchasing/SupplierClaimsPage').then(m => ({ default: m.SupplierClaimsPage })));
const SupplierStatementPage  = lazy(() => import('./pages/purchasing/SupplierStatementPage').then(m => ({ default: m.SupplierStatementPage })));
const CashierView            = lazy(() => import('./components/CashierView').then(m => ({ default: m.CashierView })));
const FinanceOverviewPage    = lazy(() => import('./pages/finance/FinanceOverviewPage').then(m => ({ default: m.FinanceOverviewPage })));
const DebtsDashboardPage     = lazy(() => import('./pages/finance/DebtsDashboardPage').then(m => ({ default: m.DebtsDashboardPage })));
const OtherReceivablesPage    = lazy(() => import('./pages/finance/OtherReceivablesPage').then(m => ({ default: m.OtherReceivablesPage })));
const InstallmentsPage       = lazy(() => import('./pages/finance/InstallmentsPage').then(m => ({ default: m.InstallmentsPage })));
const ExpensesPage           = lazy(() => import('./pages/finance/ExpensesPage').then(m => ({ default: m.ExpensesPage })));
const ChartOfAccountsPage    = lazy(() => import('./pages/finance/ChartOfAccountsPage').then(m => ({ default: m.ChartOfAccountsPage })));
const JournalEntriesPage     = lazy(() => import('./pages/finance/JournalEntriesPage').then(m => ({ default: m.JournalEntriesPage })));
const ChequesPage            = lazy(() => import('./pages/finance/ChequesPage').then(m => ({ default: m.ChequesPage })));
const FiscalClosingPage       = lazy(() => import('./pages/finance/FiscalClosingPage').then(m => ({ default: m.FiscalClosingPage })));
const BankReconciliationPage  = lazy(() => import('./pages/finance/BankReconciliationPage').then(m => ({ default: m.BankReconciliationPage })));
const BudgetsCostCentersPage  = lazy(() => import('./pages/finance/BudgetsCostCentersPage').then(m => ({ default: m.BudgetsCostCentersPage })));
const CashFlowForecastPage    = lazy(() => import('./pages/finance/CashFlowForecastPage').then(m => ({ default: m.CashFlowForecastPage })));
const EPaymentSettlementPage  = lazy(() => import('./pages/finance/EPaymentSettlementPage').then(m => ({ default: m.EPaymentSettlementPage })));
const FixedAssetsPage        = lazy(() => import('./pages/finance/FixedAssetsPage').then(m => ({ default: m.FixedAssetsPage })));
const TaxReportPage          = lazy(() => import('./pages/reports/TaxReportPage').then(m => ({ default: m.TaxReportPage })));
const ProfitLossPage         = lazy(() => import('./pages/reports/ProfitLossPage').then(m => ({ default: m.ProfitLossPage })));
const FinancialStatementsPage = lazy(() => import('./pages/reports/FinancialStatementsPage').then(m => ({ default: m.FinancialStatementsPage })));
const SalesReportsPage       = lazy(() => import('./pages/reports/SalesReportsPage').then(m => ({ default: m.SalesReportsPage })));
const PurchaseInventoryReportPage = lazy(() => import('./pages/reports/PurchaseInventoryReportPage').then(m => ({ default: m.PurchaseInventoryReportPage })));
const AttendancePage         = lazy(() => import('./pages/operations/AttendancePage').then(m => ({ default: m.AttendancePage })));
const PayrollPage            = lazy(() => import('./pages/operations/PayrollPage').then(m => ({ default: m.PayrollPage })));
const CommissionsPage        = lazy(() => import('./pages/hr/CommissionsPage').then(m => ({ default: m.CommissionsPage })));
const HrDashboardPage        = lazy(() => import('./pages/hr/HrDashboardPage').then(m => ({ default: m.HrDashboardPage })));
const CampaignsPage          = lazy(() => import('./pages/crm/CampaignsPage').then(m => ({ default: m.CampaignsPage })));
const ProjectsPage           = lazy(() => import('./pages/projects/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const ProjectDetailPage      = lazy(() => import('./pages/projects/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));
const DeliveriesPage         = lazy(() => import('./pages/operations/DeliveriesPage').then(m => ({ default: m.DeliveriesPage })));
const DriversPage            = lazy(() => import('./pages/operations/DriversPage').then(m => ({ default: m.DriversPage })));
const VehiclesPage           = lazy(() => import('./pages/operations/VehiclesPage').then(m => ({ default: m.VehiclesPage })));
const FleetDashboardPage     = lazy(() => import('./pages/operations/FleetDashboardPage').then(m => ({ default: m.FleetDashboardPage })));
const EmployeesPage          = lazy(() => import('./pages/operations/EmployeesPage').then(m => ({ default: m.EmployeesPage })));
const ReportsView            = lazy(() => import('./components/ReportsView').then(m => ({ default: m.ReportsView })));
const ApprovalsPage          = lazy(() => import('./pages/approvals/ApprovalsPage').then(m => ({ default: m.ApprovalsPage })));
const NotificationsView      = lazy(() => import('./components/NotificationsView').then(m => ({ default: m.NotificationsView })));
const AuditLogView           = lazy(() => import('./components/AuditLogView').then(m => ({ default: m.AuditLogView })));
const SettingsView           = lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));
const UsersView              = lazy(() => import('./components/UsersView').then(m => ({ default: m.UsersView })));
const BackupPage             = lazy(() => import('./pages/settings/BackupPage').then(m => ({ default: m.BackupPage })));
const SystemHealthPage       = lazy(() => import('./pages/settings/SystemHealthPage').then(m => ({ default: m.SystemHealthPage })));
const AdminPage              = lazy(() => import('./pages/admin/AdminPage').then(m => ({ default: m.AdminPage })));
const SecurityCenterPage     = lazy(() => import('./pages/admin/SecurityCenterPage').then(m => ({ default: m.SecurityCenterPage })));
const DataDeletionPage       = lazy(() => import('./pages/admin/DataDeletionPage').then(m => ({ default: m.DataDeletionPage })));
const NotFoundPage           = lazy(() => import('./pages/common/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

const AppRouterWithProps: React.FC<{
  currentUser: User;
  onLogout: () => void;
}> = ({ currentUser, onLogout }) => (
  <Routes>
    <Route
      path="/"
      element={
        <MainLayout
          currentUser={currentUser}
          onLogout={onLogout}
        />
      }
    >
      <Route index element={<Navigate to="/dashboard" replace />} />

      {/* Dashboard */}
      <Route path="dashboard" element={<S><DashboardView /></S>} />
      <Route path="dashboard/executive" element={<Navigate to="/dashboard" replace />} />

      {/* Sales / POS */}
      <Route path="sales/analytics" element={<S><SalesAnalyticsPage /></S>} />
      <Route path="sales/cycle" element={<S><InvoiceCyclePage /></S>} />
      <Route path="sales/statement" element={<S><CustomerStatementPage /></S>} />
      <Route path="sales/reservations" element={<S><ReservationsDepositPage /></S>} />
      <Route path="sales/after-sales" element={<S><AfterSalesPage /></S>} />
      <Route path="pos" element={<S><PosView /></S>} />
            <Route path="sales" element={<S><SalesView /></S>} />
            <Route path="daily/sales" element={<S><TodaySalesPage /></S>} />
            <Route path="daily/purchases" element={<S><TodayPurchasesPage /></S>} />
            <Route path="daily/expenses" element={<S><TodayExpensesPage /></S>} />
            <Route path="daily/debts" element={<S><TodayDebtsPage /></S>} />
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
      <Route path="inventory/warehouse-stock" element={<S><LocationStockPage mode="warehouse" /></S>} />
      <Route path="inventory/showroom-stock" element={<S><LocationStockPage mode="showroom" /></S>} />
      <Route path="inventory/ledger" element={<S><StockLedgerPage /></S>} />
      <Route path="inventory/transfers" element={<S><StockTransfersView /></S>} />
      <Route path="inventory/counts" element={<S><InventoryCountPage /></S>} />
      <Route path="inventory/valuation" element={<S><InventoryValuationPage /></S>} />
          <Route path="inventory/adjustments" element={<S><InventoryAdjustmentsPage /></S>} />
          <Route path="inventory/reservations" element={<S><ReservationsPage /></S>} />
          <Route path="inventory/reorder-planning" element={<S><ReorderPlanningPage /></S>} />
          <Route path="inventory/locations" element={<S><WarehouseLocationsPage /></S>} />
          <Route path="inventory/damage-quarantine" element={<S><DamageQuarantinePage /></S>} />
          <Route path="inventory/reconciliation" element={<S><InventoryReconciliationPage /></S>} />

      {/* Branches / Warehouses */}
      <Route path="branches" element={<S><BranchesPage /></S>} />
      <Route path="warehouses" element={<S><WarehousesPage /></S>} />

      {/* CRM */}
      <Route path="customers" element={<S><CustomersView /></S>} />
      <Route path="customers/imported-products" element={<S><CustomerImportedProductsPage /></S>} />
      <Route path="customers/ready-deliveries" element={<S><ReadyDeliveriesPage /></S>} />
      <Route path="customers/:id/imported-products" element={<S><CustomerImportedProductsPage /></S>} />
      <Route path="customers/:id" element={<S><CustomerDetailPage /></S>} />
      <Route path="crm" element={<Navigate to="/dashboard" replace />} />
      <Route path="crm/dashboard" element={<S><CrmDashboardPage /></S>} />
      <Route path="crm/leads" element={<S><LeadsPage /></S>} />
      <Route path="crm/pipeline" element={<S><PipelinePage /></S>} />
      <Route path="crm/activities" element={<S><CrmActivitiesPage /></S>} />
      <Route path="crm/campaigns" element={<S><CampaignsPage /></S>} />

      {/* Purchasing */}
      <Route path="suppliers" element={<S><SuppliersView /></S>} />
      <Route path="suppliers/:id" element={<S><SupplierDetailPage /></S>} />
      <Route path="purchases" element={<S><PurchasesView /></S>} />
      <Route path="purchases/requests" element={<S><PurchaseRequestsPage /></S>} />
      <Route path="purchases/quotations" element={<S><SupplierQuotationsPage /></S>} />
      <Route path="purchases/orders" element={<S><PurchaseOrdersPage /></S>} />
      <Route path="purchases/receipts" element={<S><GoodsReceiptsPage /></S>} />
      <Route path="purchases/incoming" element={<S><IncomingProductsPage /></S>} />
      <Route path="purchases/returns" element={<S><PurchaseReturnsPage /></S>} />
      <Route path="purchases/claims" element={<S><SupplierClaimsPage /></S>} />
      <Route path="purchases/statement" element={<S><SupplierStatementPage /></S>} />

      {/* Finance */}
      <Route path="cashboxes" element={<S><CashierView /></S>} />
      <Route path="finance" element={<S><FinanceOverviewPage /></S>} />
      <Route path="finance/debts" element={<Navigate to="/dashboard" replace />} />
      <Route path="finance/other-receivables" element={<S><OtherReceivablesPage /></S>} />
      <Route path="finance/installments" element={<S><InstallmentsPage /></S>} />
      <Route path="finance/expenses" element={<S><ExpensesPage /></S>} />
      <Route path="finance/accounts" element={<S><ChartOfAccountsPage /></S>} />
      <Route path="finance/journal" element={<S><JournalEntriesPage /></S>} />
      <Route path="finance/cheques" element={<S><ChequesPage /></S>} />
      <Route path="finance/fiscal-closing" element={<S><FiscalClosingPage /></S>} />
      <Route path="finance/bank-reconciliation" element={<S><BankReconciliationPage /></S>} />
      <Route path="finance/budgets-cost-centers" element={<S><BudgetsCostCentersPage /></S>} />
      <Route path="finance/cash-forecast" element={<S><CashFlowForecastPage /></S>} />
      <Route path="finance/epayment-settlements" element={<S><EPaymentSettlementPage /></S>} />
      <Route path="finance/assets" element={<S><FixedAssetsPage /></S>} />

      {/* Projects */}
      <Route path="projects" element={<S><ProjectsPage /></S>} />
      <Route path="projects/:id" element={<S><ProjectDetailPage /></S>} />

      {/* Operations */}
      <Route path="fleet/dashboard" element={<S><FleetDashboardPage /></S>} />
      <Route path="deliveries" element={<S><DeliveriesPage /></S>} />
      <Route path="drivers" element={<S><DriversPage /></S>} />
      <Route path="vehicles" element={<S><VehiclesPage /></S>} />
      <Route path="employees" element={<S><EmployeesPage /></S>} />
      <Route path="employees/attendance" element={<S><AttendancePage /></S>} />
      <Route path="employees/payroll" element={<S><PayrollPage /></S>} />
      <Route path="employees/commissions" element={<S><CommissionsPage /></S>} />
      <Route path="hr/dashboard" element={<S><HrDashboardPage /></S>} />

      {/* Reports */}
      <Route path="reports" element={<S><ReportsView /></S>} />
      <Route path="reports/tax" element={<S><TaxReportPage /></S>} />
      <Route path="reports/profit-loss" element={<S><ProfitLossPage /></S>} />
      <Route path="reports/statements" element={<S><FinancialStatementsPage /></S>} />
      <Route path="reports/sales" element={<S><SalesReportsPage /></S>} />
      <Route path="reports/purchases" element={<S><PurchaseInventoryReportPage /></S>} />

      {/* Approvals */}
      <Route path="approvals" element={<S><ApprovalsPage /></S>} />

      {/* Notifications & Audit */}
      <Route path="notifications" element={<S><NotificationsView /></S>} />
          <Route path="audit" element={<S><AuditLogView /></S>} />
          <Route path="security" element={<S><SecurityCenterPage /></S>} />

      {/* Admin Control Center */}
      <Route path="admin" element={<S><AdminPage /></S>} />
      <Route path="admin/data-deletion" element={<S><DataDeletionPage /></S>} />

      {/* Settings */}
      <Route path="data-import/types" element={<S><DynamicDataPage /></S>} />
      <Route path="data-import" element={<S><DataImportPage /></S>} />
      <Route path="settings" element={<S><SettingsView /></S>} />
      <Route path="users" element={<S><UsersView /></S>} />
      <Route path="backup" element={<S><BackupPage /></S>} />
      <Route path="system-health" element={<S><SystemHealthPage /></S>} />

      {/* Fallback */}
      <Route path="*" element={<S><NotFoundPage /></S>} />
    </Route>
  </Routes>
);

export default App;
