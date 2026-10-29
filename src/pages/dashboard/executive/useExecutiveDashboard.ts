import { useState, useEffect, useCallback } from 'react';
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { AlertTriangle, DollarSign, Package, ShoppingCart, TrendingUp } from 'lucide-react';
import { runExecutiveQueries } from './useExecutiveQueries';
import {
  type DateRange, type DailySale, type DebtCustomer, type KPI,
  type LowStockItem, type RecentInvoice, type TopProduct, formatCurrency,
} from './types';

export function useExecutiveDashboard() {
  const [range, setRange] = useState<DateRange>('month');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [dailySales, setDailySales] = useState<DailySale[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);
  const [debtCustomers, setDebtCustomers] = useState<DebtCustomer[]>([]);
  const [branchData, setBranchData] = useState<{ name: string; value: number }[]>([]);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const getRangeDates = useCallback(() => {
    const now = new Date();
    switch (range) {
      case 'today': return { from: startOfDay(now), to: endOfDay(now) };
      case 'week': return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
      case 'month': return { from: startOfMonth(now), to: endOfMonth(now) };
      case 'year': return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31, 23, 59, 59) };
    }
  }, [range]);

  const loadData = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    try {
      const { from, to } = getRangeDates();
      const res = runExecutiveQueries(format(from, 'yyyy-MM-dd'), format(to, 'yyyy-MM-dd'));
      if (!res) return;

      setKpis([
        {
          label: 'إجمالي المبيعات',
          value: formatCurrency(res.total),
          sub: `${res.invoiceCount} فاتورة`,
          trend: parseFloat(res.salesTrend) >= 0 ? 'up' : 'down',
          trendValue: `${res.salesTrend}% مقارنة بالأمس`,
          icon: ShoppingCart,
          color: 'text-sky-600',
          bg: 'bg-sky-500/10 border-sky-500/20',
        },
        {
          label: 'صافي الربح',
          value: formatCurrency(res.profit),
          sub: `هامش ${res.margin}%`,
          trend: res.profit >= 0 ? 'up' : 'down',
          icon: TrendingUp,
          color: 'text-emerald-600',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
        },
        {
          label: 'المقبوضات',
          value: formatCurrency(res.totalReceived),
          sub: 'نقدي وشبكة',
          trend: 'neutral',
          icon: DollarSign,
          color: 'text-violet-600',
          bg: 'bg-violet-500/10 border-violet-500/20',
        },
        {
          label: 'المشتريات',
          value: formatCurrency(res.totalPurchases),
          sub: 'بضاعة واردة',
          trend: 'neutral',
          icon: Package,
          color: 'text-amber-600',
          bg: 'bg-amber-500/10 border-amber-500/20',
        },
        {
          label: 'الديون المستحقة',
          value: formatCurrency(res.totalDebt),
          sub: 'ذمم العملاء',
          trend: res.totalDebt > 50000 ? 'down' : 'neutral',
          icon: AlertTriangle,
          color: 'text-rose-600',
          bg: 'bg-rose-500/10 border-rose-500/20',
        },
      ]);

      setDailySales(res.dailySalesData);
      setTopProducts(res.topProductsData);
      setRecentInvoices(res.recentInvoicesData);
      setDebtCustomers(res.debtCustomersData);
      setBranchData(res.branchDataList);
      setLowStock(res.lowStockData);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Executive Dashboard error:', e);
      setLoadError(e instanceof Error ? e.message : 'تعذر تحميل بيانات لوحة المؤشرات.');
    } finally {
      setLoading(false);
    }
  }, [getRangeDates]);

  useEffect(() => { loadData(); }, [loadData]);

  return {
    range, setRange, loading, loadError, kpis, dailySales, topProducts,
    recentInvoices, debtCustomers, branchData, lowStock, lastRefresh, refresh: loadData,
  };
}
