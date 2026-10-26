import React from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { AttentionRequiredSection } from './AttentionRequiredSection';
import { CategoryDistributionCard } from './CategoryDistributionCard';
import { OverviewKpiGrid } from './OverviewKpiGrid';
import { PaymentMethodsCard } from './PaymentMethodsCard';
import { RecentActivitiesFeed } from './RecentActivitiesFeed';
import { SalesTrendCard } from './SalesTrendCard';
import { TodayPurchasesPanel } from './TodayPurchasesPanel';
import { TopCustomersCard } from './TopCustomersCard';
import { TopProductsCard } from './TopProductsCard';
import { useOverviewDashboardData } from './useOverviewDashboardData';

export const OverviewSection: React.FC = () => {
  const {
    metrics,
    chartData,
    topProducts,
    loading,
    dashboardError,
    monthlyComparison,
    topCustomers,
    categorySales,
    paymentDistribution,
    recentActivities,
    todayPurchases,
    loadData,
    purchaseHourly,
    purchasePeakHour,
    purchasePaymentMix,
    purchaseTopSuppliers,
    purchaseTopItems,
    purchaseQuantitiesByUnit,
  } = useOverviewDashboardData();

  if (!metrics && loading) {
    return (
      <div className="py-12 text-center text-slate-500 flex flex-col items-center justify-center">
        <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950 flex items-center justify-center mb-2">
          <Activity className="w-4 h-4 text-sky-600 dark:text-sky-400" />
        </div>
        <p className="text-xs font-bold text-slate-600 dark:text-slate-400">جاري استرجاع بيانات لوحة المؤشرات...</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="p-6 text-center border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 rounded-xl" role="alert">
        <AlertTriangle className="h-6 w-6 text-rose-500 mx-auto mb-2" />
        <p className="text-xs font-bold text-rose-800 dark:text-rose-200">{dashboardError || 'تعذر تحميل مؤشرات النظام'}</p>
        <button
          type="button"
          onClick={loadData}
          className="mt-3 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const profitMarginPercent = metrics.monthSales > 0 ? ((metrics.netProfit / metrics.monthSales) * 100).toFixed(1) : '0';
  const averageTicket = metrics.salesCount > 0 ? metrics.todaySales / metrics.salesCount : 0;

  return (
    <div className="space-y-4">
      {dashboardError && (
        <div role="alert" className="flex items-center justify-between p-2.5 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
            {dashboardError}
          </span>
          <button type="button" onClick={loadData} className="font-bold underline">إعادة المحاولة</button>
        </div>
      )}

      {/* ── Unified Metric Cards Grid (8 Compact KPI Cards) ── */}
      <OverviewKpiGrid
        metrics={metrics}
        monthlyComparison={monthlyComparison}
        profitMarginPercent={profitMarginPercent}
        averageTicket={averageTicket}
      />

      <AttentionRequiredSection metrics={metrics} />

      {/* ── Today's Purchases Compact Panel ── */}
      <TodayPurchasesPanel
        canViewPurchases={PermissionService.can(AuthService.getCurrentUser(), 'purchases.view')}
        todayPurchases={todayPurchases}
        purchaseHourly={purchaseHourly}
        purchasePeakHour={purchasePeakHour}
        purchasePaymentMix={purchasePaymentMix}
        purchaseTopSuppliers={purchaseTopSuppliers}
        purchaseTopItems={purchaseTopItems}
        purchaseQuantitiesByUnit={purchaseQuantitiesByUnit}
      />

      {/* ── Main Charts Row (Sales Trend & Top Selling Products) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Sales Trend Chart (2 cols) */}
        <SalesTrendCard chartData={chartData} />

        {/* Top Ceramic Products (1 col) */}
        <TopProductsCard topProducts={topProducts} />
      </div>

      {/* ── Secondary Analytics (Categories, Payment Methods, Top Customers) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Category Distribution */}
        <CategoryDistributionCard categorySales={categorySales} />

        {/* Payment Methods */}
        <PaymentMethodsCard paymentDistribution={paymentDistribution} />

        {/* Top Customers */}
        <TopCustomersCard topCustomers={topCustomers} />
      </div>

      {/* ── Recent Activities Compact Feed ── */}
      <RecentActivitiesFeed recentActivities={recentActivities} />
    </div>
  );
};
