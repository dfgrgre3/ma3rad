import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Download, CalendarDays, Users,
  Package, MapPin, Award, Loader2, AlertCircle, RefreshCw, Filter,
  ShoppingCart, Percent, DollarSign, ArrowUpRight, ArrowDownRight, Star, Scale,
} from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { localDateString } from '../../utils/date';
import { exportToExcel } from '../../utils/export';
import { useToast } from '../../components/ui/Toast';
import { SalesFinancialReconciliation } from '../../components/reports/SalesFinancialReconciliation';
import { BranchAccessService } from '../../services/BranchAccessService';

const db = DatabaseManager.getInstance();
const branchAccess = new BranchAccessService();
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n || 0);
const fmtM = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + 'م' : n >= 1000 ? (n / 1000).toFixed(1) + 'ك' : fmt(n);
const today = () => localDateString();
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const yearStart = () => `${new Date().getFullYear()}-01-01`;

interface SalesRow { label: string; revenue: number; cost: number; profit: number; count: number; margin: number; customers?: number }
interface DailyRow { date: string; revenue: number; invoiceCount: number; returnCount: number }

export type ReportType = 'by_category' | 'by_product' | 'by_customer' | 'by_city' | 'by_user' | 'daily';

const REPORT_TYPES: { id: ReportType; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'by_category',  label: 'حسب الفئة',      icon: BarChart3,    color: 'sky' },
  { id: 'by_product',   label: 'حسب المنتج',      icon: Package,      color: 'violet' },
  { id: 'by_customer',  label: 'حسب العميل',      icon: Users,        color: 'emerald' },
  { id: 'by_city',      label: 'حسب المنطقة',     icon: MapPin,       color: 'amber' },
  { id: 'by_user',      label: 'حسب المندوب',     icon: Award,        color: 'orange' },
  { id: 'daily',        label: 'تقرير يومي',      icon: CalendarDays, color: 'pink' },
];

const COLOR_MAP: Record<string, string> = {
  sky: 'bg-sky-50 text-sky-600 border-sky-200',
  violet: 'bg-violet-50 text-violet-600 border-violet-200',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  amber: 'bg-amber-50 text-amber-600 border-amber-200',
  orange: 'bg-orange-50 text-orange-600 border-orange-200',
  pink: 'bg-pink-50 text-pink-600 border-pink-200',
};
const BAR_COLOR_MAP: Record<string, string> = {
  sky: 'bg-sky-500', violet: 'bg-violet-500', emerald: 'bg-emerald-500',
  amber: 'bg-amber-500', orange: 'bg-orange-500', pink: 'bg-pink-500',
};

