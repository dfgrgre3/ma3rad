import React from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CeramicMath } from '../../utils/products/ceramicMath';
import type { SalesTrendPoint } from '../../types/dashboard/components';
import { ArrowUpRight } from 'lucide-react';

interface SalesTrendCardProps {
  chartData: SalesTrendPoint[];
}

export const SalesTrendCard: React.FC<SalesTrendCardProps> = ({ chartData }) => {
  const hasSales = chartData.some((point) => point.sales !== 0);

  return (
    <section className="min-w-0 lg:col-span-2 rounded-[2px] border border-[#d9d9d9] bg-white p-3.5 dark:border-[#3d3d3d] dark:bg-[#2b2b2b]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[12px] font-extrabold text-[#1b1b1b] dark:text-[#f0f0f0]">حركة المبيعات خلال آخر 7 أيام</h3>
          <p className="text-[10px] text-[#767676] dark:text-[#a6a6a6]">الإيراد اليومي بناءً على الفواتير المعتمدة</p>
        </div>
        <Link to="/sales" className="inline-flex items-center gap-1 text-[10px] font-bold text-[#0067b8] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0078d4] dark:text-[#76c7ff]">
          سجلات المبيعات <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      {hasSales ? (
        <div className="h-44 min-w-0 w-full sm:h-52" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cerami-chart-grid)" />
              <XAxis
                dataKey="date"
                stroke="var(--cerami-muted)"
                fontSize={10}
                tickLine={false}
                minTickGap={8}
                interval="preserveStartEnd"
                tickFormatter={(value: string) => {
                  const date = new Date(`${value}T12:00:00`);
                  return Number.isNaN(date.getTime())
                    ? value
                    : date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric' });
                }}
              />
              <YAxis stroke="var(--cerami-muted)" fontSize={9} tickLine={false} width={48} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--cerami-tooltip-surface)', borderColor: 'var(--cerami-tooltip-border)', color: 'var(--cerami-text)', borderRadius: '6px', fontSize: '11px', padding: '4px 8px' }}
                formatter={(value: unknown) => [CeramicMath.formatCurrency(Number(value)), 'المبيعات']}
              />
              <Area isAnimationActive={false} type="monotone" dataKey="sales" stroke="var(--win-accent)" strokeWidth={2} fillOpacity={0.12} fill="var(--win-accent)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-12 text-center text-[11px] font-semibold text-[#767676] dark:text-[#a6a6a6]" role="status">لا توجد حركة مبيعات خلال هذه الفترة</p>
      )}
    </section>
  );
};
