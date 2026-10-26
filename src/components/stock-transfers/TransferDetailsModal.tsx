import React from 'react';
import { X } from 'lucide-react';
import { fmt } from './helpers';
import { TransferStatusBadge } from './TransferStatusBadge';
import type { TransferDetailsModalProps } from './types';

export const TransferDetailsModal: React.FC<TransferDetailsModalProps> = ({ transfer, items, onClose }) => (
  <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-100">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <h3 className="font-black text-slate-900 text-sm">
          تفاصيل أمر التحويل ({transfer.transferNumber})
        </h3>
        <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-1">
          <div>الحالة: <TransferStatusBadge status={transfer.status} /></div>
          <div>المصدر: {transfer.fromWarehouseName} ← الوجهة: {transfer.toWarehouseName}</div>
          <div>المنشئ: {transfer.createdByName || 'النظام'} ({transfer.date})</div>
          {transfer.approvedByName && <div>المعتمد: {transfer.approvedByName} ({transfer.approvedAt})</div>}
          {transfer.dispatchedByName && <div>المسؤول عن الإرسال: {transfer.dispatchedByName} ({transfer.dispatchedAt})</div>}
          {transfer.receivedByName && <div>المستلم: {transfer.receivedByName} ({transfer.receivedAt})</div>}
          {transfer.rejectionReason && <div className="text-rose-600 font-bold">سبب الرفض: {transfer.rejectionReason}</div>}
        </div>

        <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-500 font-bold">
              <tr>
                <th className="p-2">الصنف</th>
                <th className="p-2 text-center">المطلوب</th>
                <th className="p-2 text-center">المشحون</th>
                <th className="p-2 text-center">المستلم</th>
                <th className="p-2 text-center">الفقد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(i => (
                <tr key={i.id}>
                  <td className="p-2 font-bold">{i.productName}</td>
                  <td className="p-2 text-center font-mono">{fmt(i.quantityM2)}</td>
                  <td className="p-2 text-center font-mono">{fmt(i.shippedM2)}</td>
                  <td className="p-2 text-center font-mono text-emerald-700 font-bold">{fmt(i.receivedM2)}</td>
                  <td className="p-2 text-center font-mono text-rose-600">{fmt(i.lostM2 + i.damagedM2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-700"
        >
          إغلاق
        </button>
      </div>
    </div>
  </div>
);
