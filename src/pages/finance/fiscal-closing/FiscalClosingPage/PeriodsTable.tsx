import type { FC } from 'react';
import { Circle, Lock } from 'lucide-react';
import { DataTable } from '../../../../components/ui/DataTable';
import type { FiscalPeriod } from '../../../../types/finance';
import { formatDate, periodStatus } from './utils';
import { ActivityGate } from '../../../../components/ui/ActivityGate';

interface PeriodsTableProps {
  periods: FiscalPeriod[];
  loading: boolean;
  selectedPeriodId: string;
  canClose: boolean;
  canReopen: boolean;
  onSelectPeriod: (period: FiscalPeriod) => void;
  onOpenCloseChecklist: (period: FiscalPeriod) => void;
  onRequestReopen: (period: FiscalPeriod) => void;
  onLockPeriod: (period: FiscalPeriod) => void;
}

/** Table of fiscal periods with per-row close/reopen/lock actions. */
export const PeriodsTable: FC<PeriodsTableProps> = ({
  periods,
  loading,
  selectedPeriodId,
  canClose,
  canReopen,
  onSelectPeriod,
  onOpenCloseChecklist,
  onRequestReopen,
  onLockPeriod,
}) => (
  <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
    <div className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div>
        <h2 className="font-bold text-ink">حالة الأشهر والإقفالات</h2>
        <p className="mt-1 text-xs text-muted">حدد الشهر لمراجعة الفحوص والمهام والتسويات.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-accent-border bg-accent-soft px-2.5 py-1 font-semibold text-primary">مفتوحة</span>
        <span className="rounded-full border border-warning-border bg-warning-soft px-2.5 py-1 font-semibold text-warning">قيد المراجعة</span>
        <span className="rounded-full border border-accent-border bg-accent-soft px-2.5 py-1 font-semibold text-primary">بانتظار الاعتماد</span>
        <span className="rounded-full border border-success-border bg-success-soft px-2.5 py-1 font-semibold text-success">مقفلة</span>
        <span className="rounded-full border border-danger-border bg-danger-soft px-2.5 py-1 font-semibold text-danger">مؤمّنة</span>
      </div>
    </div>

    {loading ? (
      <div className="p-12 text-center text-sm text-muted">جاري تحميل الفترات المالية...</div>
    ) : periods.length === 0 ? (
      <div className="p-10 text-center text-sm text-muted">لا توجد فترات مسجلة لهذه السنة المالية.</div>
    ) : (
      <div className="overflow-x-auto">
        <DataTable
          ariaLabel="الفترات المالية"
          rows={periods}
          rowKey={(period) => period.id}
          onRowClick={onSelectPeriod}
          rowClassName={(period) => selectedPeriodId === period.id ? 'bg-accent-soft/70' : 'hover:bg-surface-muted'}
          columns={[
            {
              key: 'period', header: 'الشهر / الفترة',
              render: (period) => (
                <span className="font-bold text-ink">
                  {period.name}
                  <span className="mr-2 text-xs font-medium text-muted">#{period.periodNumber}</span>
                </span>
              ),
            },
            { key: 'start', header: 'بداية الفترة', render: (period) => <span className="text-ink-secondary">{formatDate(period.startDate)}</span> },
            { key: 'end', header: 'نهاية الفترة', render: (period) => <span className="text-ink-secondary">{formatDate(period.endDate)}</span> },
            {
              key: 'status', header: 'الحالة',
              render: (period) => {
                const status = periodStatus(period);
                const state = period.workflowState || period.status;
                return (
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${status.className}`}>
                    {state === 'OPEN' ? <Circle className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {status.label}
                  </span>
                );
              },
            },
            {
              key: 'actions', header: 'الإجراء',
              render: (period) => {
                const state = period.workflowState || period.status;
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {(state === 'OPEN' || state === 'IN_REVIEW') && canClose && (
                      <ActivityGate element="run">
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); onOpenCloseChecklist(period); }}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary"
                        >
                          فحص وإقفال
                        </button>
                      </ActivityGate>
                    )}
                    {state === 'CLOSED' && canReopen && (
                      <ActivityGate element="reopen">
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); onRequestReopen(period); }}
                          className="rounded-lg bg-warning-soft px-3 py-1.5 text-xs font-bold text-warning hover:bg-warning-soft"
                        >
                          إعادة فتح
                        </button>
                      </ActivityGate>
                    )}
                    {state === 'CLOSED' && canClose && (
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); onLockPeriod(period); }}
                        className="rounded-lg bg-danger-soft px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger-soft"
                      >
                        تأمين
                      </button>
                    )}
                  </div>
                );
              },
            },
          ]}
        />
      </div>
    )}
  </section>
);
