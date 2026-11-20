import React from 'react';
import { Clock, Plus, RefreshCw, Wallet } from 'lucide-react';
import type { CashShift, User } from '../../../types';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { ActivityGate } from '../../../components/ui/ActivityGate';

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
        <h2 className="text-xl font-extrabold text-ink flex items-center gap-2">
          <Wallet className="w-6 h-6 text-success" />
          الخزينة النقدية والورديات
        </h2>
        <p className="text-xs text-muted mt-1">إدارة ورديات الكاشير، متابعة رصيد الدرج، وتسجيل المصروفات التشغيلية</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {activeShift && canCloseShift ? (
          <ActivityGate element="close">
            <button
              onClick={onCloseShiftModal}
              className="px-4 py-2.5 bg-warning hover:bg-warning text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-warning/20 transition-all active:scale-95 text-xs"
            >
              <Clock className="w-4 h-4" />
              <span>إغلاق الوردية ({activeShift.shiftNumber})</span>
            </button>
          </ActivityGate>
        ) : !activeShift && canOpenShift ? (
          <ActivityGate element="open">
            <button
              onClick={onOpenShiftModal}
              className="px-4 py-2.5 bg-success hover:bg-success text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-success/20 transition-all active:scale-95 text-xs"
            >
              <Clock className="w-4 h-4" />
              <span>فتح وردية جديدة</span>
            </button>
          </ActivityGate>
        ) : null}

        <button
          onClick={onOpenExpenseModal}
          disabled={!activeShift}
          className="px-4 py-2.5 bg-primary hover:bg-primary disabled:bg-surface-sunken disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-primary/20 transition-all active:scale-95 text-xs"
        >
          <Plus className="w-4 h-4" />
          <span>سند صرف مصروف</span>
        </button>

        <button
          onClick={onRefresh}
          className="p-2.5 bg-surface border border-line text-ink-secondary rounded-xl hover:bg-surface-muted transition-colors"
          title="تحديث البيانات"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};
