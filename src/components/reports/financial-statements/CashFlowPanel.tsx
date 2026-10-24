import React from 'react';
import { ArrowDownRight, ArrowUpRight, TrendingUp } from 'lucide-react';
import type { CashFlowMonth } from '../../../services/FinancialStatementsService';
import { formatCurrency } from './format';

export function CashFlowPanel({ cash }: {
  cash: { months: CashFlowMonth[]; totals: CashFlowMonth };
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold"><ArrowDownRight className="w-4 h-4" /> إجمالي التدفقات الداخلة</div>
          <p className="mt-1 text-lg font-black">{formatCurrency(cash.totals.inflows)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-rose-600 text-xs font-bold"><ArrowUpRight className="w-4 h-4" /> إجمالي التدفقات الخارجة</div>
          <p className="mt-1 text-lg font-black">{formatCurrency(cash.totals.outflows)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-teal-600 text-xs font-bold"><TrendingUp className="w-4 h-4" /> صافي التدفق النقدي</div>
          <p className={`mt-1 text-lg font-black ${cash.totals.net < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(cash.totals.net)}</p>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
            <tr><th className="px-4 py-3">الشهر</th><th className="px-4 py-3">تدفقات داخلة</th><th className="px-4 py-3">تدفقات خارجة</th><th className="px-4 py-3">الصافي</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cash.months.map((month) => (
              <tr key={month.month}>
                <td className="px-4 py-2.5 font-mono">{month.month}</td>
                <td className="px-4 py-2.5 font-mono text-emerald-600">{formatCurrency(month.inflows)}</td>
                <td className="px-4 py-2.5 font-mono text-rose-600">{formatCurrency(month.outflows)}</td>
                <td className={`px-4 py-2.5 font-mono font-bold ${month.net < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatCurrency(month.net)}</td>
              </tr>
            ))}
            {cash.months.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-slate-400">لا توجد حركات في الفترة المحددة</td></tr>}
          </tbody>
          <tfoot className="bg-slate-50 font-black">
            <tr>
              <td className="px-4 py-3">الإجمالي</td>
              <td className="px-4 py-3 font-mono text-emerald-700">{formatCurrency(cash.totals.inflows)}</td>
              <td className="px-4 py-3 font-mono text-rose-700">{formatCurrency(cash.totals.outflows)}</td>
              <td className={`px-4 py-3 font-mono ${cash.totals.net < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatCurrency(cash.totals.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
