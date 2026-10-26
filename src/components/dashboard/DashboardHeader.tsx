import React from 'react';
import { RefreshCw } from 'lucide-react';

interface DashboardHeaderProps {
  today: string;
  onRefresh: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ today, onRefresh }) => {
  return (
    <header className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-[#fffefa] px-5 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-7 sm:py-6">
      <div className="pointer-events-none absolute -left-10 -top-16 h-52 w-52 rounded-full border-[28px] border-teal-700/[0.045]" />
      <div aria-hidden="true" className="pointer-events-none absolute left-6 top-1/2 hidden h-14 w-14 -translate-y-1/2 grid-cols-2 gap-1 opacity-35 sm:grid">
        <span className="rounded-sm border border-teal-800/40 bg-teal-700/10" /><span className="rounded-sm border border-teal-800/40 bg-amber-700/10" />
        <span className="rounded-sm border border-teal-800/40 bg-amber-700/10" /><span className="rounded-sm border border-teal-800/40 bg-teal-700/10" />
      </div>
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-teal-800 dark:text-teal-300">
            <span className="h-2 w-2 rounded-full bg-teal-600" /> CeramiSys <span className="text-slate-300 dark:text-slate-600">/</span> مساحة العمل
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">مرحباً بك في لوحة المعلومات</h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">تابع حركة المعرض وأهم مؤشرات العمل من مكان واحد.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-left dark:border-slate-700 dark:bg-slate-800 sm:block">
            <div className="text-[10px] font-semibold text-slate-400">التاريخ</div>
            <div className="mt-0.5 text-xs font-bold text-slate-700 dark:text-slate-200">{today}</div>
          </div>
          <button type="button" onClick={onRefresh} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white transition hover:bg-teal-800 focus-visible:outline-teal-600 dark:bg-teal-700 dark:hover:bg-teal-600" aria-label="تحديث بيانات لوحة المعلومات">
            <RefreshCw className="h-3.5 w-3.5" /> تحديث البيانات
          </button>
        </div>
      </div>
    </header>
  );
};
