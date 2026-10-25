import React from 'react';
import type { ReconciliationCheck } from '../../../services/FinancialStatementsService';
import { formatCurrency } from './format';

export function ReconciliationPanel({ checks }: { checks: ReconciliationCheck[] }) {
  const issues = checks.filter((check) => check.status === 'DIFFERENCE').length;
  return (
    <div className="space-y-4">
      <div className={`rounded-xl border px-5 py-4 ${issues ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <p className="font-black text-sm">{issues ? `توجد ${issues} نقاط تحتاج إلى مراجعة` : 'الفحوصات المحاسبية متطابقة'}</p>
        <p className="text-xs text-slate-600 mt-1">تعرض هذه الصفحة فروقات الأستاذ العام مع سجلات العملاء والموردين وطبقات تكلفة المخزون.</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-right px-4 py-3">الفحص</th>
                <th className="text-left px-4 py-3">الأستاذ العام</th>
                <th className="text-left px-4 py-3">المصدر المقارن</th>
                <th className="text-left px-4 py-3">الفرق</th>
                <th className="text-right px-4 py-3">النتيجة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {checks.map((check) => (
                <tr key={check.key}>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-800">{check.label}</p>
                    <p className="text-xs text-slate-500 mt-1">{check.detail}</p>
                  </td>
                  <td className="px-4 py-3 text-left font-mono">{formatCurrency(check.ledger)}</td>
                  <td className="px-4 py-3 text-left font-mono">{formatCurrency(check.source)}</td>
                  <td className={`px-4 py-3 text-left font-mono ${check.status === 'MATCH' ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(check.difference)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${check.status === 'MATCH' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {check.status === 'MATCH' ? 'متطابق' : 'فرق'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
