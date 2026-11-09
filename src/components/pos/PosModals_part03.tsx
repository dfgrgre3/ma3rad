import React from 'react';
import { History, PlayCircle, Trash2 } from 'lucide-react';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { Modal } from './PosShared';
import type { HeldOrder } from '../../types/pos';

export const HeldOrdersModal: React.FC<{
  orders: HeldOrder[];
  onResume: (order: HeldOrder) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}> = ({ orders, onResume, onDelete, onClose }) => {
  const heldTotal = (h: HeldOrder) => {
    const lines = (h.items || []).reduce((sum, item) => sum + (item.quantityM2 * item.unitPrice - (item.discountAmount || 0)), 0);
    const base = Math.max(0, lines - (h.discountAmount || 0));
    const withTax = base + (h.taxPercentage ? base * (h.taxPercentage / 100) : 0);
    return withTax + (h.shippingCost || 0) + (h.extraFees || 0);
  };
  return (
  <Modal title="الطلبات المعلّقة" icon={<History className="w-5 h-5" />} onClose={onClose}>
    {orders.length === 0 ? (
      <div className="text-center text-slate-500 text-xs py-10">لا توجد طلبات معلّقة حالياً</div>
    ) : (
      <div className="space-y-2">
        {orders.map((h) => (
          <div key={h.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 truncate">{h.customerName}</div>
              <div className="text-[10px] text-slate-500">
                {h.items.length} أصناف • {new Date(h.createdAt).toLocaleString('ar-EG')}
              </div>
              <div className="text-[11px] font-black text-sky-700 tabular-nums mt-0.5">{CeramicMath.formatCurrency(heldTotal(h))}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onResume(h)}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1"
              >
                <PlayCircle className="w-3.5 h-3.5" /> استرجاع
              </button>
              <button onClick={() => onDelete(h.id)} className="p-1.5 text-slate-500 hover:text-rose-600">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </Modal>
  );
};
