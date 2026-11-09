import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CeramicMath } from '../../utils/products/ceramicMath';
import type { SalesTrendPoint } from '../../types/dashboard/components';

interface SalesTrendCardProps {
  chartData: SalesTrendPoint[];
}

export const SalesTrendCard: React.FC<SalesTrendCardProps> = ({ chartData }) => {
  return (
    <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-bold text-slate-900 dark:text-white">حركة المبيعات خلال آخر 7 أيام</h3>
          <p className="text-[11px] text-slate-400">الإيراد اليومي بناءً على الفواتير المعتمدة</p>
        </div>
        <span className="text-[11px] font-bold text-sky-600 bg-sky-50 dark:bg-sky-950 px-2 py-0.5 rounded">
          7 أيام
        </span>
      </div>

      <div className="h-52 w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--cerami-chart-grid)" />
            <XAxis dataKey="date" stroke="var(--cerami-muted)" fontSize={10} tickLine={false} />
            <YAxis stroke="var(--cerami-muted)" fontSize={10} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--cerami-tooltip-surface)', borderColor: 'var(--cerami-tooltip-border)', color: 'var(--cerami-text)', borderRadius: '6px', fontSize: '11px', padding: '4px 8px' }}
              formatter={(val: any) => [CeramicMath.formatCurrency(Number(val)), 'المبيعات']}
            />
            <Area isAnimationActive={false} type="monotone" dataKey="sales" stroke="var(--win-accent)" strokeWidth={2} fillOpacity={0.12} fill="var(--win-accent)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
