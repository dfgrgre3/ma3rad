import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { X, Printer, MessageCircle, History, PackageCheck, ChevronLeft, Receipt, Ban } from 'lucide-react';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import { Modal, Info } from './ui';
import { STATUS_LABELS, fmt } from '../../../types/sales/ordersPage';
import { summarizeOrderQuantity } from './helpers';
import { OperationalFieldsSummary } from '../../../components/products/OperationalFieldsSummary';
import type { OrderDetailModalProps } from './OrderDetailModal_part01';

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order: detail, canUpdate, canApprove, onClose, onPrint, onShareOnWhatsApp,
  onOpenTimeline, onOpenDelivery, onAdvance, onOpenConvert, onCancel,
  operationalFields, operationalFieldValues,
}) => (
  <Modal onClose={onClose} wide>
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-base font-black text-slate-900">طلب {detail.orderNumber}</h3>
        <p className="text-[11px] text-slate-500 mt-1">{detail.date} • {detail.warehouseName} • {STATUS_LABELS[detail.status].label}</p>
      </div>
      <OperationalFieldsSummary fields={operationalFields} values={operationalFieldValues} />
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
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      <Info label="المحصل" value={fmt(detail.paidAmount)} sub={detail.financialStatus === 'PAID' ? 'مسدد بالكامل' : detail.financialStatus === 'PARTIAL' ? 'تحصيل جزئي' : 'لم يتم التحصيل'} />
      <Info label="المتبقي" value={fmt(detail.remainingAmount)} sub={detail.financialStatus === 'PAID' ? 'الرصيد مسدد' : 'مستحق على العميل'} />
      <Info label="حالة العملية" value={detail.deliveryStatus === 'DELIVERED' ? 'التسليم كامل' : detail.deliveryStatus === 'PARTIAL' ? 'تسليم جزئي' : 'لم يبدأ التسليم'} sub={detail.billingStatus === 'INVOICED' ? `تمت الفوترة (${detail.invoiceNumber || ''})` : 'لم تصدر فاتورة'} />
    </div>
    <div className="border border-slate-200 rounded-xl overflow-x-auto mb-4">
      <DataTable
      ariaLabel="بنود الطلب"
      rows={detail.items || []}
      rowKey={(item: any) => String(item.id)}
      dense
      minWidth={600}
      tableClassName="text-[11px]"
      columns={[
        {
          key: 'product', header: 'الصنف',
          render: (item: any) => (
            <span className="font-bold text-slate-800">
              {item.productName}
              <div className="text-[9px] font-normal text-slate-400">{item.size} • {item.grade}</div>
            </span>
          ),
        },
        { key: 'qty', header: 'الكمية', render: (item: any) => <span className="font-mono">{formatProductQuantity(Number(item.quantityM2), item)}</span> },
        {
          key: 'delivered', header: 'المسلّم',
          render: (item: any) => {
            const remaining = Math.max(0, Number(item.quantityM2) - Number(item.deliveredM2 || 0));
            return (
              <span className="font-mono">
                <span className={remaining <= 0 ? 'font-bold text-emerald-600' : 'text-sky-600'}>
                  {formatProductQuantity(Number(item.deliveredM2 || 0), item)}
                </span>
                {remaining > 0 && <div className="text-[9px] text-slate-400">متبقي {remaining.toFixed(2)}</div>}
              </span>
            );
          },
        },
        { key: 'boxes', header: 'الكراتين', render: (item: any) => <span className="font-mono">{item.boxesCount}</span> },
        { key: 'price', header: 'السعر', render: (item: any) => <span className="font-mono">{fmt(item.unitPrice)}</span> },
        { key: 'disc', header: 'الخصم', render: (item: any) => <span className="font-mono text-rose-600">{item.discountAmount ? `-${fmt(item.discountAmount)}` : '—'}</span> },
        { key: 'total', header: 'الإجمالي', render: (item: any) => <span className="font-bold">{fmt(item.totalPrice)}</span> },
      ]}
    />
    </div>
    <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
      <button onClick={() => onPrint(detail)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> طباعة</button>
      <button onClick={() => onShareOnWhatsApp(detail)} className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> واتساب</button>
      <button onClick={() => onOpenTimeline(detail)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> سجل الحالات</button>
      {canUpdate && ['CONFIRMED', 'PROCESSING', 'PARTIAL'].includes(detail.status) && (
        <button onClick={() => onOpenDelivery(detail)} className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><PackageCheck className="w-3.5 h-3.5" /> تسجيل تسليم</button>
      )}
      {canApprove && ['PENDING', 'CONFIRMED'].includes(detail.status) && (
        <button onClick={() => onAdvance(detail)} className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
          <ChevronLeft className="w-3.5 h-3.5" />
          {detail.status === 'PENDING' ? 'تأكيد الطلب' : 'بدء التجهيز'}
        </button>
      )}
      {['PENDING', 'CONFIRMED', 'PROCESSING', 'PARTIAL'].includes(detail.status) && detail.billingStatus !== 'INVOICED' && (
        <button onClick={() => onOpenConvert(detail)} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" /> إصدار فاتورة وإتمام</button>
      )}
      {canApprove && !['COMPLETED', 'CANCELLED'].includes(detail.status) && (
        <button onClick={() => onCancel(detail)} className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" /> إلغاء الطلب</button>
      )}
    </div>
  </Modal>
);
