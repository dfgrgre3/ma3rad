import React from 'react';
import { BadgeCheck, Wallet } from 'lucide-react';
import type { NumberFormatter } from '../../../types/dashboard/todayPurchases';

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
        <div className="flex items-start gap-2 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-[11px] font-semibold text-warning dark:bg-warning/40 ">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            يوجد <b>{fmt(remaining)}</b> مستحقة للموردين على فواتير اليوم، منها <b>{fmt(creditTotal)}</b> فواتير آجلة أو جزئية.
          </div>
          {canPay && (
            <button type="button" onClick={onShowUnpaid} className="shrink-0 rounded-md border border-warning px-2 py-1 font-bold underline-offset-2 hover:bg-warning-soft dark:hover:bg-warning/50">
              عرض الآجل
            </button>
          )}
        </div>
      )}
      {missingSupplierInvoiceCount > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-accent-border bg-accent-soft px-4 py-3 text-[11px] font-semibold text-primary dark:bg-primary/40 ">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>{plain(missingSupplierInvoiceCount)}</b> فاتورة توريد بدون رقم فاتورة المورد. إضافة الرقم تُسهّل المطابقة مع كشوف الموردين.
          </span>
        </div>
      )}
    </div>
  );
};
