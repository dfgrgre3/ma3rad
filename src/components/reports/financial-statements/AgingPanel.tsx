import React from 'react';
import type { AgingBucket, AgingRow } from '../../../services/FinancialStatementsService';
import { formatCurrency } from './format';

export function AgingPanel({ aging }: { aging: { rows: AgingRow[]; bucket: AgingBucket } }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm text-right">
        <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
          <tr><th className="px-4 py-3">الاسم</th><th className="px-4 py-3">حتى 30</th><th className="px-4 py-3">31-60</th><th className="px-4 py-3">61-90</th><th className="px-4 py-3">91-120</th><th className="px-4 py-3">+120</th><th className="px-4 py-3">الإجمالي</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {aging.rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50/70">
              <td className="px-4 py-2.5 font-semibold">{row.name}{row.phone ? <span className="block text-[10px] text-slate-400 font-mono">{row.phone}</span> : null}</td>
              <td className="px-4 py-2.5 font-mono">{formatCurrency(row.current)}</td>
              <td className="px-4 py-2.5 font-mono">{formatCurrency(row.days30)}</td>
              <td className="px-4 py-2.5 font-mono">{formatCurrency(row.days60)}</td>
              <td className="px-4 py-2.5 font-mono text-amber-700">{formatCurrency(row.days90)}</td>
              <td className="px-4 py-2.5 font-mono text-rose-600">{formatCurrency(row.over90)}</td>
              <td className="px-4 py-2.5 font-mono font-black">{formatCurrency(row.total)}</td>
            </tr>
          ))}
          {aging.rows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">لا توجد مديونيات مستحقة</td></tr>}
        </tbody>
        <tfoot className="bg-slate-50 font-black">
          <tr>
            <td className="px-4 py-3">الإجمالي</td>
            <td className="px-4 py-3 font-mono">{formatCurrency(aging.bucket.current)}</td>
            <td className="px-4 py-3 font-mono">{formatCurrency(aging.bucket.days30)}</td>
            <td className="px-4 py-3 font-mono">{formatCurrency(aging.bucket.days60)}</td>
            <td className="px-4 py-3 font-mono">{formatCurrency(aging.bucket.days90)}</td>
            <td className="px-4 py-3 font-mono">{formatCurrency(aging.bucket.over90)}</td>
            <td className="px-4 py-3 font-mono">{formatCurrency(aging.bucket.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
