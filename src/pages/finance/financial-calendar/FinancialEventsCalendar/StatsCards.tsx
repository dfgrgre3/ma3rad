import React from 'react';
import type { FinancialCalendarEvent } from './types';
import { isIncome, totalsByCurrency } from './constants';

export const StatsCards: React.FC<{
  overdueCount: number;
  upcomingCount: number;
  filteredEvents: FinancialCalendarEvent[];
}> = ({ overdueCount, upcomingCount, filteredEvents }) => (
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <div className={`rounded-xl border p-4 shadow-sm ${overdueCount ? 'border-rose-200 border-r-4 border-r-rose-500 bg-rose-50/70' : 'border-slate-200 border-r-4 border-r-emerald-500 bg-white'}`}>
      <p className="text-xs font-semibold text-slate-600">أحداث متأخرة غير مسددة</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${overdueCount ? 'text-rose-800' : 'text-emerald-800'}`}>{overdueCount}</p>
      <p className="mt-1 text-xs text-slate-600">{overdueCount ? 'تحتاج إلى متابعة' : 'لا توجد مستحقات متأخرة'}</p>
    </div>
    <div className="rounded-xl border border-amber-200 border-r-4 border-r-amber-500 bg-amber-50/70 p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-600">استحقاقات خلال ٧ أيام</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-amber-800">{upcomingCount}</p>
      <p className="mt-1 text-xs text-slate-600">أحداث غير مسددة أو محصلة</p>
    </div>
    {[
      { label: 'الإيرادات المتوقعة', value: totalsByCurrency(filteredEvents.filter(isIncome), (event) => event.amount) },
      { label: 'المصروفات المتوقعة', value: totalsByCurrency(filteredEvents.filter((event) => !isIncome(event)), (event) => event.amount) },
      { label: 'إجمالي المحصل', value: totalsByCurrency(filteredEvents.filter(isIncome), (event) => event.paidAmount) },
      { label: 'إجمالي المدفوع', value: totalsByCurrency(filteredEvents.filter((event) => !isIncome(event)), (event) => event.paidAmount) },
    ].map((item, index) => (
      <div key={item.label} className={`min-w-0 rounded-xl border border-slate-200 border-r-4 bg-white p-4 shadow-sm ${index === 0 || index === 2 ? 'border-r-emerald-500' : 'border-r-rose-500'}`}>
        <p className="text-xs font-medium text-slate-500">{item.label}</p>
        <p className={`mt-1 break-words text-lg font-black tabular-nums ${index === 0 || index === 2 ? 'text-emerald-700' : 'text-rose-700'}`}>{item.value}</p>
      </div>
    ))}
  </div>
);
