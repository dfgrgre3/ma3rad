import React from 'react';
import { DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import { fmtCurrency, sumTransactionsByType } from './helpers';
import type { FinancialTransaction } from './types';

interface EmployeeFinanceStatCardsProps {
  totalWagesBill: number;
  transactions: FinancialTransaction[];
}

export const EmployeeFinanceStatCards: React.FC<EmployeeFinanceStatCardsProps> = ({
  totalWagesBill,
  transactions,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-500 font-bold block mb-1">فاتورة الأجور التقديرية</span>
          <span className="text-lg font-black text-slate-900">{fmtCurrency(totalWagesBill)}</span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-600">
          <TrendingUp className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-500 font-bold block mb-1">إجمالي السلفيات المسجلة</span>
          <span className="text-lg font-black text-amber-600">
            {fmtCurrency(sumTransactionsByType(transactions, 'ADVANCE'))}
          </span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-600">
          <TrendingDown className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-500 font-bold block mb-1">المكافآت والحوافز</span>
          <span className="text-lg font-black text-emerald-600">
            {fmtCurrency(sumTransactionsByType(transactions, 'BONUS'))}
          </span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-600">
          <DollarSign className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-500 font-bold block mb-1">الخصومات المطبقة</span>
          <span className="text-lg font-black text-rose-600">
            {fmtCurrency(sumTransactionsByType(transactions, 'DEDUCTION'))}
          </span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center border border-rose-500/20 text-rose-600">
          <TrendingDown className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
