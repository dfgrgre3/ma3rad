import React from 'react';
import { Lock, ShoppingCart, Unlock } from 'lucide-react';
import type { CashShift } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';

interface PosShiftStatusProps {
  activeShift: CashShift | null;
}

export const PosShiftStatus: React.FC<PosShiftStatusProps> = ({ activeShift }) => (
  <div className="flex min-w-0 items-center gap-2.5">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 shadow-md shadow-sky-500/20">
      <ShoppingCart className="w-5 h-5 text-white" />
    </div>
    <div className="min-w-0">
      <h1 className="text-sm font-black text-slate-900 leading-tight">نقطة البيع السريعة</h1>
      <div className="flex items-center gap-2 text-[11px] text-slate-500 whitespace-nowrap">
        {activeShift ? (
          <>
            <span className="flex items-center gap-1 text-emerald-600 font-bold">
              <Unlock className="w-3 h-3" /> وردية مفتوحة
            </span>
            <span className="font-mono hidden sm:inline">{activeShift.shiftNumber}</span>
            <span className="hidden md:inline">•</span>
            <span className="hidden md:inline truncate max-w-[140px]">{activeShift.registerName}</span>
            <span className="hidden xl:flex items-center gap-2 mr-2 pr-2 border-r border-slate-200">
              <span>كاش: <span className="font-black text-emerald-600">{CeramicMath.formatCurrency(activeShift.totalSalesCash)}</span></span>
              <span>بطاقة: <span className="font-black text-sky-600">{CeramicMath.formatCurrency(activeShift.totalSalesCard)}</span></span>
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1 text-amber-600 font-bold">
            <Lock className="w-3 h-3" /> لا توجد وردية مفتوحة
          </span>
        )}
      </div>
    </div>
  </div>
);
