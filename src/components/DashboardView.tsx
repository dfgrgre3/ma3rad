import React, { useState, useEffect } from 'react';
import {
  TrendingUp, ShoppingCart, DollarSign, Package, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Wallet, Users, Clock, Target,
  BarChart3, Activity, Bell, Award, CreditCard, RefreshCw,
  Filter, Calendar, Eye, CheckCircle, XCircle, PackagePlus,
  ShoppingCart as Cart, ArrowUp, ArrowDown, TrendingDown
} from 'lucide-react';
import { AccountingService, DashboardMetrics } from '../services/AccountingService';
import { CeramicMath } from '../utils/ceramicMath';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart as PieChartRecharts, Pie, Cell, LineChart, Line, Legend
} from 'recharts';

const COLORS = ['#0284c7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export const DashboardView: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [chartData, setChartData] = useState<{ date: string; sales: number; profit: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; quantityM2: number; totalRevenue: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Enhanced analytics state
  const [monthlyComparison, setMonthlyComparison] = useState<any>(null);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [categorySales, setCategorySales] = useState<any[]>([]);
  const [gradeSales, setGradeSales] = useState<any[]>([]);
  const [paymentDistribution, setPaymentDistribution] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  const accountingService = new AccountingService();

  const loadData = async () => {
    setRefreshing(true);
    try {
      const data = accountingService.getDashboardMetrics();
      const trend = accountingService.getSalesTrendLast7Days();
      const top = accountingService.getTopSellingProducts(5);
      const monthlyComp = accountingService.getMonthlyComparison();
      const topCust = accountingService.getTopCustomers(5);
      const catSales = accountingService.getCategorySalesReport();
      const gradeDist = accountingService.getSalesByGrade();
      const payDist = accountingService.getPaymentMethodDistribution();
      const activities = accountingService.getRecentActivities(8);

      setMetrics(data);
      setChartData(trend);
      setTopProducts(top);
      setMonthlyComparison(monthlyComp);
      setTopCustomers(topCust);
      setCategorySales(catSales);
      setGradeSales(gradeDist);
      setPaymentDistribution(payDist);
      setRecentActivities(activities);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'sale': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'purchase': return <PackagePlus className="w-4 h-4 text-sky-500" />;
      case 'return': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'inventory': return <Package className="w-4 h-4 text-amber-500" />;
      default: return <Activity className="w-4 h-4 text-slate-500" />;
    }
  };

  if (loading || !metrics) {
    return (
      <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center h-full">
        <div className="w-12 h-12 rounded-xl bg-sky-500/10 animate-pulse flex items-center justify-center mb-4">
          <Activity className="w-6 h-6 text-sky-500 animate-spin" />
        </div>
        <p>جاري تحميل البيانات من قاعدة البيانات...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">لوحة المعلومات الرئيسية</h1>
          <p className="text-sm text-slate-500 mt-1">نظرة شاملة على أداء النظام والمبيعات</p>
        </div>
        <button
          onClick={loadData}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          تحديث البيانات
        </button>
      </div>

      {/* Top Metric Cards - Expanded */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today Sales */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-sky-500/10 transition-all" />
          <div className="flex items-center justify-between relative">
            <span className="text-xs font-bold text-slate-500">مبيعات اليوم</span>
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 relative">
            <div className="text-3xl font-black text-slate-900">
              {CeramicMath.formatCurrency(metrics.todaySales)}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500">
              <span className="font-semibold">{metrics.salesCount}</span> فاتورة مبيعات
            </div>
          </div>
        </div>

        {/* Month Sales */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-emerald-500/10 transition-all" />
          <div className="flex items-center justify-between relative">
            <span className="text-xs font-bold text-slate-500">مبيعات الشهر</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 relative">
            <div className="text-3xl font-black text-slate-900">
              {CeramicMath.formatCurrency(metrics.monthSales)}
            </div>
            <div className="flex items-center gap-1 mt-1.5 text-xs text-emerald-600 font-bold">
              <span>أرباح صافية: {CeramicMath.formatCurrency(metrics.netProfit)}</span>
            </div>
          </div>
        </div>

        {/* Receivables / Customer Debts */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-amber-500/10 transition-all" />
          <div className="flex items-center justify-between relative">
            <span className="text-xs font-bold text-slate-500">ديون العملاء</span>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 relative">
            <div className="text-3xl font-black text-amber-600">
              {CeramicMath.formatCurrency(metrics.totalReceivables)}
            </div>
            <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-500">
              مستحقات واجبة التحصيل
            </div>
          </div>
        </div>

        {/* Inventory Cost Valuation */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-indigo-500/10 transition-all" />
          <div className="flex items-center justify-between relative">
            <span className="text-xs font-bold text-slate-500">قيمة المخزون</span>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 relative">
            <div className="text-3xl font-black text-slate-900">
              {CeramicMath.formatCurrency(metrics.inventoryValuationCost)}
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
              {metrics.lowStockCount > 0 ? (
                <span className="text-red-500 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {metrics.lowStockCount} صنف قارب على النفاد
                </span>
              ) : (
                <span className="text-emerald-500 font-semibold">المخزون بمستويات ممتازة</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Average Sale Value */}
        <div className="bg-gradient-to-br from-sky-500 to-sky-600 p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="flex items-center justify-between relative">
            <span className="text-xs font-bold text-sky-100">متوسط قيمة الفاتورة</span>
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="mt-3 relative">
            <div className="text-2xl font-black text-slate-900">
              {metrics.salesCount > 0 ? CeramicMath.formatCurrency(metrics.todaySales / metrics.salesCount) : '0 ر.س'}
            </div>
          </div>
        </div>

        {/* Profit Margin */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="flex items-center justify-between relative">
            <span className="text-xs font-bold text-emerald-100">هامش الربح</span>
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="mt-3 relative">
            <div className="text-2xl font-black text-slate-900">
              {metrics.monthSales > 0 ? ((metrics.netProfit / metrics.monthSales) * 100).toFixed(1) : '0'}%
            </div>
          </div>
        </div>

        {/* Low Stock Count */}
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="flex items-center justify-between relative">
            <span className="text-xs font-bold text-indigo-100">أصناف منخفضة المخزون</span>
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="mt-3 relative">
            <div className="text-2xl font-black text-slate-900">
              {metrics.lowStockCount || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Comparison Card */}
      {monthlyComparison && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">مقارنة الشهر الحالي مع السابق</h2>
              <p className="text-xs text-slate-500">تحليل أداء المبيعات والربحية</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 ">
              <div className="text-xs text-slate-500 mb-1">مبيعات الشهر الحالي</div>
              <div className="text-xl font-black text-slate-900 mb-2">
                {CeramicMath.formatCurrency(monthlyComparison.currentMonthSales)}
              </div>
              <div className="flex items-center gap-1 text-xs">
                {monthlyComparison.salesGrowth >= 0 ? (
                  <span className="text-emerald-500 font-bold flex items-center gap-1">
                    <ArrowUp className="w-3 h-3" /> {monthlyComparison.salesGrowth.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-red-500 font-bold flex items-center gap-1">
                    <ArrowDown className="w-3 h-3" /> {Math.abs(monthlyComparison.salesGrowth).toFixed(1)}%
                  </span>
                )}
                <span className="text-slate-500">مقارنة بالشهر السابق</span>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 ">
              <div className="text-xs text-slate-500 mb-1">الأرباح الصافية</div>
              <div className="text-xl font-black text-slate-900 mb-2">
                {CeramicMath.formatCurrency(monthlyComparison.currentMonthProfit)}
              </div>
              <div className="flex items-center gap-1 text-xs">
                {monthlyComparison.profitGrowth >= 0 ? (
                  <span className="text-emerald-500 font-bold flex items-center gap-1">
                    <ArrowUp className="w-3 h-3" /> {monthlyComparison.profitGrowth.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-red-500 font-bold flex items-center gap-1">
                    <ArrowDown className="w-3 h-3" /> {Math.abs(monthlyComparison.profitGrowth).toFixed(1)}%
                  </span>
                )}
                <span className="text-slate-500">مقارنة بالشهر السابق</span>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 ">
              <div className="text-xs text-slate-500 mb-1">عدد الفواتير</div>
              <div className="text-xl font-black text-slate-900 mb-2">
                {monthlyComparison.currentMonthInvoices}
              </div>
              <div className="flex items-center gap-1 text-xs">
                {monthlyComparison.invoiceGrowth >= 0 ? (
                  <span className="text-emerald-500 font-bold flex items-center gap-1">
                    <ArrowUp className="w-3 h-3" /> {monthlyComparison.invoiceGrowth.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-red-500 font-bold flex items-center gap-1">
                    <ArrowDown className="w-3 h-3" /> {Math.abs(monthlyComparison.invoiceGrowth).toFixed(1)}%
                  </span>
                )}
                <span className="text-slate-500">مقارنة بالشهر السابق</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Charts & Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Trend Chart */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">حركة المبيعات خلال آخر 7 أيام</h2>
              <p className="text-xs text-slate-500">بيانات مسحوبة مباشرة من الفواتير المعتمدة بقاعدة البيانات</p>
            </div>
          </div>

          <div className="h-72 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a', fontSize: '12px' }}
                  formatter={(val: any) => [CeramicMath.formatCurrency(Number(val)), 'المبيعات']}
                />
                <Area type="monotone" dataKey="sales" stroke="#0284c7" strokeWidth={2} fillOpacity={1} fill="url(#salesGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Selling Products */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">أكثر أصناف السيراميك طلباً</h2>
            <p className="text-xs text-slate-500 mb-4">بناءً على كميات المتر المربع المباعة</p>

            <div className="space-y-3">
              {topProducts.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-500">
                  لا توجد مبيعات مسجلة حتى الآن.<br />
                  ابدأ بإصدار أول فاتورة من شاشة POS!
                </div>
              ) : (
                topProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 font-bold text-xs flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-bold text-xs text-slate-900">{p.name}</div>
                        <div className="text-[11px] text-slate-500">{CeramicMath.formatM2(p.quantityM2)}</div>
                      </div>
                    </div>
                    <div className="text-xs font-black text-sky-600">
                      {CeramicMath.formatCurrency(p.totalRevenue)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Sales */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-1">توزيع المبيعات حسب الفئة</h2>
          <p className="text-xs text-slate-500 mb-4">أداء الفئات المختلفة</p>
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChartRecharts>
                <Pie
                  data={categorySales}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={70}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categorySales.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a', fontSize: '12px' }}
                  formatter={(val: any) => [CeramicMath.formatCurrency(Number(val)), 'المبيعات']}
                />
              </PieChartRecharts>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-1">طرق الدفع</h2>
          <p className="text-xs text-slate-500 mb-4">توزيع طرق الدفع المستخدمة</p>
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paymentDistribution} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="method" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a', fontSize: '12px' }}
                  formatter={(val: any) => [CeramicMath.formatCurrency(Number(val)), 'المبلغ']}
                />
                <Bar dataKey="amount" fill="#0284c7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Customers */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-1">أفضل العملاء</h2>
          <p className="text-xs text-slate-500 mb-4">حسب إجمالي المشتريات</p>
          <div className="space-y-3">
            {topCustomers.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">
                لا توجد بيانات عملاء بعد
              </div>
            ) : (
              topCustomers.map((c, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                      {c.name?.charAt(0) || 'C'}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900">{c.name}</div>
                      <div className="text-[11px] text-slate-500">{c.invoiceCount || 0} فاتورة</div>
                    </div>
                  </div>
                  <div className="text-xs font-black text-emerald-600">
                    {CeramicMath.formatCurrency(c.totalAmount)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Activities */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">الأنشطة الحديثة</h2>
            <p className="text-xs text-slate-500">آخر العمليات في النظام</p>
          </div>
        </div>
        <div className="space-y-2">
          {recentActivities.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500">
              لا توجد أنشطة مسجلة حتى الآن
            </div>
          ) : (
            recentActivities.map((activity, idx) => (
              <div key={idx} className="flex items-center gap-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                {getActivityIcon(activity.type)}
                <div className="flex-1">
                  <div className="font-bold text-xs text-slate-900">{activity.description}</div>
                  <div className="text-[11px] text-slate-500">{activity.timestamp}</div>
                </div>
                <button className="text-slate-500 hover:text-slate-600 transition-colors">
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

