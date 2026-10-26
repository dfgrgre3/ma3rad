import React from 'react';
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, CreditCard, DollarSign, Package, ShoppingCart, TrendingUp, Wallet,
} from 'lucide-react';
import type { DashboardMetrics } from '../../services/AccountingService';
import { CeramicMath } from '../../utils/ceramicMath';

interface OverviewKpiGridProps {
  metrics: DashboardMetrics;
  monthlyComparison: any;
  profitMarginPercent: string;
  averageTicket: number;
}

export const OverviewKpiGrid: React.FC<OverviewKpiGridProps> = ({ metrics, monthlyComparison, profitMarginPercent, averageTicket }) => {
  return (
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
  );
};
