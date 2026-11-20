import type { FC } from 'react';
import { formatClosedAt } from './utils';

interface AuditTabProps {
  audit: any[];
  runs: any[];
}

/** Audit trail and close-run history for the selected period. */
export const AuditTab: FC<AuditTabProps> = ({ audit, runs }) => (
  <div className="space-y-4">
    <div>
      <h3 className="font-bold text-ink">سجل النشاط والاعتمادات</h3>
      <div className="mt-2 space-y-2">
        {audit.length === 0 && <p className="text-sm text-muted">لا يوجد سجل لهذه الفترة بعد.</p>}
        {audit.map((entry) => (
          <article key={entry.id} className="rounded-xl border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-ink">{entry.action}</p>
              <span className="text-xs text-muted">{formatClosedAt(entry.createdAt)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {entry.actorName} · {entry.previousState || '—'} ← {entry.newState || '—'}
              {entry.reason ? ` · السبب: ${entry.reason}` : ''}
            </p>
          </article>
        ))}
      </div>
    </div>
    <div>
      <h3 className="font-bold text-ink">عمليات الإقفال</h3>
      <div className="mt-2 space-y-2">
        {runs.length === 0 && <p className="text-sm text-muted">لا توجد عمليات إقفال مسجلة.</p>}
        {runs.map((run) => (
          <article key={run.id} className="rounded-xl border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-ink">محاولة إقفال #{run.runNumber} · {run.status}</p>
              <span className="text-xs text-muted">{run.startedByName || run.startedBy} · {formatClosedAt(run.startedAt)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{(run.summary || []).filter((item: any) => item.status !== 'PASS' && item.status !== 'NOT_APPLICABLE').length} ملاحظة في هذه المحاولة</p>
          </article>
        ))}
      </div>
    </div>
  </div>
);
