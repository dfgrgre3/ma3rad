import React from 'react';
import {
  X, Printer, MessageCircle, History, PackageCheck, ChevronLeft, Receipt, Ban,
} from 'lucide-react';
import { Order } from '../../../services/OrderService';
import { formatProductQuantity } from '../../../utils/productUnits';
import { Modal, Info } from './ui';
import { STATUS_LABELS, fmt } from './types';
import { summarizeOrderQuantity } from './helpers';

interface OrderDetailModalProps {
  order: Order;
  canUpdate: boolean;
  onClose: () => void;
  onPrint: (order: Order) => void;
  onShareOnWhatsApp: (order: Order) => void;
  onOpenTimeline: (order: Order) => void;
  onOpenDelivery: (order: Order) => void;
  onAdvance: (order: Order) => void;
  onOpenConvert: (order: Order) => void;
  onCancel: (order: Order) => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order: detail, canUpdate, onClose, onPrint, onShareOnWhatsApp,
  onOpenTimeline, onOpenDelivery, onAdvance, onOpenConvert, onCancel,
}) => (
  <Modal onClose={onClose} wide>
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-base font-black text-slate-900">طلب {detail.orderNumber}</h3>
        <p className="text-[11px] text-slate-500 mt-1">{detail.date} • {detail.warehouseName} • {STATUS_LABELS[detail.status].label}</p>
      </div>
      <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
      <Info label="العميل" value={detail.customerName || '—'} sub={detail.customerPhone || ''} />
      <Info label="التسليم المتوقع" value={detail.expectedDeliveryDate || '—'} sub={detail.invoiceNumber ? `الفاتورة: ${detail.invoiceNumber}` : 'لم تُصدر فاتورة'} />
      <Info
        label="نسبة التسليم"
        value={`${Number(detail.totalM2 || 0) > 0 ? Math.round((Number(detail.deliveredM2 || 0) / Number(detail.totalM2 || 1)) * 100) : 0}%`}
        sub={`${summarizeOrderQuantity(detail.items || [], 'deliveredM2')} من ${summarizeOrderQuantity(detail.items || [], 'quantityM2')}`}
      />
      <Info label="القيمة" value={fmt(detail.totalAmount)} sub={`${detail.items?.length || 0} بند`} />
    </div>
    <div className="border border-slate-200 rounded-xl overflow-x-auto mb-4">
      <table className="w-full text-right text-[11px] min-w-[600px]">
        <thead className="bg-slate-50 text-slate-500 font-bold">
          <tr><th className="px-3 py-2">الصنف</th><th className="px-3 py-2">الكمية</th><th className="px-3 py-2">المسلّم</th><th className="px-3 py-2">الكراتين</th><th className="px-3 py-2">السعر</th><th className="px-3 py-2">الخصم</th><th className="px-3 py-2">الإجمالي</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {(detail.items || []).map((item) => {
            const remaining = Math.max(0, Number(item.quantityM2) - Number(item.deliveredM2 || 0));
            return (
            <tr key={item.id}>
              <td className="px-3 py-2 font-bold text-slate-800">{item.productName}<div className="text-[9px] text-slate-400 font-normal">{item.size} • {item.grade}</div></td>
              <td className="px-3 py-2 font-mono">{formatProductQuantity(Number(item.quantityM2), item)}</td>
              <td className="px-3 py-2 font-mono">
                <span className={remaining <= 0 ? 'text-emerald-600 font-bold' : 'text-sky-600'}>
                  {formatProductQuantity(Number(item.deliveredM2 || 0), item)}
                </span>
                {remaining > 0 && <div className="text-[9px] text-slate-400">متبقي {remaining.toFixed(2)}</div>}
              </td>
              <td className="px-3 py-2 font-mono">{item.boxesCount}</td>
              <td className="px-3 py-2 font-mono">{fmt(item.unitPrice)}</td>
              <td className="px-3 py-2 font-mono text-rose-600">{item.discountAmount ? `-${fmt(item.discountAmount)}` : '—'}</td>
              <td className="px-3 py-2 font-bold">{fmt(item.totalPrice)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
      <button onClick={() => onPrint(detail)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> طباعة</button>
      <button onClick={() => onShareOnWhatsApp(detail)} className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> واتساب</button>
      <button onClick={() => onOpenTimeline(detail)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> سجل الحالات</button>
      {canUpdate && ['CONFIRMED', 'PROCESSING', 'PARTIAL'].includes(detail.status) && (
        <button onClick={() => onOpenDelivery(detail)} className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><PackageCheck className="w-3.5 h-3.5" /> تسجيل تسليم</button>
      )}
      {canUpdate && ['PENDING', 'CONFIRMED'].includes(detail.status) && (
        <button onClick={() => onAdvance(detail)} className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
          <ChevronLeft className="w-3.5 h-3.5" />
          {detail.status === 'PENDING' ? 'تأكيد الطلب' : 'بدء التجهيز'}
        </button>
      )}
      {['PENDING', 'CONFIRMED', 'PROCESSING', 'PARTIAL'].includes(detail.status) && (
        <button onClick={() => onOpenConvert(detail)} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" /> إصدار فاتورة وإتمام</button>
      )}
      {canUpdate && !['COMPLETED', 'CANCELLED'].includes(detail.status) && (
        <button onClick={() => onCancel(detail)} className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" /> إلغاء الطلب</button>
      )}
    </div>
  </Modal>
);
