import React from 'react';
import { formatCurrency } from './format';

export type IncomeStatement = {
  revenue: number;
  merchandiseRevenue: number;
  shippingRevenue: number;
  otherRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  expenses: number;
  sourceExpenses: number;
  expenseReconciliationDifference: number;
  netProfit: number;
  margin: number;
};

function Row({ label, amount, emphasis, negative }: {
  label: string;
  amount: number;
  emphasis?: boolean;
  negative?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 border-b border-line last:border-0 ${emphasis ? 'bg-surface-muted font-black' : ''}`}>
      <span className={`text-sm ${emphasis ? 'text-ink' : 'text-ink-secondary'}`}>{label}</span>
      <span className={`font-mono text-sm ${negative ? 'text-danger' : 'text-ink'} ${emphasis ? 'font-black' : 'font-bold'}`}>
        {formatCurrency(amount)}
      </span>
    </div>
  );
}

export function IncomeStatementPanel({ statement }: { statement: IncomeStatement }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface border border-line rounded-xl p-4">
          <p className="text-xs text-muted font-bold">إجمالي الإيرادات</p>
          <p className="text-lg font-black font-mono">{formatCurrency(statement.revenue)}</p>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4">
          <p className="text-xs text-muted font-bold">صافي الربح</p>
          <p className={`text-lg font-black font-mono ${statement.netProfit < 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(statement.netProfit)}</p>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4">
          <p className="text-xs text-muted font-bold">هامش الربح</p>
          <p className="text-lg font-black font-mono">{statement.margin}%</p>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <div className="bg-surface-sunken px-4 py-2.5 text-xs font-black text-ink">الإيرادات</div>
        <Row label="إيرادات المبيعات" amount={statement.merchandiseRevenue} />
        <Row label="إيرادات الشحن" amount={statement.shippingRevenue} />
        <Row label="إيرادات أخرى" amount={statement.otherRevenue} />
        <Row label="إجمالي الإيرادات" amount={statement.revenue} emphasis />
        <div className="bg-surface-sunken px-4 py-2.5 text-xs font-black text-ink">تكلفة البضاعة المباعة</div>
        <Row label="تكلفة المبيعات" amount={statement.costOfGoodsSold} />
        <Row label="إجمالي الربح" amount={statement.grossProfit} emphasis />
        <div className="bg-surface-sunken px-4 py-2.5 text-xs font-black text-ink">المصروفات التشغيلية</div>
        <Row label="مصروفات من القيود المرحّلة" amount={statement.expenses} negative />
        <Row label="صافي الربح (الخسارة)" amount={statement.netProfit} emphasis negative={statement.netProfit < 0} />
      </div>

      {Math.abs(statement.expenseReconciliationDifference) >= 0.01 && (
        <div className="rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-xs font-semibold text-warning">
          فرق مصالحة المصروفات بين سجل المصروفات ({formatCurrency(statement.sourceExpenses)}) والقيود المرحّلة ({formatCurrency(statement.expenses)}): {formatCurrency(statement.expenseReconciliationDifference)}
        </div>
      )}
    </div>
  );
}
