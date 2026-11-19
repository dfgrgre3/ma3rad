import type { ElementType, FC } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  AlertCircle,
  CalendarDays,
  ClipboardList,
  FileBarChart2,
  History,
  ListChecks,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFiscalClosingPage } from './FiscalClosingPage/useFiscalClosing';
import { YearSummary } from './FiscalClosingPage/YearSummary';
import { PeriodsTable } from './FiscalClosingPage/PeriodsTable';
import { PeriodDetailPanel } from './FiscalClosingPage/PeriodDetailPanel';
import {
  AdjustmentModal,
  ClosePeriodModal,
  CloseYearModal,
  CreateYearModal,
  LegacyReconcileModal,
  ReopenPeriodModal,
  TaskModal,
} from './FiscalClosingPage/modals';
import type { PeriodTab } from './FiscalClosingPage/utils';

export const FiscalClosingPage: FC = () => {
  const state = useFiscalClosingPage();
  const {
    service,
    canViewFinance,
    canManage,
    canClose,
    canReopen,
    years,
    selectedYearId,
    selectedYearIdRef,
    periods,
    selectedPeriodId,
    loading,
    actionBusy,
    loadError,
    activeTab,
    setActiveTab,
    checks,
    tasks,
    adjustments,
    readiness,
    showYearModal,
    setShowYearModal,
    yearForm,
    setYearForm,
    closePeriodTarget,
    setClosePeriodTarget,
    closeNotes,
    setCloseNotes,
    reopenPeriodTarget,
    setReopenPeriodTarget,
    reopenReason,
    setReopenReason,
    closeYearTarget,
    setCloseYearTarget,
    retainedEarningsAccount,
    setRetainedEarningsAccount,
    showTaskModal,
    setShowTaskModal,
    taskForm,
    setTaskForm,
    showAdjustmentModal,
    setShowAdjustmentModal,
    adjustmentForm,
    setAdjustmentForm,
    legacyReconcileTarget,
    setLegacyReconcileTarget,
    legacyReconcileForm,
    setLegacyReconcileForm,
    loadData,
    selectedYear,
    failedChecks,
    warningChecks,
    completedTasks,
    allChecklistComplete,
    runAction,
    handleCreateYear,
    openCloseChecklist,
    handleClosePeriod,
    handleReopenPeriod,
    handleCloseYear,
    generateYearOpenings,
    handleCreateTask,
    handleCreateAdjustment,
    selectPeriod,
  } = state;

  const tabs: Array<{ id: PeriodTab; label: string; icon: ElementType; badge?: number }> = [
    { id: 'overview', label: 'نظرة عامة', icon: CalendarDays },
    { id: 'checks', label: 'الفحص الآلي', icon: ListChecks, badge: failedChecks.length + warningChecks.length },
    { id: 'tasks', label: 'المهام', icon: ClipboardList, badge: tasks.length - completedTasks },
    { id: 'adjustments', label: 'التسويات', icon: Sparkles, badge: adjustments.length },
    { id: 'reports', label: 'تقرير الإقفال', icon: FileBarChart2 },
    { id: 'audit', label: 'السجل والاعتمادات', icon: History },
  ];

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-4 text-slate-900 sm:p-6">
      <PageHeader
        className="px-1"
        eyebrow="إدارة الفترات المالية"
        icon={<CalendarDays className="h-5 w-5" />}
        title="السنة المالية والإقفال الشهري"
        description="فحص آلي، مهام إقفال، تسويات، تقارير معتمدة، وإقفال سنوي بأرصدة افتتاحية."
        actions={<>
          {canViewFinance && (
            <Link
              to="/finance/calendar"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              <CalendarDays className="h-4 w-4" />
              التقويم المالي
            </Link>
          )}
          <select
            aria-label="السنة المالية"
            value={selectedYearId}
            onChange={(event) => {
              selectedYearIdRef.current = event.target.value;
              loadData(event.target.value);
            }}
            disabled={loading || years.length === 0}
            className="min-w-52 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-500"
          >
            {years.length === 0 && <option value="">لا توجد سنوات مالية</option>}
            {years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status === 'OPEN' ? 'مفتوحة' : 'مقفلة'}</option>)}
          </select>
          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            aria-label="تحديث بيانات السنة المالية"
            className="rounded-xl border border-slate-300 bg-white p-2.5 text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                const nextYear = new Date().getFullYear() + 1;
                setYearForm({
                  yearCode: `FY${nextYear}`,
                  name: `السنة المالية ${nextYear}`,
                  startDate: `${nextYear}-01-01`,
                  endDate: `${nextYear}-12-31`,
                  companyId: 'cmp_main',
                  currency: 'EGP',
                  yearType: 'STANDARD',
                  previousYearId: '',
                });
                setShowYearModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-3.5 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-800"
            >
              <Plus className="h-4 w-4" />
              سنة مالية جديدة
            </button>
          )}
        </>}
      />

      {loadError && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          تعذر تحميل بيانات السنة المالية: {loadError}
        </div>
      )}

      {!loading && years.length === 0 && !loadError && (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 font-bold text-slate-800">لا توجد سنوات مالية مسجلة</h2>
          <p className="mt-1 text-sm text-slate-500">
            {canManage ? 'أنشئ سنة مالية لبدء دورة الإقفال.' : 'لا توجد سنوات مالية لعرضها.'}
          </p>
        </section>
      )}

      {selectedYear && (
        <>
          <YearSummary
            selectedYear={selectedYear}
            closedPeriods={state.closedPeriods}
            openPeriods={state.openPeriods}
            periodsCount={periods.length}
            completedTasks={completedTasks}
            tasksCount={tasks.length}
            readiness={readiness}
            canClose={canClose}
            canManage={canManage}
            onCloseYear={() => setCloseYearTarget(selectedYear)}
            onGenerateOpenings={generateYearOpenings}
          />

          <PeriodsTable
            periods={periods}
            loading={loading}
            selectedPeriodId={selectedPeriodId}
            canClose={canClose}
            canReopen={canReopen}
            onSelectPeriod={selectPeriod}
            onOpenCloseChecklist={openCloseChecklist}
            onRequestReopen={(period) => { setReopenReason(''); setReopenPeriodTarget(period); }}
            onLockPeriod={(period) => runAction(() => service.lockPeriod(period.id), 'تم تأمين الفترة نهائيًا.')}
          />

          <PeriodDetailPanel
            state={state}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={tabs}
          />
        </>
      )}

      {showYearModal && (
        <CreateYearModal
          years={years}
          yearForm={yearForm}
          setYearForm={setYearForm}
          onSubmit={handleCreateYear}
          onClose={() => setShowYearModal(false)}
          busy={actionBusy}
        />
      )}

      {closePeriodTarget && (
        <ClosePeriodModal
          period={closePeriodTarget}
          checks={checks}
          notes={closeNotes}
          setNotes={setCloseNotes}
          canConfirm={allChecklistComplete}
          onConfirm={handleClosePeriod}
          onClose={() => setClosePeriodTarget(null)}
          busy={actionBusy}
        />
      )}

      {reopenPeriodTarget && (
        <ReopenPeriodModal
          period={reopenPeriodTarget}
          reason={reopenReason}
          setReason={setReopenReason}
          onConfirm={handleReopenPeriod}
          onClose={() => setReopenPeriodTarget(null)}
          busy={actionBusy}
        />
      )}

      {closeYearTarget && (
        <CloseYearModal
          year={closeYearTarget}
          readiness={readiness}
          retainedEarningsAccount={retainedEarningsAccount}
          setRetainedEarningsAccount={setRetainedEarningsAccount}
          onConfirm={handleCloseYear}
          onClose={() => setCloseYearTarget(null)}
          busy={actionBusy}
        />
      )}

      {showTaskModal && (
        <TaskModal
          taskForm={taskForm}
          setTaskForm={setTaskForm}
          onSubmit={handleCreateTask}
          onClose={() => setShowTaskModal(false)}
          busy={actionBusy}
        />
      )}

      {showAdjustmentModal && (
        <AdjustmentModal
          adjustmentForm={adjustmentForm}
          setAdjustmentForm={setAdjustmentForm}
          onSubmit={handleCreateAdjustment}
          onClose={() => setShowAdjustmentModal(false)}
          busy={actionBusy}
        />
      )}

      {legacyReconcileTarget && state.selectedPeriod && (
        <LegacyReconcileModal
          target={legacyReconcileTarget}
          form={legacyReconcileForm}
          setForm={setLegacyReconcileForm}
          onSubmit={(event) => {
            event.preventDefault();
            runAction(
              () => service.recordLegacySubledgerReconciliation(
                state.selectedPeriod!.id,
                legacyReconcileTarget.partyType,
                Number(legacyReconcileForm.balance),
                legacyReconcileForm.evidenceReference,
                legacyReconcileForm.notes || undefined,
              ),
              'تم حفظ المطابقة اليدوية مع سجل التدقيق.',
              () => setLegacyReconcileTarget(null),
            );
          }}
          onClose={() => setLegacyReconcileTarget(null)}
          busy={actionBusy}
        />
      )}
    </div>
  );
};

export default FiscalClosingPage;
