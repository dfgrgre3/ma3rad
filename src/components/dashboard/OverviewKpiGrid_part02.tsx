import React from 'react';
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, CreditCard, DollarSign, Package, ShoppingCart, TrendingUp, Wallet,
} from 'lucide-react';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { KpiTile } from './OverviewKpiGrid_part01';
import type { OverviewKpiGridProps } from './OverviewKpiGrid_part01';

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
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
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
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
          <KpiTile
            label="قيمة المخزون بالتكلفة"
            icon={Package}
            value={formatMoney(metrics.inventoryValuationCost)}
            hint={metrics.inventoryValuationCost > 0 ? 'تقييم المخزون الحالي' : 'لا توجد قيمة مخزون مسجلة'}
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
