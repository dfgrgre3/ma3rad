import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDashboardRefresh } from '../../../contexts/DashboardRefreshContext';
import {
  ShoppingBag, TrendingDown, Package, CalendarDays,
  Loader2, AlertCircle, RefreshCw, BarChart3, Handshake,
  Scale, Star, PackageCheck, DollarSign,
} from 'lucide-react';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { loadInventoryKpi, loadPurchaseKpi, type PurchaseKpi } from '../../../services/domains/reports/InventoryReportService';
import type { InventoryKpi } from '../../../services/domains/inventory/InventoryValuationService';
import { localDateString } from '../../../utils/shared/date';
import { useNavigate } from 'react-router-dom';
import { getProductUnitLabel } from '../../../utils/products/productUnits';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n || 0);
const fmtM = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + 'م' : n >= 1000 ? (n / 1000).toFixed(1) + 'ك' : fmt(n);
const today = () => localDateString();
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

type Tab = 'purchases' | 'suppliers' | 'inventory' | 'returns';

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
  const refreshCtx = useDashboardRefresh();
  const initialRef = useRef(true);
  const navigate = useNavigate();
  const user = AuthService.getCurrentUser();
  const canView = PermissionService.can(user, 'ui.reports.hub.view');
  const canViewPurchases = PermissionService.canAny(user, [
    'ui.reports.purchases.view',
    'ui.purchases.invoices.view',
  ]);
  const canViewInventory = PermissionService.can(user, 'ui.reports.inventory.view')
    || PermissionService.can(user, 'ui.inventory.valuation.view');

  const [tab, setTab] = useState<Tab>(
    canViewPurchases ? 'purchases' : canViewInventory ? 'inventory' : 'purchases'
  );
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [purchaseKpi, setPurchaseKpi] = useState<PurchaseKpi | null>(null);
  const [inventoryKpi, setInventoryKpi] = useState<InventoryKpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (tab === 'inventory' ? !canViewInventory : !canViewPurchases) {
      setLoading(false);
      return;
    }
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
  }, [canViewInventory, canViewPurchases, from, tab, to]);

  useEffect(() => {
    if (canView && (tab === 'inventory' ? canViewInventory : canViewPurchases)) load();
  }, [canView, canViewInventory, canViewPurchases, load, tab]);

  useEffect(() => {
    if (!refreshCtx) return;
    if (initialRef.current) { initialRef.current = false; return; }
    if (canView && (tab === 'inventory' ? canViewInventory : canViewPurchases)) load();
  }, [refreshCtx, canView, canViewInventory, canViewPurchases, load, tab]);

  const TABS: { id: Tab; label: string; icon: React.ElementType; visible: boolean }[] = [
    { id: 'purchases', label: 'المشتريات', icon: ShoppingBag, visible: canViewPurchases },
    { id: 'suppliers', label: 'الموردون', icon: Handshake, visible: canViewPurchases },
    { id: 'inventory', label: 'قيمة المخزون', icon: Package, visible: canViewInventory },
    { id: 'returns', label: 'المرتجعات', icon: TrendingDown, visible: canViewPurchases },
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
        {TABS.filter((item) => item.visible).map(t => {
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
        {!canView ? (
          <div role="alert" className="py-16 text-center text-sm font-semibold text-slate-600">
            ليس لديك صلاحية لعرض هذا التقرير.
          </div>
        ) : !TABS.some((item) => item.visible) ? (
          <div role="alert" className="py-16 text-center text-sm font-semibold text-slate-600">
            لا توجد لديك صلاحية لعرض أقسام هذا التقرير.
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : tab === 'inventory' && inventoryKpi ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <>
                <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-semibold text-sky-800">
                  صافي المشتريات محسوب من إجمالي الفواتير مطروحًا منه المرتجعات حسب تاريخ حركة المرتجع. هذه قيمة مالية ولا تعني كمية البضاعة المستلمة فعليًا أو المرحلة إلى المخزن.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard label="صافي المشتريات بعد المرتجعات" value={fmtM(purchaseKpi.totalPurchases) + ' ج'} sub={`فواتير: ${fmtM(purchaseKpi.grossPurchases)} ج · ${fmt(purchaseKpi.totalInvoices)} فاتورة`} icon={ShoppingBag} color="text-orange-600" bg="bg-orange-50" />
                  <StatCard label="المدفوع بعد المبالغ المستردة" value={fmtM(purchaseKpi.totalPaid) + ' ج'} sub="دفعات الموردين مطروحًا منها المبالغ المستردة" icon={PackageCheck} color="text-emerald-600" bg="bg-emerald-50" />
                  <StatCard label="المستحق للموردين" value={fmtM(purchaseKpi.totalDue) + ' ج'} sub="بعد أرصدة المرتجعات" icon={DollarSign} color="text-rose-600" bg="bg-rose-50" />
                  <StatCard label="مرتجعات الشراء" value={fmtM(purchaseKpi.returnsTotal) + ' ج'} sub={`${fmt(purchaseKpi.returnsCount)} مرتجع`} icon={TrendingDown} color="text-amber-600" bg="bg-amber-50" />
                </div>
              </>
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
