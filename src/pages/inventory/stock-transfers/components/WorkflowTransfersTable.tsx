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
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
              <span className="block font-mono font-black text-slate-900">{t.transferNumber}</span>
              <span className="block text-[10px] font-bold text-slate-400">{t.date}</span>
            </span>
          ),
        },
        { key: 'from', header: 'من مخزن', render: (t: any) => <span className="font-bold text-slate-800">{t.fromWarehouseName}</span> },
        { key: 'to', header: 'إلى مخزن', render: (t: any) => <span className="font-bold text-sky-700">{t.toWarehouseName}</span> },
        { key: 'items', header: 'عدد الأصناف', align: 'center', render: (t: any) => <span className="font-bold text-slate-600">{t.itemsCount} صنف</span> },
        { key: 'qty', header: 'الكمية المطلوبة', align: 'center', render: (t: any) => <span className="font-mono font-black text-slate-900">{t.quantitySummary}</span> },
        {
          key: 'ship', header: 'المشحون / المستلم', align: 'center',
          render: (t: any) => (
            <span className="block font-mono">
              <span className="block">مشحون: {t.shippedSummary}</span>
              <span className="block font-bold text-emerald-700">مستلم: {t.receivedSummary}</span>
              {t.totalLostM2 > 0 && <span className="block text-[10px] font-bold text-rose-600">فقد: {t.lostSummary}</span>}
            </span>
          ),
        },
        { key: 'status', header: 'الحالة', align: 'center', render: (t: any) => <TransferStatusBadge status={t.status} /> },
        {
          key: 'actions', header: 'الإجراءات والمراحل', align: 'center',
          render: (t: any) => (
            <span className="flex flex-wrap items-center justify-center gap-1.5">
              <button onClick={() => onViewDetails(t)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100">
                التفاصيل
              </button>
              {t.status === 'REQUESTED' && canApprove && (
                <>
                  <button onClick={() => onApprove(t.id)} className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-blue-500">
                    اعتماد
                  </button>
                  <button onClick={() => onReject(t.id)} className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100">
                    رفض
                  </button>
                </>
              )}
              {t.status === 'APPROVED' && canExecute && (
                <button onClick={() => onPrepare(t.id)} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-500">
                  بدء التجهيز
                </button>
              )}
              {t.status === 'PREPARING' && canExecute && (
                <button onClick={() => onDispatch(t.id)} className="rounded-lg bg-purple-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-purple-500">
                  إرسال وشحن
                </button>
              )}
              {t.status === 'IN_TRANSIT' && (
                <>
                  {canReceive && (
                    <button onClick={() => onOpenReceive(t)} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500">
                      استلام البضاعة
                    </button>
                  )}
                  {canApprove && (
                    <button onClick={() => onReject(t.id)} className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700" title="رفض وإرجاع للمصدر">
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
