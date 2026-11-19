import React from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { formatDate, formatMoney, formatNumber } from '../PartnersPage/partnersModel';
import type { PartnersPageVm } from '../../../../hooks/pages/customers/partners/usePartnersPage';

export const PartnersDistributionsTab: React.FC<{ vm: PartnersPageVm }> = ({ vm }) => {
  const { distributionHistory, openBatchId, batchLines, toggleBatch } = vm;
  return (
    <section className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="font-extrabold text-slate-800 dark:text-slate-100">سجل توزيعات الأرباح</h3>
          <span className="text-xs text-slate-500">{formatNumber.format(distributionHistory.length)} دفعة</span>
        </div>
        <div className="overflow-x-auto">
          <DataTable
            ariaLabel="سجل توزيعات الأرباح"
            rows={distributionHistory}
            rowKey={(batch) => batch.batchId}
            minWidth={640}
            dense
            columns={[
              { key: 'batch', header: 'رقم الدفعة', render: (batch) => <span className="font-mono">{batch.batchId}</span> },
              { key: 'date', header: 'التاريخ', render: (batch) => formatDate(batch.transactionDate) },
              { key: 'partners', header: 'عدد الشركاء', render: (batch) => formatNumber.format(batch.partnersCount) },
              { key: 'total', header: 'إجمالي الموزع', render: (batch) => <span className="font-extrabold">{formatMoney(batch.totalAmount)}</span> },
              {
                key: 'details', header: 'التفاصيل',
                render: (batch) => (
                  <button type="button" onClick={() => toggleBatch(batch.batchId)} className="rounded-lg border border-slate-200 px-2 py-1 font-bold text-sky-700 dark:border-slate-700 dark:text-sky-300">
                    {openBatchId === batch.batchId ? 'إخفاء' : 'عرض الحصص'}
                  </button>
                ),
              },
            ]}
            emptyTitle="لم يتم توزيع أرباح بعد."
          />

        </div>
      </div>
      {openBatchId && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h4 className="mb-3 font-extrabold text-slate-800 dark:text-slate-100">حصص الدفعة {openBatchId}</h4>
          <div className="space-y-2">
            {batchLines.map((line) => (
              <div key={line.partnerId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
                <span className="font-bold text-slate-700 dark:text-slate-200">{line.partnerName}</span>
                <span className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="font-mono">{line.journalEntryNumber}</span>
                  <span className="font-extrabold text-emerald-700 dark:text-emerald-300">{formatMoney(line.amount)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
