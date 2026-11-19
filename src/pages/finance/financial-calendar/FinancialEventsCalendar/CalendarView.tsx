import React from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Clock3, Plus } from 'lucide-react';
import type { FinancialCalendarEvent, ViewMode } from './types';
import { amountText, dateString, eventStatus, fullDate, monthName, typeOptions } from './constants';
import { EventButton } from './EventButton';

type Props = {
  mode: ViewMode;
  anchorDate: Date;
  onAnchorDateChange: (date: Date) => void;
  onModeChange: (mode: ViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelectDay: (day: Date) => void;
  calendarDays: Date[];
  mobileAgendaDays: Date[];
  filteredEvents: FinancialCalendarEvent[];
  todayKey: string;
  loading: boolean;
  loadError: string;
  canManage: boolean;
  onNewEvent: (dateKey: string) => void;
  onOpenDetails: (event: FinancialCalendarEvent) => void;
  filters: React.ReactNode;
};

export const CalendarView: React.FC<Props> = ({
  mode,
  anchorDate,
  onAnchorDateChange,
  onModeChange,
  onPrev,
  onNext,
  onToday,
  onSelectDay,
  calendarDays,
  mobileAgendaDays,
  filteredEvents,
  todayKey,
  loading,
  loadError,
  canManage,
  onNewEvent,
  onOpenDetails,
  filters,
}) => (
  <section aria-label="عرض التقويم المالي" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrev} aria-label="الفترة السابقة" className="rounded-lg border border-slate-300 p-2 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><ArrowRight className="h-4 w-4" /></button>
        <button type="button" onClick={onToday} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">اليوم</button>
        <button type="button" onClick={onNext} aria-label="الفترة التالية" className="rounded-lg border border-slate-300 p-2 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><ArrowLeft className="h-4 w-4" /></button>
        <h2 className="mr-1 min-w-36 text-lg font-black">{mode === 'day' ? fullDate(dateString(anchorDate)) : monthName(anchorDate)}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="طريقة عرض التقويم">
          {([['month', 'شهري'], ['week', 'أسبوعي'], ['day', 'يومي']] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => onModeChange(value)} aria-pressed={mode === value} className={`rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${mode === value ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
          ))}
        </div>
        {mode === 'month' && (
          <>
            <select aria-label="الشهر" value={anchorDate.getMonth()} onChange={(event) => onAnchorDateChange(new Date(anchorDate.getFullYear(), Number(event.target.value), 1))} className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
              {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{new Intl.DateTimeFormat('ar-EG', { month: 'long' }).format(new Date(2024, index, 1))}</option>)}
            </select>
            <select aria-label="السنة" value={anchorDate.getFullYear()} onChange={(event) => onAnchorDateChange(new Date(Number(event.target.value), anchorDate.getMonth(), 1))} className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
              {Array.from({ length: 11 }, (_, index) => anchorDate.getFullYear() - 5 + index).map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </>
        )}
      </div>
    </div>

    {filters}

    {loadError && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="h-4 w-4" />{loadError}</div>}
    {mode !== 'day' ? (
      <>
        <div className="space-y-2 xl:hidden">
          {mobileAgendaDays.map((day) => {
            const key = dateString(day);
            const dayEvents = filteredEvents.filter((event) => event.dueDate === key);
            const isToday = key === todayKey;
            return (
              <section key={key} className={`overflow-hidden rounded-xl border ${isToday ? 'border-cyan-300 bg-cyan-50/40' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
                  <button type="button" onClick={() => onSelectDay(day)} className="text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
                    <span className="block text-sm font-bold text-slate-800">{fullDate(key)}{isToday ? ' · اليوم' : ''}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{dayEvents.length} أحداث</span>
                  </button>
                  {canManage && <button type="button" onClick={() => onNewEvent(key)} aria-label={`إضافة حدث بتاريخ ${key}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-200 bg-white text-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><Plus className="h-4 w-4" /></button>}
                </div>
                <div className="space-y-1.5 p-2.5">
                  {dayEvents.length ? dayEvents.map((event) => <EventButton key={event.id} event={event} compact={false} onOpen={onOpenDetails} />) : <p className="px-1 py-2 text-xs text-slate-500">لا توجد أحداث في هذا اليوم.</p>}
                </div>
              </section>
            );
          })}
          {!mobileAgendaDays.length && <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{loading ? 'جارٍ تحميل الأحداث...' : 'لا توجد أحداث مالية مطابقة للفلاتر في هذه الفترة.'}</div>}
        </div>
        <div className="hidden xl:block">
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
          {(mode === 'month' ? ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'] : []).map((day) => (
            <div key={day} className="bg-slate-50 px-2 py-2 text-center text-xs font-bold text-slate-600">{day}</div>
          ))}
          {calendarDays.map((day) => {
            const key = dateString(day);
            const dayEvents = filteredEvents.filter((event) => event.dueDate === key);
            const outsideMonth = mode === 'month' && day.getMonth() !== anchorDate.getMonth();
            const isToday = key === dateString(new Date());
            const isSelectedDay = key === dateString(anchorDate);
            return (
              <div key={key} className={`min-h-28 bg-white p-2 transition-colors hover:bg-slate-50 ${isToday ? 'bg-cyan-50/60' : ''} ${outsideMonth ? 'opacity-60' : ''}`}>
                <div className="mb-1 flex items-center justify-between">
                  {mode === 'week' && <span className="text-[11px] font-semibold text-slate-500">{new Intl.DateTimeFormat('ar-EG', { weekday: 'short' }).format(day)}</span>}
                  <button type="button" onClick={() => onSelectDay(day)} aria-current={isToday ? 'date' : undefined} className={`rounded-full px-2 py-0.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${isToday ? 'bg-cyan-700 text-white' : isSelectedDay ? 'bg-cyan-100 text-cyan-900 ring-1 ring-cyan-300' : 'text-slate-600 hover:bg-slate-100'}`}>{new Intl.DateTimeFormat('ar-EG', { day: 'numeric' }).format(day)}</button>
                  {canManage && <button type="button" onClick={() => onNewEvent(key)} aria-label={`إضافة حدث بتاريخ ${key}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-cyan-50 hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><Plus className="h-4 w-4" /></button>}
                </div>
                {dayEvents.slice(0, mode === 'week' ? 8 : 3).map((item) => <EventButton key={item.id} event={item} compact={mode === 'month'} onOpen={onOpenDetails} />)}
                {dayEvents.length > (mode === 'week' ? 8 : 3) && <button type="button" onClick={() => onSelectDay(day)} className="text-xs font-semibold text-cyan-700">+{dayEvents.length - (mode === 'week' ? 8 : 3)} أحداث أخرى</button>}
              </div>
            );
          })}
        </div>
        </div>
      </>
    ) : (
      <div className="space-y-2">
        {filteredEvents.map((event) => (
          <div key={event.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-lg bg-cyan-50 p-2 text-cyan-700"><Clock3 className="h-4 w-4" /></div>
              <div className="min-w-0">
                <button type="button" onClick={() => onOpenDetails(event)} className="block truncate text-right font-bold text-slate-800 hover:text-cyan-800">{event.title}</button>
                <p className="mt-0.5 text-xs text-slate-500">{typeOptions.find((item) => item.value === event.eventType)?.label} · {event.partyName || 'دون طرف مرتبط'} · {event.reference || 'بدون مرجع'}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${eventStatus(event).color}`}>{eventStatus(event).label}</span>
              <span className="text-sm font-bold">{amountText(event.amount, event.currency)}</span>
              <span className="text-xs text-slate-500">{event.dueDate}</span>
            </div>
          </div>
        ))}
        {!filteredEvents.length && <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">{loading ? 'جارٍ تحميل الأحداث...' : 'لا توجد أحداث مالية في هذه الفترة.'}</div>}
      </div>
    )}
    {mode !== 'day' && filteredEvents.length === 0 && <p className="hidden text-center text-sm text-slate-500 xl:block">{loading ? 'جارٍ تحميل الأحداث...' : 'لا توجد أحداث مالية مطابقة للفلاتر في هذه الفترة.'}</p>}
  </section>
);

