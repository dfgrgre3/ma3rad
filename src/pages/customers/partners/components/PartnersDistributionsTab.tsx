import React from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { formatDate, formatMoney, formatNumber } from '../PartnersPage/partnersModel';
import type { PartnersPageVm } from '../../../../hooks/pages/customers/partners/usePartnersPage';

export const PartnersDistributionsTab: React.FC<{ vm: PartnersPageVm }> = ({ vm }) => {
  const { distributionHistory, openBatchId, batchLines, toggleBatch } = vm;
  return (
    <section className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-line bg-surface ">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 ">
          <h3 className="font-extrabold text-ink ">سجل توزيعات الأرباح</h3>
          <span className="text-xs text-muted">{formatNumber.format(distributionHistory.length)} دفعة</span>
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
                  <button type="button" onClick={() => toggleBatch(batch.batchId)} className="rounded-lg border border-line px-2 py-1 font-bold text-primary ">
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
        <div className="rounded-xl border border-line bg-surface p-4 ">
          <h4 className="mb-3 font-extrabold text-ink ">حصص الدفعة {openBatchId}</h4>
          <div className="space-y-2">
            {batchLines.map((line) => (
              <div key={line.partnerId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm ">
                <span className="font-bold text-ink ">{line.partnerName}</span>
                <span className="flex items-center gap-4 text-xs text-muted">
                  <span className="font-mono">{line.journalEntryNumber}</span>
                  <span className="font-extrabold text-success ">{formatMoney(line.amount)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