export function loadReport(type: ReportType, from: string, to: string): SalesRow[] | DailyRow[] {
  // Every sales report row is branch-scoped; invoices are the branch anchor and
  // returns inherit the branch of the invoice they belong to.
  const scope = branchAccess.sqlScope(
    'si.branch_id',
    '(SELECT bw.branch_id FROM warehouses bw WHERE bw.id = si.warehouse_id)'
  );
  const params = [from, to, ...scope.params, from, to, ...scope.params];

  if (type === 'daily') {
    const rows = db.query<any>(`
      WITH activity AS (
        SELECT si.date, si.id AS invoiceId, NULL AS returnId,
          si.subtotal - si.discount_amount AS revenue
        FROM sales_invoices si
        WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
        UNION ALL
        SELECT sr.date, NULL AS invoiceId, sr.id AS returnId,
          -(sr.total_amount - CASE WHEN si.total_amount > 0
            THEN ROUND(sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2)
            ELSE 0 END) AS revenue
        FROM sales_returns sr
        JOIN sales_invoices si ON si.id = sr.original_invoice_id
        WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      )
      SELECT date, COALESCE(SUM(revenue), 0) AS revenue,
        COUNT(DISTINCT invoiceId) AS invoiceCount, COUNT(DISTINCT returnId) AS returnCount
      FROM activity
      GROUP BY date
      ORDER BY date DESC
    `, params);
    return rows.map(r => ({
      date: r.date,
      revenue: Number(r.revenue),
      invoiceCount: Number(r.invoiceCount),
      returnCount: Number(r.returnCount),
    })) as DailyRow[];
  }

  if (type === 'by_category') {
    const rows = db.query<any>(`
      WITH activity AS (
        SELECT c.id AS groupId, COALESCE(c.name, 'غير مصنف') AS label, si.id AS invoiceId,
          sii.total_price - CASE WHEN si.subtotal > 0 THEN si.discount_amount * sii.total_price / si.subtotal ELSE 0 END AS revenue,
          sii.total_cost AS cost
        FROM sales_invoices si
        JOIN sales_invoice_items sii ON sii.invoice_id = si.id
        JOIN products p ON p.id = sii.product_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
        UNION ALL
        SELECT c.id AS groupId, COALESCE(c.name, 'غير مصنف') AS label, NULL AS invoiceId,
          -sri.total_refund + CASE WHEN sr.total_amount > 0 AND si.total_amount > 0
            THEN ROUND(
              sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2
            ) * sri.total_refund / sr.total_amount
            ELSE 0
          END AS revenue,
          -(sri.quantity_m2 * sri.unit_cost) AS cost
        FROM sales_returns sr
        JOIN sales_invoices si ON si.id = sr.original_invoice_id
        JOIN sales_return_items sri ON sri.return_id = sr.id
        JOIN products p ON p.id = sri.product_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      )
      SELECT label, COALESCE(SUM(revenue), 0) AS revenue, COALESCE(SUM(cost), 0) AS cost,
        COALESCE(SUM(revenue - cost), 0) AS profit, COUNT(DISTINCT invoiceId) AS count
      FROM activity
      GROUP BY groupId, label
      ORDER BY revenue DESC
    `, params);
    return rows.map(r => {
      const revenue = Number(r.revenue), cost = Number(r.cost);
      const profit = Number(r.profit);
      return { label: r.label, revenue, cost, profit, count: Number(r.count), margin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0 };
    });
  }

  if (type === 'by_product') {
    const rows = db.query<any>(`
      WITH activity AS (
        SELECT p.id AS groupId, p.name AS label, si.id AS invoiceId,
          sii.total_price - CASE WHEN si.subtotal > 0 THEN si.discount_amount * sii.total_price / si.subtotal ELSE 0 END AS revenue,
          sii.total_cost AS cost
        FROM sales_invoices si
        JOIN sales_invoice_items sii ON sii.invoice_id = si.id
        JOIN products p ON p.id = sii.product_id
        WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
        UNION ALL
        SELECT p.id AS groupId, p.name AS label, NULL AS invoiceId,
          -sri.total_refund + CASE WHEN sr.total_amount > 0 AND si.total_amount > 0
            THEN ROUND(
              sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2
            ) * sri.total_refund / sr.total_amount
            ELSE 0
          END AS revenue,
          -(sri.quantity_m2 * sri.unit_cost) AS cost
        FROM sales_returns sr
        JOIN sales_invoices si ON si.id = sr.original_invoice_id
        JOIN sales_return_items sri ON sri.return_id = sr.id
        JOIN products p ON p.id = sri.product_id
        WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      )
      SELECT label, COALESCE(SUM(revenue), 0) AS revenue, COALESCE(SUM(cost), 0) AS cost,
        COALESCE(SUM(revenue - cost), 0) AS profit, COUNT(DISTINCT invoiceId) AS count
      FROM activity
      GROUP BY groupId, label
      ORDER BY revenue DESC
      LIMIT 30
    `, params);
    return rows.map(r => {
      const revenue = Number(r.revenue), cost = Number(r.cost);
      const profit = Number(r.profit);
      return { label: r.label, revenue, cost, profit, count: Number(r.count), margin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0 };
    });
  }

  if (type === 'by_customer') {
    const rows = db.query<any>(`
      WITH activity AS (
        SELECT cu.id AS groupId, cu.name AS label, si.id AS invoiceId,
          si.subtotal - si.discount_amount AS revenue, si.total_cost AS cost, si.gross_profit AS profit
        FROM sales_invoices si
        JOIN customers cu ON cu.id = si.customer_id
        WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
        UNION ALL
        SELECT cu.id AS groupId, cu.name AS label, NULL AS invoiceId,
          -(sr.total_amount - CASE WHEN si.total_amount > 0
            THEN ROUND(sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2)
            ELSE 0 END) AS revenue,
          -COALESCE((SELECT SUM(sri.quantity_m2 * sri.unit_cost)
            FROM sales_return_items sri WHERE sri.return_id = sr.id), 0) AS cost,
          COALESCE((SELECT SUM(sri.quantity_m2 * sri.unit_cost)
            FROM sales_return_items sri WHERE sri.return_id = sr.id), 0)
            - (sr.total_amount - CASE WHEN si.total_amount > 0
              THEN ROUND(sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2)
              ELSE 0 END) AS profit
        FROM sales_returns sr
        JOIN sales_invoices si ON si.id = sr.original_invoice_id
        JOIN customers cu ON cu.id = sr.customer_id
        WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      )
      SELECT label, COALESCE(SUM(revenue), 0) AS revenue, COALESCE(SUM(cost), 0) AS cost,
        COALESCE(SUM(profit), 0) AS profit, COUNT(DISTINCT invoiceId) AS count
      FROM activity
      GROUP BY groupId, label
      ORDER BY revenue DESC
      LIMIT 30
    `, params);
    return rows.map(r => {
      const revenue = Number(r.revenue), cost = Number(r.cost), profit = Number(r.profit);
      return { label: r.label, revenue, cost, profit, count: Number(r.count), margin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0 };
    });
  }

  if (type === 'by_city') {
    const rows = db.query<any>(`
      WITH activity AS (
        SELECT COALESCE(cu.city, 'غير محدد') AS label, cu.id AS customerId, si.id AS invoiceId,
          si.subtotal - si.discount_amount AS revenue
        FROM sales_invoices si
        JOIN customers cu ON cu.id = si.customer_id
        WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
        UNION ALL
        SELECT COALESCE(cu.city, 'غير محدد') AS label, cu.id AS customerId, NULL AS invoiceId,
          -(sr.total_amount - CASE WHEN si.total_amount > 0
            THEN ROUND(sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2)
            ELSE 0 END) AS revenue
        FROM sales_returns sr
        JOIN sales_invoices si ON si.id = sr.original_invoice_id
        JOIN customers cu ON cu.id = sr.customer_id
        WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      )
      SELECT label, COALESCE(SUM(revenue), 0) AS revenue,
        COUNT(DISTINCT invoiceId) AS count, COUNT(DISTINCT customerId) AS customers
      FROM activity
      GROUP BY label
      ORDER BY revenue DESC
    `, params);
    return rows.map(r => {
      const revenue = Number(r.revenue);
      return {
        label: r.label,
        revenue,
        cost: 0,
        profit: 0,
        count: Number(r.count),
        margin: 0,
        customers: Number(r.customers),
      };
    });
  }

  if (type === 'by_user') {
    const rows = db.query<any>(`
      WITH activity AS (
        SELECT si.created_by AS groupId, COALESCE(u.full_name, 'غير معروف') AS label, si.id AS invoiceId,
          si.subtotal - si.discount_amount AS revenue, si.total_cost AS cost, si.gross_profit AS profit
        FROM sales_invoices si
        LEFT JOIN users u ON u.id = si.created_by
        WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
        UNION ALL
        SELECT si.created_by AS groupId, COALESCE(u.full_name, 'غير معروف') AS label, NULL AS invoiceId,
          -(sr.total_amount - CASE WHEN si.total_amount > 0
            THEN ROUND(sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2)
            ELSE 0 END) AS revenue,
          -COALESCE((SELECT SUM(sri.quantity_m2 * sri.unit_cost)
            FROM sales_return_items sri WHERE sri.return_id = sr.id), 0) AS cost,
          COALESCE((SELECT SUM(sri.quantity_m2 * sri.unit_cost)
            FROM sales_return_items sri WHERE sri.return_id = sr.id), 0)
            - (sr.total_amount - CASE WHEN si.total_amount > 0
              THEN ROUND(sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2)
              ELSE 0 END) AS profit
        FROM sales_returns sr
        JOIN sales_invoices si ON si.id = sr.original_invoice_id
        LEFT JOIN users u ON u.id = si.created_by
        WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      )
      SELECT label, COALESCE(SUM(revenue), 0) AS revenue, COALESCE(SUM(cost), 0) AS cost,
        COALESCE(SUM(profit), 0) AS profit, COUNT(DISTINCT invoiceId) AS count
      FROM activity
      GROUP BY groupId, label
      ORDER BY revenue DESC
    `, params);
    return rows.map(r => {
      const revenue = Number(r.revenue), cost = Number(r.cost), profit = Number(r.profit);
      return { label: r.label, revenue, cost, profit, count: Number(r.count), margin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0 };
    });
  }

  return [];
}

