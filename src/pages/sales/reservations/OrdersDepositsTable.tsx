import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Receipt, DollarSign, ArrowUpRight, RotateCcw } from 'lucide-react';
import type { Order, OrderDeposit } from '../../../services/domains/sales/OrderService';
import { fmtCurrency } from './helpers';
import { orderStatusBadges, orderStatusLabels } from './constants';

interface OrdersDepositsTableProps {
  orders: Order[];
  canCreate?: boolean;
  canInvoice?: boolean;
  canRefund?: boolean;
  depositsByOrder: Record<string, OrderDeposit[]>;
  onRecordDeposit: (order: Order) => void;
  onConvertToInvoice: (order: Order) => void;
  onRefundDeposit: (deposit: OrderDeposit) => void;
}

export const OrdersDepositsTable: React.FC<OrdersDepositsTableProps> = ({
  orders,
  canCreate = false,
  canInvoice = false,
  canRefund = false,
  depositsByOrder,
  onRecordDeposit,
  onConvertToInvoice,
  onRefundDeposit,
}) => {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <DataTable
        ariaLabel="طلبات العربون"
        rows={orders}
        rowKey={(o: any) => String(o.id)}
        tableClassName="text-sm"
        rowClassName={() => 'transition hover:bg-slate-50/70 dark:hover:bg-slate-700/30'}
        columns={[
          {
            key: 'num', header: 'رقم الطلب',
            render: (o: any) => (
              <span className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Receipt className="h-4 w-4 text-sky-600" />
                {o.orderNumber}
              </span>
            ),
          },
          { key: 'customer', header: 'العميل', render: (o: any) => <span className="font-semibold text-slate-800 dark:text-slate-200">{o.customerName || 'عميل نقدي'}</span> },
          { key: 'warehouse', header: 'المخزن', render: (o: any) => <span className="text-slate-600 dark:text-slate-300">{o.warehouseName || 'المخزن الرئيسي'}</span> },
          { key: 'total', header: 'إجمالي الطلب', render: (o: any) => <span className="font-bold text-slate-900 dark:text-white">{fmtCurrency(o.totalAmount)}</span> },
          {
            key: 'deposits', header: 'العربون المدفوع',
            render: (o: any) => (
              <div className="font-bold text-emerald-600 dark:text-emerald-400">
                <div>{fmtCurrency(o.paidAmount)}</div>
                <div className="mt-1 space-y-1">
                  {(depositsByOrder[o.id] || []).map((deposit: any) => (
                    <div key={deposit.id} className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      <span>{deposit.depositNumber}: {fmtCurrency(deposit.amount)}</span>
                      {deposit.refundNumber ? (
                        <span className="text-rose-600 dark:text-rose-400">مردود ({deposit.refundNumber})</span>
                      ) : deposit.invoiceId ? (
                        <span>مسوّى بفاتورة</span>
                      ) : canRefund ? (
                        <button type="button" onClick={() => onRefundDeposit(deposit)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40" title="رد العربون">
                          <RotateCcw className="h-3 w-3" /> رد العربون
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ),
          },
          { key: 'remaining', header: 'المتبقي', render: (o: any) => <span className="font-bold text-rose-600 dark:text-rose-400">{fmtCurrency(o.remainingAmount)}</span> },
          {
            key: 'percent', header: 'نسبة العربون',
            render: (o: any) => {
              const percentPaid = o.totalAmount > 0 ? Math.round((o.paidAmount / o.totalAmount) * 100) : 0;
              return (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className={`h-full ${percentPaid >= 100 ? 'bg-emerald-500' : percentPaid > 0 ? 'bg-amber-500' : 'bg-slate-300'}`}
                      style={{ width: `${Math.min(100, percentPaid)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{percentPaid}%</span>
                </div>
              );
            },
          },
          {
            key: 'status', header: 'الحالة',
            render: (o: any) => (
              <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${orderStatusBadges[o.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                {orderStatusLabels[o.status] || o.status}
              </span>
            ),
          },
          {
            key: 'actions', header: 'إجراءات', align: 'center',
            render: (o: any) => (
              <div className="flex items-center justify-center gap-1.5">
                {canCreate && o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                  <button onClick={() => onRecordDeposit(o)} className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300" title="تسجيل دفعة أو عربون">
                    <DollarSign className="h-3.5 w-3.5" />
                    عربون
                  </button>
                )}
                {canInvoice && o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                  <button onClick={() => onConvertToInvoice(o)} className="flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-700 transition hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300" title="إصدار فاتورة مبيعات وخصم العربون">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    فوترة
                  </button>
                )}
                {o.invoiceNumber && (
                  <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-700">فـ: {o.invoiceNumber}</span>
                )}
              </div>
            ),
          },
        ]}
        emptyTitle="لا توجد طلبات حجز مطابقة لخيارات البحث."
      />
      </div>
    </div>
  );
};
