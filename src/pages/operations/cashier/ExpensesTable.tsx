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
    <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 border-b border-line flex justify-between items-center bg-surface-sunken">
        <h3 className="font-extrabold text-sm text-ink flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-muted" />
          سجل سندات صرف المصروفات
        </h3>
        <span className="text-[10px] font-bold bg-surface-sunken text-ink-secondary px-2 py-1 rounded-md">
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
          rowClassName={() => 'transition-colors group hover:bg-surface-sunken'}
          columns={[
            { key: 'cat', header: 'بند المصروف', render: (exp: any) => <span className="font-bold text-ink">{exp.category}</span> },
            { key: 'amount', header: 'المبلغ', render: (exp: any) => <span className="text-sm font-black tabular-nums text-danger">{CeramicMath.formatCurrency(exp.amount)}</span> },
            { key: 'recipient', header: 'المستلم', render: (exp: any) => <span className="text-ink">{exp.recipient || '-'}</span> },
            { key: 'desc', header: 'البيان', render: (exp: any) => <span className="block max-w-xs truncate text-muted" title={exp.description}>{exp.description}</span> },
            {
              key: 'method', header: 'طريقة الصرف',
              render: (exp: any) => (
                <span className={`rounded-md border px-2 py-1 text-[10px] font-bold ${exp.paymentType === 'CASH' ? 'border-success-border bg-success-soft text-success' : 'bg-accent-soft text-primary'}`}>
                  {exp.paymentType === 'CASH' ? 'نقدي' : 'تحويل'}
                </span>
              ),
            },
            { key: 'by', header: 'المستخدم', render: (exp: any) => <span className="text-ink-secondary">{exp.performedByName || 'المدير'}</span> },
            { key: 'date', header: 'التاريخ', render: (exp: any) => <span className="font-mono text-[11px] tabular-nums text-muted">{exp.date}</span> },
          ]}
          emptyTitle="لا توجد مصروفات مسجلة في هذه الفترة"
        />
      </div>
    </div>
  );
};
