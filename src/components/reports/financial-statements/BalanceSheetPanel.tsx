import React from 'react';
import type { BalanceSheet, StatementLine } from '../../../services/FinancialStatementsService';
import { formatCurrency } from './format';

function StatementSection({ title, amount, lines, color }: {
  title: string;
  amount: number;
  lines: StatementLine[];
  color: 'teal' | 'rose' | 'emerald';
}) {
  const colors = {
    teal: 'bg-teal-50/60 text-teal-800 text-teal-700',
    rose: 'bg-rose-50/60 text-rose-800 text-rose-700',
    emerald: 'bg-emerald-50/60 text-emerald-800 text-emerald-700',
  }[color].split(' ');

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className={`px-4 py-3 border-b border-slate-200 ${colors[0]} flex items-center justify-between`}>
        <h3 className={`text-sm font-black ${colors[1]}`}>{title}</h3>
        <span className={`text-xs font-bold ${colors[2]}`}>{formatCurrency(amount)}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {lines.map((line, index) => (
          <div key={`${line.label}-${index}`} className={`flex items-center justify-between px-4 py-2.5 text-sm ${line.emphasis ? 'bg-slate-50 font-black text-slate-900' : 'text-slate-700'}`}>
            <span className={line.indent ? 'pr-4 text-slate-500' : ''}>{line.label}</span>
            <span className={`font-mono ${line.amount < 0 ? 'text-rose-600' : ''}`}>{formatCurrency(line.amount)}</span>
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
      <div className="lg:col-span-2 bg-slate-900 text-white rounded-xl px-5 py-3 flex items-center justify-between">
        <span className="text-xs font-bold">الأصول = الالتزامات + حقوق الملكية</span>
        <span className={`text-sm font-black font-mono ${Math.abs(balance.totals.difference) < 0.01 ? 'text-emerald-400' : 'text-amber-400'}`}>
          فرق التسوية: {formatCurrency(balance.totals.difference)}
        </span>
      </div>
    </div>
  );
}
