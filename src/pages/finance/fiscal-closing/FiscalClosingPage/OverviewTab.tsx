import type { FC } from 'react';

interface OverviewTabProps {
  failedChecksCount: number;
  warningChecksCount: number;
  completedTasks: number;
  tasksCount: number;
  adjustmentsCount: number;
  closingNotes?: string | null;
}

/** Overview tab: summary counters and closing notes. */
export const OverviewTab: FC<OverviewTabProps> = ({
  failedChecksCount,
  warningChecksCount,
  completedTasks,
  tasksCount,
  adjustmentsCount,
  closingNotes,
}) => (
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">الفحوص الحاجبة</p>
      <p className={`mt-1 text-2xl font-black ${failedChecksCount ? 'text-rose-700' : 'text-emerald-700'}`}>{failedChecksCount}</p>
    </div>
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">التحذيرات</p>
      <p className="mt-1 text-2xl font-black text-amber-700">{warningChecksCount}</p>
    </div>
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">المهام المكتملة</p>
      <p className="mt-1 text-2xl font-black text-cyan-700">{completedTasks} / {tasksCount}</p>
    </div>
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">التسويات</p>
      <p className="mt-1 text-2xl font-black text-violet-700">{adjustmentsCount}</p>
    </div>
    {closingNotes && (
      <div className="sm:col-span-2 xl:col-span-4 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600 whitespace-pre-wrap">
        {closingNotes}
      </div>
    )}
  </div>
);
