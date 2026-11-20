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
    <div className="rounded-xl border border-line p-4">
      <p className="text-xs text-muted">الفحوص الحاجبة</p>
      <p className={`mt-1 text-2xl font-black ${failedChecksCount ? 'text-danger' : 'text-success'}`}>{failedChecksCount}</p>
    </div>
    <div className="rounded-xl border border-line p-4">
      <p className="text-xs text-muted">التحذيرات</p>
      <p className="mt-1 text-2xl font-black text-warning">{warningChecksCount}</p>
    </div>
    <div className="rounded-xl border border-line p-4">
      <p className="text-xs text-muted">المهام المكتملة</p>
      <p className="mt-1 text-2xl font-black text-primary">{completedTasks} / {tasksCount}</p>
    </div>
    <div className="rounded-xl border border-line p-4">
      <p className="text-xs text-muted">التسويات</p>
      <p className="mt-1 text-2xl font-black text-primary">{adjustmentsCount}</p>
    </div>
    {closingNotes && (
      <div className="sm:col-span-2 xl:col-span-4 rounded-xl bg-surface-muted p-3 text-sm leading-6 text-ink-secondary whitespace-pre-wrap">
        {closingNotes}
      </div>
    )}
  </div>
);
