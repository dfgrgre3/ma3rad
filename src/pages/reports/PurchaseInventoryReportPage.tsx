import React, { useEffect, useState } from 'react';
import {
  ShoppingBag, TrendingUp, TrendingDown, Package, Download, CalendarDays,
  Loader2, AlertCircle, RefreshCw, BarChart3, Handshake, ArrowUpRight,
  Scale, Star, PackageCheck, DollarSign,
} from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { localDateString } from '../../utils/date';
import { exportToExcel } from '../../utils/export';
import { useToast } from '../../components/ui/Toast';
import { useNavigate } from 'react-router-dom';
import { getProductUnitLabel } from '../../utils/productUnits';

const db = DatabaseManager.getInstance();
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n || 0);
const fmtM = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + 'م' : n >= 1000 ? (n / 1000).toFixed(1) + 'ك' : fmt(n);
const today = () => localDateString();
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

type Tab = 'purchases' | 'suppliers' | 'inventory' | 'returns';

interface PurchaseKpi {
  totalPurchases: number;
  totalInvoices: number;
  totalPaid: number;
  totalDue: number;
  topSuppliers: { name: string; total: number; count: number }[];
  topCategories: { category: string; total: number; qty: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }[];
  returnsTotal: number;
  returnsCount: number;
}

interface InventoryKpi {
  totalValue: number;
  totalSkus: number;
  lowStockCount: number;
  zeroStockCount: number;
  topValueItems: { name: string; value: number; qty: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }[];
  categoryBreakdown: { category: string; items: number; value: number }[];
}

function loadPurchaseKpi(from: string, to: string): PurchaseKpi {
  const base = `pi.date >= ? AND pi.date <= ? AND pi.status != 'CANCELLED'`;
  const params = [from, to];

  const summary = db.query<any>(`
    SELECT 
      COALESCE(SUM(pi.total_amount), 0) AS total,
      COUNT(*) AS count,
      COALESCE(SUM(pi.paid_amount), 0) AS paid
    FROM purchase_invoices pi WHERE ${base}
  `, params)[0] || {};

  const topSuppliers = db.query<any>(`
    SELECT s.name, COALESCE(SUM(pi.total_amount), 0) AS total, COUNT(*) AS count
    FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
    WHERE ${base} GROUP BY s.id ORDER BY total DESC LIMIT 8
  `, params).map(r => ({ name: r.name, total: Number(r.total), count: Number(r.count) }));

  const topCategories = db.query<any>(`
    SELECT COALESCE(c.name, 'غير مصنف') AS category,
      COALESCE(SUM(pii.unit_price * pii.quantity), 0) AS total,
      COALESCE(SUM(pii.quantity), 0) AS qty,
      p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
    FROM purchase_invoices pi
    JOIN purchase_invoice_items pii ON pii.invoice_id = pi.id
    JOIN products p ON p.id = pii.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${base} GROUP BY c.id, p.product_type, p.base_unit, p.custom_unit ORDER BY total DESC LIMIT 8
  `, params).map(r => ({ category: r.category, total: Number(r.total), qty: Number(r.qty), productType: r.productType, baseUnit: r.baseUnit, customUnit: r.customUnit }));

  const returnsSummary = db.query<any>(`
    SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
    FROM purchase_returns WHERE created_at >= ? AND created_at <= ?
  `, [from + 'T00:00:00', to + 'T23:59:59'])[0] || {};

  return {
    totalPurchases: Number(summary.total || 0),
    totalInvoices: Number(summary.count || 0),
    totalPaid: Number(summary.paid || 0),
    totalDue: Number(summary.total || 0) - Number(summary.paid || 0),
    topSuppliers,
    topCategories,
    returnsTotal: Number(returnsSummary.total || 0),
    returnsCount: Number(returnsSummary.count || 0),
  };
}

