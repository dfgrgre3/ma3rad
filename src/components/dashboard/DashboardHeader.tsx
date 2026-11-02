import React from 'react';
import { Activity, RefreshCw } from 'lucide-react';

interface DashboardHeaderProps {
  today: string;
  onRefresh: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ today, onRefresh }) => {
  return (
    <header className="win-page-head flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[#0078d4] sm:flex">
          <Activity className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-bold tracking-[0.12em] text-[#0078d4]">سيراميسيس <span aria-hidden="true">/</span> مركز المتابعة</p>
          <h1 className="win-page-title text-[22px] sm:text-[27px]">لوحة المعلومات</h1>
          <p className="win-page-subtitle mt-1 text-[11px] leading-5 sm:text-xs">
            ملخص حركة المعرض والمؤشرات الرئيسية <span className="mx-1">·</span>{today}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="win-btn win-btn--primary shrink-0"
        aria-label="تحديث بيانات لوحة المعلومات"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> تحديث
      </button>
    </header>
  );
};
