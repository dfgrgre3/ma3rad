import React, { useEffect } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { AuthService } from '../../services/domains/auth/AuthService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import { AttentionRequiredSection } from './AttentionRequiredSection';
import { CategoryDistributionCard } from './CategoryDistributionCard';
import { OverviewKpiGrid } from './OverviewKpiGrid';
import { PaymentMethodsCard } from './PaymentMethodsCard';
import { RecentActivitiesFeed } from './RecentActivitiesFeed';
import { SalesTrendCard } from './SalesTrendCard';
import { TodayPurchasesPanel } from './TodayPurchasesPanel';
import { TopCustomersCard } from './TopCustomersCard';
import { TopProductsCard } from './TopProductsCard';
import { ProfileKpiPanel } from './ProfileKpiPanel';
import { QuickActions } from './QuickActions';
import { useOverviewDashboardData } from '../../hooks/domains/dashboard/useOverviewDashboardData';

interface OverviewSectionProps {
  onDataLoaded?: () => void;
}

export const OverviewSection: React.FC<OverviewSectionProps> = ({ onDataLoaded }) => {
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
    purchasesLoading,
    purchasesError,
    loadData,
    purchaseHourly,
    purchasePeakHour,
    purchasePaymentMix,
    purchaseTopSuppliers,
    purchaseTopItems,
    purchaseQuantitiesByUnit,
  } = useOverviewDashboardData();

  useEffect(() => {
    if (!loading && !refreshing) onDataLoaded?.();
  }, [loading, onDataLoaded, refreshing]);

  if (!metrics && loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-950">
          <Activity className="h-4 w-4 text-sky-600 dark:text-sky-400" />
        </div>
        <p className="text-xs font-bold text-slate-600 dark:text-slate-400">جاري استرجاع بيانات لوحة المؤشرات...</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900 dark:bg-rose-950/30" role="alert">
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-rose-500" />
        <p className="text-xs font-bold text-rose-800 dark:text-rose-200">{dashboardError || 'تعذر تحميل مؤشرات النظام'}</p>
        <button
          type="button"
          onClick={loadData}
          className="mt-3 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const profitMarginPercent = metrics.monthSales > 0 ? ((metrics.netProfit / metrics.monthSales) * 100).toFixed(1) : '0';
  const averageTicket = metrics.salesCount > 0 ? metrics.todaySales / metrics.salesCount : 0;

  return (
    <div className="min-w-0 space-y-3 sm:space-y-4">
      {dashboardError && (
        <div role="alert" className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <span className="flex min-w-0 items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
            {dashboardError}
          </span>
          <button type="button" onClick={loadData} className="shrink-0 font-bold underline">إعادة المحاولة</button>
        </div>
      )}

      <AttentionRequiredSection metrics={metrics} />
      <QuickActions />
      <ProfileKpiPanel />

      <OverviewKpiGrid
        metrics={metrics}
        monthlyComparison={monthlyComparison}
        profitMarginPercent={profitMarginPercent}
        averageTicket={averageTicket}
      />

      <TodayPurchasesPanel
        canViewPurchases={PermissionService.can(AuthService.getCurrentUser(), 'ui.purchases.invoices.view')}
        todayPurchases={todayPurchases}
        isLoading={purchasesLoading}
        error={purchasesError}
        onRetry={loadData}
        purchaseHourly={purchaseHourly}
        purchasePeakHour={purchasePeakHour}
        purchasePaymentMix={purchasePaymentMix}
        purchaseTopSuppliers={purchaseTopSuppliers}
        purchaseTopItems={purchaseTopItems}
        purchaseQuantitiesByUnit={purchaseQuantitiesByUnit}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <SalesTrendCard chartData={chartData} />
        <TopProductsCard topProducts={topProducts} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <CategoryDistributionCard categorySales={categorySales} />
        <PaymentMethodsCard paymentDistribution={paymentDistribution} />
        <TopCustomersCard topCustomers={topCustomers} />
      </div>

      <RecentActivitiesFeed recentActivities={recentActivities} />
    </div>
  );
};
