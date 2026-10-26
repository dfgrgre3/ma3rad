import React from 'react';
import { Cell, Pie, PieChart as PieChartRecharts, ResponsiveContainer, Tooltip } from 'recharts';
import { CeramicMath } from '../../utils/ceramicMath';
import { CHART_COLORS } from './types';

interface CategoryDistributionCardProps {
  categorySales: any[];
}

export const CategoryDistributionCard: React.FC<CategoryDistributionCardProps> = ({ categorySales }) => {
  return (
    <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
      <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-0.5">توزيع المبيعات حسب الفئة</h3>
      <p className="text-[11px] text-slate-400 mb-2">الحصة النسبية لكل تصنيف</p>
      <div className="h-44 w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <PieChartRecharts>
            <Pie
              isAnimationActive={false}
              data={categorySales}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={55}
              dataKey="value"
            >
              {categorySales.map((_, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '6px', fontSize: '11px', padding: '4px 8px' }}
              formatter={(val: any) => [CeramicMath.formatCurrency(Number(val)), 'المبيعات']}
            />
          </PieChartRecharts>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
