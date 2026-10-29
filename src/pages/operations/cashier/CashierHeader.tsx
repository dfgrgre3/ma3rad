import React from 'react';
import { Clock, Plus, RefreshCw, Wallet } from 'lucide-react';
import type { CashShift, User } from '../../../types';
import { PermissionService } from '../../../services/PermissionService';

interface Props {
  currentUser: User | null;
  activeShift: CashShift | null;
  isLoading: boolean;
  onOpenShiftModal: () => void;
  onCloseShiftModal: () => void;
  onOpenExpenseModal: () => void;
  onRefresh: () => void;
}

export const CashierHeader: React.FC<Props> = ({
  currentUser,
  activeShift,
  isLoading,
  onOpenShiftModal,
  onCloseShiftModal,
  onOpenExpenseModal,
  onRefresh,
}) => {
  const canOpenShift = PermissionService.can(currentUser, 'cashier.shift.open');
  const canCloseShift = PermissionService.can(currentUser, 'cashier.shift.close');

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
          <Wallet className="w-6 h-6 text-emerald-600" />
          الخزينة النقدية والورديات
        </h2>
        <p className="text-xs text-slate-500 mt-1">إدارة ورديات الكاشير، متابعة رصيد الدرج، وتسجيل المصروفات التشغيلية</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {activeShift && canCloseShift ? (
          <button
            onClick={onCloseShiftModal}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-amber-600/20 transition-all active:scale-95 text-xs"
          >
            <Clock className="w-4 h-4" />
            <span>إغلاق الوردية ({activeShift.shiftNumber})</span>
          </button>
        ) : !activeShift && canOpenShift ? (
          <button
            onClick={onOpenShiftModal}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95 text-xs"
          >
            <Clock className="w-4 h-4" />
            <span>فتح وردية جديدة</span>
          </button>
        ) : null}

        <button
          onClick={onOpenExpenseModal}
          disabled={!activeShift}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/20 transition-all active:scale-95 text-xs"
        >
          <Plus className="w-4 h-4" />
          <span>سند صرف مصروف</span>
        </button>

        <button
          onClick={onRefresh}
          className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
          title="تحديث البيانات"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};
