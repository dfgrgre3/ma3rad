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
      <div className="bg-surface p-5 rounded-2xl border border-line/80 dark:border-line-strong shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-accent-soft dark:bg-primary/50 flex items-center justify-center text-primary ">
          <BookmarkPlus className="w-6 h-6" />
        </div>
        <div>
          <div className="text-xs text-muted font-medium">حجوزات نشطة حالياً</div>
          <div className="text-2xl font-black text-ink dark:text-white mt-0.5">{activeReservationsCount}</div>
          <div className="text-[11px] text-primary font-semibold mt-0.5">بضاعة محجوزة ومجمدة</div>
        </div>
      </div>

      <div className="bg-surface p-5 rounded-2xl border border-line/80 dark:border-line-strong shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-accent-soft dark:bg-primary/50 flex items-center justify-center text-primary ">
          <Boxes className="w-6 h-6" />
        </div>
        <div>
          <div className="text-xs text-muted font-medium">إجمالي الكمية المحجوزة</div>
          <div className="text-lg font-black text-ink dark:text-white mt-0.5">{[...reservedByUnit].map(([unit, quantity]) => `${quantity.toLocaleString('ar-EG')} ${unit}`).join(' · ') || '0'}</div>
          <div className="text-[11px] text-primary font-semibold mt-0.5">في جميع المخازن</div>
        </div>
      </div>

      <div className="bg-surface p-5 rounded-2xl border border-line/80 dark:border-line-strong shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-warning-soft dark:bg-warning/50 flex items-center justify-center text-warning ">
          <Receipt className="w-6 h-6" />
        </div>
        <div>
          <div className="text-xs text-muted font-medium">طلبات حجز بانتظار الفوترة</div>
          <div className="text-2xl font-black text-ink dark:text-white mt-0.5">{pendingOrdersCount}</div>
          <div className="text-[11px] text-warning font-semibold mt-0.5">طلبات معلقة ومؤكدة</div>
        </div>
      </div>

      <div className="bg-surface p-5 rounded-2xl border border-line/80 dark:border-line-strong shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-success-soft dark:bg-success/50 flex items-center justify-center text-success ">
          <DollarSign className="w-6 h-6" />
        </div>
        <div>
          <div className="text-xs text-muted font-medium">إجمالي العربونات المحصلة</div>
          <div className="text-2xl font-black text-ink dark:text-white mt-0.5">{fmtCurrency(totalDepositsCollected)}</div>
          <div className="text-[11px] text-success font-semibold mt-0.5">مقدمات طلبات العملاء</div>
        </div>
      </div>
    </div>
  );
};
