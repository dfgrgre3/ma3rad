import React from 'react';
import { DataTable } from '../../ui/DataTable';
import type { AgingBucket, AgingRow } from '../../../services/domains/reports/FinancialStatementsService';
import { formatCurrency } from './format';

export function AgingPanel({ aging }: { aging: { rows: AgingRow[]; bucket: AgingBucket } }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <DataTable
        ariaLabel="تحليل أعمار الذمم"
        rows={aging.rows}
        rowKey={(row: any) => String(row.id)}
        tableClassName="text-sm"
        columns={[
          {
            key: 'name', header: 'الاسم',
            render: (row: any) => (
              <span className="font-semibold">
                {row.name}
                {row.phone ? <span className="block text-[10px] text-slate-400 font-mono">{row.phone}</span> : null}
              </span>
            ),
          },
          { key: 'c30', header: 'حتى 30', render: (row: any) => <span className="font-mono">{formatCurrency(row.current)}</span> },
          { key: 'd30', header: '31-60', render: (row: any) => <span className="font-mono">{formatCurrency(row.days30)}</span> },
          { key: 'd60', header: '61-90', render: (row: any) => <span className="font-mono">{formatCurrency(row.days60)}</span> },
          { key: 'd90', header: '91-120', render: (row: any) => <span className="font-mono text-amber-700">{formatCurrency(row.days90)}</span> },
          { key: 'over', header: '+120', render: (row: any) => <span className="font-mono text-rose-600">{formatCurrency(row.over90)}</span> },
          { key: 'total', header: 'الإجمالي', render: (row: any) => <span className="font-mono font-black">{formatCurrency(row.total)}</span> },
        ]}
        footer={
          <tr className="bg-slate-50 font-black">
            <td className="px-4 py-3">الإجمالي</td>
            <td className="px-4 py-3 font-mono">{formatCurrency(aging.bucket.current)}</td>
            <td className="px-4 py-3 font-mono">{formatCurrency(aging.bucket.days30)}</td>
            <td className="px-4 py-3 font-mono">{formatCurrency(aging.bucket.days60)}</td>
            <td className="px-4 py-3 font-mono">{formatCurrency(aging.bucket.days90)}</td>
            <td className="px-4 py-3 font-mono">{formatCurrency(aging.bucket.over90)}</td>
            <td className="px-4 py-3 font-mono">{formatCurrency(aging.bucket.total)}</td>
          </tr>
        }
        emptyTitle="لا توجد مديونيات مستحقة"
      />
    </div>
  );
}
