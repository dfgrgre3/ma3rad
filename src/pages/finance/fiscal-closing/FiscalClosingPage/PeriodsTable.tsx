import type { FC } from 'react';
import { Circle, Lock } from 'lucide-react';
import { DataTable } from '../../../../components/ui/DataTable';
import type { FiscalPeriod } from '../../../../types/finance';
import { formatDate, periodStatus } from './utils';

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
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div>
        <h2 className="font-bold text-slate-800">حالة الأشهر والإقفالات</h2>
        <p className="mt-1 text-xs text-slate-500">حدد الشهر لمراجعة الفحوص والمهام والتسويات.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-semibold text-sky-800">مفتوحة</span>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">قيد المراجعة</span>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-semibold text-violet-800">بانتظار الاعتماد</span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">مقفلة</span>
        <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-800">مؤمّنة</span>
      </div>
    </div>

    {loading ? (
      <div className="p-12 text-center text-sm text-slate-500">جاري تحميل الفترات المالية...</div>
    ) : periods.length === 0 ? (
      <div className="p-10 text-center text-sm text-slate-500">لا توجد فترات مسجلة لهذه السنة المالية.</div>
    ) : (
      <div className="overflow-x-auto">
        <DataTable
          ariaLabel="الفترات المالية"
          rows={periods}
          rowKey={(period) => period.id}
          onRowClick={onSelectPeriod}
          rowClassName={(period) => selectedPeriodId === period.id ? 'bg-cyan-50/70' : 'hover:bg-slate-50'}
          columns={[
            {
              key: 'period', header: 'الشهر / الفترة',
              render: (period) => (
                <span className="font-bold text-slate-800">
                  {period.name}
                  <span className="mr-2 text-xs font-medium text-slate-400">#{period.periodNumber}</span>
                </span>
              ),
            },
            { key: 'start', header: 'بداية الفترة', render: (period) => <span className="text-slate-600">{formatDate(period.startDate)}</span> },
            { key: 'end', header: 'نهاية الفترة', render: (period) => <span className="text-slate-600">{formatDate(period.endDate)}</span> },
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
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); onOpenCloseChecklist(period); }}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
                      >
                        فحص وإقفال
                      </button>
                    )}
                    {state === 'CLOSED' && canReopen && (
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); onRequestReopen(period); }}
                        className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                      >
                        إعادة فتح
                      </button>
                    )}
                    {state === 'CLOSED' && canClose && (
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); onLockPeriod(period); }}
                        className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
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
