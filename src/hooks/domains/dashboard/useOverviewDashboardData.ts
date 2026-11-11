import { useCallback, useEffect, useMemo, useState } from 'react';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AccountingService, type DashboardMetrics, type MonthlyComparison } from '../../../services/domains/finance/AccountingService';
import { DailyOperationsService, type DailyPurchaseResult } from '../../../services/domains/operations/DailyOperationsService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { getProductUnitLabel } from '../../../utils/products/productUnits';
import type {
  CategoryDistributionItem, PaymentDistributionItem, PurchaseHourlyBucket,
  PurchasePaymentMixItem, PurchaseTopItem, PurchaseTopSupplier, RecentActivityItem, SalesTrendPoint,
  TopCustomerItem, TopSellingProduct,
} from '../../../types/dashboard/components';

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
  gradeSales: { grade: string; quantityM2: number; totalRevenue: number }[];
  paymentDistribution: PaymentDistributionItem[];
  recentActivities: RecentActivityItem[];
  todayPurchases: DailyPurchaseResult | null;
  purchasesLoading: boolean;
  purchasesError: string | null;
  loadData: () => void;
  purchaseHourly: PurchaseHourlyBucket[];
  purchasePeakHour: number;
  purchasePaymentMix: PurchasePaymentMixItem[];
  purchaseTopSuppliers: PurchaseTopSupplier[];
  purchaseTopItems: PurchaseTopItem[];
  purchaseQuantitiesByUnit: [string, number][];
}

export const useOverviewDashboardData = (): OverviewDashboardData => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [chartData, setChartData] = useState<SalesTrendPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopSellingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [monthlyComparison, setMonthlyComparison] = useState<MonthlyComparison | null>(null);
  const [topCustomers, setTopCustomers] = useState<TopCustomerItem[]>([]);
  const [categorySales, setCategorySales] = useState<CategoryDistributionItem[]>([]);
  const [gradeSales, setGradeSales] = useState<{ grade: string; quantityM2: number; totalRevenue: number }[]>([]);
  const [paymentDistribution, setPaymentDistribution] = useState<PaymentDistributionItem[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivityItem[]>([]);
  const [todayPurchases, setTodayPurchases] = useState<DailyPurchaseResult | null>(null);
  const [purchasesLoading, setPurchasesLoading] = useState(true);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);

  const accountingService = useMemo(() => new AccountingService(), []);

  const loadData = useCallback(() => {
    const dashboardStartedAt = performance.now();
    setRefreshing(true);
    setPurchasesLoading(true);
    const databaseManager = DatabaseManager.getInstance();
    const accountingStartedAt = performance.now();
    const accountingQueryCountBefore = databaseManager.getQueryStats().totalQueries;
    try {
      const actor = AuthService.requireAuth();
      PermissionService.require(actor, 'sales.view', '/sales');
      PermissionService.require(actor, 'purchases.view', '/purchases');
      PermissionService.require(actor, 'finance.view', '/finance');
      PermissionService.require(actor, 'customers.view', '/customers');
      PermissionService.require(actor, 'inventory.view', '/inventory');
      const data = accountingService.getDashboardMetrics();
      const trend = accountingService.getSalesTrendLast7Days();
      const top = accountingService.getTopSellingProducts(5);
      const monthlyComp = accountingService.getMonthlyComparison();
      const topCust = accountingService.getTopCustomers(5).map((customer) => ({
        name: customer.name,
        totalAmount: customer.totalPurchases,
        invoiceCount: customer.purchaseCount,
      }));
      const categories = new Map<string, number>();
      accountingService.getCategorySalesReport().forEach((category) => {
        categories.set(category.categoryName, (categories.get(category.categoryName) || 0) + category.totalRevenue);
      });
      const catSales = [...categories.entries()].map(([name, value]) => ({ name, value }));
      const gradeDist = accountingService.getSalesByGrade();
      const payDist = accountingService.getPaymentMethodDistribution().map((payment) => ({
        method: payment.method,
        amount: payment.totalAmount,
        count: payment.count,
      }));
      const activities = accountingService.getRecentActivities(6);

      setMetrics(data);
      setChartData(trend);
      setTopProducts(top);
      setMonthlyComparison(monthlyComp);
      setTopCustomers(topCust);
      setCategorySales(catSales);
      setGradeSales(gradeDist);
      setPaymentDistribution(payDist);
      setRecentActivities(activities);
      setDashboardError(null);
    } catch (e) {
      console.error(e);
      setDashboardError((e as Error)?.message || 'تعذر تحميل بيانات لوحة المعلومات');
    } finally {
      console.info('[performance] Dashboard accounting data loaded', JSON.stringify({
        durationMs: Math.round((performance.now() - accountingStartedAt) * 100) / 100,
        queryCount: databaseManager.getQueryStats().totalQueries - accountingQueryCountBefore,
      }));
    }

    const purchasesStartedAt = performance.now();
    const purchasesQueryCountBefore = databaseManager.getQueryStats().totalQueries;
    try {
      if (PermissionService.can(AuthService.getCurrentUser(), 'purchases.view')) {
        setTodayPurchases(new DailyOperationsService().getPurchases());
        setPurchasesError(null);
      } else {
        setTodayPurchases(null);
        setPurchasesError(null);
      }
    } catch (error: any) {
      setTodayPurchases(null);
      setPurchasesError(error?.message || 'تعذر تحميل مؤشرات مشتريات اليوم');
    } finally {
      console.info('[performance] Dashboard purchase data loaded', JSON.stringify({
        durationMs: Math.round((performance.now() - purchasesStartedAt) * 100) / 100,
        queryCount: databaseManager.getQueryStats().totalQueries - purchasesQueryCountBefore,
      }));
      console.info('[performance] Dashboard data ready', JSON.stringify({
        durationMs: Math.round((performance.now() - dashboardStartedAt) * 100) / 100,
      }));
      setLoading(false);
      setPurchasesLoading(false);
      setRefreshing(false);
    }
  }, [accountingService]);

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
      .map(([method, values]) => ({ method, ...values }))
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
    loading,
    refreshing,
    dashboardError,
    monthlyComparison,
    topCustomers,
    categorySales,
    gradeSales,
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
  };
};
