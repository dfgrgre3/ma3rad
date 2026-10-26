import React from 'react';
import { X, History } from 'lucide-react';
import { Order, OrderStatusEntry } from '../../../services/OrderService';
import { Modal } from './ui';
import { STATUS_LABELS } from './types';

interface TimelineModalProps {
  order: Order;
  entries: OrderStatusEntry[];
  onClose: () => void;
}

export const TimelineModal: React.FC<TimelineModalProps> = ({ order, entries, onClose }) => (
  <Modal onClose={onClose}>
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-base font-black text-slate-900 flex items-center gap-2"><History className="w-5 h-5 text-violet-600" /> سجل حالات الطلب {order.orderNumber}</h3>
      <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
    </div>
    {entries.length === 0 ? (
      <div className="py-10 text-center text-slate-400 text-xs">لا يوجد سجل حالات لهذا الطلب بعد.</div>
    ) : (
      <ol className="relative border-r-2 border-slate-100 mr-3 space-y-4 pr-5">
        {entries.map((entry) => (
          <li key={entry.id} className="relative">
            <span className="absolute -right-[27px] top-1 w-3 h-3 rounded-full bg-violet-500 border-2 border-white shadow" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-slate-800">{STATUS_LABELS[entry.toStatus]?.label || entry.toStatus}</span>
              <span className="text-[10px] font-mono text-slate-400">{new Date(entry.createdAt).toLocaleString('ar-EG')}</span>
            </div>
            {entry.fromStatus && <div className="text-[10px] text-slate-400 mt-0.5">من: {STATUS_LABELS[entry.fromStatus]?.label || entry.fromStatus}</div>}
            {entry.note && <div className="text-[11px] text-slate-600 mt-1">{entry.note}</div>}
            <div className="text-[10px] text-slate-400 mt-0.5">بواسطة {entry.createdByName || '—'}</div>
          </li>
        ))}
      </ol>
    )}
  </Modal>
);
