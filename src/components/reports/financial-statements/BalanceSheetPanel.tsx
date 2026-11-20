import React from 'react';
import type { BalanceSheet, StatementLine } from '../../../services/domains/reports/FinancialStatementsService';
import { formatCurrency } from './format';

function StatementSection({ title, amount, lines, color }: {
  title: string;
  amount: number;
  lines: StatementLine[];
  color: 'teal' | 'rose' | 'emerald';
}) {
  const colors = {
    teal: 'bg-success-soft/60 text-success text-success',
    rose: 'bg-danger-soft/60 text-danger text-danger',
    emerald: 'bg-success-soft/60 text-success text-success',
  }[color].split(' ');

  return (
    <div className="bg-surface border border-line rounded-xl overflow-hidden">
      <div className={`px-4 py-3 border-b border-line ${colors[0]} flex items-center justify-between`}>
        <h3 className={`text-sm font-black ${colors[1]}`}>{title}</h3>
        <span className={`text-xs font-bold ${colors[2]}`}>{formatCurrency(amount)}</span>
      </div>
      <div className="divide-y divide-line-strong">
        {lines.map((line, index) => (
          <div key={`${line.label}-${index}`} className={`flex items-center justify-between px-4 py-2.5 text-sm ${line.emphasis ? 'bg-surface-muted font-black text-ink' : 'text-ink'}`}>
            <span className={line.indent ? 'pr-4 text-muted' : ''}>{line.label}</span>
            <span className={`font-mono ${line.amount < 0 ? 'text-danger' : ''}`}>{formatCurrency(line.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BalanceSheetPanel({ balance }: { balance: BalanceSheet }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <StatementSection title="الأصول" amount={balance.totals.assets} lines={balance.assets} color="teal" />
      <div className="space-y-4">
        <StatementSection title="الالتزامات" amount={balance.totals.liabilities} lines={balance.liabilities} color="rose" />
        <StatementSection title="حقوق الملكية" amount={balance.totals.equity} lines={balance.equity} color="emerald" />
      </div>
      <div className="lg:col-span-2 bg-primary text-white rounded-xl px-5 py-3 flex items-center justify-between">
        <span className="text-xs font-bold">الأصول = الالتزامات + حقوق الملكية</span>
        <span className={`text-sm font-black font-mono ${Math.abs(balance.totals.difference) < 0.01 ? 'text-success' : 'text-warning'}`}>
          فرق التسوية: {formatCurrency(balance.totals.difference)}
        </span>
      </div>
    </div>
  );
}
