import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { CheckCircle, DollarSign } from 'lucide-react';
import type { Expense } from '../../../types';
import { CeramicMath } from '../../../utils/products/ceramicMath';

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
        <DataTable
          ariaLabel="مصروفات الكاشير"
          rows={expenses}
          rowKey={(exp: any) => String(exp.id)}
          dense
          tableClassName="whitespace-nowrap text-xs"
          rowClassName={() => 'transition-colors group hover:bg-slate-100'}
          columns={[
            { key: 'cat', header: 'بند المصروف', render: (exp: any) => <span className="font-bold text-slate-900">{exp.category}</span> },
            { key: 'amount', header: 'المبلغ', render: (exp: any) => <span className="text-sm font-black tabular-nums text-red-600">{CeramicMath.formatCurrency(exp.amount)}</span> },
            { key: 'recipient', header: 'المستلم', render: (exp: any) => <span className="text-slate-700">{exp.recipient || '-'}</span> },
            { key: 'desc', header: 'البيان', render: (exp: any) => <span className="block max-w-xs truncate text-slate-500" title={exp.description}>{exp.description}</span> },
            {
              key: 'method', header: 'طريقة الصرف',
              render: (exp: any) => (
                <span className={`rounded-md border px-2 py-1 text-[10px] font-bold ${exp.paymentType === 'CASH' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-600'}`}>
                  {exp.paymentType === 'CASH' ? 'نقدي' : 'تحويل'}
                </span>
              ),
            },
            { key: 'by', header: 'المستخدم', render: (exp: any) => <span className="text-slate-600">{exp.performedByName || 'المدير'}</span> },
            { key: 'date', header: 'التاريخ', render: (exp: any) => <span className="font-mono text-[11px] tabular-nums text-slate-500">{exp.date}</span> },
          ]}
          emptyTitle="لا توجد مصروفات مسجلة في هذه الفترة"
        />
      </div>
    </div>
  );
};
