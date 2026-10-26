import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Download, CalendarDays, Users,
  Package, MapPin, Award, Loader2, AlertCircle, RefreshCw, Filter,
  ShoppingCart, Percent, DollarSign, ArrowUpRight, ArrowDownRight, Star,
} from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { localDateString } from '../../utils/date';
import { exportToExcel } from '../../utils/export';
import { useToast } from '../../components/ui/Toast';

const db = DatabaseManager.getInstance();
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n || 0);
const fmtM = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + 'م' : n >= 1000 ? (n / 1000).toFixed(1) + 'ك' : fmt(n);
const today = () => localDateString();
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const yearStart = () => `${new Date().getFullYear()}-01-01`;

interface SalesRow { label: string; revenue: number; cost: number; profit: number; count: number; margin: number }
interface DailyRow { date: string; revenue: number; count: number }

type ReportType = 'by_category' | 'by_product' | 'by_customer' | 'by_city' | 'by_user' | 'daily';

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

function loadReport(type: ReportType, from: string, to: string): SalesRow[] | DailyRow[] {
  const baseWhere = `si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID'`;
  const params = [from, to];

  if (type === 'daily') {
    const rows = db.query<any>(`
      SELECT si.date, 
        COALESCE(SUM(si.total_amount), 0) AS revenue,
        COUNT(DISTINCT si.id) AS count
      FROM sales_invoices si
      WHERE ${baseWhere}
      GROUP BY si.date
      ORDER BY si.date DESC
    `, params);
    return rows.map(r => ({
      date: r.date,
      revenue: Number(r.revenue),
      count: Number(r.count),
    })) as DailyRow[];
  }

  if (type === 'by_category') {
    const rows = db.query<any>(`
      SELECT 
        COALESCE(c.name, 'غير مصنف') AS label,
        COALESCE(SUM(sii.total_price - CASE WHEN si.subtotal > 0 THEN si.discount_amount * sii.total_price / si.subtotal ELSE 0 END), 0) AS revenue,
        COALESCE(SUM(sii.total_cost), 0) AS cost,
        COUNT(DISTINCT si.id) AS count
      FROM sales_invoices si
      JOIN sales_invoice_items sii ON sii.invoice_id = si.id
      JOIN products p ON p.id = sii.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${baseWhere}
      GROUP BY c.id
      ORDER BY revenue DESC
    `, params);
    return rows.map(r => {
      const revenue = Number(r.revenue), cost = Number(r.cost);
      const profit = revenue - cost;
      return { label: r.label, revenue, cost, profit, count: Number(r.count), margin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0 };
    });
  }

  if (type === 'by_product') {
    const rows = db.query<any>(`
      SELECT 
        p.name AS label,
        COALESCE(SUM(sii.total_price - CASE WHEN si.subtotal > 0 THEN si.discount_amount * sii.total_price / si.subtotal ELSE 0 END), 0) AS revenue,
        COALESCE(SUM(sii.total_cost), 0) AS cost,
        COALESCE(SUM(sii.quantity_m2), 0) AS qty,
        COUNT(DISTINCT si.id) AS count
      FROM sales_invoices si
      JOIN sales_invoice_items sii ON sii.invoice_id = si.id
      JOIN products p ON p.id = sii.product_id
      WHERE ${baseWhere}
      GROUP BY p.id
      ORDER BY revenue DESC
      LIMIT 30
    `, params);
    return rows.map(r => {
      const revenue = Number(r.revenue), cost = Number(r.cost);
      const profit = revenue - cost;
      return { label: r.label, revenue, cost, profit, count: Number(r.count), margin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0 };
    });
  }

  if (type === 'by_customer') {
    const rows = db.query<any>(`
      SELECT 
        cu.name AS label,
        COALESCE(SUM(si.subtotal - si.discount_amount), 0) AS revenue,
        COALESCE(SUM(si.total_cost), 0) AS cost,
        COALESCE(SUM(si.gross_profit), 0) AS profit,
        COUNT(DISTINCT si.id) AS count
      FROM sales_invoices si
      JOIN customers cu ON cu.id = si.customer_id
      WHERE ${baseWhere}
      GROUP BY cu.id
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
      SELECT 
        COALESCE(cu.city, 'غير محدد') AS label,
        COALESCE(SUM(si.total_amount), 0) AS revenue,
        COUNT(DISTINCT si.id) AS count,
        COUNT(DISTINCT cu.id) AS customers
      FROM sales_invoices si
      JOIN customers cu ON cu.id = si.customer_id
      WHERE ${baseWhere}
      GROUP BY cu.city
      ORDER BY revenue DESC
    `, params);
    return rows.map(r => {
      const revenue = Number(r.revenue);
      return { label: r.label, revenue, cost: 0, profit: 0, count: Number(r.count), margin: Number(r.customers) };
    });
  }

  if (type === 'by_user') {
    const rows = db.query<any>(`
      SELECT 
        COALESCE(u.full_name, 'غير معروف') AS label,
        COALESCE(SUM(si.subtotal - si.discount_amount), 0) AS revenue,
        COALESCE(SUM(si.total_cost), 0) AS cost,
        COALESCE(SUM(si.gross_profit), 0) AS profit,
        COUNT(DISTINCT si.id) AS count
      FROM sales_invoices si
      LEFT JOIN users u ON u.id = si.created_by
      WHERE ${baseWhere}
      GROUP BY si.created_by
      ORDER BY revenue DESC
    `, params);
    return rows.map(r => {
      const revenue = Number(r.revenue), cost = Number(r.cost), profit = Number(r.profit);
      return { label: r.label, revenue, cost, profit, count: Number(r.count), margin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0 };
    });
  }

  return [];
}

