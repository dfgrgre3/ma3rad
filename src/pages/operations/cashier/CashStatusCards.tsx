import React from 'react';
import { ArrowDownRight, Wallet } from 'lucide-react';
import type { CashRegister, CashShift, Expense } from '../../../types';
import { CeramicMath } from '../../../utils/ceramicMath';

interface Props {
  defaultRegister?: CashRegister;
  activeShift: CashShift | null;
  expenses: Expense[];
}

export const CashStatusCards: React.FC<Props> = ({ defaultRegister, activeShift, expenses }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Main Treasury Balance */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-slate-500">رصيد الخزينة الرئيسي</span>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
        <div className="text-2xl font-black text-slate-900 tracking-tight">
          {CeramicMath.formatCurrency(defaultRegister?.currentBalance || 0)}
        </div>
        <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          الرصيد النقدي المتوفر بالدرج
        </div>
      </div>

      {/* Current Active Shift */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-slate-500">حالة الوردية الحالية</span>
          <div className={`w-3 h-3 rounded-full ${activeShift ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-slate-300'}`} />
        </div>
        <div className="text-lg font-extrabold text-slate-900">
          {activeShift ? `وردية #${activeShift.shiftNumber}` : 'لا توجد وردية نشطة'}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {activeShift ? `مبيعات نقدية: ${CeramicMath.formatCurrency(activeShift.totalSalesCash)}` : 'يجب فتح وردية للبدء في العمليات'}
        </div>
      </div>

      {/* Total Expenses */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-slate-500">إجمالي المصروفات</span>
          <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-600 flex items-center justify-center">
            <ArrowDownRight className="w-5 h-5" />
          </div>
        </div>
        <div className="text-2xl font-black text-red-600 tracking-tight">
          {CeramicMath.formatCurrency(expenses.reduce((s, e) => s + e.amount, 0))}
        </div>
        <div className="text-[10px] text-slate-500 mt-1">مصاريف تشغيلية ونظافة ونقل</div>
      </div>
    </div>
  );
};
