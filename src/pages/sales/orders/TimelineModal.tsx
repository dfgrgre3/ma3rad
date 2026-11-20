import React from 'react';
import { X, History } from 'lucide-react';
import { Order, OrderStatusEntry } from '../../../services/domains/sales/OrderService';
import { Modal } from './ui';
import { getOrderStatusLabel } from '../../../types/sales/ordersPage';

interface TimelineModalProps {
  order: Order;
  entries: OrderStatusEntry[];
  onClose: () => void;
}

export const TimelineModal: React.FC<TimelineModalProps> = ({ order, entries, onClose }) => (
  <Modal onClose={onClose}>
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-base font-black text-ink flex items-center gap-2"><History className="w-5 h-5 text-primary" /> سجل حالات الطلب {order.orderNumber}</h3>
      <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
    </div>
    {entries.length === 0 ? (
      <div className="py-10 text-center text-muted text-xs">لا يوجد سجل حالات لهذا الطلب بعد.</div>
    ) : (
      <ol className="relative border-r-2 border-line mr-3 space-y-4 pr-5">
        {entries.map((entry) => (
          <li key={entry.id} className="relative">
            <span className="absolute -right-[27px] top-1 w-3 h-3 rounded-full bg-primary border-2 border-white shadow" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-ink">{getOrderStatusLabel(entry.toStatus).label}</span>
              <span className="text-[10px] font-mono text-muted">{new Date(entry.createdAt).toLocaleString('ar-EG')}</span>
            </div>
            {entry.fromStatus && <div className="text-[10px] text-muted mt-0.5">من: {getOrderStatusLabel(entry.fromStatus).label}</div>}
            {entry.note && <div className="text-[11px] text-ink-secondary mt-1">{entry.note}</div>}
            <div className="text-[10px] text-muted mt-0.5">بواسطة {entry.createdByName || '—'}</div>
          </li>
        ))}
      </ol>
    )}
  </Modal>
);