function SalesBarChart({ rows, color }: { rows: SalesRow[]; color: string }) {
  if (rows.length === 0) return <p className="text-xs text-slate-400 text-center py-8">لا توجد بيانات في هذه الفترة</p>;
  const max = Math.max(...rows.map(r => r.revenue), 1);
  const barColor = BAR_COLOR_MAP[color] || 'bg-sky-500';

  return (
    <div className="space-y-2.5 mt-2">
      {rows.slice(0, 20).map((row, i) => {
        const pct = Math.round((row.revenue / max) * 100);
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-slate-600 w-36 shrink-0 font-medium truncate text-left">{row.label}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor} transition-all duration-700 flex items-center justify-end pr-2`}
                style={{ width: `${Math.max(pct, 3)}%` }}
              >
                {pct > 15 && <span className="text-white text-xs font-black">{fmtM(row.revenue)}</span>}
              </div>
            </div>
            <div className="text-left w-24 shrink-0">
              <p className="text-xs font-black text-slate-900">{fmtM(row.revenue)} ج</p>
              <p className="text-xs text-slate-400">{fmt(row.count)} {row.margin > 0 ? `• ${row.margin}%` : ''}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DailyChart({ rows }: { rows: DailyRow[] }) {
  if (rows.length === 0) return <p className="text-xs text-slate-400 text-center py-8">لا توجد بيانات في هذه الفترة</p>;
  const max = Math.max(...rows.map(r => r.revenue), 1);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-pink-50 border border-pink-200 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-pink-700">{fmtM(totalRevenue)} ج</p>
          <p className="text-xs text-pink-500">إجمالي الإيرادات</p>
        </div>
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-violet-700">{fmt(totalCount)}</p>
          <p className="text-xs text-violet-500">إجمالي الفواتير</p>
        </div>
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-sky-700">{totalCount > 0 ? fmtM(totalRevenue / totalCount) : '0'} ج</p>
          <p className="text-xs text-sky-500">متوسط الفاتورة</p>
        </div>
      </div>
      <div className="space-y-1.5 max-h-96 overflow-y-auto">
        {rows.map((row, i) => {
          const pct = Math.round((row.revenue / max) * 100);
          return (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-slate-500 w-24 shrink-0 font-medium">{row.date}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                <div className="h-full rounded-full bg-pink-500 transition-all duration-700"
                  style={{ width: `${Math.max(pct, 2)}%` }} />
              </div>
              <span className="text-xs font-black text-slate-900 w-20 text-left">{fmtM(row.revenue)} ج</span>
              <span className="text-xs text-slate-400 w-12 text-left">{row.count} ف</span>
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

  useEffect(() => { if (canView) load(); }, [reportType, from, to]);

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
            { key: 'count', label: 'عدد الفواتير' },
          ],
          rows: rows as any[],
        });
      } else {
        const rows = data as SalesRow[];
        exportToExcel({
          title: `تقرير مبيعات - ${currentType.label}`,
          subtitle: `الفترة: ${from} — ${to}`,
          fileName: `تقرير-مبيعات-${reportType}-${from}-${to}`,
          columns: [
            { key: 'label', label: 'البيان' },
            { key: 'revenue', label: 'الإيرادات' },
            { key: 'cost', label: 'التكلفة' },
            { key: 'profit', label: 'الربح' },
            { key: 'margin', label: 'الهامش%' },
            { key: 'count', label: 'العدد/الكمية' },
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
            <h1 className="text-base font-black text-slate-900">تقارير المبيعات المتقدمة</h1>
            <p className="text-xs text-slate-400">تحليل مفصل حسب الفئة والمنتج والعميل والمندوب والمنطقة</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition px-3 py-2 rounded-lg flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> تصدير
          </button>
          <button onClick={load} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
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
          const isActive = reportType === type.id;
          const colorClass = isActive ? COLOR_MAP[type.color] : 'text-slate-500 hover:bg-slate-50';
          return (
            <button key={type.id} onClick={() => setReportType(type.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition whitespace-nowrap ${isActive ? colorClass + ' border' : 'border-transparent ' + colorClass}`}
            >
              <Icon className="w-3.5 h-3.5" /> {type.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {error && (
        <div className="mx-6 mt-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
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
            <SalesBarChart rows={data as SalesRow[]} color={currentType.color} />
          )}
        </div>
      </div>
    </div>
  );
};
