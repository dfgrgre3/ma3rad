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
  <div className="flex min-w-0 flex-col gap-1 rounded-[2px] border border-[#d9d9d9] bg-white p-2.5 dark:border-[#3d3d3d] dark:bg-[#2b2b2b]">
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-[11.5px] font-semibold text-[#4d4d4d] dark:text-[#c8c8c8]">{label}</span>
      <Icon className="h-3.5 w-3.5 shrink-0 text-[#0078d4]" />
    </div>
    <div className={`truncate text-[17px] font-semibold tabular-nums ${TONE_CLASS[tone]}`}>{value}</div>
    {hint && <div className="truncate text-[10.5px] text-[#767676] dark:text-[#a6a6a6]">{hint}</div>}
  </div>
);

export const OverviewKpiGrid: React.FC<OverviewKpiGridProps> = ({ metrics, monthlyComparison, profitMarginPercent, averageTicket }) => {
  const rawGrowth = monthlyComparison?.salesGrowth;
  const growth = Number.isFinite(rawGrowth) ? rawGrowth : null;
  const rawInvoiceGrowth = monthlyComparison?.invoiceGrowth;
  const invoiceGrowth = Number.isFinite(rawInvoiceGrowth) ? rawInvoiceGrowth : null;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <KpiTile
        label="مبيعات اليوم"
        icon={ShoppingCart}
        value={CeramicMath.formatCurrency(metrics.todaySales)}
        hint={`${metrics.salesCount} فاتورة مبيعات`}
      />

      <KpiTile
        label="مبيعات الشهر"
        icon={TrendingUp}
        value={CeramicMath.formatCurrency(metrics.monthSales)}
        hint={growth !== null ? (
          <span className="flex items-center gap-1">
            {growth >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(growth).toFixed(1)}% نمو شهري
          </span>
        ) : 'لا توجد مقارنة بالشهر السابق'}
      />

      <KpiTile
        label="الأرباح الصافية"
        icon={DollarSign}
        tone={metrics.netProfit < 0 ? 'negative' : 'positive'}
        value={CeramicMath.formatCurrency(metrics.netProfit)}
        hint={`هامش الربح ${profitMarginPercent}%`}
      />

      <KpiTile
        label="متوسط الفاتورة"
        icon={CreditCard}
        value={CeramicMath.formatCurrency(averageTicket)}
        hint="معدل القيمة اليومي"
      />

      <KpiTile
        label="ديون العملاء"
        icon={Wallet}
        tone={metrics.totalReceivables > 0 ? 'warning' : 'default'}
        value={CeramicMath.formatCurrency(metrics.totalReceivables)}
        hint="مستحقات واجبة التحصيل"
      />

      <KpiTile
        label="قيمة المخزون (التكلفة)"
        icon={Package}
        value={CeramicMath.formatCurrency(metrics.inventoryValuationCost)}
        hint="إجمالي بضاعة المستودعات"
      />

      <KpiTile
        label="نواقص المخزون"
        icon={AlertTriangle}
        tone={metrics.lowStockCount > 0 ? 'negative' : 'positive'}
        value={`${metrics.lowStockCount} صنف`}
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
        ) : 'مقارنة بالشهر السابق'}
      />
    </div>
  );
};
