import React from 'react';
import type { FinancialCalendarEvent } from './types';
import { isIncome, totalsByCurrency } from './constants';

export const StatsCards: React.FC<{
  overdueCount: number;
  upcomingCount: number;
  filteredEvents: FinancialCalendarEvent[];
}> = ({ overdueCount, upcomingCount, filteredEvents }) => (
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <div className={`rounded-xl border p-4 shadow-sm ${overdueCount ? 'border-danger-border border-r-4 border-danger bg-danger-soft/70' : 'border-line border-r-4 border-success bg-surface'}`}>
      <p className="text-xs font-semibold text-ink-secondary">أحداث متأخرة غير مسددة</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${overdueCount ? 'text-danger' : 'text-success'}`}>{overdueCount}</p>
      <p className="mt-1 text-xs text-ink-secondary">{overdueCount ? 'تحتاج إلى متابعة' : 'لا توجد مستحقات متأخرة'}</p>
    </div>
    <div className="rounded-xl border border-warning-border border-r-4 border-warning bg-warning-soft/70 p-4 shadow-sm">
      <p className="text-xs font-semibold text-ink-secondary">استحقاقات خلال ٧ أيام</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-warning">{upcomingCount}</p>
      <p className="mt-1 text-xs text-ink-secondary">أحداث غير مسددة أو محصلة</p>
    </div>
    {[
      { label: 'الإيرادات المتوقعة', value: totalsByCurrency(filteredEvents.filter(isIncome), (event) => event.amount) },
      { label: 'المصروفات المتوقعة', value: totalsByCurrency(filteredEvents.filter((event) => !isIncome(event)), (event) => event.amount) },
      { label: 'إجمالي المحصل', value: totalsByCurrency(filteredEvents.filter(isIncome), (event) => event.paidAmount) },
      { label: 'إجمالي المدفوع', value: totalsByCurrency(filteredEvents.filter((event) => !isIncome(event)), (event) => event.paidAmount) },
    ].map((item, index) => (
      <div key={item.label} className={`min-w-0 rounded-xl border border-line border-r-4 bg-surface p-4 shadow-sm ${index === 0 || index === 2 ? 'border-success' : 'border-danger'}`}>
        <p className="text-xs font-medium text-muted">{item.label}</p>
        <p className={`mt-1 break-words text-lg font-black tabular-nums ${index === 0 || index === 2 ? 'text-success' : 'text-danger'}`}>{item.value}</p>
      </div>
    ))}
  </div>
);
