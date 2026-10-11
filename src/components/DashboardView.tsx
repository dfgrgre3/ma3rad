import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, ShoppingCart, DollarSign, Package, AlertTriangle, 
  ArrowUpRight, ArrowDownRight, Wallet, Users, Clock
} from 'lucide-react';
import { AccountingService, DashboardMetrics } from '../services/AccountingService';
import { CeramicMath } from '../utils/ceramicMath';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export const DashboardView: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [chartData, setChartData] = useState<{ date: string; sales: number; profit: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; quantityM2: number; totalRevenue: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const accountingService = new AccountingService();

  const loadData = () => {
    try {
      const data = accountingService.getDashboardMetrics();
      const trend = accountingService.getSalesTrendLast7Days();
      const top = accountingService.getTopSellingProducts(5);
      setMetrics(data);
      setChartData(trend);
      setTopProducts(top);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading || !metrics) {
    return <div className="p-8 text-center text-slate-500">جاري تحميل البيانات من قاعدة البيانات...</div>;
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today Sales */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">مبيعات اليوم</span>
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {CeramicMath.formatCurrency(metrics.todaySales)}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500">
              <span className="font-semibold">{metrics.salesCount}</span> فاتورة مبيعات اليوم
            </div>
          </div>
        </div>

        {/* Month Sales */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">مبيعات الشهر الحالية</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {CeramicMath.formatCurrency(metrics.monthSales)}
            </div>
            <div className="flex items-center gap-1 mt-1.5 text-xs text-emerald-600 font-bold">
              <span>أرباح صافية: {CeramicMath.formatCurrency(metrics.netProfit)}</span>
            </div>
          </div>
        </div>

        {/* Receivables / Customer Debts */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">ديون العملاء (الآجل)</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {CeramicMath.formatCurrency(metrics.totalReceivables)}
            </div>
            <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-500">
              مستحقات واجبة التحصيل
            </div>
          </div>
        </div>

        {/* Inventory Cost Valuation */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">قيمة المخزون (سعر الشراء)</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
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

      {/* Main Charts & Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Trend Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">حركة المبيعات خلال آخر 7 أيام</h2>
              <p className="text-xs text-slate-500">بيانات مسحوبة مباشرة من الفواتير المعتمدة بقاعدة البيانات</p>
            </div>
          </div>

          <div className="h-64 w-full" dir="ltr">
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
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  formatter={(val: any) => [CeramicMath.formatCurrency(Number(val)), 'المبيعات']}
                />
                <Area type="monotone" dataKey="sales" stroke="#0284c7" strokeWidth={2} fillOpacity={1} fill="url(#salesGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Selling Products */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">أكثر أصناف السيراميك طلباً</h2>
            <p className="text-xs text-slate-500 mb-4">بناءً على كميات المتر المربع المباعة</p>

            <div className="space-y-3">
              {topProducts.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400">
                  لا توجد مبيعات مسجلة حتى الآن.<br />
                  ابدأ بإصدار أول فاتورة من شاشة POS!
                </div>
              ) : (
                topProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-sky-500/10 text-sky-600 font-bold text-xs flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100">{p.name}</div>
                        <div className="text-[11px] text-slate-500">{CeramicMath.formatM2(p.quantityM2)}</div>
                      </div>
                    </div>
                    <div className="text-xs font-black text-sky-600 dark:text-sky-400">
                      {CeramicMath.formatCurrency(p.totalRevenue)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
