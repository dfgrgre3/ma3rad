import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { dashboardMetricsService, type OverviewDashboardData as ServiceOverviewData, type TodayOperationsSummary } from '../../../services/domains/dashboard/DashboardMetricsService';
import { AccountingService, type DashboardMetrics, type MonthlyComparison } from '../../../services/domains/finance/AccountingService';
import { getProductUnitLabel } from '../../../utils/products/productUnits';
import type {
  CategoryDistributionItem, PaymentDistributionItem, PurchaseHourlyBucket,
  PurchasePaymentMixItem, PurchaseTopItem, PurchaseTopSupplier, RecentActivityItem, SalesTrendPoint,
  TopCustomerItem, TopSellingProduct,
} from '../../../types/dashboard/components';
import type { DailyPurchaseResult } from '../../../services/domains/operations/DailyOperationsService';

// Translate payment method to Arabic
const translatePaymentMethod = (method: string): string => {
  const translations: Record<string, string> = {
    'CASH': 'نقدي',
    'CARD': 'بطاقة',
    'BANK_TRANSFER': 'تحويل بنكي',
    'CHECK': 'شيك',
    'VOUCHER': 'قسيمة',
  };
  return translations[method] ?? method;
};

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

  const purchaseHourly = useMemo(() => {
    const buckets = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));
    todayPurchases?.rows.forEach((row) => {
      const date = new Date(row.createdAt);
      if (Number.isNaN(date.getTime())) return;
      buckets[date.getHours()].total += Number(row.total) || 0;
      buckets[date.getHours()].count += 1;
    });
    return buckets;
  }, [todayPurchases]);

  const purchasePeakHour = Math.max(...purchaseHourly.map((bucket) => bucket.total), 0);

  const purchasePaymentMix = useMemo(() => {
    const mix = new Map<string, { total: number; count: number }>();
    todayPurchases?.rows.forEach((row) => {
      const key = row.paymentType || 'CASH';
      const entry = mix.get(key) || { total: 0, count: 0 };
      entry.total += Number(row.total) || 0;
      entry.count += 1;
      mix.set(key, entry);
    });
    return [...mix.entries()]
      .map(([method, values]) => ({ method: translatePaymentMethod(method), ...values }))
      .sort((a, b) => b.total - a.total);
  }, [todayPurchases]);

  const purchaseTopSuppliers = useMemo(() => {
    const suppliers = new Map<string, { name: string; total: number; paid: number; count: number }>();
    todayPurchases?.rows.forEach((row) => {
      const key = row.supplierId || row.supplierName || 'unknown';
      const supplier = suppliers.get(key) || { name: row.supplierName || '—', total: 0, paid: 0, count: 0 };
      supplier.total += Number(row.total) || 0;
      supplier.paid += Number(row.paid) || 0;
      supplier.count += 1;
      suppliers.set(key, supplier);
    });
    return [...suppliers.values()].sort((a, b) => b.total - a.total).slice(0, 4);
  }, [todayPurchases]);

  const purchaseTopItems = useMemo(() => {
    const products = new Map<string, { name: string; quantity: number; total: number; invoices: Set<string>; productType?: 'CERAMIC' | 'GENERAL'; baseUnit?: string; customUnit?: string }>();
    todayPurchases?.items.forEach((item) => {
      const key = item.productId || item.productName;
      const product = products.get(key) || { name: item.productName || '—', quantity: 0, total: 0, invoices: new Set<string>(), productType: item.productType, baseUnit: item.baseUnit, customUnit: item.customUnit };
      product.quantity += Number(item.quantityM2) || 0;
      product.total += Number(item.totalCost) || 0;
      product.invoices.add(item.purchaseId);
      products.set(key, product);
    });
    return [...products.values()].sort((a, b) => b.total - a.total).slice(0, 4);
  }, [todayPurchases]);

  const purchaseQuantitiesByUnit = useMemo(() => {
    const quantities = new Map<string, number>();
    todayPurchases?.items.forEach((item) => {
      const unit = getProductUnitLabel(item);
      quantities.set(unit, (quantities.get(unit) || 0) + (Number(item.quantityM2) || 0));
    });
    return [...quantities.entries()];
  }, [todayPurchases]);

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
    purchaseHourly,
    purchasePeakHour,
    purchasePaymentMix,
    purchaseTopSuppliers,
    purchaseTopItems,
    purchaseQuantitiesByUnit,
    todayOps,
  };
};
