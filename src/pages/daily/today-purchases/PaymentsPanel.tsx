import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Wallet } from 'lucide-react';
import type { DailySupplierPaymentRow } from '../../../services/domains/operations/DailyOperationsService';
import { METHOD_STYLE, PAY_LABEL } from './constants';
import { MiniStat } from './primitives';
import type { NumberFormatter } from '../../../types/dashboard/todayPurchases';

export interface PaymentsPanelProps {
  payments: DailySupplierPaymentRow[];
  fmt: NumberFormatter;
  plain: NumberFormatter;
}

export const PaymentsPanel: React.FC<PaymentsPanelProps> = ({ payments, fmt, plain }) => (
  <div role="tabpanel" aria-label="سداد الموردين">
    <div className="grid gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:grid-cols-4">
      <MiniStat label="إجمالي السداد" value={fmt(payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0))} />
      <MiniStat label="عدد السندات" value={plain(payments.length)} />
      <MiniStat label="نقدي" value={fmt(payments.filter((payment) => payment.paymentType === 'CASH').reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0))} />
      <MiniStat label="بنكي / بطاقة" value={fmt(payments.filter((payment) => payment.paymentType !== 'CASH').reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0))} />
    </div>
    {payments.length === 0 ? (
      <div className="flex flex-col items-center px-4 py-14 text-center">
        <Wallet className="h-6 w-6 text-slate-400" />
        <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">لا توجد سندات سداد في هذا اليوم</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">سجّل دفعة من زر «سداد للمورد» بجانب أي فاتورة غير مسددة.</p>
      </div>
    ) : (
      <div className="overflow-x-auto">
        <DataTable
          ariaLabel="سندات سداد الموردين"
          rows={payments}
          rowKey={(payment: any) => String(payment.id)}
          minWidth={820}
          dense
          tableClassName="text-xs"
          columns={[
            { key: 'receipt', header: 'السند', render: (payment: any) => <span className="whitespace-nowrap font-mono font-bold text-emerald-700 dark:text-emerald-300">{payment.receiptNumber}</span> },
            { key: 'supplier', header: 'المورد', render: (payment: any) => <span className="font-semibold text-slate-900 dark:text-slate-100">{payment.supplierName || '—'}</span> },
            { key: 'invoices', header: 'الفواتير', render: (payment: any) => <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{payment.invoiceNumbers || '—'}</span> },
            { key: 'amount', header: 'المبلغ', render: (payment: any) => <span className="whitespace-nowrap font-black tabular-nums text-slate-900 dark:text-slate-100">{fmt(payment.amount)}</span> },
            {
              key: 'method', header: 'طريقة السداد',
              render: (payment: any) => (
                <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold dark:bg-slate-800 ${METHOD_STYLE[payment.paymentType]?.text || 'text-slate-600 dark:text-slate-300'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${METHOD_STYLE[payment.paymentType]?.dot || 'bg-slate-400'}`} />
                  {PAY_LABEL[payment.paymentType] || payment.paymentType}
                </span>
              ),
            },
            { key: 'by', header: 'بواسطة', render: (payment: any) => <span className="text-slate-600 dark:text-slate-300">{payment.performedByName || '—'}</span> },
            { key: 'notes', header: 'ملاحظات', render: (payment: any) => <span className="block max-w-[220px] truncate text-slate-500 dark:text-slate-400" title={payment.notes || ''}>{payment.notes || '—'}</span> },
          ]}
        />
      </div>
    )}
  </div>
);