function loadInventoryKpi(): InventoryKpi {
  const summary = db.query<any>(`
    SELECT 
      COUNT(*) AS skus,
      COALESCE(SUM(quantity_m2 * avg_cost), 0) AS value,
      SUM(CASE WHEN quantity_m2 <= min_stock_level AND min_stock_level > 0 THEN 1 ELSE 0 END) AS low_stock,
      SUM(CASE WHEN quantity_m2 <= 0 THEN 1 ELSE 0 END) AS zero_stock
    FROM inventory
  `)[0] || {};

  const topValueItems = db.query<any>(`
    SELECT p.name, i.quantity_m2 AS qty, (i.quantity_m2 * i.avg_cost) AS value,
      p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
    FROM inventory i JOIN products p ON p.id = i.product_id
    WHERE i.quantity_m2 > 0
    ORDER BY value DESC LIMIT 10
  `).map(r => ({ name: r.name, value: Number(r.value), qty: Number(r.qty), productType: r.productType, baseUnit: r.baseUnit, customUnit: r.customUnit }));

  const categoryBreakdown = db.query<any>(`
    SELECT COALESCE(c.name, 'غير مصنف') AS category,
      COUNT(DISTINCT i.product_id) AS items,
      COALESCE(SUM(i.quantity_m2 * i.avg_cost), 0) AS value
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    GROUP BY c.id ORDER BY value DESC LIMIT 8
  `).map(r => ({ category: r.category, items: Number(r.items), value: Number(r.value) }));

  return {
    totalValue: Number(summary.value || 0),
    totalSkus: Number(summary.skus || 0),
    lowStockCount: Number(summary.low_stock || 0),
    zeroStockCount: Number(summary.zero_stock || 0),
    topValueItems,
    categoryBreakdown,
  };
}

function StatCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4 hover:shadow-md transition-shadow">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-black text-slate-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function HBar({ rows, color }: { rows: { label: string; value: number; sub?: string }[]; color: string }) {
  const max = Math.max(...rows.map(r => r.value), 1);
  const barColors: Record<string, string> = {
    orange: 'bg-orange-500', sky: 'bg-sky-500', violet: 'bg-violet-500',
    emerald: 'bg-emerald-500', amber: 'bg-amber-500',
  };
  const bc = barColors[color] || 'bg-sky-500';
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => {
        const pct = Math.round((r.value / max) * 100);
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-slate-600 w-28 shrink-0 font-medium truncate text-left">{r.label}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
              <div className={`h-full rounded-full ${bc} transition-all duration-700 flex items-center justify-end pr-2`}
                style={{ width: `${Math.max(pct, 3)}%` }}>
                {pct > 12 && <span className="text-white text-xs font-black">{fmtM(r.value)}</span>}
              </div>
            </div>
            <div className="text-left w-20 shrink-0">
              <p className="text-xs font-black text-slate-900">{fmtM(r.value)} ج</p>
              {r.sub && <p className="text-xs text-slate-400">{r.sub}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const PurchaseInventoryReportPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const user = AuthService.getCurrentUser();
  const canView = PermissionService.can(user, 'reports.view');

  const [tab, setTab] = useState<Tab>('purchases');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [purchaseKpi, setPurchaseKpi] = useState<PurchaseKpi | null>(null);
  const [inventoryKpi, setInventoryKpi] = useState<InventoryKpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    try {
      if (tab !== 'inventory') setPurchaseKpi(loadPurchaseKpi(from, to));
      if (tab === 'inventory') setInventoryKpi(loadInventoryKpi());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل التقرير.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (canView) load(); }, [tab, from, to]);

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'purchases', label: 'المشتريات', icon: ShoppingBag },
    { id: 'suppliers', label: 'الموردون', icon: Handshake },
    { id: 'inventory', label: 'قيمة المخزون', icon: Package },
    { id: 'returns', label: 'المرتجعات', icon: TrendingDown },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">تقارير المشتريات والمخزون</h1>
            <p className="text-xs text-slate-400">تحليل المشتريات والموردين وقيمة المخزون</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/purchases')} className="text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 transition px-3 py-2 rounded-lg flex items-center gap-1.5">
            <ShoppingBag className="w-3.5 h-3.5" /> المشتريات
          </button>
          <button onClick={load} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Date filters - hidden for inventory tab */}
      {tab !== 'inventory' && (
        <div className="bg-white border-b border-slate-100 px-6 py-3 flex flex-wrap items-center gap-3 flex-shrink-0">
          {[
            { label: 'هذا الشهر', from: monthStart(), to: today() },
            { label: 'هذه السنة', from: `${new Date().getFullYear()}-01-01`, to: today() },
          ].map(p => (
            <button key={p.label}
              onClick={() => { setFrom(p.from); setTo(p.to); }}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition ${from === p.from && to === p.to ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'}`}
            >
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-400" />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white font-medium focus:outline-none focus:border-orange-400" />
            <span className="text-xs text-slate-400">إلى</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white font-medium focus:outline-none focus:border-orange-400" />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-slate-100 px-6 py-2 flex gap-1 flex-shrink-0">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${isActive ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'text-slate-500 hover:bg-slate-50 border border-transparent'}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mx-6 mt-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : tab === 'inventory' && inventoryKpi ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="إجمالي قيمة المخزون" value={fmtM(inventoryKpi.totalValue) + ' ج'} sub="بالتكلفة المتوسطة" icon={Scale} color="text-violet-600" bg="bg-violet-50" />
              <StatCard label="إجمالي الأصناف" value={fmt(inventoryKpi.totalSkus)} sub="صنف مخزون" icon={Package} color="text-sky-600" bg="bg-sky-50" />
              <StatCard label="أصناف منخفضة" value={fmt(inventoryKpi.lowStockCount)} sub="تحتاج إعادة طلب" icon={AlertCircle} color="text-amber-600" bg="bg-amber-50" />
              <StatCard label="أصناف نفدت" value={fmt(inventoryKpi.zeroStockCount)} sub="صفر مخزون" icon={TrendingDown} color="text-rose-600" bg="bg-rose-50" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><Star className="w-4 h-4 text-violet-500" /> أعلى أصناف بالقيمة</h3>
                <HBar rows={inventoryKpi.topValueItems.map(r => ({ label: r.name, value: r.value, sub: `${fmt(r.qty)} ${getProductUnitLabel(r)}` }))} color="violet" />
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-sky-500" /> قيمة المخزون حسب الفئة</h3>
                <HBar rows={inventoryKpi.categoryBreakdown.map(r => ({ label: r.category, value: r.value, sub: `${r.items} صنف` }))} color="sky" />
              </div>
            </div>
          </div>
        ) : purchaseKpi ? (
          <div className="space-y-5">
            {(tab === 'purchases' || tab === 'returns') && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="إجمالي المشتريات" value={fmtM(purchaseKpi.totalPurchases) + ' ج'} sub={`${fmt(purchaseKpi.totalInvoices)} فاتورة`} icon={ShoppingBag} color="text-orange-600" bg="bg-orange-50" />
                <StatCard label="المبلغ المدفوع" value={fmtM(purchaseKpi.totalPaid) + ' ج'} sub="إجمالي الدفعات" icon={PackageCheck} color="text-emerald-600" bg="bg-emerald-50" />
                <StatCard label="المستحق للموردين" value={fmtM(purchaseKpi.totalDue) + ' ج'} sub="ذمم دائنة" icon={DollarSign} color="text-rose-600" bg="bg-rose-50" />
                <StatCard label="مرتجعات الشراء" value={fmtM(purchaseKpi.returnsTotal) + ' ج'} sub={`${fmt(purchaseKpi.returnsCount)} مرتجع`} icon={TrendingDown} color="text-amber-600" bg="bg-amber-50" />
              </div>
            )}
            {tab === 'purchases' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><Handshake className="w-4 h-4 text-orange-500" /> أكبر الموردين مشترياتاً</h3>
                  <HBar rows={purchaseKpi.topSuppliers.map(r => ({ label: r.name, value: r.total, sub: `${r.count} فاتورة` }))} color="orange" />
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><Package className="w-4 h-4 text-amber-500" /> المشتريات حسب الفئة</h3>
                  <HBar rows={purchaseKpi.topCategories.map(r => ({ label: r.category, value: r.total, sub: `${fmtM(r.qty)} ${getProductUnitLabel(r)}` }))} color="amber" />
                </div>
              </div>
            )}
            {tab === 'suppliers' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><Handshake className="w-4 h-4 text-orange-500" /> تصنيف الموردين حسب حجم التعامل</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-slate-50">
                      <th className="text-right px-3 py-2 font-black text-slate-700 rounded-r-lg">#</th>
                      <th className="text-right px-3 py-2 font-black text-slate-700">المورد</th>
                      <th className="text-right px-3 py-2 font-black text-slate-700">إجمالي المشتريات</th>
                      <th className="text-right px-3 py-2 font-black text-slate-700 rounded-l-lg">عدد الفواتير</th>
                    </tr></thead>
                    <tbody>
                      {purchaseKpi.topSuppliers.map((s, i) => (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50 transition">
                          <td className="px-3 py-2.5 font-bold text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2.5 font-bold text-slate-900">{s.name}</td>
                          <td className="px-3 py-2.5 font-black text-orange-600">{fmtM(s.total)} ج</td>
                          <td className="px-3 py-2.5 text-slate-500">{s.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-16">
            <p className="text-slate-400 text-sm">لا توجد بيانات في هذه الفترة</p>
          </div>
        )}
      </div>
    </div>
  );
};
