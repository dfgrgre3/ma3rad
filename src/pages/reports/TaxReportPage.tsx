import React, { useEffect, useMemo, useState } from 'react';
import { ReceiptText, Loader2, Download, CalendarDays } from 'lucide-react';
import { FinanceExtrasService } from '../../services/FinanceExtrasService';
import { localDateString } from '../../utils/date';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0) + ' ج';
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const today = () => localDateString();

export const TaxReportPage: React.FC = () => {
  const service = useMemo(() => new FinanceExtrasService(), []);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [summary, setSummary] = useState({ outputTax: 0, inputTax: 0, netTax: 0, salesTotal: 0, purchasesTotal: 0, salesCount: 0, purchasesCount: 0 });
  const [months, setMonths] = useState<Array<{ month: string; outputTax: number; inputTax: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    try {
      setSummary(service.getTaxSummary(from, to));
      setMonths(service.getTaxByMonth(from, to));
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل تقرير الضريبة.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [from, to]);

  const exportCsv = () => {
    const rows = [
      ['الشهر', 'ضريبة المخرجات', 'ضريبة المدخلات', 'الصافي'],
      ...months.map((m) => [m.month, String(m.outputTax || 0), String(m.inputTax || 0), String((Number(m.outputTax) || 0) - (Number(m.inputTax) || 0))]),
      ['الإجمالي', String(summary.outputTax), String(summary.inputTax), String(summary.netTax)],
    ];
    const csv = '\uFEFF' + rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vat-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center"><ReceiptText className="w-5 h-5 text-teal-600" /></div>
          <div>
            <h1 className="text-base font-black">تقرير ضريبة القيمة المضافة</h1>
            <p className="text-xs text-slate-500 font-medium">ملخص ضريبة المخرجات والمدخلات وصافي المستحق عن الفترة</p>
          </div>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold transition shrink-0">
          <Download className="w-4 h-4" /> تصدير CSV
        </button>
      </div>

      <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1">من تاريخ</label>
          <div className="relative">
            <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1">إلى تاريخ</label>
          <div className="relative">
            <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
          </div>
        </div>
        <div className="text-[11px] text-slate-400 pb-2">يتم احتساب الضريبة من حقول الضريبة المسجلة في فواتير البيع والشراء.</div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {error && <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div> : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-[10px] font-bold text-slate-500">إجمالي المبيعات الخاضعة</div>
                <div className="text-xl font-black text-slate-900 mt-1">{fmt(summary.salesTotal)}</div>
                <div className="text-[10px] text-slate-400 mt-1">{summary.salesCount} فاتورة</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-[10px] font-bold text-slate-500">إجمالي المشتريات</div>
                <div className="text-xl font-black text-slate-900 mt-1">{fmt(summary.purchasesTotal)}</div>
                <div className="text-[10px] text-slate-400 mt-1">{summary.purchasesCount} فاتورة</div>
              </div>
              <div className="bg-white border border-emerald-200 rounded-xl p-4">
                <div className="text-[10px] font-bold text-emerald-700">ضريبة المخرجات</div>
                <div className="text-xl font-black text-emerald-700 mt-1">{fmt(summary.outputTax)}</div>
              </div>
              <div className="bg-white border border-rose-200 rounded-xl p-4">
                <div className="text-[10px] font-bold text-rose-700">ضريبة المدخلات</div>
                <div className="text-xl font-black text-rose-700 mt-1">{fmt(summary.inputTax)}</div>
              </div>
            </div>

            <div className={`rounded-2xl border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${summary.netTax >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <div>
                <div className={`text-sm font-black ${summary.netTax >= 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                  {summary.netTax >= 0 ? 'صافي الضريبة المستحقة للمصلحة' : 'رصيد ضريبي دائن للمنشأة'}
                </div>
                <div className="text-[11px] mt-1 text-slate-600">ضريبة المخرجات − ضريبة المدخلات للفترة المحددة</div>
              </div>
              <div className={`text-3xl font-black font-mono ${summary.netTax >= 0 ? 'text-amber-800' : 'text-emerald-800'}`}>{fmt(Math.abs(summary.netTax))}</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-black">التفصيل الشهري</h3>
                <span className="text-[10px] text-slate-400">{months.length} شهر</span>
              </div>
              <table className="w-full text-sm text-right">
                <thead className="bg-white border-b border-slate-200">
                  <tr>{['الشهر', 'ضريبة المخرجات', 'ضريبة المدخلات', 'الصافي'].map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {months.map((m) => {
                    const net = Number(m.outputTax || 0) - Number(m.inputTax || 0);
                    return (
                      <tr key={m.month} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-mono font-bold text-slate-700">{m.month}</td>
                        <td className="px-4 py-3 font-mono text-emerald-700">{fmt(Number(m.outputTax))}</td>
                        <td className="px-4 py-3 font-mono text-rose-700">{fmt(Number(m.inputTax))}</td>
                        <td className={`px-4 py-3 font-mono font-black ${net >= 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{fmt(net)}</td>
                      </tr>
                    );
                  })}
                  {months.length === 0 && <tr><td colSpan={4} className="py-16 text-center text-slate-400">لا توجد حركات ضريبية في الفترة المحددة</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
