import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, CreditCard, Clock, Users, Package, RefreshCw, Download } from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { BranchAccessService } from '../../services/BranchAccessService';
import { localDateString } from '../../utils/date';
import { exportToExcel } from '../../utils/export';

const db = DatabaseManager.getInstance();
const branchAccess = new BranchAccessService();

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n || 0);
const fmtMoney = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0);

interface PaymentMixRow { method: string; count: number; amount: number; }
interface HourlyRow { hour: string; count: number; amount: number; }
interface TopItemRow { name: string; qty: number; amount: number; }
interface CashierRow { name: string; invoices: number; amount: number; cash: number; }

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'نقدي', CARD: 'بطاقة', BANK_TRANSFER: 'تحويل', CHEQUE: 'شيك',
  CREDIT: 'آجل', MIXED: 'مختلط',
};

export function PosReportsPage() {
  const [from, setFrom] = useState(localDateString());
  const [to, setTo] = useState(localDateString());
  const [loading, setLoading] = useState(false);
  const [paymentMix, setPaymentMix] = useState<PaymentMixRow[]>([]);
  const [hourly, setHourly] = useState<HourlyRow[]>([]);
  const [topItems, setTopItems] = useState<TopItemRow[]>([]);
  const [cashiers, setCashiers] = useState<CashierRow[]>([]);
  const [totals, setTotals] = useState({ invoices: 0, amount: 0, voids: 0, voidAmount: 0, discounts: 0 });

  const load = () => {
    setLoading(true);
    try {
      const scope = branchAccess.sqlScope('si.branch_id', '(SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id)');
      const sp = scope.params;

      // Payment mix
      const pm = db.query<any>(
        `SELECT payment_type AS method, COUNT(*) AS count, COALESCE(SUM(total_amount),0) AS amount
         FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' ${scope.clause}
         GROUP BY payment_type ORDER BY amount DESC`,
        [from, to, ...sp]
      );
      setPaymentMix(pm.map((r: any) => ({ method: r.method, count: r.count, amount: r.amount })));

      // Hourly distribution
      const hr = db.query<any>(
        `SELECT substr(si.created_at,12,2) AS hour, COUNT(*) AS count, COALESCE(SUM(total_amount),0) AS amount
         FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' ${scope.clause}
         GROUP BY hour ORDER BY hour`,
        [from, to, ...sp]
      );
      setHourly(hr.map((r: any) => ({ hour: `${r.hour}:00`, count: r.count, amount: r.amount })));

      // Top items
      const ti = db.query<any>(
        `SELECT sii.product_name AS name, COALESCE(SUM(sii.quantity_m2),0) AS qty, COALESCE(SUM(sii.total_price),0) AS amount
         FROM sales_invoice_items sii JOIN sales_invoices si ON si.id = sii.invoice_id
         WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' ${scope.clause.replace('si.branch_id', 'si.branch_id')}
         GROUP BY sii.product_name ORDER BY amount DESC LIMIT 15`,
        [from, to, ...sp]
      );
      setTopItems(ti.map((r: any) => ({ name: r.name, qty: r.qty, amount: r.amount })));

      // Cashier performance
      const ca = db.query<any>(
        `SELECT u.full_name AS name, COUNT(*) AS invoices, COALESCE(SUM(si.total_amount),0) AS amount, COALESCE(SUM(si.paid_amount),0) AS cash
         FROM sales_invoices si LEFT JOIN users u ON u.id = si.created_by
         WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' ${scope.clause}
         GROUP BY u.full_name ORDER BY amount DESC`,
        [from, to, ...sp]
      );
      setCashiers(ca.map((r: any) => ({ name: r.name || '—', invoices: r.invoices, amount: r.amount, cash: r.cash })));

      // Totals
      const t = db.query<any>(
        `SELECT COUNT(*) AS invoices, COALESCE(SUM(total_amount),0) AS amount,
                COALESCE(SUM(discount_amount),0) AS discounts
         FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' ${scope.clause}`,
        [from, to, ...sp]
      )[0];
      const v = db.query<any>(
        `SELECT COUNT(*) AS c, COALESCE(SUM(total_amount),0) AS amount FROM sales_invoices si
         WHERE si.date BETWEEN ? AND ? AND si.invoice_status = 'VOID' ${scope.clause}`,
        [from, to, ...sp]
      )[0];
      setTotals({ invoices: t.invoices, amount: t.amount, voids: v.c, voidAmount: v.amount, discounts: t.discounts });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const exportPaymentMix = () => exportToExcel({
    title: 'تقرير طرق الدفع (POS)',
    columns: [{ key: 'method', label: 'الطريقة' }, { key: 'count', label: 'عدد' }, { key: 'amount', label: 'المبلغ' }],
    rows: paymentMix.map((r) => ({ method: PAYMENT_LABELS[r.method] || r.method, count: r.count, amount: r.amount })),
    fileName: 'pos-payment-mix',
    permission: 'reports.view',
  });

  const exportTopItems = () => exportToExcel({
    title: 'الأصناف الأكثر مبيعاً (POS)',
    columns: [{ key: 'name', label: 'الصنف' }, { key: 'qty', label: 'الكمية' }, { key: 'amount', label: 'المبلغ' }],
    rows: topItems as unknown as Record<string, unknown>[],
    fileName: 'pos-top-items',
    permission: 'reports.view',
  });

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2"><BarChart3 className="w-6 h-6 text-sky-600" /> تقارير نقطة البيع (POS)</h1>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
          <span className="text-slate-400">إلى</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
          <button onClick={load} disabled={loading} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-sm flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">الفواتير</div>
          <div className="text-2xl font-black text-slate-900">{fmt(totals.invoices)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">الإجمالي</div>
          <div className="text-2xl font-black text-sky-600">{fmtMoney(totals.amount)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">الخصومات</div>
          <div className="text-2xl font-black text-rose-600">{fmtMoney(totals.discounts)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">الملغاة</div>
          <div className="text-2xl font-black text-amber-600">{fmt(totals.voids)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">قيمة الملغاة</div>
          <div className="text-2xl font-black text-amber-600">{fmtMoney(totals.voidAmount)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Payment mix */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><CreditCard className="w-4 h-4 text-sky-600" /> توزيع طرق الدفع</h2>
            <button onClick={exportPaymentMix} className="text-xs text-sky-600 hover:underline flex items-center gap-1"><Download className="w-3 h-3" /> Excel</button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 text-xs"><th className="text-right py-1">الطريقة</th><th className="text-center py-1">عدد</th><th className="text-left py-1">المبلغ</th></tr></thead>
            <tbody>
              {paymentMix.map((r) => (
                <tr key={r.method} className="border-t border-slate-100">
                  <td className="py-1.5">{PAYMENT_LABELS[r.method] || r.method}</td>
                  <td className="text-center py-1.5">{fmt(r.count)}</td>
                  <td className="text-left py-1.5 font-bold">{fmtMoney(r.amount)}</td>
                </tr>
              ))}
              {paymentMix.length === 0 && <tr><td colSpan={3} className="text-center py-4 text-slate-400">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Hourly */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-sky-600" /> توزيع المبيعات حسب الساعة</h2>
          <div className="space-y-1.5">
            {hourly.map((r) => {
              const max = Math.max(...hourly.map((x) => x.amount), 1);
              const pct = (r.amount / max) * 100;
              return (
                <div key={r.hour} className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-slate-500">{r.hour}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-sky-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-20 text-left font-bold">{fmtMoney(r.amount)}</span>
                  <span className="w-8 text-slate-400">({r.count})</span>
                </div>
              );
            })}
            {hourly.length === 0 && <div className="text-center py-4 text-slate-400 text-sm">لا توجد بيانات</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top items */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Package className="w-4 h-4 text-sky-600" /> الأصناف الأكثر مبيعاً (أفضل 15)</h2>
            <button onClick={exportTopItems} className="text-xs text-sky-600 hover:underline flex items-center gap-1"><Download className="w-3 h-3" /> Excel</button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 text-xs"><th className="text-right py-1">#</th><th className="text-right py-1">الصنف</th><th className="text-center py-1">الكمية</th><th className="text-left py-1">المبلغ</th></tr></thead>
            <tbody>
              {topItems.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1.5 text-slate-400">{i + 1}</td>
                  <td className="py-1.5">{r.name}</td>
                  <td className="text-center py-1.5">{fmt(r.qty)}</td>
                  <td className="text-left py-1.5 font-bold">{fmtMoney(r.amount)}</td>
                </tr>
              ))}
              {topItems.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-slate-400">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Cashier performance */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-sky-600" /> أداء الكاشيرات</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 text-xs"><th className="text-right py-1">الكاشير</th><th className="text-center py-1">فواتير</th><th className="text-left py-1">الإجمالي</th><th className="text-left py-1">النقد</th></tr></thead>
            <tbody>
              {cashiers.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1.5">{r.name}</td>
                  <td className="text-center py-1.5">{fmt(r.invoices)}</td>
                  <td className="text-left py-1.5 font-bold">{fmtMoney(r.amount)}</td>
                  <td className="text-left py-1.5">{fmtMoney(r.cash)}</td>
                </tr>
              ))}
              {cashiers.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-slate-400">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default PosReportsPage;