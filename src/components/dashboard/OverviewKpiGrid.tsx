import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, CreditCard, DollarSign, Package, ShoppingCart, TrendingUp, Wallet,
} from 'lucide-react';
import { CeramicMath } from '../../utils/products/ceramicMath';
import type { DashboardMetrics, MonthlyComparison } from '../../services/domains/finance/AccountingService';

export interface OverviewKpiGridProps {
  metrics: DashboardMetrics;
  monthlyComparison: MonthlyComparison | null;
  profitMarginPercent: string;
  averageTicket: number;
}

export interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
  to?: string;
}

export const TONE_CLASS: Record<NonNullable<KpiTileProps['tone']>, string> = {
  default: 'text-[#1b1b1b] dark:text-[#f0f0f0]',
  positive: 'text-[#107c10] dark:text-[#6cc36c]',
  negative: 'text-[#c42b1c] dark:text-[#f1707b]',
  warning: 'text-[#9d5d00] dark:text-[#e0a54a]',
};

export const KpiTile: React.FC<KpiTileProps> = ({ label, value, hint, icon: Icon, tone = 'default', to }) => {
  const content = (
    <>
      <span className="absolute inset-y-0 right-0 w-1 bg-[#0078d4] opacity-70" aria-hidden="true" />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-semibold text-[#4d4d4d] dark:text-[#c8c8c8] sm:text-[11px]">{label}</span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] text-[#0078d4]">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
      <div className={`truncate text-[clamp(0.82rem,3.7vw,1.05rem)] font-extrabold tabular-nums tracking-tight ${TONE_CLASS[tone]}`}>{value}</div>
      {hint && <div className="truncate text-[9px] text-[#767676] dark:text-[#a6a6a6] sm:text-[10px]">{hint}</div>}
    </>
  );
  const className = `group relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-[2px] border border-[#d9d9d9] bg-surface p-2.5 dark:border-[#3d3d3d] dark:bg-[#2b2b2b] sm:p-3 ${
 to ? 'transition-colors hover:border-[#0078d4] hover:bg-[#f8fbfe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0078d4] dark:hover:bg-[#30363b]' : ''
 }`;

  return to ? (
    <Link to={to} className={className} aria-label={`فتح سجلات ${label}`}>
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
};

export const OverviewKpiGrid: React.FC<OverviewKpiGridProps> = ({ metrics, monthlyComparison, profitMarginPercent, averageTicket }) => {
  const salesGrowth = metrics.previousMonthSales > 0 && Number.isFinite(metrics.salesGrowthRate)
    ? metrics.salesGrowthRate
    : null;
  const invoiceGrowth = typeof monthlyComparison?.invoiceGrowth === 'number' && Number.isFinite(monthlyComparison.invoiceGrowth)
    ? monthlyComparison.invoiceGrowth
    : null;
  const hasSales = metrics.salesCount > 0 || metrics.todaySales > 0 || metrics.monthSales > 0;
  const formatMoney = (value: number) => Number.isFinite(value) ? CeramicMath.formatCurrency(value) : '—';
  const formatCount = (value: number) => Number.isFinite(value) ? value.toLocaleString('ar-EG') : '—';
  const formatPercent = (value: number) => `${Math.abs(value).toLocaleString('ar-EG', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const growthHint = (value: number, label: string) => (
    <span className="flex items-center gap-1">
      {value >= 0 ? <ArrowUp className="h-3 w-3 shrink-0" aria-hidden="true" /> : <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span>{formatPercent(value)} {label}</span>
    </span>
  );

  return (
    <div className="space-y-4">
      <section aria-labelledby="dashboard-financial-heading">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id="dashboard-financial-heading" className="text-[12px] font-extrabold text-[#1b1b1b] dark:text-[#f0f0f0]">المؤشرات المالية</h3>
          <span className="text-[10px] font-semibold text-[#767676] dark:text-[#a6a6a6]">اليوم والشهر حتى تاريخه</span>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3 sm:gap-3">
          <KpiTile
            label="مبيعات اليوم"
            icon={ShoppingCart}
            value={formatMoney(metrics.todaySales)}
            hint={hasSales ? `${formatCount(metrics.salesCount)} فاتورة اليوم` : 'لا توجد مبيعات مسجلة اليوم'}
            to="/sales"
          />

          <KpiTile
            label="مبيعات الشهر"
            icon={TrendingUp}
            value={formatMoney(metrics.monthSales)}
            hint={salesGrowth !== null
              ? growthHint(salesGrowth, 'مقارنة بنفس الفترة من الشهر السابق')
              : 'لا تتوفر مبيعات للفترة السابقة للمقارنة'}
            to="/sales"
          />

          <KpiTile
            label="الأرباح الصافية"
            icon={DollarSign}
            tone={metrics.netProfit < 0 ? 'negative' : 'positive'}
            value={formatMoney(metrics.netProfit)}
            hint={hasSales ? `من بداية الشهر · هامش الربح ${profitMarginPercent}%` : 'لا توجد أرباح مسجلة بعد'}
            to="/finance"
          />

          <KpiTile
            label="متوسط الفاتورة"
            icon={CreditCard}
            value={formatMoney(averageTicket)}
            hint={hasSales ? 'متوسط قيمة فواتير اليوم' : 'لا توجد فواتير حتى الآن'}
            to="/sales"
          />

          <KpiTile
            label="ديون العملاء"
            icon={Wallet}
            tone={metrics.totalReceivables > 0 ? 'warning' : 'default'}
            value={formatMoney(metrics.totalReceivables)}
            hint={metrics.totalReceivables > 0 ? 'إجمالي المستحقات القائمة' : 'لا توجد ديون مستحقة'}
            to="/finance/debts"
          />

          <KpiTile
            label="فواتير الشهر"
            icon={Activity}
            value={monthlyComparison ? formatCount(monthlyComparison.currentMonthInvoices) : '—'}
            hint={monthlyComparison
              ? invoiceGrowth !== null
                ? growthHint(invoiceGrowth, `مقارنة بالشهر السابق · ${formatCount(monthlyComparison.previousMonth.invoices)} فاتورة`)
                : `حتى الآن · الشهر السابق ${formatCount(monthlyComparison.previousMonth.invoices)} فاتورة`
              : 'بيانات المقارنة غير متاحة'}
            to="/sales"
          />
        </div>
      </section>

      <section aria-labelledby="dashboard-operations-heading">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id="dashboard-operations-heading" className="text-[12px] font-extrabold text-[#1b1b1b] dark:text-[#f0f0f0]">المخزون والتشغيل</h3>
          <span className="text-[10px] font-semibold text-[#767676] dark:text-[#a6a6a6]">المخزون الحالي</span>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:gap-3">
          <KpiTile
            label="قيمة المخزون بالتكلفة"
            icon={Package}
            value={metrics.inventoryValuationUnavailable ? 'غير متاح' : formatMoney(metrics.inventoryValuationCost ?? 0)}
            hint={metrics.inventoryValuationUnavailable 
              ? 'تقييم المخزون غير متاح (خطأ FIFO - راجع المخزون)' 
              : metrics.inventoryValuationCost != null && metrics.inventoryValuationCost > 0 
                ? 'تقييم المخزون الحالي' 
                : 'لا توجد قيمة مخزون مسجلة'}
            to="/inventory"
          />

          <KpiTile
            label="نواقص المخزون"
            icon={AlertTriangle}
            tone={metrics.lowStockCount > 0 ? 'negative' : 'positive'}
            value={`${formatCount(metrics.lowStockCount)} صنف`}
            hint={metrics.lowStockCount > 0 ? 'أصناف بلغت حد إعادة الطلب' : 'المخزون بمستوى آمن'}
            to="/inventory/reorder-planning"
          />
        </div>
      </section>
    </div>
  );
};