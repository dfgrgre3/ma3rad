import React from 'react';
import { BookmarkPlus, Boxes, Receipt, DollarSign } from 'lucide-react';
import { fmtCurrency } from './helpers';

interface ReservationStatsCardsProps {
  activeReservationsCount: number;
  reservedByUnit: Map<string, number>;
  pendingOrdersCount: number;
  totalDepositsCollected: number;
}

export const ReservationStatsCards: React.FC<ReservationStatsCardsProps> = ({
  activeReservationsCount,
  reservedByUnit,
  pendingOrdersCount,
  totalDepositsCollected,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-sky-50 dark:bg-sky-950/50 flex items-center justify-center text-sky-600 dark:text-sky-400">
          <BookmarkPlus className="w-6 h-6" />
        </div>
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">حجوزات نشطة حالياً</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{activeReservationsCount}</div>
          <div className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold mt-0.5">بضاعة محجوزة ومجمدة</div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <Boxes className="w-6 h-6" />
        </div>
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">إجمالي الكمية المحجوزة</div>
          <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{[...reservedByUnit].map(([unit, quantity]) => `${quantity.toLocaleString('ar-EG')} ${unit}`).join(' · ') || '0'}</div>
          <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">في جميع المخازن</div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <Receipt className="w-6 h-6" />
        </div>
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">طلبات حجز بانتظار الفوترة</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{pendingOrdersCount}</div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">طلبات معلقة ومؤكدة</div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <DollarSign className="w-6 h-6" />
        </div>
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">إجمالي العربونات المحصلة</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{fmtCurrency(totalDepositsCollected)}</div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">مقدمات طلبات العملاء</div>
        </div>
      </div>
    </div>
  );
};
