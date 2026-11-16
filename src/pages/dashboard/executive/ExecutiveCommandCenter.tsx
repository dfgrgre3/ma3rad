import React, { useEffect, useRef } from 'react';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowLeftRight, ArrowUpRight, Banknote, Boxes,
  Building2, ChevronLeft, CircleDollarSign, Landmark, Loader2, Package, ReceiptText,
  RefreshCw, ShoppingBag, ShoppingCart, TrendingDown, TrendingUp, Users, Wallet,
} from 'lucide-react';
import {
  Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useDashboardRefresh } from '../../../contexts/DashboardRefreshContext';
import { useExecutiveCommandCenter } from '../../../hooks/domains/dashboard/useExecutiveCommandCenter';
import { commandFormatters } from '../../../services/domains/dashboard/ExecutiveCommandService';
import { COMMAND_RANGES, type CommandRange, type DrilldownKey } from '../../../types/dashboard/executiveCommand';
import { CommandKpiCard } from './CommandKpiCard';
import { DrilldownModal } from './DrilldownModal';

const changePercent = (current: number, previous: number): number | null => {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
};

const shortMoney = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} م`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toLocaleString('ar-EG', { maximumFractionDigits: 1 })} ألف`;
  return value.toLocaleString('ar-EG', { maximumFractionDigits: 0 });
};

interface PanelProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  children: React.ReactNode;
}

