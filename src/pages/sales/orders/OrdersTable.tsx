import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import {
  Eye, Printer, History, MessageCircle, Pencil, PackageCheck, Receipt,
  Trash2, User, Phone, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Order } from '../../../services/domains/sales/OrderService';
import { IconBtn } from './ui';
import { getOrderStatusLabel, fmt } from '../../../types/sales/ordersPage';

interface OrdersTableProps {
  orders: Order[];
  pageItems: Order[];
  page: number;
  totalPages: number;
  pageSize: number;
  canCreate: boolean;
  canUpdate: boolean;
  canApprove: boolean;
  canDelete: boolean;
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
  orders, pageItems, page, totalPages, pageSize, canUpdate, canDelete,
  onViewDetails, onPrintOrder, onOpenTimeline, onShareOnWhatsApp, onEditOrder,
  onOpenDelivery, onOpenConvert, onRemoveOrder, onPrevPage, onNextPage,
}) => (
  <>
    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
      <DataTable
      ariaLabel="طلبات المبيعات"
      rows={pageItems}
      rowKey={(o: any) => String(o.id)}
      dense
      minWidth={980}
      tableClassName="text-xs"
      rowClassName={() => 'transition hover:bg-slate-50/70'}
      columns={[
        { key: 'num', header: 'رقم الطلب', render: (o: any) => <span className="font-mono font-bold text-violet-600">{o.orderNumber}</span> },
        {
          key: 'customer', header: 'العميل',
          render: (o: any) => (
            <div>
              <div className="flex items-center gap-1 font-bold text-slate-800"><User className="h-3.5 w-3.5 text-slate-400" />{o.customerName}</div>
              <div className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-slate-400"><Phone className="h-3 w-3" />{o.customerPhone || '—'}</div>
            </div>
          ),
        },
        { key: 'warehouse', header: 'المخزن', render: (o: any) => <span className="font-semibold text-sky-600">{o.warehouseName}</span> },
        { key: 'date', header: 'التاريخ', render: (o: any) => <span className="font-mono text-slate-500">{o.date}</span> },
        { key: 'expected', header: 'التسليم المتوقع', render: (o: any) => <span className="font-mono text-slate-500">{o.expectedDeliveryDate || '—'}</span> },
        { key: 'items', header: 'البنود', render: (o: any) => <span className="text-slate-500">{o.itemsCount || 0} بند</span> },
        {
          key: 'delivery', header: 'التسليم',
          render: (o: any) => {
            const pct = Math.min(100, Math.round(Number(o.deliveryProgress) || 0));
            return (
              <div className="min-w-[90px]">
                <div className="mb-1 flex items-center justify-between text-[9px] font-bold text-slate-500">
                  <span>اكتمال البنود</span>
                  <span className={pct >= 100 ? 'text-emerald-600' : 'text-sky-600'}>{pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          },
        },
        { key: 'total', header: 'الإجمالي', render: (o: any) => <span className="font-black text-slate-900">{fmt(o.totalAmount)}</span> },
        {
          key: 'status', header: 'الحالة',
          render: (o: any) => {
            const st = getOrderStatusLabel(o.status);
            return (
              <div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${st.color}`}>{st.label}</span>
                <div className="mt-1 flex flex-col gap-0.5 text-[9px] font-bold text-slate-500">
                  <span>التسليم: {o.deliveryStatus === 'DELIVERED' ? 'كامل' : o.deliveryStatus === 'PARTIAL' ? 'جزئي' : 'لم يبدأ'}</span>
                  <span>الفوترة: {o.billingStatus === 'INVOICED' ? 'مفوتر' : 'غير مفوتر'}</span>
                  <span>ماليًا: {o.financialStatus === 'PAID' ? 'مسدد' : o.financialStatus === 'PARTIAL' ? 'جزئي' : 'غير مسدد'}</span>
                </div>
              </div>
            );
          },
        },
        { key: 'invoice', header: 'الفاتورة', render: (o: any) => <span className="font-mono text-[10px] text-emerald-600">{o.invoiceNumber || '—'}</span> },
        {
          key: 'actions', header: 'الإجراءات', align: 'center',
          render: (o: any) => (
            <div className="flex items-center justify-center gap-1">
              <IconBtn title="تفاصيل الطلب" onClick={() => onViewDetails(o)}><Eye className="h-4 w-4" /></IconBtn>
              <IconBtn title="طباعة الطلب" onClick={() => onPrintOrder(o)}><Printer className="h-4 w-4" /></IconBtn>
              <IconBtn title="سجل الحالات" onClick={() => onOpenTimeline(o)}><History className="h-4 w-4" /></IconBtn>
              <IconBtn title="مشاركة واتساب" onClick={() => onShareOnWhatsApp(o)}><MessageCircle className="h-4 w-4 text-emerald-600" /></IconBtn>
              {canUpdate && o.status === 'PENDING' && (
                <IconBtn title="تعديل الطلب" onClick={() => onEditOrder(o)}><Pencil className="h-4 w-4" /></IconBtn>
              )}
              {canUpdate && ['CONFIRMED', 'PROCESSING', 'PARTIAL', 'READY'].includes(o.status) && (
                <IconBtn title="تسجيل تسليم" onClick={() => onOpenDelivery(o)}><PackageCheck className="h-4 w-4 text-sky-600" /></IconBtn>
              )}
              {canUpdate && ['PENDING', 'CONFIRMED', 'PROCESSING', 'PARTIAL', 'READY'].includes(o.status) && (
                <button onClick={() => onOpenConvert(o)} className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700"><Receipt className="h-3 w-3" /> فاتورة</button>
              )}
              {canDelete && o.status === 'CANCELLED' && (
                <IconBtn title="حذف الطلب الملغي" onClick={() => onRemoveOrder(o)}><Trash2 className="h-4 w-4 text-rose-500" /></IconBtn>
              )}
            </div>
          ),
        },
      ]}
      emptyTitle="لا توجد طلبات مطابقة."
    />
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
