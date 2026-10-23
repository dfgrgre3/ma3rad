import React, { useEffect, useMemo, useState } from 'react';
import { PieChart, Loader2, Download, CalendarDays, TrendingUp, TrendingDown } from 'lucide-react';
import { AccountingService } from '../../services/AccountingService';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0) + ' ج';
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const today = () => new Date().toISOString().slice(0, 10);

type PnL = { revenue: number; costOfGoodsSold: number; grossProfit: number; expenses: number; netProfit: number; margin: number };

export const ProfitLossPage: React.FC = () => {
  const service = useMemo(() => new AccountingService(), []);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [pnl, setPnl] = useState<PnL>({ revenue: 0, costOfGoodsSold: 0, grossProfit: 0, expenses: 0, netProfit: 0, margin: 0 });
  const [expenses, setExpenses] = useState<Array<{ category: string; total: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    try {
      setPnl(service.getProfitAndLossReport(from, to));
      setExpenses(service.getExpenseReport(from, to).byCategory as Array<{ category: string; total: number }>);
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل قائمة الأرباح والخسائر.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [from, to]);

  const expenseTotal = expenses.reduce((s, e) => s + Number(e.total), 0);
  const maxExpense = Math.max(1, ...expenses.map((e) => Number(e.total)));

  const exportCsv = () => {
    const rows = [
      ['البند', 'القيمة'],
      ['الإيرادات', String(pnl.revenue)],
      ['تكلفة البضاعة المباعة', String(pnl.costOfGoodsSold)],
      ['إجمالي الربح', String(pnl.grossProfit)],
      ['المصروفات التشغيلية', String(pnl.expenses)],
      ['صافي الربح', String(pnl.netProfit)],
      ['هامش الربح %', String(pnl.margin)],
      [],
      ['فئة المصروف', 'الإجمالي'],
      ...expenses.map((e) => [e.category, String(e.total)]),
    ];
    const csv = '\uFEFF' + rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profit-loss-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center"><PieChart className="w-5 h-5 text-emerald-600" /></div>
          <div>
            <h1 className="text-base font-black">قائمة الأرباح والخسائر</h1>
            <p className="text-xs text-slate-500 font-medium">تحليل الإيرادات والتكاليف والمصروفات للفترة المحددة</p>
          </div>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition shrink-0">
          <Download className="w-4 h-4" /> تصدير CSV
        </button>
      </div>

      <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1">من تاريخ</label>
          <div className="relative"><CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" /><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" /></div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1">إلى تاريخ</label>
          <div className="relative"><CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" /></div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div> : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
                <h3 className="text-sm font-black">قائمة الدخل التحليلية</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">{from} — {to}</p>
              </div>
              <div className="divide-y divide-slate-100">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm font-bold text-slate-700">إيرادات المبيعات</span>
                  <span className="font-mono font-black text-slate-900">{fmt(pnl.revenue)}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-slate-600">(−) تكلفة البضاعة المباعة</span>
                  <span className="font-mono font-bold text-rose-600">{fmt(pnl.costOfGoodsSold)}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-4 bg-emerald-50/50">
                  <span className="text-sm font-black text-emerald-800">إجمالي الربح</span>
                  <span className="font-mono font-black text-emerald-800 text-lg">{fmt(pnl.grossProfit)}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-slate-600">(−) المصروفات التشغيلية</span>
                  <span className="font-mono font-bold text-rose-600">{fmt(pnl.expenses)}</span>
                </div>
                <div className={`flex items-center justify-between px-5 py-4 ${pnl.netProfit >= 0 ? 'bg-sky-50/60' : 'bg-rose-50/60'}`}>
                  <span className={`text-sm font-black ${pnl.netProfit >= 0 ? 'text-sky-800' : 'text-rose-800'}`}>صافي الربح / (الخسارة)</span>
                  <span className={`font-mono font-black text-xl ${pnl.netProfit >= 0 ? 'text-sky-800' : 'text-rose-800'}`}>{fmt(pnl.netProfit)}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-px bg-slate-200 border-t border-slate-200">
                <div className="bg-white px-4 py-3 text-center">
                  <div className="text-[10px] text-slate-400 font-bold">هامش صافي الربح</div>
                  <div className={`text-lg font-black mt-1 ${pnl.margin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{pnl.margin}%</div>
                </div>
                <div className="bg-white px-4 py-3 text-center">
                  <div className="text-[10px] text-slate-400 font-bold">نسبة تكلفة البضاعة</div>
                  <div className="text-lg font-black mt-1 text-slate-800">{pnl.revenue > 0 ? ((pnl.costOfGoodsSold / pnl.revenue) * 100).toFixed(1) : 0}%</div>
                </div>
                <div className="bg-white px-4 py-3 text-center">
                  <div className="text-[10px] text-slate-400 font-bold">نسبة المصروفات</div>
                  <div className="text-lg font-black mt-1 text-slate-800">{pnl.revenue > 0 ? ((pnl.expenses / pnl.revenue) * 100).toFixed(1) : 0}%</div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-black">توزيع المصروفات</h3>
                <span className="text-[10px] font-bold text-slate-400">{fmt(expenseTotal)}</span>
              </div>
              <div className="p-4 space-y-3">
                {expenses.map((e) => (
                  <div key={e.category}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-bold text-slate-700">{e.category}</span>
                      <span className="font-mono text-slate-500">{fmt(Number(e.total))}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-400 rounded-full" style={{ width: `${Math.max(2, (Number(e.total) / maxExpense) * 100)}%` }} />
                    </div>
                  </div>
                ))}
                {expenses.length === 0 && <div className="py-10 text-center text-xs text-slate-400">لا توجد مصروفات في هذه الفترة</div>}
              </div>
              <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2 text-[10px] text-slate-400">
                {pnl.netProfit >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-500" />}
                {pnl.netProfit >= 0 ? 'المنشأة تحقق أرباحاً في هذه الفترة' : 'المنشأة تحقق خسارة في هذه الفترة'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
