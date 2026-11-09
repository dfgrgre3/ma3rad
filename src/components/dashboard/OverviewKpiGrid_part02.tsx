import React from 'react';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, CreditCard, DollarSign, Package, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { KpiTile } from './OverviewKpiGrid_part01';
import type { OverviewKpiGridProps } from './OverviewKpiGrid_part01';

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
