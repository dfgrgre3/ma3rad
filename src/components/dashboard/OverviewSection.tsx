import React, { useEffect, useRef } from 'react';
import { useDashboardRefresh } from '../../contexts/DashboardRefreshContext';
import { Activity, AlertTriangle, RefreshCw } from 'lucide-react';
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
import { resolveDashboardLayout, type PulseWidgetId } from '../../config/activityDashboardLayout';
import { useDashboardPrefs } from '../../hooks/domains/dashboard/useDashboardPrefs';
import { getEffectiveBusinessType } from '../../services/domains/config/BusinessTypeService';

interface OverviewSectionProps {
  onDataLoaded?: () => void;
}

export const OverviewSection: React.FC<OverviewSectionProps> = ({ onDataLoaded }) => {
  const refreshToken = useDashboardRefresh()?.refreshToken;
  const prefs = useDashboardPrefs();
  const initialRef = useRef(true);
  const {
    metrics,
    chartData,
    topProducts,
    loading,
    refreshing,
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
    todayOps,
  } = useOverviewDashboardData();

  useEffect(() => {
    if (!loading && !refreshing) onDataLoaded?.();
  }, [loading, onDataLoaded, refreshing]);

  useEffect(() => {
    if (refreshToken === undefined) return;
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }
    loadData();
  }, [refreshToken, loadData]);

  if (!metrics && loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft ">
          <Activity className="h-4 w-4 text-primary " />
        </div>
        <p className="text-xs font-bold text-ink-secondary ">جاري استرجاع بيانات لوحة المؤشرات...</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="rounded-xl border border-danger-border bg-danger-soft p-6 text-center dark:bg-danger/30" role="alert">
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-danger" />
        <p className="text-xs font-bold text-danger ">{dashboardError || 'تعذر تحميل مؤشرات النظام'}</p>
        <button
          type="button"
          onClick={loadData}
          className="mt-3 rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-white hover:bg-danger"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  // Use metrics from AccountingService to avoid duplicate calculations
  const profitMarginPercent = metrics.profitMargin?.toFixed(1) ?? '0';
  const averageTicket = metrics.averageOrderValue ?? 0;

  // Widgets visible for the current business activity + the user's saved picks.
  const pulseWidgets = new Set<PulseWidgetId>(
    resolveDashboardLayout(getEffectiveBusinessType(), prefs).pulseWidgets
  );
  const show = (id: PulseWidgetId) => pulseWidgets.has(id);

  return (
    <div className="min-w-0 space-y-3 sm:space-y-4">
      {dashboardError && (
        <div role="alert" className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-danger-border bg-danger-soft p-2.5 text-xs font-semibold text-danger dark:bg-danger/40 ">
          <span className="flex min-w-0 items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
            {dashboardError}
          </span>
          <button type="button" onClick={loadData} className="shrink-0 font-bold underline">إعادة المحاولة</button>
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={loadData}
          disabled={refreshing}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-ink shadow-sm transition hover:bg-surface-muted disabled:opacity-50 dark:hover:bg-primary sm:w-auto sm:py-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'جاري التحديث...' : 'تحديث البيانات'}
        </button>
      </div>
      {show('attention') && <AttentionRequiredSection metrics={metrics} />}
      {show('quickActions') && <QuickActions />}
      {show('profileKpis') && <ProfileKpiPanel />}

      {show('kpiGrid') && (
        <OverviewKpiGrid
          metrics={metrics}
          monthlyComparison={monthlyComparison}
          profitMarginPercent={profitMarginPercent}
          averageTicket={averageTicket}
          todayOps={todayOps}
        />
      )}

      {show('purchases') && (
        <TodayPurchasesPanel
          canViewPurchases={PermissionService.can(AuthService.getCurrentUser(), 'purchases.view')}
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
      )}

      {(show('salesTrend') || show('topProducts')) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {show('salesTrend') && <SalesTrendCard chartData={chartData} />}
          {show('topProducts') && <TopProductsCard topProducts={topProducts} />}
        </div>
      )}

      {(show('categoryDist') || show('paymentMix') || show('topCustomers')) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {show('categoryDist') && <CategoryDistributionCard categorySales={categorySales} />}
          {show('paymentMix') && <PaymentMethodsCard paymentDistribution={paymentDistribution} />}
          {show('topCustomers') && <TopCustomersCard topCustomers={topCustomers} />}
        </div>
      )}

      {show('recentFeed') && <RecentActivitiesFeed recentActivities={recentActivities} />}
    </div>
  );
};
