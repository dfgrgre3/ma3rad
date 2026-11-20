import React from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { X } from 'lucide-react';
import { fmt } from './helpers';
import { TransferStatusBadge } from './TransferStatusBadge';
import type { TransferDetailsModalProps } from '../../../../types/inventory/stockTransfers';

export const TransferDetailsModal: React.FC<TransferDetailsModalProps> = ({ transfer, items, onClose }) => (
  <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-surface rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-line">
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <h3 className="font-black text-ink text-sm">
          تفاصيل أمر التحويل ({transfer.transferNumber})
        </h3>
        <button onClick={onClose} className="p-1 rounded-lg text-muted hover:bg-surface-sunken">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div className="bg-surface-muted p-3 rounded-xl text-xs space-y-1">
          <div>الحالة: <TransferStatusBadge status={transfer.status} /></div>
          <div>المصدر: {transfer.fromWarehouseName} ← الوجهة: {transfer.toWarehouseName}</div>
          <div>المنشئ: {transfer.createdByName || 'النظام'} ({transfer.date})</div>
          {transfer.approvedByName && <div>المعتمد: {transfer.approvedByName} ({transfer.approvedAt})</div>}
          {transfer.dispatchedByName && <div>المسؤول عن الإرسال: {transfer.dispatchedByName} ({transfer.dispatchedAt})</div>}
          {transfer.receivedByName && <div>المستلم: {transfer.receivedByName} ({transfer.receivedAt})</div>}
          {transfer.rejectionReason && <div className="text-danger font-bold">سبب الرفض: {transfer.rejectionReason}</div>}
        </div>

        <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
          <DataTable
            ariaLabel="أصناف أمر التحويل"
            rows={items}
            rowKey={(i: any) => String(i.id)}
            dense
            tableClassName="text-xs"
            columns={[
              { key: 'name', header: 'الصنف', render: (i: any) => <span className="font-bold">{i.productName}</span> },
              { key: 'req', header: 'المطلوب', align: 'center', render: (i: any) => <span className="font-mono">{fmt(i.quantityM2)}</span> },
              { key: 'ship', header: 'المشحون', align: 'center', render: (i: any) => <span className="font-mono">{fmt(i.shippedM2)}</span> },
              { key: 'recv', header: 'المستلم', align: 'center', render: (i: any) => <span className="font-mono font-bold text-success">{fmt(i.receivedM2)}</span> },
              { key: 'lost', header: 'الفقد', align: 'center', render: (i: any) => <span className="font-mono text-danger">{fmt(i.lostM2 + i.damagedM2)}</span> },
            ]}
          />
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-line flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-surface-sunken text-xs font-bold text-ink"
        >
          إغلاق
        </button>
      </div>
    </div>
  </div>
);
