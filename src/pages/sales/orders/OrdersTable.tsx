import React from 'react';
import {
  Eye, Printer, History, MessageCircle, Pencil, PackageCheck, Receipt,
  Trash2, User, Phone, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Order } from '../../../services/OrderService';
import { IconBtn } from './ui';
import { STATUS_LABELS, fmt } from './types';

interface OrdersTableProps {
  orders: Order[];
  pageItems: Order[];
  page: number;
  totalPages: number;
  pageSize: number;
  canCreate: boolean;
  canUpdate: boolean;
  onViewDetails: (order: Order) => void;
  onPrintOrder: (order: Order) => void;
  onOpenTimeline: (order: Order) => void;
  onShareOnWhatsApp: (order: Order) => void;
  onEditOrder: (order: Order) => void;
  onOpenDelivery: (order: Order) => void;
  onOpenConvert: (order: Order) => void;
  onRemoveOrder: (order: Order) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export const OrdersTable: React.FC<OrdersTableProps> = ({
  orders, pageItems, page, totalPages, pageSize, canCreate, canUpdate,
  onViewDetails, onPrintOrder, onOpenTimeline, onShareOnWhatsApp, onEditOrder,
  onOpenDelivery, onOpenConvert, onRemoveOrder, onPrevPage, onNextPage,
}) => (
  <>
    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
      <table className="w-full text-right text-xs min-w-[980px]">
        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
          <tr>
            <th className="px-4 py-3">رقم الطلب</th>
            <th className="px-4 py-3">العميل</th>
            <th className="px-4 py-3">المخزن</th>
            <th className="px-4 py-3">التاريخ</th>
            <th className="px-4 py-3">التسليم المتوقع</th>
            <th className="px-4 py-3">البنود</th>
            <th className="px-4 py-3">التسليم</th>
            <th className="px-4 py-3">الإجمالي</th>
            <th className="px-4 py-3">الحالة</th>
            <th className="px-4 py-3">الفاتورة</th>
            <th className="px-4 py-3 text-center">الإجراءات</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {pageItems.map((o) => {
            const st = STATUS_LABELS[o.status];
            return (
              <tr key={o.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3 font-mono font-bold text-violet-600">{o.orderNumber}</td>
                <td className="px-4 py-3">
                  <div className="font-bold text-slate-800 flex items-center gap-1"><User className="w-3.5 h-3.5 text-slate-400" />{o.customerName}</div>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{o.customerPhone || '—'}</div>
                </td>
                <td className="px-4 py-3 text-sky-600 font-semibold">{o.warehouseName}</td>
                <td className="px-4 py-3 font-mono text-slate-500">{o.date}</td>
                <td className="px-4 py-3 font-mono text-slate-500">{o.expectedDeliveryDate || '—'}</td>
                <td className="px-4 py-3 text-slate-500">{o.itemsCount || 0} بند</td>
                <td className="px-4 py-3">
                  {(() => {
                    const pct = Math.min(100, Math.round(Number(o.deliveryProgress) || 0));
                    return (
                      <div className="min-w-[90px]">
                        <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 mb-1">
                          <span>اكتمال البنود</span>
                          <span className={pct >= 100 ? 'text-emerald-600' : 'text-sky-600'}>{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                </td>
                <td className="px-4 py-3 font-black text-slate-900">{fmt(o.totalAmount)}</td>
                <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${st.color}`}>{st.label}</span></td>
                <td className="px-4 py-3 font-mono text-[10px] text-emerald-600">{o.invoiceNumber || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <IconBtn title="تفاصيل الطلب" onClick={() => onViewDetails(o)}><Eye className="w-4 h-4" /></IconBtn>
                    <IconBtn title="طباعة الطلب" onClick={() => onPrintOrder(o)}><Printer className="w-4 h-4" /></IconBtn>
                    <IconBtn title="سجل الحالات" onClick={() => onOpenTimeline(o)}><History className="w-4 h-4" /></IconBtn>
                    <IconBtn title="مشاركة واتساب" onClick={() => onShareOnWhatsApp(o)}><MessageCircle className="w-4 h-4 text-emerald-600" /></IconBtn>
                    {canCreate && o.status === 'PENDING' && (
                      <IconBtn title="تعديل الطلب" onClick={() => onEditOrder(o)}><Pencil className="w-4 h-4" /></IconBtn>
                    )}
                    {canUpdate && ['CONFIRMED', 'PROCESSING', 'PARTIAL'].includes(o.status) && (
                      <IconBtn title="تسجيل تسليم" onClick={() => onOpenDelivery(o)}><PackageCheck className="w-4 h-4 text-sky-600" /></IconBtn>
                    )}
                    {canUpdate && ['PENDING', 'CONFIRMED', 'PROCESSING', 'PARTIAL'].includes(o.status) && (
                      <button onClick={() => onOpenConvert(o)} className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1"><Receipt className="w-3 h-3" /> فاتورة</button>
                    )}
                    {canUpdate && o.status === 'CANCELLED' && (
                      <IconBtn title="حذف الطلب الملغي" onClick={() => onRemoveOrder(o)}><Trash2 className="w-4 h-4 text-rose-500" /></IconBtn>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {orders.length === 0 && <tr><td colSpan={11} className="py-16 text-center text-slate-400">لا توجد طلبات مطابقة.</td></tr>}
        </tbody>
      </table>
    </div>

    {orders.length > pageSize && (
      <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
        <span>{(page - 1) * pageSize + 1} — {Math.min(page * pageSize, orders.length)} من {orders.length}</span>
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={onPrevPage} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          <span className="px-3 font-bold">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={onNextPage} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
        </div>
      </div>
    )}
  </>
);
