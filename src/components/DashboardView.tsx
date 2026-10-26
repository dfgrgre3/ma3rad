import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  TrendingUp, ShoppingCart, DollarSign, Package, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Wallet, Users, Clock, Target,
  BarChart3, Activity, Bell, Award, CreditCard, RefreshCw,
  Filter, Calendar, Eye, CheckCircle, XCircle, PackagePlus,
  ArrowUp, ArrowDown, TrendingDown, Truck, Loader2,
  LayoutDashboard, Banknote, ShoppingBag, Layers, ShieldCheck
} from 'lucide-react';
import { AccountingService, DashboardMetrics } from '../services/AccountingService';
import { CeramicMath } from '../utils/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../utils/productUnits';
import { DailyOperationsService, type DailyPurchaseResult } from '../services/DailyOperationsService';
import { AuthService } from '../services/AuthService';
import { PermissionService } from '../services/PermissionService';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart as PieChartRecharts, Pie, Cell
} from 'recharts';

const CHART_COLORS = ['#0284c7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

type SectionId = 'all' | 'pulse' | 'executive' | 'sales' | 'purchases' | 'debts' | 'crm' | 'fleet' | 'hr';

const SECTIONS_CONFIG: { id: SectionId; label: string; icon: React.ElementType; badge?: string }[] = [
  { id: 'all', label: 'نظرة شاملة', icon: Layers },
  { id: 'pulse', label: 'ملخص اليوم', icon: LayoutDashboard, badge: 'مباشر' },
  { id: 'executive', label: 'الأداء التنفيذي', icon: TrendingUp },
  { id: 'sales', label: 'المبيعات', icon: ShoppingCart },
  { id: 'purchases', label: 'المشتريات والمخزون', icon: ShoppingBag },
  { id: 'debts', label: 'الديون والذمم', icon: Banknote },
  { id: 'crm', label: 'العملاء', icon: Target },
  { id: 'fleet', label: 'التوصيل والأسطول', icon: Truck },
  { id: 'hr', label: 'الموارد البشرية', icon: Award },
];

const OverviewSection: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [chartData, setChartData] = useState<{ date: string; sales: number; profit: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; quantityM2: number; totalRevenue: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [monthlyComparison, setMonthlyComparison] = useState<any>(null);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [categorySales, setCategorySales] = useState<any[]>([]);
  const [gradeSales, setGradeSales] = useState<any[]>([]);
  const [paymentDistribution, setPaymentDistribution] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [todayPurchases, setTodayPurchases] = useState<DailyPurchaseResult | null>(null);
  const [purchasesLoading, setPurchasesLoading] = useState(true);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);

  const accountingService = useMemo(() => new AccountingService(), []);

  const loadData = () => {
    setRefreshing(true);
    setPurchasesLoading(true);
    try {
      const data = accountingService.getDashboardMetrics();
      const trend = accountingService.getSalesTrendLast7Days();
      const top = accountingService.getTopSellingProducts(5);
      const monthlyComp = accountingService.getMonthlyComparison();
      const topCust = accountingService.getTopCustomers(5);
      const catSales = accountingService.getCategorySalesReport();
      const gradeDist = accountingService.getSalesByGrade();
      const payDist = accountingService.getPaymentMethodDistribution();
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
    }

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
      setLoading(false);
      setPurchasesLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const purchasePaymentLabels: Record<string, string> = {
    CASH: 'نقدي',
    BANK_TRANSFER: 'تحويل بنكي',
    CARD: 'بطاقة',
    CREDIT: 'آجل',
    CHEQUE: 'شيك',
    MIXED: 'مختلط',
  };

  const purchasePaymentColors: Record<string, string> = {
    CASH: 'bg-emerald-500',
    BANK_TRANSFER: 'bg-sky-500',
    CARD: 'bg-violet-500',
    CREDIT: 'bg-rose-500',
    CHEQUE: 'bg-indigo-500',
    MIXED: 'bg-slate-500',
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'sale': return <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />;
      case 'purchase': return <PackagePlus className="w-3.5 h-3.5 text-sky-600" />;
      case 'return': return <XCircle className="w-3.5 h-3.5 text-rose-600" />;
      case 'inventory': return <Package className="w-3.5 h-3.5 text-amber-600" />;
      default: return <Activity className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 [&>div:nth-child(n+5)]:hidden">
        {/* 1. Today Sales */}
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">مبيعات اليوم</span>
            <span className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <ShoppingCart className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-base sm:text-lg font-black tabular-nums text-slate-900 dark:text-white">
              {CeramicMath.formatCurrency(metrics.todaySales)}
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              <span className="font-bold text-sky-600 dark:text-sky-400">{metrics.salesCount}</span> فاتورة مبيعات
            </div>
          </div>
        </div>

        {/* 2. Month Sales */}
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">مبيعات الشهر</span>
            <span className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-base sm:text-lg font-black tabular-nums text-slate-900 dark:text-white">
              {CeramicMath.formatCurrency(metrics.monthSales)}
            </div>
            <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
              {monthlyComparison && (
                monthlyComparison.salesGrowth >= 0 ? (
                  <span className="flex items-center gap-0.5 font-bold">
                    <ArrowUp className="w-3 h-3" /> {monthlyComparison.salesGrowth.toFixed(1)}%
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-rose-600 font-bold">
                    <ArrowDown className="w-3 h-3" /> {Math.abs(monthlyComparison.salesGrowth).toFixed(1)}%
                  </span>
                )
              )}
              <span className="text-slate-400 font-normal">نمو شهري</span>
            </div>
          </div>
        </div>

        {/* 3. Net Profit */}
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">الأرباح الصافية</span>
            <span className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-base sm:text-lg font-black tabular-nums text-emerald-600 dark:text-emerald-400">
              {CeramicMath.formatCurrency(metrics.netProfit)}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
              هامش الربح: <span className="text-slate-800 dark:text-slate-200 font-bold">{profitMarginPercent}%</span>
            </div>
          </div>
        </div>

        {/* 4. Average Ticket */}
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">متوسط الفاتورة</span>
            <span className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-base sm:text-lg font-black tabular-nums text-slate-900 dark:text-white">
              {CeramicMath.formatCurrency(averageTicket)}
            </div>
            <div className="text-[11px] font-medium text-slate-400 mt-0.5">
              معدل القيمة اليومي
            </div>
          </div>
        </div>

        {/* 5. Receivables */}
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">ديون العملاء</span>
            <span className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Wallet className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-base sm:text-lg font-black tabular-nums text-amber-600 dark:text-amber-400">
              {CeramicMath.formatCurrency(metrics.totalReceivables)}
            </div>
            <div className="text-[11px] font-medium text-slate-400 mt-0.5">
              مستحقات واجبة التحصيل
            </div>
          </div>
        </div>

        {/* 6. Inventory Valuation */}
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">قيمة المخزون (التكلفة)</span>
            <span className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Package className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-base sm:text-lg font-black tabular-nums text-slate-900 dark:text-white">
              {CeramicMath.formatCurrency(metrics.inventoryValuationCost)}
            </div>
            <div className="text-[11px] font-medium text-slate-400 mt-0.5">
              إجمالي قيمة بضاعة المستودعات
            </div>
          </div>
        </div>

        {/* 7. Low Stock Alerts */}
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">نواقص المخزون</span>
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              metrics.lowStockCount > 0 ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400' : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600'
            }`}>
              <AlertTriangle className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <div className={`text-base sm:text-lg font-black tabular-nums ${
              metrics.lowStockCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
            }`}>
              {metrics.lowStockCount} <span className="text-xs font-bold text-slate-500">صنف</span>
            </div>
            <div className="text-[11px] font-medium text-slate-400 mt-0.5">
              {metrics.lowStockCount > 0 ? 'أصناف بلغت حد إعادة الطلب' : 'المخزون بمستوى آمن'}
            </div>
          </div>
        </div>

        {/* 8. Monthly Invoices */}
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">فواتير الشهر</span>
            <span className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <div className="text-base sm:text-lg font-black tabular-nums text-slate-900 dark:text-white">
              {monthlyComparison ? monthlyComparison.currentMonthInvoices : '—'}
            </div>
            <div className="text-[11px] font-medium text-teal-600 dark:text-teal-400 mt-0.5 flex items-center gap-1">
              {monthlyComparison && (
                monthlyComparison.invoiceGrowth >= 0 ? (
                  <span className="flex items-center gap-0.5 font-bold">
                    <ArrowUp className="w-3 h-3" /> {monthlyComparison.invoiceGrowth.toFixed(1)}%
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-rose-600 font-bold">
                    <ArrowDown className="w-3 h-3" /> {Math.abs(monthlyComparison.invoiceGrowth).toFixed(1)}%
                  </span>
                )
              )}
              <span className="text-slate-400 font-normal">مقارنة بالشهر السابق</span>
            </div>
          </div>
        </div>
      </div>

      {(metrics.lowStockCount > 0 || metrics.outOfStockCount > 0 || metrics.urgentDebtsCount > 0) && (
      <section aria-label="يتطلب انتباهك" className="relative overflow-hidden rounded-xl border border-amber-200 bg-[#fffdf5] p-3.5 dark:border-amber-900/70 dark:bg-amber-950/20">
        <div className="absolute inset-y-0 right-0 w-1 bg-amber-400" />
        <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-slate-800 dark:text-slate-100">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> يتطلب انتباهك
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { label: 'أصناف عند حد إعادة الطلب', value: metrics.lowStockCount, to: '/inventory/reorder-planning', tone: 'text-amber-800 dark:text-amber-300', icon: Package },
            { label: 'أصناف نفد مخزونها', value: metrics.outOfStockCount, to: '/inventory', tone: 'text-rose-700 dark:text-rose-300', icon: AlertTriangle },
            { label: 'ديون متأخرة لأكثر من 30 يوماً', value: metrics.urgentDebtsCount, to: '/finance/debts', tone: 'text-orange-800 dark:text-orange-300', icon: Clock },
          ].filter(({ value }) => value > 0).map(({ label, value, to, tone, icon: Icon }) => (
            <Link key={label} to={to} className="flex items-center gap-2.5 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2.5 transition hover:border-amber-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-amber-800">
              <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-600 dark:text-slate-300">{label}</span>
              <span className={`text-base font-black tabular-nums ${tone}`}>{value}</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-slate-300" />
            </Link>
          ))}
        </div>
      </section>
      )}

      {/* ── Today's Purchases Compact Panel ── */}
      {PermissionService.can(AuthService.getCurrentUser(), 'purchases.view') && todayPurchases && todayPurchases.rows.length > 0 && (
        <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3.5 text-xs font-bold text-slate-700 dark:text-slate-200">
            <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-amber-700 dark:text-amber-300" /> <span>?????? ??????? ?????</span></span>
            <span className="text-[10px] font-semibold text-slate-400">{todayPurchases.summary.count} ?????? ????? ? ??? ????????</span>
          </summary>
          <div className="border-t border-slate-100 p-3.5 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 flex items-center justify-center font-bold">
                <Truck className="w-3.5 h-3.5" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">مشتريات وتوريدات اليوم</h3>
                <p className="text-[10px] text-slate-400">حركة التوريد الفعلي، السداد المالي، والموردين</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {new Date(`${todayPurchases.date}T12:00:00`).toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </div>
          </div>

          {/* 4 Compact Purchase KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">إجمالي التوريد</span>
              <div className="text-sm font-black tabular-nums text-orange-700 dark:text-orange-400 mt-0.5">
                {CeramicMath.formatCurrency(todayPurchases.summary.total)}
              </div>
              <span className="text-[10px] text-slate-400">{todayPurchases.summary.count} فاتورة توريد</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">المسدد اليوم</span>
              <div className="text-sm font-black tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                {CeramicMath.formatCurrency(todayPurchases.summary.paid)}
              </div>
              <span className="text-[10px] text-slate-400">{todayPurchases.summary.paymentsCount} سند صرف</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">المتبقي للموردين</span>
              <div className="text-sm font-black tabular-nums text-rose-600 dark:text-rose-400 mt-0.5">
                {CeramicMath.formatCurrency(todayPurchases.summary.remaining)}
              </div>
              <span className="text-[10px] text-slate-400">{todayPurchases.summary.suppliersCount} مورد مسجل</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">الأصناف المستلمة</span>
              <div className="text-sm font-black tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                {todayPurchases.summary.itemsCount} سطر
              </div>
              <span className="text-[10px] text-slate-400">{purchaseQuantitiesByUnit.map(([unit, quantity]) => `${quantity.toLocaleString('ar-EG')} ${unit}`).join(' · ') || '—'}</span>
            </div>
          </div>

          {/* Sub-grid for Purchases: Left Hourly & Payment, Right Suppliers & Items */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Left: Hourly & Payments */}
            <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">نبض المشتريات بالساعة</span>
                  <span className="text-[10px] text-slate-400">
                    الذروة: {purchasePeakHour > 0 ? CeramicMath.formatCurrency(purchasePeakHour) : '0'}
                  </span>
                </div>
                {todayPurchases.rows.length === 0 ? (
                  <p className="py-4 text-center text-[11px] text-slate-400">لا توجد فواتير توريد مسجلة اليوم</p>
                ) : (
                  <div>
                    <div className="flex h-16 items-end gap-0.5 border-b border-slate-200 dark:border-slate-700" dir="ltr">
                      {purchaseHourly.map((bucket, hour) => (
                        <div
                          key={hour}
                          title={`${String(hour).padStart(2, '0')}:00 · ${CeramicMath.formatCurrency(bucket.total)}`}
                          className={`flex-1 rounded-t-xs ${bucket.total > 0 ? 'bg-orange-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                          style={{ height: bucket.total > 0 ? `${Math.max((bucket.total / purchasePeakHour) * 100, 10)}%` : '2px' }}
                        />
                      ))}
                    </div>
                    <div className="mt-1 flex justify-between text-[9px] text-slate-400" dir="ltr">
                      <span>00:00</span>
                      <span>08:00</span>
                      <span>14:00</span>
                      <span>20:00</span>
                      <span>23:00</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1.5">طرق سداد المشتريات</span>
                <div className="flex flex-wrap gap-2">
                  {purchasePaymentMix.length === 0 ? (
                    <span className="text-[10px] text-slate-400">لا توجد مدفوعات مسجلة</span>
                  ) : (
                    purchasePaymentMix.map((p) => (
                      <span key={p.method} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                        <span className={`w-2 h-2 rounded-full ${purchasePaymentColors[p.method] || 'bg-slate-400'}`} />
                        <span>{purchasePaymentLabels[p.method] || p.method}:</span>
                        <span className="font-bold">{CeramicMath.formatCurrency(p.total)}</span>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right: Top Suppliers & Top Items */}
            <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
              <div>
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1.5">أبرز الموردين اليوم</span>
                {purchaseTopSuppliers.length === 0 ? (
                  <p className="py-2 text-center text-[10px] text-slate-400">لا توجد بيانات موردين</p>
                ) : (
                  <div className="space-y-1">
                    {purchaseTopSuppliers.map((s, idx) => (
                      <div key={idx} className="flex items-center justify-between py-1 px-2 rounded bg-white dark:bg-slate-800 text-[11px]">
                        <span className="truncate font-semibold text-slate-800 dark:text-slate-200">{idx + 1}. {s.name}</span>
                        <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">{CeramicMath.formatCurrency(s.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1.5">أكثر الأصناف توريدًا</span>
                {purchaseTopItems.length === 0 ? (
                  <p className="py-2 text-center text-[10px] text-slate-400">لا توجد أصناف واردة</p>
                ) : (
                  <div className="space-y-1">
                    {purchaseTopItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between py-1 px-2 rounded bg-white dark:bg-slate-800 text-[11px]">
                        <span className="truncate font-semibold text-slate-800 dark:text-slate-200">{idx + 1}. {item.name}</span>
                        <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatProductQuantity(item.quantity, item)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </details>
      )}

      {/* ── Main Charts Row (Sales Trend & Top Selling Products) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Sales Trend Chart (2 cols) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">حركة المبيعات خلال آخر 7 أيام</h3>
              <p className="text-[11px] text-slate-400">الإيراد اليومي بناءً على الفواتير المعتمدة</p>
            </div>
            <span className="text-[11px] font-bold text-sky-600 bg-sky-50 dark:bg-sky-950 px-2 py-0.5 rounded">
              7 أيام
            </span>
          </div>

          <div className="h-52 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradCompact" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '6px', fontSize: '11px', padding: '4px 8px' }}
                  formatter={(val: any) => [CeramicMath.formatCurrency(Number(val)), 'المبيعات']}
                />
                <Area isAnimationActive={false} type="monotone" dataKey="sales" stroke="#0284c7" strokeWidth={2} fillOpacity={1} fill="url(#salesGradCompact)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Ceramic Products (1 col) */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">أكثر الأصناف طلباً</h3>
                <p className="text-[11px] text-slate-400">حسب إجمالي الكمية بوحدة كل صنف</p>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">أعلى 5</span>
            </div>

            <div className="space-y-1.5">
              {topProducts.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">لا توجد مبيعات مسجلة حتى الآن</div>
              ) : (
                topProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-black text-[10px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-slate-100 truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-400">{formatProductQuantity(p.quantityM2, p)}</div>
                      </div>
                    </div>
                    <span className="font-bold tabular-nums text-sky-600 dark:text-sky-400 text-xs shrink-0 mr-2">
                      {CeramicMath.formatCurrency(p.totalRevenue)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Secondary Analytics (Categories, Payment Methods, Top Customers) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Category Distribution */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-0.5">توزيع المبيعات حسب الفئة</h3>
          <p className="text-[11px] text-slate-400 mb-2">الحصة النسبية لكل تصنيف</p>
          <div className="h-44 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChartRecharts>
                <Pie
                  isAnimationActive={false}
                  data={categorySales}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={55}
                  dataKey="value"
                >
                  {categorySales.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '6px', fontSize: '11px', padding: '4px 8px' }}
                  formatter={(val: any) => [CeramicMath.formatCurrency(Number(val)), 'المبيعات']}
                />
              </PieChartRecharts>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-0.5">طرق الدفع</h3>
          <p className="text-[11px] text-slate-400 mb-2">توزيع إيرادات الدفع المستخدمة</p>
          <div className="h-44 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paymentDistribution} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
                <XAxis dataKey="method" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '6px', fontSize: '11px', padding: '4px 8px' }}
                  formatter={(val: any) => [CeramicMath.formatCurrency(Number(val)), 'المبلغ']}
                />
                <Bar isAnimationActive={false} dataKey="amount" fill="#0284c7" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Customers */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-0.5">أفضل العملاء</h3>
          <p className="text-[11px] text-slate-400 mb-2">حسب إجمالي المشتريات التراكمية</p>
          <div className="space-y-1.5">
            {topCustomers.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">لا توجد بيانات عملاء بعد</div>
            ) : (
              topCustomers.map((c, idx) => (
                <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[10px] flex items-center justify-center shrink-0">
                      {c.name?.charAt(0) || 'ع'}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-slate-100 truncate">{c.name}</div>
                      <div className="text-[10px] text-slate-400">{c.invoiceCount || 0} فاتورة</div>
                    </div>
                  </div>
                  <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400 text-xs shrink-0 mr-2">
                    {CeramicMath.formatCurrency(c.totalAmount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Recent Activities Compact Feed ── */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white">الأنشطة الأخيرة بالنظام</h3>
          <span className="text-[10px] text-slate-400">آخر العمليات المعتمدة</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {recentActivities.length === 0 ? (
            <div className="col-span-2 text-center py-4 text-xs text-slate-400">لا توجد عمليات مسجلة حديثاً</div>
          ) : (
            recentActivities.map((activity, idx) => (
              <div key={idx} className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                {getActivityIcon(activity.type)}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{activity.description}</div>
                  <div className="text-[10px] text-slate-400">{activity.timestamp}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// Lazy loaded integrated dashboards
const ExecutiveDashboard = lazy(() => import('../pages/dashboard/ExecutiveDashboard').then(m => ({ default: m.ExecutiveDashboard })));
const SalesAnalyticsPage = lazy(() => import('../pages/sales/SalesAnalyticsPage').then(m => ({ default: m.SalesAnalyticsPage })));
const PurchaseInventoryReportPage = lazy(() => import('../pages/reports/PurchaseInventoryReportPage').then(m => ({ default: m.PurchaseInventoryReportPage })));
const DebtsDashboardPage = lazy(() => import('../pages/finance/DebtsDashboardPage').then(m => ({ default: m.DebtsDashboardPage })));
const CrmDashboardPage = lazy(() => import('../pages/crm/CrmDashboardPage').then(m => ({ default: m.CrmDashboardPage })));
const FleetDashboardPage = lazy(() => import('../pages/operations/FleetDashboardPage').then(m => ({ default: m.FleetDashboardPage })));
const HrDashboardPage = lazy(() => import('../pages/hr/HrDashboardPage').then(m => ({ default: m.HrDashboardPage })));

const DashboardLoader: React.FC = () => (
  <div className="flex h-32 w-full flex-col items-center justify-center gap-2">
    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
      <Loader2 className="w-4 h-4" />
    </div>
    <span className="text-xs font-semibold text-slate-500">جاري تحميل المؤشرات...</span>
  </div>
);

const SectionCard: React.FC<{
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  badge?: string;
  onScrollTop?: () => void;
  children: React.ReactNode;
}> = ({ id, title, subtitle, icon: Icon, iconBg, iconColor, badge, onScrollTop, children }) => {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs p-3.5 sm:p-4 space-y-4"
    >
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center font-bold shrink-0`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">{title}</h2>
              {badge && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
        </div>

        {onScrollTop && (
          <button
            type="button"
            onClick={onScrollTop}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="العودة لأعلى الصفحة"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">للأعلى</span>
          </button>
        )}
      </div>

      <div className="dashboard-embedded-scope [&>div]:!h-auto [&>div]:!overflow-visible [&>main]:!h-auto [&>main]:!overflow-visible [&>div]:!p-0 [&>main]:!p-0 [&>div]:!bg-transparent [&>main]:!bg-transparent [&_header]:!hidden [&_h1]:!hidden [&_.border-b.border-slate-200.px-6.py-4]:!hidden">
        {children}
      </div>
    </section>
  );
};

export const DashboardView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('sec') || searchParams.get('section') || searchParams.get('tab');
  const initialSection = requestedSection?.replace(/^sec-/, '') as SectionId | undefined;
  const [activeTab, setActiveTab] = useState<SectionId>(
    initialSection && SECTIONS_CONFIG.some((section) => section.id === initialSection) ? initialSection : 'pulse'
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    const sec = searchParams.get('sec') || searchParams.get('section') || searchParams.get('tab');
    if (!sec) return;
    const clean = sec.replace(/^sec-/, '') as SectionId;
    if (SECTIONS_CONFIG.some((section) => section.id === clean)) setActiveTab(clean);
  }, [searchParams]);

  const selectSection = (section: SectionId) => {
    setActiveTab(section);
    const next = new URLSearchParams(searchParams);
    if (section === 'pulse') next.delete('sec');
    else next.set('sec', section);
    next.delete('section');
    next.delete('tab');
    setSearchParams(next, { replace: true });
    document.getElementById('dashboard-scroll-root')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const refresh = () => {
    setRefreshKey((key) => key + 1);
    setLastUpdated(new Date());
  };
  const today = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const isOverview = activeTab === 'all';

  return (
    <div id="dashboard-scroll-root" className="h-full overflow-y-auto bg-[#f5f5f2] dark:bg-slate-950" dir="rtl">
      <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6 lg:p-8">
        <header className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-[#fffefa] px-5 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-7 sm:py-6">
          <div className="pointer-events-none absolute -left-10 -top-16 h-52 w-52 rounded-full border-[28px] border-teal-700/[0.045]" />
          <div aria-hidden="true" className="pointer-events-none absolute left-6 top-1/2 hidden h-14 w-14 -translate-y-1/2 grid-cols-2 gap-1 opacity-35 sm:grid">
            <span className="rounded-sm border border-teal-800/40 bg-teal-700/10" /><span className="rounded-sm border border-teal-800/40 bg-amber-700/10" />
            <span className="rounded-sm border border-teal-800/40 bg-amber-700/10" /><span className="rounded-sm border border-teal-800/40 bg-teal-700/10" />
          </div>
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-teal-800 dark:text-teal-300">
                <span className="h-2 w-2 rounded-full bg-teal-600" /> CeramiSys <span className="text-slate-300 dark:text-slate-600">/</span> مساحة العمل
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">مرحباً بك في لوحة المعلومات</h1>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">تابع حركة المعرض وأهم مؤشرات العمل من مكان واحد.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-left dark:border-slate-700 dark:bg-slate-800 sm:block">
                <div className="text-[10px] font-semibold text-slate-400">التاريخ</div>
                <div className="mt-0.5 text-xs font-bold text-slate-700 dark:text-slate-200">{today}</div>
              </div>
              <button type="button" onClick={refresh} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white transition hover:bg-teal-800 focus-visible:outline-teal-600 dark:bg-teal-700 dark:hover:bg-teal-600" aria-label="تحديث بيانات لوحة المعلومات">
                <RefreshCw className="h-3.5 w-3.5" /> تحديث البيانات
              </button>
            </div>
          </div>
        </header>

        <nav aria-label="أقسام لوحة المعلومات" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {SECTIONS_CONFIG.map((section) => {
            const Icon = section.icon;
            const selected = activeTab === section.id;
            return (
              <button key={section.id} type="button" onClick={() => selectSection(section.id)} aria-pressed={selected}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition focus-visible:outline-teal-600 ${selected ? 'border-teal-800 bg-teal-800 text-white shadow-sm dark:border-teal-600 dark:bg-teal-700' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-700 dark:hover:text-teal-300'}`}>
                <Icon className="h-4 w-4" /> {section.label}
                {section.badge && <span className={`rounded px-1.5 py-0.5 text-[9px] ${selected ? 'bg-white/15 text-white' : 'bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300'}`}>{section.badge}</span>}
              </button>
            );
          })}
        </nav>

        {(activeTab === 'pulse' || isOverview) && (
          <>
            <section aria-label="اختصارات سريعة" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { to: '/pos', label: 'فاتورة بيع جديدة', detail: 'ابدأ عملية بيع', icon: ShoppingCart, tone: 'text-teal-800 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300' },
                { to: '/products', label: 'المنتجات', detail: 'الأصناف والأسعار', icon: Package, tone: 'text-sky-800 bg-sky-50 dark:bg-sky-950/60 dark:text-sky-300' },
                { to: '/purchases', label: 'المشتريات', detail: 'فواتير الموردين', icon: ShoppingBag, tone: 'text-amber-800 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300' },
                { to: '/finance/debts', label: 'الذمم المدينة', detail: 'متابعة التحصيل', icon: Wallet, tone: 'text-rose-800 bg-rose-50 dark:bg-rose-950/60 dark:text-rose-300' },
              ].map(({ to, label, detail, icon: Icon, tone }) => (
                <Link key={to} to={to} className="group flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-sm focus-visible:outline-teal-600 dark:border-slate-800 dark:bg-slate-900">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
                  <span className="min-w-0"><span className="block truncate text-xs font-extrabold text-slate-800 dark:text-slate-100">{label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{detail}</span></span>
                  <ArrowUpRight className="mr-auto h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-teal-700" />
                </Link>
              ))}
            </section>
            <SectionCard id="sec-pulse" title="ملخص حركة اليوم" subtitle={`نظرة مباشرة على المبيعات والمشتريات والأداء · آخر تحديث ${new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' }).format(lastUpdated)}`} icon={LayoutDashboard} iconBg="bg-teal-50 dark:bg-teal-950" iconColor="text-teal-700 dark:text-teal-300" badge="مباشر">
              <OverviewSection key={refreshKey} />
            </SectionCard>
          </>
        )}
        {(activeTab === 'all' || activeTab === 'executive') && <SectionCard id="sec-executive" title="الأداء التنفيذي" subtitle="مؤشرات الأداء والاتجاهات المالية والتشغيلية" icon={TrendingUp} iconBg="bg-indigo-50 dark:bg-indigo-950" iconColor="text-indigo-700 dark:text-indigo-300"><Suspense fallback={<DashboardLoader />}><ExecutiveDashboard /></Suspense></SectionCard>}
        {(activeTab === 'all' || activeTab === 'sales') && <SectionCard id="sec-sales" title="تحليلات المبيعات" subtitle="اتجاهات البيع والأصناف والعملاء" icon={ShoppingCart} iconBg="bg-emerald-50 dark:bg-emerald-950" iconColor="text-emerald-700 dark:text-emerald-300"><Suspense fallback={<DashboardLoader />}><SalesAnalyticsPage /></Suspense></SectionCard>}
        {(activeTab === 'all' || activeTab === 'purchases') && <SectionCard id="sec-purchases" title="المشتريات والمخزون" subtitle="حركة الفواتير وتقييم المخزون والموردين" icon={ShoppingBag} iconBg="bg-amber-50 dark:bg-amber-950" iconColor="text-amber-700 dark:text-amber-300"><Suspense fallback={<DashboardLoader />}><PurchaseInventoryReportPage /></Suspense></SectionCard>}
        {(activeTab === 'all' || activeTab === 'debts') && <SectionCard id="sec-debts" title="الديون والذمم" subtitle="متابعة مستحقات العملاء والموردين" icon={Banknote} iconBg="bg-rose-50 dark:bg-rose-950" iconColor="text-rose-700 dark:text-rose-300"><Suspense fallback={<DashboardLoader />}><DebtsDashboardPage /></Suspense></SectionCard>}
        {(activeTab === 'all' || activeTab === 'crm') && <SectionCard id="sec-crm" title="إدارة العملاء والفرص" subtitle="متابعة العملاء المحتملين والأنشطة التسويقية" icon={Target} iconBg="bg-violet-50 dark:bg-violet-950" iconColor="text-violet-700 dark:text-violet-300"><Suspense fallback={<DashboardLoader />}><CrmDashboardPage /></Suspense></SectionCard>}
        {(activeTab === 'all' || activeTab === 'fleet') && <SectionCard id="sec-fleet" title="التوصيل والأسطول" subtitle="متابعة الشحنات والسائقين والمركبات" icon={Truck} iconBg="bg-cyan-50 dark:bg-cyan-950" iconColor="text-cyan-700 dark:text-cyan-300"><Suspense fallback={<DashboardLoader />}><FleetDashboardPage /></Suspense></SectionCard>}
        {(activeTab === 'all' || activeTab === 'hr') && <SectionCard id="sec-hr" title="الموارد البشرية" subtitle="متابعة فريق العمل والحضور والعمولات" icon={Award} iconBg="bg-teal-50 dark:bg-teal-950" iconColor="text-teal-700 dark:text-teal-300"><Suspense fallback={<DashboardLoader />}><HrDashboardPage /></Suspense></SectionCard>}
        <footer className="pb-2 text-center text-[10px] font-medium text-slate-400">CeramiSys ERP <span className="px-1.5">·</span> إدارة أكثر وضوحاً لمعرضك</footer>
      </div>
    </div>
  );
};
