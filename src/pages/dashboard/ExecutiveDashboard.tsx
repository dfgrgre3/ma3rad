import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp, DollarSign, ShoppingCart, Package,
  AlertTriangle, ArrowUpRight, ArrowDownRight, Clock
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { DatabaseManager } from '../../database/db';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';

import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface KPI {
  label: string;
  value: string;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

interface DailySale { day: string; sales: number; profit: number }
interface TopProduct { name: string; qty: number; revenue: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }
interface RecentInvoice { id: string; customer: string; amount: number; date: string; status: string }
interface DebtCustomer { name: string; debt: number }
interface LowStockItem { name: string; warehouse: string; qty: number; min: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }

type DateRange = 'today' | 'week' | 'month' | 'year';

// ─── Color Palette ─────────────────────────────────────────────────────────────
const CHART_COLORS = ['#38bdf8', '#818cf8', '#34d399', '#fb923c', '#f472b6'];

// ─── Executive Dashboard ───────────────────────────────────────────────────────
export const ExecutiveDashboard: React.FC = () => {
  const [range, setRange] = useState<DateRange>('month');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [dailySales, setDailySales] = useState<DailySale[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);
  const [debtCustomers, setDebtCustomers] = useState<DebtCustomer[]>([]);
  const [branchData, setBranchData] = useState<{ name: string; value: number }[]>([]);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const getRangeDates = () => {
    const now = new Date();
    switch (range) {
      case 'today':
        return { from: startOfDay(now), to: endOfDay(now) };
      case 'week':
        return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
      case 'month':
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case 'year':
        return {
          from: new Date(now.getFullYear(), 0, 1),
          to: new Date(now.getFullYear(), 11, 31, 23, 59, 59),
        };
    }
  };

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const db = DatabaseManager.getInstance().getDatabase();
      if (!db) return;

      const { from, to } = getRangeDates();
      const fromStr = format(from, 'yyyy-MM-dd');
      const toStr = format(to, 'yyyy-MM-dd');
      const today = format(new Date(), 'yyyy-MM-dd');
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

      // ── KPIs ──────────────────────────────────────────────────────────────────
      const salesRow = db.exec(
        `SELECT COALESCE(SUM(subtotal - discount_amount),0) as total, COALESCE(SUM(gross_profit), 0) as profit
         FROM sales_invoices WHERE date BETWEEN ? AND ? AND invoice_status != 'VOID'`,
        [fromStr, toStr]
      );
      const returnsRow = db.exec(
        `SELECT COALESCE(SUM(sr.total_amount - CASE WHEN si.total_amount > 0
           THEN ROUND(sr.total_amount * COALESCE(si.tax_amount,0) / si.total_amount,2) ELSE 0 END),0)
         FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id
         WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'`, [fromStr, toStr]
      );
      const returnedCostRow = db.exec(
        `SELECT COALESCE(SUM(sri.quantity_m2 * sri.unit_cost),0)
         FROM sales_return_items sri JOIN sales_returns sr ON sr.id=sri.return_id
         JOIN sales_invoices si ON si.id=sr.original_invoice_id
         WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'`, [fromStr, toStr]
      );
      const netReturns = Number(returnsRow[0]?.values[0]?.[0] ?? 0);
      const returnedCost = Number(returnedCostRow[0]?.values[0]?.[0] ?? 0);
      const total = Number(salesRow[0]?.values[0]?.[0] ?? 0) - netReturns;
      const profit = Number(salesRow[0]?.values[0]?.[1] ?? 0) - netReturns + returnedCost;

      const yesterdayRow = db.exec(
        `SELECT COALESCE((SELECT SUM(subtotal-discount_amount) FROM sales_invoices
           WHERE date=? AND invoice_status!='VOID'),0) - COALESCE((SELECT SUM(sr.total_amount -
             CASE WHEN si.total_amount>0 THEN ROUND(sr.total_amount*COALESCE(si.tax_amount,0)/si.total_amount,2) ELSE 0 END)
           FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id
           WHERE sr.date=? AND si.invoice_status!='VOID'),0)`, [yesterday, yesterday]
      );
      const todayRow = db.exec(
        `SELECT COALESCE((SELECT SUM(subtotal-discount_amount) FROM sales_invoices
           WHERE date=? AND invoice_status!='VOID'),0) - COALESCE((SELECT SUM(sr.total_amount -
             CASE WHEN si.total_amount>0 THEN ROUND(sr.total_amount*COALESCE(si.tax_amount,0)/si.total_amount,2) ELSE 0 END)
           FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id
           WHERE sr.date=? AND si.invoice_status!='VOID'),0)`, [today, today]
      );
      const todaySales = todayRow[0]?.values[0]?.[0] as number ?? 0;
      const yesterdaySales = yesterdayRow[0]?.values[0]?.[0] as number ?? 0;
      const salesTrend = yesterdaySales > 0
        ? (((todaySales - yesterdaySales) / yesterdaySales) * 100).toFixed(1)
        : '0';

      const debtRow = db.exec(
        `SELECT COALESCE(SUM(current_balance),0) FROM customers WHERE current_balance > 0`
      );
      const totalDebt = debtRow[0]?.values[0]?.[0] as number ?? 0;

      const purchaseRow = db.exec(
        `SELECT COALESCE(SUM(total_amount),0) FROM purchase_invoices
         WHERE date BETWEEN ? AND ?`,
        [fromStr, toStr]
      );
      const totalPurchasesRow = db.exec(
        `SELECT COALESCE(SUM(total_amount),0) FROM purchase_invoices WHERE date BETWEEN ? AND ? AND invoice_status != 'VOID'`,
        [fromStr, toStr]
      );
      const totalPurchases = totalPurchasesRow[0]?.values[0]?.[0] as number ?? 0;

      const purchaseRows = db.exec(
        `SELECT id, date, supplier_id, total_amount, payment_status, created_at, currency_rate
         FROM purchase_invoices WHERE date BETWEEN ? AND ? AND invoice_status != 'VOID'
         ORDER BY created_at ASC`,
        [fromStr, toStr]
      );
      const supplierById = new Map<string, string>();
      const rowsForTrend: Array<{date: string; total: number; count: number}> = [];
      let purchasesTotal = 0;
      let purchasesCount = 0;
      for (const row of purchaseRows[0]?.values ?? []) {
        const [pid, pdate, psupplierId, ptotalAmount, ppaymentStatus, pcreatedAt, pcurrencyRate] = row;
        supplierById.set(String(psupplierId), String(psupplierId));
        purchasesTotal += Number(ptotalAmount) || 0;
        purchasesCount += 1;
        rowsForTrend.push({ date: String(pdate), total: Number(ptotalAmount) || 0, count: 1 });
      }


      const receivedRow = db.exec(
        `SELECT COALESCE(SUM(amount),0) FROM customer_payments
         WHERE date BETWEEN ? AND ?`,
        [fromStr, toStr]
      );
      const totalReceived = receivedRow[0]?.values[0]?.[0] as number ?? 0;

      const invoiceCountRow = db.exec(
        `SELECT COUNT(*) FROM sales_invoices WHERE date BETWEEN ? AND ? AND invoice_status != 'VOID'`,
        [fromStr, toStr]
      );
      const invoiceCount = invoiceCountRow[0]?.values[0]?.[0] as number ?? 0;

      const margin = total > 0 ? ((profit / total) * 100).toFixed(1) : '0';


      setKpis([
        {
          label: 'إجمالي المبيعات',
          value: formatCurrency(total),
          sub: `${invoiceCount} فاتورة`,
          trend: parseFloat(salesTrend) >= 0 ? 'up' : 'down',
          trendValue: `${salesTrend}% مقارنة بالأمس`,
          icon: ShoppingCart,
          color: 'text-sky-600',
          bg: 'bg-sky-500/10 border-sky-500/20',
        },
        {
          label: 'صافي الربح',
          value: formatCurrency(profit),
          sub: `هامش ${margin}%`,
          trend: profit >= 0 ? 'up' : 'down',
          icon: TrendingUp,
          color: 'text-emerald-600',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
        },
        {
          label: 'المقبوضات',
          value: formatCurrency(totalReceived),
          sub: 'نقدي وشبكة',
          trend: 'neutral',
          icon: DollarSign,
          color: 'text-violet-600',
          bg: 'bg-violet-500/10 border-violet-500/20',
        },
        {
          label: 'المشتريات',
          value: formatCurrency(totalPurchases),
          sub: 'بضاعة واردة',
          trend: 'neutral',
          icon: Package,
          color: 'text-amber-600',
          bg: 'bg-amber-500/10 border-amber-500/20',
        },
        {
          label: 'الديون المستحقة',
          value: formatCurrency(totalDebt),
          sub: 'ذمم العملاء',
          trend: totalDebt > 50000 ? 'down' : 'neutral',
          icon: AlertTriangle,
          color: 'text-rose-600',
          bg: 'bg-rose-500/10 border-rose-500/20',
        },
      ]);

      // ── Daily Sales Chart (last 30 days) ─────────────────────────────────────
      const days30From = format(subDays(new Date(), 29), 'yyyy-MM-dd');
      const salesByDayRow = db.exec(
        `SELECT date as day,
                COALESCE(SUM(subtotal-discount_amount),0) as sales,
                COALESCE(SUM(gross_profit),0) as profit
         FROM sales_invoices
         WHERE date >= ? AND invoice_status != 'VOID'
         GROUP BY date
         ORDER BY day ASC`,
        [days30From]
      );

      const salesMap: Record<string, { sales: number; profit: number }> = {};
      if (salesByDayRow[0]) {
        salesByDayRow[0].values.forEach((row: any[]) => {
          const [d, s, p] = row;
          salesMap[d as string] = { sales: s as number, profit: p as number };
        });
      }

      const returnByDayRow = db.exec(
        `SELECT sr.date,
                SUM(sr.total_amount - CASE WHEN si.total_amount>0
                  THEN ROUND(sr.total_amount*COALESCE(si.tax_amount,0)/si.total_amount,2) ELSE 0 END) AS revenue,
                (SELECT COALESCE(SUM(sri.quantity_m2*sri.unit_cost),0)
                 FROM sales_return_items sri WHERE sri.return_id=sr.id) AS returnedCost
         FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id
         WHERE sr.date>=? AND si.invoice_status!='VOID' GROUP BY sr.id`,
        [days30From]
      );
      if (returnByDayRow[0]) {
        returnByDayRow[0].values.forEach((row: any[]) => {
          const [date, revenue, returnedCost] = row;
          const key = date as string;
          if (!salesMap[key]) salesMap[key] = { sales: 0, profit: 0 };
          salesMap[key].sales -= Number(revenue || 0);
          salesMap[key].profit += Number(returnedCost || 0) - Number(revenue || 0);
        });
      }

      const dailyData: DailySale[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
        const label = format(subDays(new Date(), i), 'd/M');
        dailyData.push({
          day: label,
          sales: salesMap[d]?.sales ?? 0,
          profit: salesMap[d]?.profit ?? 0,
        });
      }
      setDailySales(dailyData);

      // ── Top Products ──────────────────────────────────────────────────────────
      const topProdRow = db.exec(
        `WITH activity AS (
           SELECT p.id, p.name, p.product_type, p.base_unit, p.custom_unit,
             sii.quantity_m2 AS qty,
             sii.total_price - CASE WHEN si.subtotal > 0
               THEN si.discount_amount * sii.total_price / si.subtotal ELSE 0 END AS revenue
           FROM sales_invoice_items sii
           JOIN products p ON p.id=sii.product_id
           JOIN sales_invoices si ON si.id=sii.invoice_id
           WHERE si.date BETWEEN ? AND ? AND si.invoice_status!='VOID'
           UNION ALL
           SELECT p.id, p.name, p.product_type, p.base_unit, p.custom_unit,
             -sri.quantity_m2 AS qty,
             -sri.total_refund + CASE WHEN sr.total_amount>0 AND si.total_amount>0
               THEN ROUND(sr.total_amount*COALESCE(si.tax_amount,0)/si.total_amount,2)
                 * sri.total_refund / sr.total_amount ELSE 0 END AS revenue
           FROM sales_return_items sri
           JOIN sales_returns sr ON sr.id=sri.return_id
           JOIN sales_invoices si ON si.id=sr.original_invoice_id
           JOIN products p ON p.id=sri.product_id
           WHERE sr.date BETWEEN ? AND ? AND si.invoice_status!='VOID'
         )
         SELECT name, product_type, base_unit, custom_unit, SUM(qty) AS qty, SUM(revenue) AS revenue
         FROM activity GROUP BY id ORDER BY revenue DESC LIMIT 6`,
        [fromStr, toStr, fromStr, toStr]
      );
      const topProdsData: TopProduct[] = topProdRow[0]?.values.map((row: any[]) => {
        const [n, productType, baseUnit, customUnit, q, r] = row;
        return {
          name: String(n).slice(0, 20),
          qty: Math.round(Number(q)),
          revenue: Number(r),
          productType: String(productType) as 'CERAMIC' | 'GENERAL',
          baseUnit: String(baseUnit || ''),
          customUnit: customUnit ? String(customUnit) : undefined,
        };
      }) ?? [];
      setTopProducts(topProdsData);

      // ── Recent Invoices ───────────────────────────────────────────────────────
      const recentRow = db.exec(
        `SELECT si.invoice_number, COALESCE(c.name,'عميل نقدي') as cname,
                si.total_amount, si.created_at, si.payment_status
         FROM sales_invoices si
         LEFT JOIN customers c ON c.id = si.customer_id
         WHERE si.invoice_status != 'VOID'
         ORDER BY si.created_at DESC LIMIT 8`
      );
      const recentData: RecentInvoice[] = recentRow[0]?.values.map((row: any[]) => {
        const [id, c, a, d, s] = row;
        return {
          id: String(id),
          customer: String(c),
          amount: Number(a),
          date: format(new Date(String(d)), 'dd/MM HH:mm'),
          status: String(s),
        };
      }) ?? [];
      setRecentInvoices(recentData);

      // ── Top Debt Customers ────────────────────────────────────────────────────
      const debtCustRow = db.exec(
        `SELECT name, current_balance FROM customers WHERE current_balance > 0 ORDER BY current_balance DESC LIMIT 5`
      );
      const debtData: DebtCustomer[] = debtCustRow[0]?.values.map((row: any[]) => {
        const [n, b] = row;
        return {
          name: String(n),
          debt: Number(b),
        };
      }) ?? [];
      setDebtCustomers(debtData);

      // Branch sales from recorded invoices.
      const branchRow = db.exec(
        `WITH activity AS (
          SELECT warehouse_id, subtotal-discount_amount AS revenue
          FROM sales_invoices WHERE date BETWEEN ? AND ? AND invoice_status!='VOID'
          UNION ALL
          SELECT sr.warehouse_id, -(sr.total_amount - CASE WHEN si.total_amount>0
            THEN ROUND(sr.total_amount*COALESCE(si.tax_amount,0)/si.total_amount,2) ELSE 0 END)
          FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id
          WHERE sr.date BETWEEN ? AND ? AND si.invoice_status!='VOID'
        )
        SELECT COALESCE(w.name,'غير محدد') AS branch, COALESCE(SUM(a.revenue),0) AS total
        FROM activity a LEFT JOIN warehouses w ON w.id=a.warehouse_id
        GROUP BY w.id ORDER BY total DESC LIMIT 5`,
        [fromStr, toStr, fromStr, toStr]
      );
      const branchSales: { name: string; value: number }[] = branchRow[0]?.values.map((row: any[]) => {
        const [n, v] = row;
        return {
          name: String(n),
          value: Math.round(Number(v)),
        };
      }) ?? [];
      setBranchData(branchSales);

      // ── Low Stock Alerts ─────────────────────────────────────────────────────
      const lowStockRow = db.exec(
        `SELECT p.name, COALESCE(w.name,'-') as warehouse,
                COALESCE(ws.quantity_m2, 0) as qty, p.min_stock_level,
                p.product_type, p.base_unit, p.custom_unit
         FROM warehouse_stock ws
         JOIN products p ON ws.product_id = p.id
         JOIN warehouses w ON w.id = ws.warehouse_id
         WHERE p.is_active = 1 AND p.min_stock_level > 0
           AND ws.quantity_m2 <= p.min_stock_level
         ORDER BY ws.quantity_m2 ASC
         LIMIT 8`
      );
      const lowStockData: LowStockItem[] = lowStockRow[0]?.values.map((row: any[]) => {
        const [n, w, q, m, productType, baseUnit, customUnit] = row;
        return {
          name: String(n),
          warehouse: String(w),
          qty: Number(q),
          min: Number(m),
          productType: String(productType) as 'CERAMIC' | 'GENERAL',
          baseUnit: String(baseUnit || ''),
          customUnit: customUnit ? String(customUnit) : undefined,
        };
      }) ?? [];
      setLowStock(lowStockData);

      setLastRefresh(new Date());
    } catch (e) {
      console.error('Executive Dashboard error:', e);
      setLoadError(e instanceof Error ? e.message : 'تعذر تحميل بيانات لوحة المؤشرات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('ar-EG', { style: 'decimal', maximumFractionDigits: 0 }).format(n) + ' ج';

  const paymentStatusLabel: Record<string, { label: string; cls: string }> = {
    PAID:        { label: 'مدفوع', cls: 'bg-emerald-500/20 text-emerald-600' },
    PARTIAL:     { label: 'جزئي', cls: 'bg-amber-500/20 text-amber-600' },
    UNPAID:      { label: 'آجل', cls: 'bg-rose-500/20 text-rose-600' },
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto bg-slate-50 text-slate-900 p-5 space-y-5" dir="rtl">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900">لوحة المعلومات التنفيذية</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            آخر تحديث: {format(lastRefresh, 'HH:mm:ss')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Range Pills */}
          {([
            { id: 'today', label: 'اليوم' },
            { id: 'week', label: 'الأسبوع' },
            { id: 'month', label: 'الشهر' },
            { id: 'year', label: 'السنة' },
          ] as { id: DateRange; label: string }[]).map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
 range === r.id
 ? 'bg-sky-600 text-slate-900 shadow-md shadow-sky-600/25'
 : 'bg-slate-100 hover:bg-slate-200 hover:text-slate-900'
 }`}
            >
              {r.label}
            </button>
          ))}

          {/* Refresh */}
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition disabled:cursor-not-allowed disabled:opacity-50"
            title="تحديث"
          >
            تحديث
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600 animate-bounce" />
            <p className="text-sm text-slate-500">جاري تحميل البيانات...</p>
          </div>
        </div>
      ) : (
        <>
          {loadError && (
            <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              تعذر تحميل بعض المؤشرات: {loadError}
            </div>
          )}
          {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div
                  key={kpi.label}
                  className={`rounded-xl border p-4 ${kpi.bg} flex flex-col gap-2`}
                >
                  <div className="flex items-center justify-between">
                    <Icon className={`w-5 h-5 ${kpi.color}`} />
                    {kpi.trend === 'up' && (
                      <div className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold">
                        <ArrowUpRight className="w-3 h-3" />
                        {kpi.trendValue}
                      </div>
                    )}
                    {kpi.trend === 'down' && (
                      <div className="flex items-center gap-1 text-rose-600 text-[10px] font-bold">
                        <ArrowDownRight className="w-3 h-3" />
                        {kpi.trendValue}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xl font-black text-slate-900 leading-tight">{kpi.value}</div>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5">{kpi.label}</div>
                    {kpi.sub && <div className="text-[10px] text-slate-500 mt-0.5">{kpi.sub}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Charts Row ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Sales Line Chart — 2/3 width */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-4">المبيعات والأرباح — آخر 30 يوم</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={dailySales} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} interval={4} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(val: number) => [formatCurrency(val)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
                  <Line type="monotone" dataKey="sales" name="مبيعات" stroke="#38bdf8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="profit" name="ربح" stroke="#34d399" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Branch Pie — 1/3 width */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-4">توزيع المبيعات بالفروع</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={branchData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {branchData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                    formatter={(val: number) => [formatCurrency(val)]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1">
                {branchData.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-slate-500 truncate">{b.name}</span>
                    <span className="text-slate-700 font-semibold mr-auto">{formatCurrency(b.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Low Stock Alerts ─────────────────────────────────────────────────── */}
          {lowStock.length > 0 && (
            <div className="bg-white rounded-xl border border-rose-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <h3 className="text-sm font-bold text-slate-900">تنبيهات المخزون</h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-600">
                    {lowStock.length} صنف
                  </span>
                </div>
                <span className="text-[10px] text-slate-500">أصناف وصلت إلى الحد الأدنى أو نفدت</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                {lowStock.map((item, i) => {
                  const out = item.qty <= 0;
                  const pct = item.min > 0 ? Math.min(100, (item.qty / item.min) * 100) : 0;
                  return (
                    <div key={i} className="flex items-center gap-2 py-1 border-b border-slate-100 last:border-0">
                      <div className={`w-1.5 h-8 rounded-full shrink-0 ${out ? 'bg-rose-600' : 'bg-amber-500'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">{item.name}</div>
                        <div className="text-[10px] text-slate-500 truncate">{item.warehouse}</div>
                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
                          <div
                            className={`h-full rounded-full transition-all ${out ? 'bg-rose-600' : 'bg-amber-500'}`}
                            style={{ width: `${out ? 100 : pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <div className={`text-xs font-bold ${out ? 'text-rose-600' : 'text-amber-600'}`}>
                          {out ? 'نفد' : formatProductQuantity(item.qty, item)}
                        </div>
                        <div className="text-[10px] text-slate-500">الحد: {formatProductQuantity(item.min, item)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Bottom Tables Row ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Top Products Bar Chart */}
            <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-4">أكثر المنتجات مبيعاً</h3>
              {topProducts.length === 0 ? (
                <div className="text-center text-slate-500 text-sm py-8">لا توجد بيانات</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topProducts} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} width={90} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                      formatter={(val: number) => [formatCurrency(val)]}
                    />
                    <Bar dataKey="revenue" name="الإيراد" fill="#818cf8" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Recent Invoices */}
            <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3">آخر الفواتير</h3>
              <div className="space-y-2">
                {recentInvoices.length === 0 ? (
                  <p className="text-slate-500 text-xs text-center py-6">لا توجد فواتير</p>
                ) : recentInvoices.map((inv) => {
                  const statusInfo = paymentStatusLabel[inv.status] ?? { label: inv.status, cls: 'bg-slate-200 text-slate-700' };
                  return (
                    <div key={inv.id} className="flex items-center gap-2 py-1.5 border-b border-slate-200 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">{inv.customer}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />{inv.date}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-sky-600">{formatCurrency(inv.amount)}</div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${statusInfo.cls}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Debt Customers */}
            <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">أعلى الديون</h3>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <div className="space-y-2.5">
                {debtCustomers.length === 0 ? (
                  <p className="text-slate-500 text-xs text-center py-6">✓ لا توجد ديون</p>
                ) : debtCustomers.map((c, i) => {
                  const maxDebt = debtCustomers[0]?.debt ?? 1;
                  const pct = (c.debt / maxDebt) * 100;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-700 font-medium truncate">{c.name}</span>
                        <span className="text-rose-600 font-bold shrink-0 mr-2">{formatCurrency(c.debt)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rose-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
