import React from 'react';
import { Lock, ShoppingCart, Unlock } from 'lucide-react';
import type { CashShift } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';

interface PosShiftStatusProps {
  activeShift: CashShift | null;
}

export const PosShiftStatus: React.FC<PosShiftStatusProps> = ({ activeShift }) => {
  const collected = activeShift
    ? activeShift.totalSalesCash + activeShift.totalSalesCard + activeShift.totalSalesTransfer
    : 0;

  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 shadow-md shadow-sky-500/20">
        <ShoppingCart className="h-5 w-5 text-white" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-sm font-black leading-tight text-slate-900">نقطة البيع السريعة</h1>
        {activeShift ? (
          <>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600">
              <span className="flex items-center gap-1 font-bold text-emerald-700">
                <Unlock className="h-3 w-3" aria-hidden="true" /> حالة الوردية: مفتوحة
              </span>
              <span className="font-mono text-slate-500">{activeShift.shiftNumber}</span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-4 lg:flex lg:flex-wrap lg:gap-x-5">
              <div className="min-w-0">
                <dt className="text-slate-500">الموظف</dt>
                <dd className="truncate font-bold text-slate-800">{activeShift.userName || 'غير محدد'}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-500">الخزينة</dt>
                <dd className="truncate font-bold text-slate-800">{activeShift.registerName || 'غير محددة'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">الرصيد الافتتاحي</dt>
                <dd className="font-black tabular-nums text-slate-800">{CeramicMath.formatCurrency(activeShift.openingBalance)} ج.م</dd>
              </div>
              <div>
                <dt className="text-slate-500">المتحصل خلال الوردية</dt>
                <dd className="font-black tabular-nums text-emerald-700">{CeramicMath.formatCurrency(collected)} ج.م</dd>
              </div>
            </dl>
          </>
        ) : (
          <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-amber-700">
            <Lock className="h-3 w-3" aria-hidden="true" /> لا توجد وردية مفتوحة
          </div>
        )}
      </div>
    </div>
  );
};
