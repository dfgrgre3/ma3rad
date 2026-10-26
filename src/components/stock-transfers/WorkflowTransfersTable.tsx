import React from 'react';
import { TransferStatusBadge } from './TransferStatusBadge';
import type { WorkflowTransfersTableProps } from './types';

export const WorkflowTransfersTable: React.FC<WorkflowTransfersTableProps> = ({
  transfers,
  onViewDetails,
  onApprove,
  onReject,
  onPrepare,
  onDispatch,
  onOpenReceive,
}) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <table className="w-full text-right text-xs">
      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
        <tr>
          <th className="p-3.5">رقم التحويل / التاريخ</th>
          <th className="p-3.5">من مخزن</th>
          <th className="p-3.5">إلى مخزن</th>
          <th className="p-3.5 text-center">عدد الأصناف</th>
          <th className="p-3.5 text-center">الكمية المطلوبة</th>
          <th className="p-3.5 text-center">المشحون / المستلم</th>
          <th className="p-3.5 text-center">الحالة</th>
          <th className="p-3.5 text-center">الإجراءات والمراحل</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {transfers.map((t) => (
          <tr key={t.id} className="hover:bg-slate-50/80 transition">
            <td className="p-3.5">
              <div className="font-mono font-black text-slate-900">{t.transferNumber}</div>
              <div className="text-[10px] text-slate-400 font-bold">{t.date}</div>
            </td>
            <td className="p-3.5">
              <span className="font-bold text-slate-800">{t.fromWarehouseName}</span>
            </td>
            <td className="p-3.5">
              <span className="font-bold text-sky-700">{t.toWarehouseName}</span>
            </td>
            <td className="p-3.5 text-center font-bold text-slate-600">
              {t.itemsCount} صنف
            </td>
            <td className="p-3.5 text-center font-mono font-black text-slate-900">
              {t.quantitySummary}
            </td>
            <td className="p-3.5 text-center font-mono">
              <div>مشحون: {t.shippedSummary}</div>
              <div className="text-emerald-700 font-bold">مستلم: {t.receivedSummary}</div>
              {t.totalLostM2 > 0 && (
                <div className="text-rose-600 font-bold text-[10px]">فقد: {t.lostSummary}</div>
              )}
            </td>
            <td className="p-3.5 text-center">
              <TransferStatusBadge status={t.status} />
            </td>
            <td className="p-3.5 text-center">
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                <button
                  onClick={() => onViewDetails(t)}
                  className="px-2.5 py-1 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-bold border border-slate-200"
                >
                  التفاصيل
                </button>

                {t.status === 'REQUESTED' && (
                  <>
                    <button
                      onClick={() => onApprove(t.id)}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
                    >
                      اعتماد
                    </button>
                    <button
                      onClick={() => onReject(t.id)}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold"
                    >
                      رفض
                    </button>
                  </>
                )}

                {t.status === 'APPROVED' && (
                  <button
                    onClick={() => onPrepare(t.id)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                  >
                    بدء التجهيز
                  </button>
                )}

                {t.status === 'PREPARING' && (
                  <button
                    onClick={() => onDispatch(t.id)}
                    className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold"
                  >
                    إرسال وشحن
                  </button>
                )}

                {t.status === 'IN_TRANSIT' && (
                  <>
                    <button
                      onClick={() => onOpenReceive(t)}
                      className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                    >
                      استلام البضاعة
                    </button>
                    <button
                      onClick={() => onReject(t.id)}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold"
                      title="رفض وإرجاع للمصدر"
                    >
                      رفض
                    </button>
                  </>
                )}
              </div>
            </td>
          </tr>
        ))}
        {transfers.length === 0 && (
          <tr>
            <td colSpan={8} className="py-12 text-center text-slate-400">
              لا توجد أوامر تحويل في هذه الحالة
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);
