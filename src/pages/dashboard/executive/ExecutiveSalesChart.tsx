import React from 'react';
import {
  CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { CHART_COLORS, type DailySale, formatCurrency } from '../../../types/dashboard/executive';

interface Props {
  dailySales: DailySale[];
  branchData: { name: string; value: number }[];
  range: 'today' | 'week' | 'month' | 'year';
}

const RANGE_LABELS: Record<Props['range'], string> = {
  today: 'اليوم',
  week: 'آخر 7 أيام',
  month: 'آخر 30 يوم',
  year: 'آخر 12 شهر',
};

export const ExecutiveSalesChart: React.FC<Props> = ({ dailySales, branchData, range }) => {
  const isSinglePoint = dailySales.length <= 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Sales Line Chart — 2/3 width */}
      <div className="min-w-0 lg:col-span-2 bg-surface rounded-xl border border-line p-3 sm:p-4 ">
        <h3 className="text-sm font-bold text-ink dark:text-white mb-4">المبيعات والأرباح — {RANGE_LABELS[range]}</h3>
        {isSinglePoint && dailySales.length === 1 ? (
          <div className="h-48 flex items-center justify-center">
            <div className="text-center text-muted ">
              <p className="font-medium">نقطة بيانات واحدة</p>
              <p className="text-sm mt-1">مبيعات اليوم: {formatCurrency(dailySales[0].sales)}</p>
              <p className="text-sm">ربح اليوم: {formatCurrency(dailySales[0].profit)}</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailySales} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cerami-chart-grid)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--cerami-muted)' }} interval={dailySales.length > 7 ? 4 : 1} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--cerami-muted)' }} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--cerami-tooltip-surface)', border: '1px solid var(--cerami-tooltip-border)', borderRadius: 8, color: 'var(--cerami-text)' }}
                labelStyle={{ color: 'var(--cerami-muted)' }}
                formatter={(val: number) => [formatCurrency(val)]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: 'var(--cerami-muted)' }} />
              <Line type="monotone" dataKey="sales" name="مبيعات" stroke="#38bdf8" strokeWidth={2} dot={isSinglePoint ? { r: 6 } : false} activeDot={isSinglePoint ? { r: 8 } : { r: 6 }} />
              <Line type="monotone" dataKey="profit" name="ربح" stroke="#34d399" strokeWidth={2} dot={isSinglePoint ? { r: 6 } : false} activeDot={isSinglePoint ? { r: 8 } : { r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Branch Pie — 1/3 width */}
      <div className="min-w-0 bg-surface rounded-xl border border-line p-3 sm:p-4 ">
        <h3 className="text-sm font-bold text-ink dark:text-white mb-4">توزيع المبيعات بالفروع</h3>
        {branchData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted text-sm">لا توجد بيانات للفروع</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={branchData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {branchData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--cerami-tooltip-surface)', border: '1px solid var(--cerami-tooltip-border)', borderRadius: 8, color: 'var(--cerami-text)' }}
                  formatter={(val: number) => [formatCurrency(val)]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1">
              {branchData.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-muted truncate">{b.name}</span>
                  <span className="text-ink font-semibold mr-auto">{formatCurrency(b.value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
