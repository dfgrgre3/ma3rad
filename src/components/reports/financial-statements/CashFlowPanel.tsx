import React from 'react';
import { DataTable } from '../../ui/DataTable';
import { ArrowDownRight, ArrowUpRight, TrendingUp } from 'lucide-react';
import type { CashFlowMonth } from '../../../services/domains/reports/FinancialStatementsService';
import { formatCurrency } from './format';

export function CashFlowPanel({ cash }: {
  cash: { months: CashFlowMonth[]; totals: CashFlowMonth; balances: { opening: number; closing: number } };
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <div className="bg-surface border border-line rounded-xl p-4">
          <div className="text-xs font-bold text-muted">رصيد النقدية الافتتاحي</div>
          <p className="mt-1 text-lg font-black">{formatCurrency(cash.balances.opening)}</p>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4">
          <div className="flex items-center gap-2 text-success text-xs font-bold"><ArrowDownRight className="w-4 h-4" /> إجمالي التدفقات الداخلة</div>
          <p className="mt-1 text-lg font-black">{formatCurrency(cash.totals.inflows)}</p>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4">
          <div className="flex items-center gap-2 text-danger text-xs font-bold"><ArrowUpRight className="w-4 h-4" /> إجمالي التدفقات الخارجة</div>
          <p className="mt-1 text-lg font-black">{formatCurrency(cash.totals.outflows)}</p>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4">
          <div className="flex items-center gap-2 text-success text-xs font-bold"><TrendingUp className="w-4 h-4" /> صافي التدفق النقدي</div>
          <p className={`mt-1 text-lg font-black ${cash.totals.net < 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(cash.totals.net)}</p>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4">
          <div className="text-xs font-bold text-muted">رصيد النقدية الختامي</div>
          <p className="mt-1 text-lg font-black">{formatCurrency(cash.balances.closing)}</p>
        </div>
      </div>
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <DataTable
          ariaLabel="التدفقات النقدية الشهرية"
          rows={cash.months}
          rowKey={(month: any) => String(month.month)}
          tableClassName="text-sm"
          columns={[
            { key: 'month', header: 'الشهر', render: (month: any) => <span className="font-mono">{month.month}</span> },
            { key: 'in', header: 'تدفقات داخلة', render: (month: any) => <span className="font-mono text-success">{formatCurrency(month.inflows)}</span> },
            { key: 'out', header: 'تدفقات خارجة', render: (month: any) => <span className="font-mono text-danger">{formatCurrency(month.outflows)}</span> },
            { key: 'net', header: 'الصافي', render: (month: any) => <span className={`font-mono font-bold ${month.net < 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(month.net)}</span> },
          ]}
          footer={
            <tr className="bg-surface-muted font-black">
              <td className="px-4 py-3">الإجمالي</td>
              <td className="px-4 py-3 font-mono text-success">{formatCurrency(cash.totals.inflows)}</td>
              <td className="px-4 py-3 font-mono text-danger">{formatCurrency(cash.totals.outflows)}</td>
              <td className={`px-4 py-3 font-mono ${cash.totals.net < 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(cash.totals.net)}</td>
            </tr>
          }
          emptyTitle="لا توجد حركات في الفترة المحددة"
        />
      </div>
    </div>
  );
}
