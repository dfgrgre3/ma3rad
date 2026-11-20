import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Receipt, DollarSign, ArrowUpRight, RotateCcw } from 'lucide-react';
import type { Order, OrderDeposit } from '../../../services/domains/sales/OrderService';
import { fmtCurrency } from './helpers';
import { orderStatusBadges, orderStatusLabels } from './constants';
import { ActivityGate } from '../../../components/ui/ActivityGate';

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
    <div className="bg-surface rounded-2xl border border-line/80 dark:border-line-strong shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <DataTable
        ariaLabel="طلبات العربون"
        rows={orders}
        rowKey={(o: any) => String(o.id)}
        tableClassName="text-sm"
        rowClassName={() => 'transition hover:bg-surface-muted/70 dark:hover:bg-primary/30'}
        columns={[
          {
            key: 'num', header: 'رقم الطلب',
            render: (o: any) => (
              <span className="flex items-center gap-2 font-bold text-ink dark:text-white">
                <Receipt className="h-4 w-4 text-primary" />
                {o.orderNumber}
              </span>
            ),
          },
          { key: 'customer', header: 'العميل', render: (o: any) => <span className="font-semibold text-ink ">{o.customerName || 'عميل نقدي'}</span> },
          { key: 'warehouse', header: 'المخزن', render: (o: any) => <span className="text-ink-secondary ">{o.warehouseName || 'المخزن الرئيسي'}</span> },
          { key: 'total', header: 'إجمالي الطلب', render: (o: any) => <span className="font-bold text-ink dark:text-white">{fmtCurrency(o.totalAmount)}</span> },
          {
            key: 'deposits', header: 'العربون المدفوع',
            render: (o: any) => (
              <div className="font-bold text-success ">
                <div>{fmtCurrency(o.paidAmount)}</div>
                <div className="mt-1 space-y-1">
                  {(depositsByOrder[o.id] || []).map((deposit: any) => (
                    <div key={deposit.id} className="flex items-center gap-1.5 text-[11px] font-medium text-muted ">
                      <span>{deposit.depositNumber}: {fmtCurrency(deposit.amount)}</span>
                      {deposit.refundNumber ? (
                        <span className="text-danger ">مردود ({deposit.refundNumber})</span>
                      ) : deposit.invoiceId ? (
                        <span>مسوّى بفاتورة</span>
                      ) : canRefund ? (
                        <ActivityGate element="deposit">
                          <button type="button" onClick={() => onRefundDeposit(deposit)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-danger hover:bg-danger-soft dark:hover:bg-danger/40" title="رد العربون">
                            <RotateCcw className="h-3 w-3" /> رد العربون
                          </button>
                        </ActivityGate>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ),
          },
          { key: 'remaining', header: 'المتبقي', render: (o: any) => <span className="font-bold text-danger ">{fmtCurrency(o.remainingAmount)}</span> },
          {
            key: 'percent', header: 'نسبة العربون',
            render: (o: any) => {
              const percentPaid = o.totalAmount > 0 ? Math.round((o.paidAmount / o.totalAmount) * 100) : 0;
              return (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-16 overflow-hidden rounded-full bg-surface-sunken ">
                    <div
                      className={`h-full ${percentPaid >= 100 ? 'bg-success' : percentPaid > 0 ? 'bg-warning' : 'bg-surface-sunken'}`}
                      style={{ width: `${Math.min(100, percentPaid)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-ink-secondary ">{percentPaid}%</span>
                </div>
              );
            },
          },
          {
            key: 'status', header: 'الحالة',
            render: (o: any) => (
              <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${orderStatusBadges[o.status] || 'border-line bg-surface-muted text-ink-secondary'}`}>
                {orderStatusLabels[o.status] || o.status}
              </span>
            ),
          },
          {
            key: 'actions', header: 'إجراءات', align: 'center',
            render: (o: any) => (
              <div className="flex items-center justify-center gap-1.5">
                {canCreate && o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                  <ActivityGate element="deposit">
                    <button onClick={() => onRecordDeposit(o)} className="flex items-center gap-1 rounded-lg bg-success-soft px-2.5 py-1.5 text-xs font-bold text-success transition hover:bg-success-soft dark:bg-success/40 " title="تسجيل دفعة أو عربون">
                      <DollarSign className="h-3.5 w-3.5" />
                      عربون
                    </button>
                  </ActivityGate>
                )}
                {canInvoice && o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                  <button onClick={() => onConvertToInvoice(o)} className="flex items-center gap-1 rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs font-bold text-primary transition hover:bg-accent-soft dark:bg-primary/40 " title="إصدار فاتورة مبيعات وخصم العربون">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    فوترة
                  </button>
                )}
                {o.invoiceNumber && (
                  <span className="rounded bg-surface-sunken px-2 py-1 text-[11px] font-bold text-muted ">فـ: {o.invoiceNumber}</span>
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
