import React from 'react';
import { DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import { fmtCurrency, sumTransactionsByType } from './helpers';
import type { FinancialTransaction } from '../../../types/hr/employeesPage';

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
      <div className="bg-surface border border-line rounded-xl p-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-muted font-bold block mb-1">فاتورة الأجور التقديرية</span>
          <span className="text-lg font-black text-ink">{fmtCurrency(totalWagesBill)}</span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center border border-success/20 text-success">
          <TrendingUp className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-surface border border-line rounded-xl p-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-muted font-bold block mb-1">إجمالي السلفيات المسجلة</span>
          <span className="text-lg font-black text-warning">
            {fmtCurrency(sumTransactionsByType(transactions, 'ADVANCE'))}
          </span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center border border-warning/20 text-warning">
          <TrendingDown className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-surface border border-line rounded-xl p-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-muted font-bold block mb-1">المكافآت والحوافز</span>
          <span className="text-lg font-black text-success">
            {fmtCurrency(sumTransactionsByType(transactions, 'BONUS'))}
          </span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center border border-success/20 text-success">
          <DollarSign className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-surface border border-line rounded-xl p-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-muted font-bold block mb-1">الخصومات المطبقة</span>
          <span className="text-lg font-black text-danger">
            {fmtCurrency(sumTransactionsByType(transactions, 'DEDUCTION'))}
          </span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-danger/10 flex items-center justify-center border border-danger/20 text-danger">
          <TrendingDown className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
