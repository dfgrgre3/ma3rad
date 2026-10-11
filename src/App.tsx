import React, { useState, useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DatabaseManager } from './database/db';
import { AppRouter } from './router';
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
  // Using MemoryRouter for Electron (no hash/browser history needed)
  return (
    <MemoryRouter initialEntries={['/dashboard']} initialIndex={0}>
      <AppRouterWithProps
        currentUser={currentUser}
        darkMode={darkMode}
        onToggleDark={toggleDarkMode}
      />
    </MemoryRouter>
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
const WarehousesPage         = lazy(() => import('./pages/operations/WarehousesPage').then(m => ({ default: m.Wareh