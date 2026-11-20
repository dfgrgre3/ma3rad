import React from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { TransferStatusBadge } from './TransferStatusBadge';
import type { WorkflowTransfersTableProps } from '../../../../types/inventory/stockTransfers';

export const WorkflowTransfersTable: React.FC<WorkflowTransfersTableProps> = ({
  transfers,
  canApprove,
  canExecute,
  canReceive,
  onViewDetails,
  onApprove,
  onReject,
  onPrepare,
  onDispatch,
  onOpenReceive,
}) => (
  <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
    <DataTable
      ariaLabel="أوامر تحويل المخزون"
      rows={transfers}
      rowKey={(t: any) => String(t.id)}
      dense
      tableClassName="text-xs"
      columns={[
        {
          key: 'num', header: 'رقم التحويل / التاريخ',
          render: (t: any) => (
            <span className="block">
              <span className="block font-mono font-black text-ink">{t.transferNumber}</span>
              <span className="block text-[10px] font-bold text-muted">{t.date}</span>
            </span>
          ),
        },
        { key: 'from', header: 'من مخزن', render: (t: any) => <span className="font-bold text-ink">{t.fromWarehouseName}</span> },
        { key: 'to', header: 'إلى مخزن', render: (t: any) => <span className="font-bold text-primary">{t.toWarehouseName}</span> },
        { key: 'items', header: 'عدد الأصناف', align: 'center', render: (t: any) => <span className="font-bold text-ink-secondary">{t.itemsCount} صنف</span> },
        { key: 'qty', header: 'الكمية المطلوبة', align: 'center', render: (t: any) => <span className="font-mono font-black text-ink">{t.quantitySummary}</span> },
        {
          key: 'ship', header: 'المشحون / المستلم', align: 'center',
          render: (t: any) => (
            <span className="block font-mono">
              <span className="block">مشحون: {t.shippedSummary}</span>
              <span className="block font-bold text-success">مستلم: {t.receivedSummary}</span>
              {t.totalLostM2 > 0 && <span className="block text-[10px] font-bold text-danger">فقد: {t.lostSummary}</span>}
            </span>
          ),
        },
        { key: 'status', header: 'الحالة', align: 'center', render: (t: any) => <TransferStatusBadge status={t.status} /> },
        {
          key: 'actions', header: 'الإجراءات والمراحل', align: 'center',
          render: (t: any) => (
            <span className="flex flex-wrap items-center justify-center gap-1.5">
              <button onClick={() => onViewDetails(t)} className="rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-ink-secondary hover:bg-surface-sunken">
                التفاصيل
              </button>
              {t.status === 'REQUESTED' && canApprove && (
                <>
                  <button onClick={() => onApprove(t.id)} className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-white hover:bg-primary">
                    اعتماد
                  </button>
                  <button onClick={() => onReject(t.id)} className="rounded-lg bg-danger-soft px-2.5 py-1 text-xs font-bold text-danger hover:bg-danger-soft">
                    رفض
                  </button>
                </>
              )}
              {t.status === 'APPROVED' && canExecute && (
                <button onClick={() => onPrepare(t.id)} className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-white hover:bg-primary">
                  بدء التجهيز
                </button>
              )}
              {t.status === 'PREPARING' && canExecute && (
                <button onClick={() => onDispatch(t.id)} className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-white hover:bg-primary">
                  إرسال وشحن
                </button>
              )}
              {t.status === 'IN_TRANSIT' && (
                <>
                  {canReceive && (
                    <button onClick={() => onOpenReceive(t)} className="rounded-lg bg-success px-3 py-1 text-xs font-bold text-white hover:bg-success">
                      استلام البضاعة
                    </button>
                  )}
                  {canApprove && (
                    <button onClick={() => onReject(t.id)} className="rounded-lg bg-danger-soft px-2.5 py-1 text-xs font-bold text-danger" title="رفض وإرجاع للمصدر">
                      رفض
                    </button>
                  )}
                </>
              )}
            </span>
          ),
        },
      ]}
      emptyTitle="لا توجد أوامر تحويل في هذه الحالة"
    />
  </div>
);
