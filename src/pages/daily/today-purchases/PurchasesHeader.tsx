import React from 'react';
import {
  CalendarDays, Download, ExternalLink, Plus, Printer, ReceiptText, RefreshCw, ShoppingBag, Users,
} from 'lucide-react';
import { formatDay, shiftDay } from './helpers';

export interface PurchasesHeaderProps {
  date: string;
  todayDate: string;
  invoiceCountLabel: string;
  hasData: boolean;
  canCreate: boolean;
  loading: boolean;
  onSelectDate: (date: string) => void;
  onRefresh: () => void;
  onPrint: () => void;
  onExport: () => void;
  onOpenQuickCreate: () => void;
  onNavigate: (path: string) => void;
}

export const PurchasesHeader: React.FC<PurchasesHeaderProps> = ({
  date, todayDate, invoiceCountLabel, hasData, canCreate, loading,
  onSelectDate, onRefresh, onPrint, onExport, onOpenQuickCreate, onNavigate,
}) => (
  <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300">
          <ShoppingBag className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-base font-black text-slate-900 dark:text-white">مشتريات اليوم</h1>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {date === todayDate ? 'اليوم' : formatDay(date)}
            </span>
            <span className="hidden rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:bg-orange-950 dark:text-orange-300 sm:inline-flex">
              {invoiceCountLabel} فاتورة توريد
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">متابعة فواتير التوريد والسداد والموردين والأصناف الواردة خلال اليوم</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canCreate && (
          <button
            type="button"
            onClick={onOpenQuickCreate}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          >
            <Plus className="h-4 w-4" /> فاتورة توريد
          </button>
        )}
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => onSelectDate(todayDate)}
            aria-pressed={date === todayDate}
            className={`min-h-8 rounded-md px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${date === todayDate ? 'bg-white text-orange-700 shadow-sm dark:bg-slate-700 dark:text-orange-300' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'}`}
          >
            اليوم
          </button>
          <button
            type="button"
            onClick={() => onSelectDate(shiftDay(todayDate, -1))}
            aria-pressed={date === shiftDay(todayDate, -1)}
            className={`min-h-8 rounded-md px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${date === shiftDay(todayDate, -1) ? 'bg-white text-orange-700 shadow-sm dark:bg-slate-700 dark:text-orange-300' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'}`}
          >
            أمس
          </button>
          <label className="relative flex min-h-8 items-center gap-1.5 border-r border-slate-200 px-2 dark:border-slate-700">
            <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span className="sr-only">اختيار تاريخ المشتريات</span>
            <input
              type="date"
              value={date}
              onChange={(event) => onSelectDate(event.target.value || todayDate)}
              aria-label="اختيار تاريخ المشتريات"
              className="w-[128px] bg-transparent text-xs font-semibold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-slate-200"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="تحديث بيانات المشتريات"
          title="تحديث"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          onClick={onPrint}
          disabled={!hasData}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Printer className="h-4 w-4" /> طباعة
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={!hasData}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" /> تصدير جدول بيانات
        </button>
      </div>
    </div>

    <div className="mx-auto mt-3 flex max-w-screen-2xl flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      <button type="button" onClick={() => onNavigate('/purchases')} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100 hover:text-orange-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-orange-300">
        <ExternalLink className="h-3.5 w-3.5" /> كل فواتير التوريد
      </button>
      <button type="button" onClick={() => onNavigate('/suppliers')} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100 hover:text-orange-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-orange-300">
        <Users className="h-3.5 w-3.5" /> الموردون
      </button>
      <button type="button" onClick={() => onNavigate('/purchases/returns')} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100 hover:text-orange-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-orange-300">
        <ReceiptText className="h-3.5 w-3.5" /> مرتجعات التوريد
      </button>
      <span className="mr-auto inline-flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className={`inline-flex h-2 w-2 rounded-full ${loading ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'}`} />
        {loading ? 'جارٍ التحديث…' : 'متصل بقاعدة البيانات المحلية'}
      </span>
    </div>
  </header>
);