function SalesBarChart({ rows, color, reportType }: { rows: SalesRow[]; color: string; reportType: ReportType }) {
  if (rows.length === 0) return <p className="text-xs text-slate-400 text-center py-8">لا توجد بيانات في هذه الفترة</p>;
  const max = Math.max(...rows.map(r => Math.abs(r.revenue)), 1);
  const barColor = BAR_COLOR_MAP[color] || 'bg-sky-500';

  return (
    <div className="space-y-2.5 mt-2">
      {rows.slice(0, 20).map((row, i) => {
        const pct = Math.round((Math.abs(row.revenue) / max) * 100);
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-slate-600 w-36 shrink-0 font-medium truncate text-left">{row.label}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
              <div
                className={`h-full rounded-full ${row.revenue < 0 ? 'bg-rose-500' : barColor} transition-all duration-700 flex items-center justify-end pr-2`}
                style={{ width: `${Math.max(pct, 3)}%` }}
              >
                {pct > 15 && <span className="text-white text-xs font-black">{fmtM(row.revenue)}</span>}
              </div>
            </div>
            <div className="text-left w-24 shrink-0">
              <p className="text-xs font-black text-slate-900">{fmtM(row.revenue)} ج</p>
              <p className="text-xs text-slate-400">
                {fmt(row.count)} فاتورة
                {reportType === 'by_city' && ` • ${fmt(row.customers || 0)} عميل`}
                {reportType !== 'by_city' && row.margin > 0 && ` • ${row.margin}%`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DailyChart({ rows }: { rows: DailyRow[] }) {
  if (rows.length === 0) return <p className="text-xs text-slate-400 text-center py-8">لا توجد بيانات في هذه الفترة</p>;
  const max = Math.max(...rows.map(r => Math.abs(r.revenue)), 1);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalInvoiceCount = rows.reduce((s, r) => s + r.invoiceCount, 0);
  const totalReturnCount = rows.reduce((s, r) => s + r.returnCount, 0);

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-pink-50 border border-pink-200 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-pink-700">{fmtM(totalRevenue)} ج</p>
          <p className="text-xs text-pink-500">إجمالي الإيرادات</p>
        </div>
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-violet-700">{fmt(totalInvoiceCount)}</p>
          <p className="text-xs text-violet-500">إجمالي الفواتير</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-amber-700">{fmt(totalReturnCount)}</p>
          <p className="text-xs text-amber-500">إجمالي المرتجعات</p>
        </div>
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-sky-700">{totalInvoiceCount > 0 ? fmtM(totalRevenue / totalInvoiceCount) : '0'} ج</p>
          <p className="text-xs text-sky-500">صافي الإيراد لكل فاتورة</p>
        </div>
      </div>
      <div className="space-y-1.5 max-h-96 overflow-y-auto">
        {rows.map((row, i) => {
          const pct = Math.round((Math.abs(row.revenue) / max) * 100);
          return (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-slate-500 w-24 shrink-0 font-medium">{row.date}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                <div className={`h-full rounded-full ${row.revenue < 0 ? 'bg-rose-500' : 'bg-pink-500'} transition-all duration-700`}
                  style={{ width: `${Math.max(pct, 2)}%` }} />
              </div>
              <span className="text-xs font-black text-slate-900 w-20 text-left">{fmtM(row.revenue)} ج</span>
              <span className="text-xs text-slate-400 w-28 text-left">
                {fmt(row.invoiceCount)} ف • {fmt(row.returnCount)} م
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const SalesReportsPage: React.FC = () => {
  const toast = useToast();
  const user = AuthService.getCurrentUser();
  const canView = PermissionService.can(user, 'reports.view');

  const [reportType, setReportType] = useState<ReportType>('by_category');
  const [activeSection, setActiveSection] = useState<'reports' | 'reconciliation'>('reports');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<SalesRow[] | DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentType = REPORT_TYPES.find(t => t.id === reportType)!;

  const load = () => {
    setLoading(true);
    try {
      setData(loadReport(reportType, from, to));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل التقرير.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (canView && activeSection === 'reports') load(); }, [canView, activeSection, reportType, from, to]);

  const handleExport = () => {
    try {
      if (reportType === 'daily') {
        const rows = data as DailyRow[];
        exportToExcel({
          title: `تقرير مبيعات يومي`,
          subtitle: `الفترة: ${from} — ${to}`,
          fileName: `تقرير-يومي-${from}-${to}`,
          columns: [
            { key: 'date', label: 'التاريخ' },
            { key: 'revenue', label: 'الإيرادات' },
            { key: 'invoiceCount', label: 'عدد الفواتير' },
            { key: 'returnCount', label: 'عدد المرتجعات' },
          ],
          rows: rows as any[],
        });
      } else {
        const rows = data as SalesRow[];
        exportToExcel({
          title: `تقرير مبيعات - ${currentType.label}`,
          subtitle: `الفترة: ${from} — ${to}`,
          fileName: `تقرير-مبيعات-${reportType}-${from}-${to}`,
          columns: reportType === 'by_city'
            ? [
                { key: 'label', label: 'المنطقة' },
                { key: 'revenue', label: 'صافي الإيرادات' },
                { key: 'count', label: 'عدد الفواتير' },
                { key: 'customers', label: 'عدد العملاء' },
              ]
            : [
                { key: 'label', label: 'البيان' },
                { key: 'revenue', label: 'الإيرادات' },
                { key: 'cost', label: 'التكلفة' },
                { key: 'profit', label: 'الربح' },
                { key: 'margin', label: 'الهامش%' },
                { key: 'count', label: 'عدد الفواتير' },
              ],
          rows: rows as any[],
        });
      }
    } catch (e: any) {
      toast.error('تعذر التصدير: ' + e?.message);
    }
  };

  const quickPeriods = [
    { label: 'هذا الشهر', from: monthStart(), to: today() },
    { label: 'هذه السنة', from: yearStart(), to: today() },
    { label: 'الأسبوع', from: (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; })(), to: today() },
  ];

  if (!canView) {
    return (
      <div className="h-full flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-3" />
          <p className="text-slate-600 font-bold">لا تملك صلاحية مشاهدة التقارير</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">
              {activeSection === 'reports' ? 'تقارير المبيعات المتقدمة' : 'بوابة المصالحة المالية'}
            </h1>
            <p className="text-xs text-slate-400">
              {activeSection === 'reports'
                ? 'تحليل مفصل حسب الفئة والمنتج والعميل والمندوب والمنطقة'
                : 'مراجعة المبيعات والمرتجعات والدفتر العام والأرصدة التشغيلية'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeSection === 'reports' && (
            <button onClick={handleExport} className="text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition px-3 py-2 rounded-lg flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> تصدير
            </button>
          )}
          {activeSection === 'reports' && (
            <button onClick={load} className="p-2 hover:bg-slate-100 rounded-lg transition">
              <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-slate-100 px-6 py-3 flex flex-wrap items-center gap-3 flex-shrink-0">
        {/* Quick periods */}
        <div className="flex gap-1.5">
          {quickPeriods.map(p => (
            <button key={p.label}
              onClick={() => { setFrom(p.from); setTo(p.to); }}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition ${from === p.from && to === p.to ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-slate-400" />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white font-medium focus:outline-none focus:border-teal-400" />
          <span className="text-xs text-slate-400">إلى</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white font-medium focus:outline-none focus:border-teal-400" />
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="bg-white border-b border-slate-100 px-6 py-2 flex gap-1 overflow-x-auto flex-shrink-0">
        {REPORT_TYPES.map(type => {
          const Icon = type.icon;
          const isActive = activeSection === 'reports' && reportType === type.id;
          const colorClass = isActive ? COLOR_MAP[type.color] : 'text-slate-500 hover:bg-slate-50';
          return (
            <button key={type.id} onClick={() => { setActiveSection('reports'); setReportType(type.id); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition whitespace-nowrap ${isActive ? colorClass + ' border' : 'border-transparent ' + colorClass}`}
            >
              <Icon className="w-3.5 h-3.5" /> {type.label}
            </button>
          );
        })}
        <button onClick={() => setActiveSection('reconciliation')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition whitespace-nowrap ${
            activeSection === 'reconciliation'
              ? 'bg-teal-50 text-teal-700 border-teal-200'
              : 'border-transparent text-slate-500 hover:bg-slate-50'
          }`}>
          <Scale className="w-3.5 h-3.5" /> مصالحة الفروقات المالية
        </button>
      </div>

      {/* Content */}
      {activeSection === 'reports' && error && (
        <div className="mx-6 mt-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {activeSection === 'reconciliation' ? (
          <SalesFinancialReconciliation dateFrom={from} dateTo={to} />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <currentType.icon className={`w-5 h-5 ${COLOR_MAP[currentType.color].split(' ')[1]}`} />
                <h2 className="text-sm font-black text-slate-900">{currentType.label}</h2>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                  {from} — {to}
                </span>
              </div>
              {!loading && (
                <span className="text-xs font-bold text-slate-400">
                  {data.length} {reportType === 'daily' ? 'يوم' : 'نتيجة'}
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
              </div>
            ) : reportType === 'daily' ? (
              <DailyChart rows={data as DailyRow[]} />
            ) : (
              <SalesBarChart rows={data as SalesRow[]} color={currentType.color} reportType={reportType} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
