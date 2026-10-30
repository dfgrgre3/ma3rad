import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Wallet,
  RefreshCw, ArrowUpRight, ArrowDownRight, BarChart3
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { DatabaseManager } from '../../database/db';
import { format, startOfMonth, endOfMonth } from 'date-fns';

interface Metrics {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalReceivables: number;
  totalPayables: number;
  cashBalance: number;
  inventoryValue: number;
}

export const FinanceOverviewPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    totalReceivables: 0,
    totalPayables: 0,
    cashBalance: 0,
    inventoryValue: 0,
  });
  const [monthlyData, setMonthlyData] = useState<{ month: string; revenue: number; expenses: number }[]>([]);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    const db = DatabaseManager.getInstance().getDb();
    if (!db) { setLoading(false); return; }

    try {
      const thisMonth = {
        from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        to: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
      };

      const revRow = db.exec(
        `SELECT COALESCE(SUM(subtotal - discount_amount + shipping_cost),0) FROM sales_invoices WHERE date BETWEEN ? AND ? AND invoice_status != 'VOID'`,
        [thisMonth.from, thisMonth.to]
      );
      const expRow = db.exec(
        `SELECT COALESCE(SUM(amount),0) FROM expenses WHERE date BETWEEN ? AND ?`,
        [thisMonth.from, thisMonth.to]
      );
      const receivRow = db.exec(`SELECT COALESCE(SUM(current_balance),0) FROM customers WHERE current_balance > 0`);
      const payRow = db.exec(`SELECT COALESCE(SUM(current_balance),0) FROM suppliers WHERE current_balance > 0`);
      const cashRow = db.exec(`SELECT COALESCE(SUM(current_balance),0) FROM cash_registers WHERE is_active = 1`);
      const invValRow = db.exec(`
        SELECT COALESCE(SUM(ws.quantity_m2 * p.cost_price), 0)
        FROM warehouse_stock ws
        JOIN products p ON ws.product_id = p.id
      `);

      const rev = Number(revRow[0]?.values[0]?.[0] || 0);
      const exp = Number(expRow[0]?.values[0]?.[0] || 0);
      const grossProfitRow = db.exec(
        `SELECT COALESCE(SUM(gross_profit),0) FROM sales_invoices WHERE date BETWEEN ? AND ? AND invoice_status != 'VOID'`,
        [thisMonth.from, thisMonth.to]
      );
      const grossProfit = Number(grossProfitRow[0]?.values[0]?.[0] || 0);
      const shippingRevenueRow = db.exec(
        `SELECT COALESCE(SUM(shipping_cost),0) FROM sales_invoices WHERE date BETWEEN ? AND ? AND invoice_status != 'VOID'`,
        [thisMonth.from, thisMonth.to]
      );
      const shippingRevenue = Number(shippingRevenueRow[0]?.values[0]?.[0] || 0);

      setMetrics({
        totalRevenue: rev,
        totalExpenses: exp,
        netProfit: grossProfit + shippingRevenue - exp,
        totalReceivables: Number(receivRow[0]?.values[0]?.[0] || 0),
        totalPayables: Number(payRow[0]?.values[0]?.[0] || 0),
        cashBalance: Number(cashRow[0]?.values[0]?.[0] || 0),
        inventoryValue: Number(invValRow[0]?.values[0]?.[0] || 0),
      });

      const sixMonths: { month: string; revenue: number; expenses: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const from = format(startOfMonth(d), 'yyyy-MM-dd');
        const to = format(endOfMonth(d), 'yyyy-MM-dd');
        const rRow = db.exec(`SELECT COALESCE(SUM(total_amount),0) FROM sales_invoices WHERE date BETWEEN ? AND ? AND invoice_status != 'VOID'`, [from, to]);
        const eRow = db.exec(`SELECT COALESCE(SUM(amount),0) FROM expenses WHERE date BETWEEN ? AND ?`, [from, to]);
        sixMonths.push({
          month: format(d, 'MMM'),
          revenue: Number(rRow[0]?.values[0]?.[0] || 0),
          expenses: Number(eRow[0]?.values[0]?.[0] || 0),
        });
      }
      setMonthlyData(sixMonths);
    } catch (e) {
      console.error(e);
      setLoadError(e instanceof Error ? e.message : 'تعذر تحميل بيانات المركز المالي.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n) + ' ج';

  const cards = [
    { label: 'إيرادات المبيعات (الشهر)', value: fmt(metrics.totalRevenue), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { label: 'المصروفات والتشغيل (الشهر)', value: fmt(metrics.totalExpenses), icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-500/10 border-rose-500/20' },
    { label: 'صافي أرباح المعرض', value: fmt(metrics.netProfit), icon: DollarSign, color: metrics.netProfit >= 0 ? 'text-sky-600' : 'text-rose-600', bg: 'bg-sky-500/10 border-sky-500/20' },
    { label: 'الذمم المدينة (حقوقنا لدى العملاء)', value: fmt(metrics.totalReceivables), icon: ArrowUpRight, color: 'text-amber-600', bg: 'bg-amber-500/10 border-amber-500/20' },
    { label: 'الذمم الدائنة (مستحقات المصانع)', value: fmt(metrics.totalPayables), icon: ArrowDownRight, color: 'text-violet-600', bg: 'bg-violet-500/10 border-violet-500/20' },
    { label: 'رصيد الخزائن النقدية', value: fmt(metrics.cashBalance), icon: Wallet, color: 'text-teal-600', bg: 'bg-teal-500/10 border-teal-500/20' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50 text-slate-900 p-6 space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">المؤشرات المالية</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            إيرادات ومصروفات وأرباح وسيولة وذمم. إدارة شجرة الحسابات والقيود في الصفحات المتخصصة.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="p-2.5 rounded-xl bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-300 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loadError && (
        <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          تعذر تحميل بعض بيانات المركز المالي: {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`rounded-2xl border p-4 ${c.bg} shadow-sm`}>
              <Icon className={`w-5 h-5 ${c.color} mb-2`} />
              <div className={`text-base font-black ${c.color}`}>{c.value}</div>
              <div className="text-[11px] text-slate-500 mt-1">{c.label}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-sky-600" />
            تحليل الإيرادات والمصروفات الشهرية (آخر 6 أشهر)
          </h3>
          <span className="text-xs text-slate-500">تحديث فوري من فواتير المبيعات والمصروفات</span>
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
              formatter={(val: number) => [fmt(val)]}
            />
            <Bar dataKey="revenue" name="إيرادات المبيعات" fill="#10b981" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expenses" name="المصروفات" fill="#f43f5e" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FinanceOverviewPage;