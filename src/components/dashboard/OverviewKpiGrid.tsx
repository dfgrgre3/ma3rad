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

interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
}

const TONE_CLASS: Record<NonNullable<KpiTileProps['tone']>, string> = {
  default: 'text-[#1b1b1b] dark:text-[#f0f0f0]',
  positive: 'text-[#107c10] dark:text-[#6cc36c]',
  negative: 'text-[#c42b1c] dark:text-[#f1707b]',
  warning: 'text-[#9d5d00] dark:text-[#e0a54a]',
};

const KpiTile: React.FC<KpiTileProps> = ({ label, value, hint, icon: Icon, tone = 'default' }) => (
  <div className="group relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-[2px] border border-[#d9d9d9] bg-white p-2.5 dark:border-[#3d3d3d] dark:bg-[#2b2b2b] sm:p-3">
    <span className="absolute inset-y-0 right-0 w-1 bg-[#0078d4] opacity-70" aria-hidden="true" />
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-[10px] font-semibold text-[#4d4d4d] dark:text-[#c8c8c8] sm:text-[11px]">{label}</span>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] text-[#0078d4]">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </div>
    <div className={`truncate text-[clamp(0.82rem,3.7vw,1.05rem)] font-extrabold tabular-nums tracking-tight ${TONE_CLASS[tone]}`}>{value}</div>
    {hint && <div className="truncate text-[9px] text-[#767676] dark:text-[#a6a6a6] sm:text-[10px]">{hint}</div>}
  </div>
);

export const OverviewKpiGrid: React.FC<OverviewKpiGridProps> = ({ metrics, monthlyComparison, profitMarginPercent, averageTicket }) => {
  const rawGrowth = monthlyComparison?.salesGrowth;
  const growth = Number.isFinite(rawGrowth) ? rawGrowth : null;
  const rawInvoiceGrowth = monthlyComparison?.invoiceGrowth;
  const invoiceGrowth = Number.isFinite(rawInvoiceGrowth) ? rawInvoiceGrowth : null;
  const hasSales = metrics.salesCount > 0 || metrics.todaySales > 0 || metrics.monthSales > 0;
  const formatMoney = (value: number, emptyFallback = '—') => (value > 0 ? CeramicMath.formatCurrency(value) : emptyFallback);
  const formatCount = (value: number, emptyFallback = '—') => (value > 0 ? String(value) : emptyFallback);

  return (
    <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
      <KpiTile
        label="مبيعات اليوم"
        icon={ShoppingCart}
        value={formatMoney(metrics.todaySales)}
        hint={hasSales ? `${metrics.salesCount} فاتورة مبيعات` : 'لا توجد مبيعات مسجلة اليوم'}
      />

      <KpiTile
        label="مبيعات الشهر"
        icon={TrendingUp}
        value={formatMoney(metrics.monthSales)}
        hint={growth !== null ? (
          <span className="flex items-center gap-1">
            {growth >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(growth).toFixed(1)}% نمو شهري
          </span>
        ) : (hasSales ? 'لا توجد مقارنة بالشهر السابق' : 'لا توجد بيانات لهذا الشهر')}
      />

      <KpiTile
        label="الأرباح الصافية"
        icon={DollarSign}
        tone={metrics.netProfit < 0 ? 'negative' : 'positive'}
        value={formatMoney(metrics.netProfit)}
        hint={hasSales ? `هامش الربح ${profitMarginPercent}%` : 'لا توجد أرباح مسجلة بعد الآن'}
      />

      <KpiTile
        label="متوسط الفاتورة"
        icon={CreditCard}
        value={averageTicket > 0 ? CeramicMath.formatCurrency(averageTicket) : '—'}
        hint={hasSales ? 'معدل القيمة اليومي' : 'لا توجد فواتير حتى الآن'}
      />

      <KpiTile
        label="ديون العملاء"
        icon={Wallet}
        tone={metrics.totalReceivables > 0 ? 'warning' : 'default'}
        value={formatMoney(metrics.totalReceivables)}
        hint={metrics.totalReceivables > 0 ? 'مستحقات واجبة التحصيل' : 'لا توجد ديون مستحقة'}
      />

      <KpiTile
        label="قيمة المخزون (التكلفة)"
        icon={Package}
        value={formatMoney(metrics.inventoryValuationCost)}
        hint={metrics.inventoryValuationCost > 0 ? 'إجمالي بضاعة المستودعات' : 'المخزون غير مُسجل بعد'}
      />

      <KpiTile
        label="نواقص المخزون"
        icon={AlertTriangle}
        tone={metrics.lowStockCount > 0 ? 'negative' : 'positive'}
        value={formatCount(metrics.lowStockCount, '0') + ' صنف'}
        hint={metrics.lowStockCount > 0 ? 'أصناف بلغت حد إعادة الطلب' : 'المخزون بمستوى آمن'}
      />

      <KpiTile
        label="فواتير الشهر"
        icon={Activity}
        value={monthlyComparison ? monthlyComparison.currentMonthInvoices : '—'}
        hint={invoiceGrowth !== null ? (
          <span className="flex items-center gap-1">
            {invoiceGrowth >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(invoiceGrowth).toFixed(1)}% مقارنة بالشهر السابق
          </span>
        ) : (hasSales ? 'مقارنة بالشهر السابق' : 'لا توجد فواتير مسجلة')}
      />
    </div>
  );
};
