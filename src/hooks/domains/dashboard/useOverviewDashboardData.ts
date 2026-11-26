import { useCallback, useEffect, useState, useTransition } from 'react';
import { dashboardMetricsService, type OverviewDashboardData as ServiceOverviewData, type TodayOperationsSummary } from '../../../services/domains/dashboard/DashboardMetricsService';
import type { DashboardMetrics, MonthlyComparison } from '../../../services/domains/finance/AccountingService';
import type {
  CategoryDistributionItem, PaymentDistributionItem, PurchaseHourlyBucket,
  PurchasePaymentMixItem, PurchaseTopItem, PurchaseTopSupplier, RecentActivityItem, SalesTrendPoint,
  TopCustomerItem, TopSellingProduct,
} from '../../../types/dashboard/components';

/** مجاميع مشتريات اليوم كما يحسبها DashboardMetricsService — لا يُعاد حسابها في الواجهة. */
type PurchaseAggregates = Pick<
  ServiceOverviewData,
  'purchaseHourly' | 'purchasePeakHour' | 'purchasePaymentMix' | 'purchaseTopSuppliers' | 'purchaseTopItems' | 'purchaseQuantitiesByUnit'
>;

export interface OverviewDashboardData {
  metrics: DashboardMetrics | null;
  chartData: SalesTrendPoint[];
  topProducts: TopSellingProduct[];
  loading: boolean;
  refreshing: boolean;
  dashboardError: string | null;
  monthlyComparison: MonthlyComparison | null;
  topCustomers: TopCustomerItem[];
  categorySales: CategoryDistributionItem[];
  paymentDistribution: PaymentDistributionItem[];
  recentActivities: RecentActivityItem[];
  todayPurchases: ServiceOverviewData['todayPurchases'] | null;
  purchasesLoading: boolean;
  purchasesError: string | null;
  loadData: () => void;
  purchaseHourly: PurchaseHourlyBucket[];
  purchasePeakHour: number;
  purchasePaymentMix: PurchasePaymentMixItem[];
  purchaseTopSuppliers: PurchaseTopSupplier[];
  purchaseTopItems: PurchaseTopItem[];
  purchaseQuantitiesByUnit: [string, number][];
  todayOps: TodayOperationsSummary | null;
}

export const useOverviewDashboardData = (): OverviewDashboardData => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [chartData, setChartData] = useState<SalesTrendPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopSellingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [monthlyComparison, setMonthlyComparison] = useState<MonthlyComparison | null>(null);
  const [topCustomers, setTopCustomers] = useState<TopCustomerItem[]>([]);
  const [categorySales, setCategorySales] = useState<CategoryDistributionItem[]>([]);
  const [paymentDistribution, setPaymentDistribution] = useState<PaymentDistributionItem[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivityItem[]>([]);
  const [todayPurchases, setTodayPurchases] = useState<ServiceOverviewData['todayPurchases'] | null>(null);
  const [purchasesLoading, setPurchasesLoading] = useState(true);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);
  const [todayOps, setTodayOps] = useState<TodayOperationsSummary | null>(null);
  const [purchaseAgg, setPurchaseAgg] = useState<PurchaseAggregates | null>(null);

  const loadData = useCallback(async () => {
    const dashboardStartedAt = performance.now();
    // Allow spinner to render first
    await new Promise(resolve => setTimeout(resolve, 0));
    
    startTransition(() => {
      setRefreshing(true);
      setPurchasesLoading(true);
    });
    
    try {
      const data = await dashboardMetricsService.getOverviewDashboardData();
      
      // Check for partial errors
      const errors = dashboardMetricsService.getErrors();
      if (errors.length > 0) {
        const errorMessages = errors.map(e => `${e.section}: ${e.message}`).join('; ');
        startTransition(() => {
          setDashboardError(`تحميل جزئي: ${errorMessages}`);
        });
      } else {
        startTransition(() => {
          setDashboardError(null);
        });
      }

      startTransition(() => {
        setMetrics(data.metrics);
        setChartData(data.chartData);
        setTopProducts(data.topProducts);
        setMonthlyComparison(data.monthlyComparison);
        setTopCustomers(data.topCustomers);
        setCategorySales(data.categorySales);
        setPaymentDistribution(data.paymentDistribution);
        setRecentActivities(data.recentActivities);
        setTodayPurchases(data.todayPurchases);
        setPurchasesError(data.purchasesError);
        setTodayOps(data.todayOps);
        setPurchaseAgg({
          purchaseHourly: data.purchaseHourly,
          purchasePeakHour: data.purchasePeakHour,
          purchasePaymentMix: data.purchasePaymentMix,
          purchaseTopSuppliers: data.purchaseTopSuppliers,
          purchaseTopItems: data.purchaseTopItems,
          purchaseQuantitiesByUnit: data.purchaseQuantitiesByUnit,
        });
      });
    } catch (e) {
      console.error(e);
      startTransition(() => {
        setDashboardError((e as Error)?.message || 'تعذر تحميل بيانات لوحة المعلومات');
      });
    } finally {
      console.info('[performance] Dashboard data ready', JSON.stringify({
        durationMs: Math.round((performance.now() - dashboardStartedAt) * 100) / 100,
      }));
      startTransition(() => {
        setLoading(false);
        setPurchasesLoading(false);
        setRefreshing(false);
      });
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    metrics,
    chartData,
    topProducts,
    loading: loading || isPending,
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
    purchaseHourly: purchaseAgg?.purchaseHourly ?? [],
    purchasePeakHour: purchaseAgg?.purchasePeakHour ?? 0,
    purchasePaymentMix: purchaseAgg?.purchasePaymentMix ?? [],
    purchaseTopSuppliers: purchaseAgg?.purchaseTopSuppliers ?? [],
    purchaseTopItems: purchaseAgg?.purchaseTopItems ?? [],
    purchaseQuantitiesByUnit: purchaseAgg?.purchaseQuantitiesByUnit ?? [],
    todayOps,
  };
};
