import React from 'react';
import { Wallet } from 'lucide-react';
import type { DailySupplierPaymentRow } from '../../../services/DailyOperationsService';
import { METHOD_STYLE, PAY_LABEL } from './constants';
import { MiniStat } from './primitives';
import type { NumberFormatter } from './types';

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
        <table className="w-full min-w-[820px] text-right text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/70">
            <tr>{['السند', 'المورد', 'الفواتير', 'المبلغ', 'طريقة السداد', 'بواسطة', 'ملاحظات'].map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">{heading}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {payments.map((payment) => (
              <tr key={payment.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono font-bold text-emerald-700 dark:text-emerald-300">{payment.receiptNumber}</td>
                <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{payment.supplierName || '—'}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">{payment.invoiceNumbers || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-black tabular-nums text-slate-900 dark:text-slate-100">{fmt(payment.amount)}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${METHOD_STYLE[payment.paymentType]?.text || 'text-slate-600 dark:text-slate-300'} bg-slate-100 dark:bg-slate-800`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${METHOD_STYLE[payment.paymentType]?.dot || 'bg-slate-400'}`} />
                    {PAY_LABEL[payment.paymentType] || payment.paymentType}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{payment.performedByName || '—'}</td>
                <td className="max-w-[220px] truncate px-3 py-2.5 text-slate-500 dark:text-slate-400" title={payment.notes || ''}>{payment.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
