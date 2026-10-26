import React from 'react';
import { BadgeCheck, Wallet } from 'lucide-react';
import type { NumberFormatter } from './types';

export interface PurchaseAlertsProps {
  remaining: number;
  creditTotal: number;
  missingSupplierInvoiceCount: number;
  canPay: boolean;
  onShowUnpaid: () => void;
  plain: NumberFormatter;
  fmt: NumberFormatter;
}

export const PurchaseAlerts: React.FC<PurchaseAlertsProps> = ({
  remaining, creditTotal, missingSupplierInvoiceCount, canPay, onShowUnpaid, plain, fmt,
}) => {
  if (!(remaining > 0 || missingSupplierInvoiceCount > 0)) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {remaining > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            يوجد <b>{fmt(remaining)}</b> مستحقة للموردين على فواتير اليوم، منها <b>{fmt(creditTotal)}</b> فواتير آجلة أو جزئية.
          </div>
          {canPay && (
            <button type="button" onClick={onShowUnpaid} className="shrink-0 rounded-md border border-amber-300 px-2 py-1 font-bold underline-offset-2 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/50">
              عرض الآجل
            </button>
          )}
        </div>
      )}
      {missingSupplierInvoiceCount > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[11px] font-semibold text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>{plain(missingSupplierInvoiceCount)}</b> فاتورة توريد بدون رقم فاتورة المورد. إضافة الرقم تُسهّل المطابقة مع كشوف الموردين.
          </span>
        </div>
      )}
    </div>
  );
};
