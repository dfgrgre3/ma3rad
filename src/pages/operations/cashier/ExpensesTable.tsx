import React from 'react';
import { CheckCircle, DollarSign } from 'lucide-react';
import type { Expense } from '../../../types';
import { CeramicMath } from '../../../utils/ceramicMath';

interface Props {
  expenses: Expense[];
}

export const ExpensesTable: React.FC<Props> = ({ expenses }) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-100">
        <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-slate-500" />
          سجل سندات صرف المصروفات
        </h3>
        <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded-md">
          {expenses.length} سجل
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
            <tr>
              <th className="p-3.5">بند المصروف</th>
              <th className="p-3.5">المبلغ</th>
              <th className="p-3.5">المستلم</th>
              <th className="p-3.5 min-w-[200px]">البيان</th>
              <th className="p-3.5">طريقة الصرف</th>
              <th className="p-3.5">المستخدم</th>
              <th className="p-3.5">التاريخ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-1">
                    <CheckCircle className="w-6 h-6 opacity-50" />
                  </div>
                  لا توجد مصروفات مسجلة في هذه الفترة
                </td>
              </tr>
            ) : (
              expenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-100 transition-colors group">
                  <td className="p-3.5 font-bold text-slate-900">{exp.category}</td>
                  <td className="p-3.5 font-black text-red-600 text-sm tabular-nums">{CeramicMath.formatCurrency(exp.amount)}</td>
                  <td className="p-3.5 text-slate-700">{exp.recipient || '-'}</td>
                  <td className="p-3.5 text-slate-500 max-w-xs truncate" title={exp.description}>{exp.description}</td>
                  <td className="p-3.5">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold border ${exp.paymentType === 'CASH' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-600'}`}>
                      {exp.paymentType === 'CASH' ? 'نقدي' : 'تحويل'}
                    </span>
                  </td>
                  <td className="p-3.5 text-slate-600">{exp.performedByName || 'المدير'}</td>
                  <td className="p-3.5 font-mono text-slate-500 text-[11px] tabular-nums">{exp.date}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