const Panel: React.FC<PanelProps> = ({ title, subtitle, actionLabel, onAction, className = '', children }) => (
  <section className={`min-w-0 rounded-[2px] border border-[#d9d9d9] bg-white dark:border-[#3d3d3d] dark:bg-[#2b2b2b] ${className}`}>
    <header className="flex items-center justify-between gap-2 border-b border-[#d9d9d9] px-3 py-2.5 dark:border-[#3d3d3d]">
      <div className="min-w-0">
        <h3 className="truncate text-[12px] font-extrabold text-[#1b1b1b] dark:text-[#f0f0f0]">{title}</h3>
        {subtitle && <p className="truncate text-[10px] text-[#767676] dark:text-[#a6a6a6]">{subtitle}</p>}
      </div>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-[#0067b8] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0078d4] dark:text-[#8ec8f5]"
        >
          {actionLabel ?? 'عرض التفاصيل'}
          <ChevronLeft className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </header>
    <div className="min-w-0 p-3">{children}</div>
  </section>
);

const EmptyLine: React.FC<{ text: string }> = ({ text }) => (
  <p className="py-8 text-center text-[11px] font-semibold text-[#767676] dark:text-[#a6a6a6]">{text}</p>
);

export const ExecutiveCommandCenter: React.FC = () => {
  const refreshToken = useDashboardRefresh()?.refreshToken;
  const initialRefreshRef = useRef(true);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const {
    range, setRange, data, loading, error, lastUpdated, refresh,
    drilldownKey, drilldown, drilldownLoading, drilldownError, openDrilldown, closeDrilldown,
  } = useExecutiveCommandCenter();

  refreshRef.current = refresh;

  useEffect(() => {
    if (refreshToken === undefined) return;
    if (initialRefreshRef.current) {
      initialRefreshRef.current = false;
      return;
    }
    void refreshRef.current();
  }, [refreshToken]);

  const open = (key: DrilldownKey) => () => { void openDrilldown(key); };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-[#0078d4]" />
        <p className="text-xs font-bold text-[#4d4d4d] dark:text-[#c8c8c8]">جارٍ تجميع مؤشرات القيادة التنفيذية…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900 dark:bg-rose-950/30" role="alert">
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-rose-500" />
        <p className="text-xs font-bold text-rose-800 dark:text-rose-200">{error || 'تعذر تحميل لوحة القيادة.'}</p>
        <button type="button" onClick={() => void refresh()} className="mt-3 rounded bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const { comparison, cashFlow, liquidity, inventory, sales, profit, expenses, collections, receivables } = data;
  const salesChange = changePercent(comparison.current.sales, comparison.previous.sales);
  const profitChange = changePercent(comparison.current.profit, comparison.previous.profit);
  const expenseChange = changePercent(comparison.current.expenses, comparison.previous.expenses);
  const collectionChange = changePercent(comparison.current.collections, comparison.previous.collections);
  const slowMovingValue = data.slowMoving.reduce((sum, row) => sum + row.stockValue, 0);
  const maxBranchSales = Math.max(...data.branches.map((row) => row.sales), 1);
  const maxEmployeeSales = Math.max(...data.employees.map((row) => row.sales), 1);
  const latestUpdate = lastUpdated ?? new Date(data.generatedAt);

  return (
    <div className="min-w-0 space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-black text-[#1b1b1b] dark:text-[#f5f5f5] sm:text-lg">مركز القيادة التنفيذي</h1>
          <p className="mt-0.5 text-[11px] text-[#767676] dark:text-[#a6a6a6]">
            {data.period.label} · {data.period.from} ← {data.period.to} · آخر تحديث {latestUpdate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
          {COMMAND_RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRange(item.id as CommandRange)}
              aria-pressed={range === item.id}
              className={`min-h-8 flex-1 rounded-[2px] border px-2.5 py-1.5 text-[10px] font-bold transition-colors sm:flex-none ${
                range === item.id
                  ? 'border-[#0078d4] bg-[#0078d4] text-white'
                  : 'border-[#d9d9d9] bg-white text-[#4d4d4d] hover:bg-[#f0f6fc] dark:border-[#4a4a4a] dark:bg-[#2b2b2b] dark:text-[#c8c8c8] dark:hover:bg-[#30363b]'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-[2px] border border-[#d9d9d9] bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#4d4d4d] hover:bg-[#f0f6fc] disabled:opacity-50 dark:border-[#4a4a4a] dark:bg-[#2b2b2b] dark:text-[#c8c8c8] dark:hover:bg-[#30363b]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-[2px] border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <span className="flex min-w-0 items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}</span>
          <button type="button" className="shrink-0 underline" onClick={() => void refresh()}>إعادة المحاولة</button>
        </div>
      )}

      {/* Alerts strip */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button type="button" onClick={open('overdueInvoices')} className="flex items-center justify-between gap-2 rounded-[2px] border border-rose-200 bg-rose-50 px-3 py-2 text-right transition hover:border-rose-400 dark:border-rose-900 dark:bg-rose-950/30">
          <span className="flex items-center gap-2 text-[11px] font-bold text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4" />
            {receivables.overdueCount > 0 ? `${commandFormatters.count(receivables.overdueCount)} فاتورة متأخرة` : 'لا توجد فواتير متأخرة'}
          </span>
          <span className="tabular-nums text-[11px] font-black text-rose-700 dark:text-rose-300">{shortMoney(receivables.overdueTotal)}</span>
        </button>
        <button type="button" onClick={open('lowStock')} className="flex items-center justify-between gap-2 rounded-[2px] border border-amber-200 bg-amber-50 px-3 py-2 text-right transition hover:border-amber-400 dark:border-amber-900 dark:bg-amber-950/30">
          <span className="flex items-center gap-2 text-[11px] font-bold text-amber-800 dark:text-amber-300">
            <Package className="h-4 w-4" />
            {inventory.lowStockCount > 0 ? `${commandFormatters.count(inventory.lowStockCount)} صنف عند حد الطلب` : 'المخزون بمستوى آمن'}
          </span>
          <span className="tabular-nums text-[11px] font-black text-amber-800 dark:text-amber-300">{commandFormatters.count(inventory.outOfStockCount)} نفد</span>
        </button>
        <button type="button" onClick={open('slowMoving')} className="flex items-center justify-between gap-2 rounded-[2px] border border-slate-200 bg-slate-50 px-3 py-2 text-right transition hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800/50">
          <span className="flex items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-300">
            <TrendingDown className="h-4 w-4" />
            {data.slowMoving.length > 0 ? `${commandFormatters.count(data.slowMoving.length)} صنف راكد` : 'لا توجد أصناف راكدة'}
          </span>
          <span className="tabular-nums text-[11px] font-black text-slate-700 dark:text-slate-300">{shortMoney(slowMovingValue)}</span>
        </button>
      </div>

      {/* Financial KPIs */}
      <section aria-labelledby="command-financial-heading">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="command-financial-heading" className="text-[12px] font-extrabold text-[#1b1b1b] dark:text-[#f0f0f0]">المؤشرات المالية</h2>
          <span className="text-[10px] font-semibold text-[#767676] dark:text-[#a6a6a6]">كل رقم قابل للضغط لعرض السجلات المكوّنة له</span>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <CommandKpiCard
            label="مبيعات اليوم"
            value={commandFormatters.money(sales.today)}
            hint={`${commandFormatters.count(sales.todayInvoiceCount)} فاتورة اليوم`}
            icon={ShoppingCart}
            tone="info"
            onClick={open('salesToday')}
          />
          <CommandKpiCard
            label="مبيعات الفترة"
            value={commandFormatters.money(sales.net)}
            hint={`${commandFormatters.count(sales.invoiceCount)} فاتورة · صافي بعد المرتجعات`}
            icon={TrendingUp}
            tone="default"
            change={salesChange}
            onClick={open('salesMonth')}
          />
          <CommandKpiCard
            label="صافي الربح الفعلي"
            value={commandFormatters.money(profit.net)}
            hint={`هامش ${profit.margin.toLocaleString('ar-EG', { maximumFractionDigits: 1 })}% · ${profit.source === 'ledger' ? 'من القيود المرحلة' : 'تقديري'}`}
            icon={CircleDollarSign}
            tone={profit.net < 0 ? 'negative' : 'positive'}
            change={profitChange}
            onClick={open('profit')}
          />
          <CommandKpiCard
            label="إجمالي المصروفات"
            value={commandFormatters.money(expenses.total)}
            hint={`${commandFormatters.count(expenses.count)} حركة · اليوم ${shortMoney(expenses.today)}`}
            icon={ReceiptText}
            tone="warning"
            change={expenseChange}
            onClick={open('expenses')}
          />
          <CommandKpiCard
            label="إجمالي التحصيلات"
            value={commandFormatters.money(collections.total)}
            hint={`${commandFormatters.count(collections.count)} حركة تحصيل`}
            icon={Banknote}
            tone="positive"
            change={collectionChange}
            onClick={open('collections')}
          />
          <CommandKpiCard
            label="المديونيات المستحقة"
            value={commandFormatters.money(receivables.total)}
            hint={`${commandFormatters.count(receivables.overdueCount)} فاتورة متأخرة · ${shortMoney(receivables.overdueTotal)}`}
            icon={Wallet}
            tone={receivables.overdueCount > 0 ? 'warning' : 'default'}
            onClick={open('receivables')}
          />
        </div>
      </section>

      {/* Comparison */}
      <Panel
        title="مقارنة بالفترة السابقة"
        subtitle={`${data.period.label} مقابل ${data.period.previousLabel}`}
        actionLabel="تفاصيل المقارنة"
        onAction={open('comparison')}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { label: 'المبيعات', current: comparison.current.sales, previous: comparison.previous.sales, change: salesChange },
            { label: 'صافي الربح', current: comparison.current.profit, previous: comparison.previous.profit, change: profitChange },
            { label: 'المصروفات', current: comparison.current.expenses, previous: comparison.previous.expenses, change: expenseChange },
            { label: 'التحصيلات', current: comparison.current.collections, previous: comparison.previous.collections, change: collectionChange },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={open('comparison')}
              className="min-w-0 rounded-[2px] border border-[#e5e5e5] bg-[#fafafa] p-2.5 text-right transition hover:border-[#0078d4] dark:border-[#3d3d3d] dark:bg-[#303030]"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[10px] font-semibold text-[#4d4d4d] dark:text-[#c8c8c8]">{item.label}</span>
                {item.change !== null && (
                  <span className={`flex items-center gap-0.5 text-[10px] font-black ${item.change >= 0 ? 'text-[#107c10] dark:text-[#7bd67b]' : 'text-[#c42b1c] dark:text-[#ff9a91]'}`}>
                    {item.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(item.change).toLocaleString('ar-EG', { maximumFractionDigits: 1 })}%
                  </span>
                )}
              </div>
              <div className="mt-1 truncate text-[13px] font-black tabular-nums text-[#1b1b1b] dark:text-[#f0f0f0]">{commandFormatters.money(item.current)}</div>
              <div className="mt-0.5 truncate text-[9px] text-[#767676] dark:text-[#a6a6a6]">السابق: {commandFormatters.money(item.previous)}</div>
            </button>
          ))}
        </div>
      </Panel>

      {/* Liquidity & inventory KPIs */}
      <section aria-labelledby="command-operations-heading">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="command-operations-heading" className="text-[12px] font-extrabold text-[#1b1b1b] dark:text-[#f0f0f0]">السيولة والمخزون والتشغيل</h2>
          <span className="text-[10px] font-semibold text-[#767676] dark:text-[#a6a6a6]">أرصدة لحظية وقيم مخزون حالية</span>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <CommandKpiCard
            label="أرصدة الخزائن والبنوك"
            value={commandFormatters.money(liquidity.total)}
            hint={`نقدية ${shortMoney(liquidity.cashTotal)} · بنوك ${shortMoney(liquidity.bankTotal)}`}
            icon={Landmark}
            tone="info"
            onClick={open('cashBalance')}
          />
          <CommandKpiCard
            label="قيمة المخزون الحالية"
            value={commandFormatters.money(inventory.costValue)}
            hint={`${commandFormatters.count(inventory.productCount)} صنف · ${commandFormatters.numberAr(inventory.totalQuantity)} وحدة`}
            icon={Boxes}
            tone="default"
            onClick={open('inventoryValue')}
          />
          <CommandKpiCard
            label="صافي التدفق النقدي"
            value={commandFormatters.money(cashFlow.net)}
            hint={`داخل ${shortMoney(cashFlow.inflow)} · خارج ${shortMoney(cashFlow.outflow)}`}
            icon={ArrowLeftRight}
            tone={cashFlow.net < 0 ? 'negative' : 'positive'}
            onClick={open('cashFlow')}
          />
          <CommandKpiCard
            label="المشتريات"
            value={commandFormatters.money(sales.purchases)}
            hint={`${commandFormatters.count(sales.purchaseCount)} فاتورة توريد`}
            icon={ShoppingBag}
            tone="warning"
            onClick={open('purchases')}
          />
          <CommandKpiCard
            label="نواقص المخزون"
            value={`${commandFormatters.count(inventory.lowStockCount)} صنف`}
            hint={`${commandFormatters.count(inventory.outOfStockCount)} صنف نفد من المخزن`}
            icon={AlertTriangle}
            tone={inventory.lowStockCount > 0 ? 'negative' : 'positive'}
            onClick={open('lowStock')}
          />
          <CommandKpiCard
            label="الأصناف الراكدة"
            value={`${commandFormatters.count(data.slowMoving.length)} صنف`}
            hint={`قيمة ${shortMoney(slowMovingValue)} بدون بيع ٦٠ يومًا`}
            icon={TrendingDown}
            tone={data.slowMoving.length > 0 ? 'warning' : 'positive'}
            onClick={open('slowMoving')}
          />
        </div>
      </section>

      {/* Trend & cash position */}
      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="اتجاه المبيعات والأرباح"
          subtitle="المبيعات الحالية مقابل الفترة السابقة، مع الربح اليومي من القيود المرحلة"
          actionLabel="فواتير الفترة"
          onAction={open('salesMonth')}
        >
          {data.trend.length === 0 ? <EmptyLine text="لا توجد حركة مبيعات في هذه الفترة" /> : (
            <div className="h-56 w-full min-w-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.trend} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--cerami-chart-grid)" />
                  <XAxis dataKey="label" stroke="var(--cerami-muted)" fontSize={10} tickLine={false} minTickGap={12} />
                  <YAxis stroke="var(--cerami-muted)" fontSize={9} tickLine={false} width={52} tickFormatter={(value: number) => shortMoney(value)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--cerami-tooltip-surface)', borderColor: 'var(--cerami-tooltip-border)', color: 'var(--cerami-text)', borderRadius: '6px', fontSize: '11px' }}
                    formatter={(value: unknown, name: string) => [commandFormatters.money(Number(value)), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Area isAnimationActive={false} type="monotone" dataKey="sales" name="المبيعات" stroke="var(--win-accent)" strokeWidth={2} fill="var(--win-accent)" fillOpacity={0.12} />
                  <Line isAnimationActive={false} type="monotone" dataKey="previousSales" name="الفترة السابقة" stroke="#a6a6a6" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  <Line isAnimationActive={false} type="monotone" dataKey="profit" name="صافي الربح" stroke="#107c10" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="السيولة الحالية" subtitle="أرصدة الخزائن والحسابات البنكية" actionLabel="كل الأرصدة" onAction={open('cashBalance')}>
          <div className="space-y-2">
            <div className="rounded-[2px] border border-[#c7e0f4] bg-[#f0f6fc] p-2.5 dark:border-[#0f3550] dark:bg-[#0f3550]/40">
              <div className="flex items-center justify-between text-[10px] font-semibold text-[#005a9e] dark:text-[#8ec8f5]">
                <span>إجمالي السيولة</span>
                <span className="flex items-center gap-1"><Landmark className="h-3 w-3" />{liquidity.cashAccounts.length} حساب</span>
              </div>
              <div className="mt-1 text-base font-black tabular-nums text-[#005a9e] dark:text-[#8ec8f5]">{commandFormatters.money(liquidity.total)}</div>
            </div>
            {liquidity.cashAccounts.length === 0 ? <EmptyLine text="لا توجد خزائن أو حسابات بنكية متاحة" /> : liquidity.cashAccounts.slice(0, 4).map((account) => (
              <button key={account.id} type="button" onClick={open('cashBalance')} className="flex w-full items-center justify-between gap-2 border-b border-[#f0f0f0] py-1.5 text-right last:border-0 dark:border-[#3d3d3d]">
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-bold text-[#1b1b1b] dark:text-[#f0f0f0]">{account.name}</span>
                  <span className="block truncate text-[9px] text-[#767676] dark:text-[#a6a6a6]">{account.type === 'cash' ? 'خزينة' : 'بنك'} · {account.branchName}</span>
                </span>
                <span className={`shrink-0 tabular-nums text-[11px] font-black ${account.balance < 0 ? 'text-[#c42b1c] dark:text-[#ff9a91]' : 'text-[#107c10] dark:text-[#7bd67b]'}`}>
                  {commandFormatters.money(account.balance)}
                </span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      {/* Branches & employees */}
      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="أفضل الفروع أداءً" subtitle="المبيعات والربح الإجمالي لكل فرع" actionLabel="كل الفروع" onAction={open('branches')}>
          {data.branches.length === 0 ? <EmptyLine text="لا توجد فروع متاحة" /> : (
            <div className="space-y-2">
              {data.branches.slice(0, 5).map((branch) => (
                <button key={branch.branchId} type="button" onClick={open('branches')} className="w-full text-right">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex min-w-0 items-center gap-1.5 font-bold text-[#1b1b1b] dark:text-[#f0f0f0]"><Building2 className="h-3 w-3 text-[#0078d4]" /><span className="truncate">{branch.name}</span></span>
                    <span className="shrink-0 tabular-nums font-black text-[#0067b8] dark:text-[#8ec8f5]">{commandFormatters.money(branch.sales)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0f0] dark:bg-[#3d3d3d]">
                    <div className="h-full rounded-full bg-[#0078d4]" style={{ width: `${Math.max(2, (branch.sales / maxBranchSales) * 100)}%` }} />
                  </div>
                  <div className="mt-0.5 flex justify-between text-[9px] text-[#767676] dark:text-[#a6a6a6]">
                    <span>{commandFormatters.count(branch.invoices)} فاتورة</span>
                    <span>ربح {shortMoney(branch.grossProfit)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="المبيعات حسب الموظف" subtitle="أداء مندوبي وموظفي البيع" actionLabel="كل الموظفين" onAction={open('employees')}>
          {data.employees.length === 0 ? <EmptyLine text="لا توجد مبيعات مسجلة على موظفين" /> : (
            <div className="space-y-2">
              {data.employees.slice(0, 5).map((employee) => (
                <button key={employee.key} type="button" onClick={open('employees')} className="w-full text-right">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex min-w-0 items-center gap-1.5 font-bold text-[#1b1b1b] dark:text-[#f0f0f0]"><Users className="h-3 w-3 text-[#107c10]" /><span className="truncate">{employee.name}</span></span>
                    <span className="shrink-0 tabular-nums font-black text-[#107c10] dark:text-[#7bd67b]">{commandFormatters.money(employee.sales)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0f0] dark:bg-[#3d3d3d]">
                    <div className="h-full rounded-full bg-[#107c10]" style={{ width: `${Math.max(2, (employee.sales / maxEmployeeSales) * 100)}%` }} />
                  </div>
                  <div className="mt-0.5 flex justify-between text-[9px] text-[#767676] dark:text-[#a6a6a6]">
                    <span>{commandFormatters.count(employee.invoices)} فاتورة</span>
                    <span>ربح {shortMoney(employee.grossProfit)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Products */}
      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="الأصناف الأكثر مبيعًا" subtitle="أعلى الأصناف إيرادًا خلال الفترة" actionLabel="كل الأصناف" onAction={open('topProducts')}>
          {data.topProducts.length === 0 ? <EmptyLine text="لا توجد مبيعات أصناف في الفترة" /> : (
            <div className="space-y-1.5">
              {data.topProducts.slice(0, 5).map((product, index) => (
                <button key={product.productId} type="button" onClick={open('topProducts')} className="flex w-full items-center gap-2 border-b border-[#f0f0f0] py-1.5 text-right last:border-0 dark:border-[#3d3d3d]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#eef6fd] text-[9px] font-black text-[#0067b8] dark:bg-[#0f3550] dark:text-[#8ec8f5]">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-bold text-[#1b1b1b] dark:text-[#f0f0f0]">{product.name}</span>
                    <span className="block text-[9px] text-[#767676] dark:text-[#a6a6a6]">{commandFormatters.numberAr(product.quantity)} · ربح {shortMoney(product.profit)}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-[11px] font-black text-[#0067b8] dark:text-[#8ec8f5]">{commandFormatters.money(product.revenue)}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="الأصناف الراكدة" subtitle="أصناف لديها رصيد ولم تُبع خلال ٦٠ يومًا" actionLabel="كل الأصناف الراكدة" onAction={open('slowMoving')}>
          {data.slowMoving.length === 0 ? <EmptyLine text="لا توجد أصناف راكدة" /> : (
            <div className="space-y-1.5">
              {data.slowMoving.slice(0, 5).map((product) => (
                <button key={product.productId} type="button" onClick={open('slowMoving')} className="flex w-full items-center gap-2 border-b border-[#f0f0f0] py-1.5 text-right last:border-0 dark:border-[#3d3d3d]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"><Package className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-bold text-[#1b1b1b] dark:text-[#f0f0f0]">{product.name}</span>
                    <span className="block text-[9px] text-[#767676] dark:text-[#a6a6a6]">
                      رصيد {commandFormatters.numberAr(product.stockQty)} · {product.lastSaleDate ? `آخر بيع ${product.lastSaleDate}` : 'لم يُبع مطلقًا'}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-[11px] font-black text-amber-700 dark:text-amber-300">{commandFormatters.money(product.stockValue)}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Cash flow & alerts */}
      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="مؤشرات التدفق النقدي" subtitle="التحصيلات مقابل المصروفات والمدفوعات" actionLabel="تفاصيل التدفق" onAction={open('cashFlow')}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" onClick={open('cashInflow')} className="rounded-[2px] border border-emerald-200 bg-emerald-50 p-2.5 text-right dark:border-emerald-900 dark:bg-emerald-950/30">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300"><TrendingUp className="h-3.5 w-3.5" />التدفق الداخل</div>
              <div className="mt-1 truncate text-sm font-black tabular-nums text-emerald-700 dark:text-emerald-300">{commandFormatters.money(cashFlow.inflow)}</div>
            </button>
            <button type="button" onClick={open('cashOutflow')} className="rounded-[2px] border border-rose-200 bg-rose-50 p-2.5 text-right dark:border-rose-900 dark:bg-rose-950/30">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-700 dark:text-rose-300"><TrendingDown className="h-3.5 w-3.5" />التدفق الخارج</div>
              <div className="mt-1 truncate text-sm font-black tabular-nums text-rose-700 dark:text-rose-300">{commandFormatters.money(cashFlow.outflow)}</div>
            </button>
            <button type="button" onClick={open('cashFlow')} className={`rounded-[2px] border p-2.5 text-right ${cashFlow.net >= 0 ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30'}`}>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#4d4d4d] dark:text-[#c8c8c8]"><Activity className="h-3.5 w-3.5" />الصافي</div>
              <div className={`mt-1 truncate text-sm font-black tabular-nums ${cashFlow.net >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{commandFormatters.money(cashFlow.net)}</div>
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <div className="flex items-center justify-between rounded-[2px] bg-[#fafafa] px-2.5 py-1.5 text-[10px] dark:bg-[#303030]">
              <span className="text-[#4d4d4d] dark:text-[#c8c8c8]">المصروفات</span>
              <span className="font-bold tabular-nums text-[#9d5d00] dark:text-[#f0bb63]">{shortMoney(cashFlow.expenses)}</span>
            </div>
            <div className="flex items-center justify-between rounded-[2px] bg-[#fafafa] px-2.5 py-1.5 text-[10px] dark:bg-[#303030]">
              <span className="text-[#4d4d4d] dark:text-[#c8c8c8]">مدفوعات التوريد</span>
              <span className="font-bold tabular-nums text-[#9d5d00] dark:text-[#f0bb63]">{shortMoney(cashFlow.purchasesPaid)}</span>
            </div>
            <div className="flex items-center justify-between rounded-[2px] bg-[#fafafa] px-2.5 py-1.5 text-[10px] dark:bg-[#303030]">
              <span className="text-[#4d4d4d] dark:text-[#c8c8c8]">سداد موردين سابق</span>
              <span className="font-bold tabular-nums text-[#9d5d00] dark:text-[#f0bb63]">{shortMoney(cashFlow.supplierPayments)}</span>
            </div>
          </div>
        </Panel>

        <Panel title="تنبيهات تحتاج متابعة" subtitle="فواتير متأخرة ونواقص مخزون" actionLabel="كل التنبيهات" onAction={open('overdueInvoices')}>
          <div className="space-y-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-rose-700 dark:text-rose-300">
                <span>فواتير متأخرة</span>
                <span>{commandFormatters.count(receivables.overdueCount)}</span>
              </div>
              {data.alerts.overdueInvoices.length === 0 ? (
                <p className="text-[10px] text-[#767676] dark:text-[#a6a6a6]">لا توجد فواتير متأخرة.</p>
              ) : data.alerts.overdueInvoices.slice(0, 3).map((invoice) => (
                <button key={invoice.id} type="button" onClick={open('overdueInvoices')} className="flex w-full items-center justify-between gap-2 border-b border-[#f0f0f0] py-1 text-right last:border-0 dark:border-[#3d3d3d]">
                  <span className="min-w-0">
                    <span className="block truncate text-[10px] font-bold text-[#1b1b1b] dark:text-[#f0f0f0]">{invoice.invoiceNumber} · {invoice.customer}</span>
                    <span className="block text-[9px] text-rose-600 dark:text-rose-300">متأخرة {commandFormatters.count(invoice.daysOverdue)} يوم</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-[10px] font-black text-rose-700 dark:text-rose-300">{shortMoney(invoice.remaining)}</span>
                </button>
              ))}
            </div>
            <div className="border-t border-[#d9d9d9] pt-2 dark:border-[#3d3d3d]">
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-amber-700 dark:text-amber-300">
                <span>نواقص المخزون</span>
                <span>{commandFormatters.count(inventory.lowStockCount)}</span>
              </div>
              {data.alerts.lowStock.length === 0 ? (
                <p className="text-[10px] text-[#767676] dark:text-[#a6a6a6]">المخزون بمستوى آمن.</p>
              ) : data.alerts.lowStock.slice(0, 3).map((item) => (
                <button key={`${item.productId}-${item.warehouse}`} type="button" onClick={open('lowStock')} className="flex w-full items-center justify-between gap-2 border-b border-[#f0f0f0] py-1 text-right last:border-0 dark:border-[#3d3d3d]">
                  <span className="min-w-0">
                    <span className="block truncate text-[10px] font-bold text-[#1b1b1b] dark:text-[#f0f0f0]">{item.name}</span>
                    <span className="block truncate text-[9px] text-[#767676] dark:text-[#a6a6a6]">{item.warehouse}</span>
                  </span>
                  <span className={`shrink-0 tabular-nums text-[10px] font-black ${item.quantity <= 0 ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>
                    {item.quantity <= 0 ? 'نفد' : `${commandFormatters.numberAr(item.quantity)} / ${commandFormatters.numberAr(item.minLevel)}`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <DrilldownModal
        open={drilldownKey !== null}
        result={drilldown}
        loading={drilldownLoading}
        error={drilldownError}
        onClose={closeDrilldown}
        onRetry={() => { if (drilldownKey) void openDrilldown(drilldownKey); }}
      />
    </div>
  );
};

export default ExecutiveCommandCenter;
