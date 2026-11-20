import React from 'react';
import { ArrowDownRight, Wallet } from 'lucide-react';
import type { CashRegister, CashShift, Expense } from '../../../types';
import { CeramicMath } from '../../../utils/products/ceramicMath';

interface Props {
  defaultRegister?: CashRegister;
  activeShift: CashShift | null;
  expenses: Expense[];
}

export const CashStatusCards: React.FC<Props> = ({ defaultRegister, activeShift, expenses }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Main Treasury Balance */}
      <div className="bg-surface p-5 rounded-2xl border border-line shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-muted">رصيد الخزينة الرئيسي</span>
          <div className="w-9 h-9 rounded-xl bg-success/10 text-success flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
        <div className="text-2xl font-black text-ink tracking-tight">
          {CeramicMath.formatCurrency(defaultRegister?.currentBalance || 0)}
        </div>
        <div className="text-[10px] text-muted mt-1 flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-success" />
          الرصيد النقدي المتوفر بالدرج
        </div>
      </div>

      {/* Current Active Shift */}
      <div className="bg-surface p-5 rounded-2xl border border-line shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-muted">حالة الوردية الحالية</span>
          <div className={`w-3 h-3 rounded-full ${activeShift ? 'bg-success animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-surface-sunken'}`} />
        </div>
        <div className="text-lg font-extrabold text-ink">
          {activeShift ? `وردية #${activeShift.shiftNumber}` : 'لا توجد وردية نشطة'}
        </div>
        <div className="text-xs text-muted mt-1">
          {activeShift ? `مبيعات نقدية: ${CeramicMath.formatCurrency(activeShift.totalSalesCash)}` : 'يجب فتح وردية للبدء في العمليات'}
        </div>
      </div>

      {/* Total Expenses */}
      <div className="bg-surface p-5 rounded-2xl border border-line shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-muted">إجمالي المصروفات</span>
          <div className="w-9 h-9 rounded-xl bg-danger/10 text-danger flex items-center justify-center">
            <ArrowDownRight className="w-5 h-5" />
          </div>
        </div>
        <div className="text-2xl font-black text-danger tracking-tight">
          {CeramicMath.formatCurrency(expenses.reduce((s, e) => s + e.amount, 0))}
        </div>
        <div className="text-[10px] text-muted mt-1">مصاريف تشغيلية ونظافة ونقل</div>
      </div>
    </div>
  );
};
