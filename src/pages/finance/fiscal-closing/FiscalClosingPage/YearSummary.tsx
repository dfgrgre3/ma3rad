import type { FC } from 'react';
import { Lock, ScrollText } from 'lucide-react';
import type { FiscalCloseCheck } from '../../../../services/domains/finance/FinancePeriodCloseService';
import type { FiscalYear } from '../../../../types/finance';
import { formatDate } from '../utils';

interface YearSummaryProps {
  selectedYear: FiscalYear;
  closedPeriods: number;
  openPeriods: number;
  periodsCount: number;
  completedTasks: number;
  tasksCount: number;
  readiness: FiscalCloseCheck[];
  canClose: boolean;
  canManage: boolean;
  onCloseYear: () => void;
  onGenerateOpenings: () => void;
}

/** Year-level stats cards and the close-year / opening-balances action bar. */
export const YearSummary: FC<YearSummaryProps> = ({
  selectedYear,
  closedPeriods,
  openPeriods,
  periodsCount,
  completedTasks,
  tasksCount,
  readiness,
  canClose,
  canManage,
  onCloseYear,
  onGenerateOpenings,
}) => (
  <>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-500">السنة المالية</p>
        <p className="mt-1 text-lg font-black text-slate-800">{selectedYear.name}</p>
        <p className="mt-1 text-xs text-slate-500">{formatDate(selectedYear.startDate)} — {formatDate(selectedYear.endDate)}</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-500">حالة السنة</p>
        <p className={`mt-1 text-lg font-black ${selectedYear.status === 'OPEN' ? 'text-emerald-700' : 'text-slate-700'}`}>
          {selectedYear.status === 'OPEN' ? 'مفتوحة' : selectedYear.workflowState === 'LOCKED' ? 'مؤمّنة' : 'مقفلة'}
        </p>
        <p className="mt-1 text-xs text-slate-500">{selectedYear.companyName || selectedYear.companyId} · {selectedYear.currency || 'EGP'}</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-500">الفترات المقفلة</p>
        <p className="mt-1 text-2xl font-black text-emerald-700">{closedPeriods} <span className="text-sm font-semibold text-slate-400">/ {periodsCount}</span></p>
        <p className="mt-1 text-xs text-slate-500">{openPeriods} فترة مفتوحة</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-500">المهام</p>
        <p className="mt-1 text-2xl font-black text-cyan-700">{completedTasks} <span className="text-sm font-semibold text-slate-400">/ {tasksCount}</span></p>
        <p className="mt-1 text-xs text-slate-500">مكتملة / إجمالي مهام الفترة المحددة</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-500">فحوص الإقفال السنوي</p>
        <p className={`mt-1 text-2xl font-black ${readiness.some((check) => check.status === 'FAIL') ? 'text-rose-700' : 'text-emerald-700'}`}>
          {readiness.filter((check) => check.status === 'FAIL').length}
        </p>
        <p className="mt-1 text-xs text-slate-500">فحص حاجب · {readiness.filter((check) => check.status === 'WARNING').length} تحذير</p>
      </div>
    </section>

    <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      {canClose && selectedYear.status === 'OPEN' && (
        <button
          type="button"
          onClick={onCloseYear}
          disabled={openPeriods > 0}
          title={openPeriods > 0 ? 'يجب إقفال جميع الأشهر قبل إقفال السنة' : 'إقفال السنة المالية'}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-3.5 py-2 text-sm font-bold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Lock className="h-4 w-4" />
          إقفال السنة المالية
        </button>
      )}
      {canManage && (
        <button
          type="button"
          onClick={onGenerateOpenings}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
        >
          <ScrollText className="h-4 w-4" />
          إنشاء الأرصدة الافتتاحية
        </button>
      )}
      <span className="mr-auto text-xs text-slate-500">
        الأرصدة الافتتاحية تُنشأ من أرصدة إقفال السنة السابقة ولا تُصفّر الأصول والالتزامات.
      </span>
    </section>
  </>
);
