import React from 'react';
import { Lock, ShoppingCart, Unlock } from 'lucide-react';
import type { CashShift } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { usePosActivityCopy } from '../../../../hooks/pages/sales/pos/usePosActivityCopy';

interface PosShiftStatusProps {
  activeShift: CashShift | null;
}

export const PosShiftStatus: React.FC<PosShiftStatusProps> = ({ activeShift }) => {
  const copy = usePosActivityCopy();
  const collected = activeShift
    ? activeShift.totalSalesCash + activeShift.totalSalesCard + activeShift.totalSalesTransfer
    : 0;

  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-primary shadow-md shadow-primary/20">
        <ShoppingCart className="h-5 w-5 text-white" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-sm font-black leading-tight text-ink">{copy.screenTitle}</h1>
        {activeShift ? (
          <>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-secondary">
              <span className="flex items-center gap-1 font-bold text-success">
                <Unlock className="h-3 w-3" aria-hidden="true" /> حالة الوردية: مفتوحة
              </span>
              <span className="font-mono text-muted">{activeShift.shiftNumber}</span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-4 lg:flex lg:flex-wrap lg:gap-x-5">
              <div className="min-w-0">
                <dt className="text-muted">الموظف</dt>
                <dd className="truncate font-bold text-ink">{activeShift.userName || 'غير محدد'}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted">الخزينة</dt>
                <dd className="truncate font-bold text-ink">{activeShift.registerName || 'غير محددة'}</dd>
              </div>
              <div>
                <dt className="text-muted">الرصيد الافتتاحي</dt>
                <dd className="font-black tabular-nums text-ink">{CeramicMath.formatCurrency(activeShift.openingBalance)}</dd>
              </div>
              <div>
                <dt className="text-muted">المتحصل خلال الوردية</dt>
                <dd className="font-black tabular-nums text-success">{CeramicMath.formatCurrency(collected)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-warning">
            <Lock className="h-3 w-3" aria-hidden="true" /> لا توجد وردية مفتوحة
          </div>
        )}
      </div>
    </div>
  );
};
