import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { FinanceEnterpriseService } from '../../../../services/domains/finance/FinanceEnterpriseService';
import type {
  FiscalCloseCheck,
  PeriodAdjustment,
  PeriodCloseReport,
  PeriodCloseTask,
} from '../../../../services/domains/finance/FinancePeriodCloseService';
import { AuthService } from '../../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../../services/domains/auth/PermissionService';
import { useToast } from '../../../../components/ui/Toast';
import type { FiscalPeriod, FiscalYear } from '../../../../types/finance';
import {
  initialAdjustmentForm,
  initialLegacyReconcileForm,
  initialTaskForm,
  initialYearForm,
  type AdjustmentFormState,
  type LegacyReconcileFormState,
  type LegacyReconcileTarget,
  type PeriodTab,
  type TaskFormState,
  type YearFormState,
} from './utils';

/**
 * All state, data loading and action handlers for the fiscal closing page.
 * Pure extraction — behavior is identical to the previous inline component.
 */
export function useFiscalClosingPage() {
  const service = useMemo(() => new FinanceEnterpriseService(), []);
  const toast = useToast();
  const actor = AuthService.getCurrentUser();
  const canViewFinance = PermissionService.canAny(actor, ['ui.finance.fiscal_closing.view', 'finance.fiscal_closing.view', 'finance.view']);
  const canManage = PermissionService.canAny(actor, ['ui.finance.fiscal_closing.approve', 'finance.fiscal_closing.execute', 'finance.approve', 'finance.close']);
  const canClose = PermissionService.canAny(actor, ['ui.finance.fiscal_closing.close', 'finance.fiscal_closing.execute', 'finance.close']);
  const canReopen = PermissionService.canAny(actor, ['ui.finance.fiscal_closing.reopen', 'finance.reopen', 'finance.close']);

  const [years, setYears] = useState<FiscalYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState('');
  const selectedYearIdRef = useRef('');
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PeriodTab>('overview');

  const [checks, setChecks] = useState<FiscalCloseCheck[]>([]);
  const [tasks, setTasks] = useState<PeriodCloseTask[]>([]);
  const [adjustments, setAdjustments] = useState<PeriodAdjustment[]>([]);
  const [report, setReport] = useState<PeriodCloseReport | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<FiscalCloseCheck[]>([]);

  const [showYearModal, setShowYearModal] = useState(false);
  const [yearForm, setYearForm] = useState<YearFormState>(initialYearForm);
  const [closePeriodTarget, setClosePeriodTarget] = useState<FiscalPeriod | null>(null);
  const [closeNotes, setCloseNotes] = useState('');
  const [reopenPeriodTarget, setReopenPeriodTarget] = useState<FiscalPeriod | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [closeYearTarget, setCloseYearTarget] = useState<FiscalYear | null>(null);
  const [retainedEarningsAccount, setRetainedEarningsAccount] = useState('3102');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState<TaskFormState>(initialTaskForm);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentFormState>(initialAdjustmentForm);
  const [legacyReconcileTarget, setLegacyReconcileTarget] = useState<LegacyReconcileTarget | null>(null);
  const [legacyReconcileForm, setLegacyReconcileForm] = useState<LegacyReconcileFormState>(initialLegacyReconcileForm);

  const loadPeriodDetails = useCallback((periodId: string) => {
    if (!periodId) {
      setChecks([]); setTasks([]); setAdjustments([]); setReport(null); setAudit([]); setRuns([]);
      return;
    }
    try {
      setChecks(service.getPeriodCloseChecks(periodId));
      setTasks(service.getPeriodCloseTasks(periodId));
      setAdjustments(service.getPeriodAdjustments(periodId));
      setReport(service.getPeriodCloseReport(periodId));
      setAudit(service.getFiscalCloseAudit('PERIOD', periodId));
      setRuns(service.getCloseRuns(periodId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل تفاصيل الفترة.');
    }
  }, [service, toast]);

  const loadData = useCallback((yearId?: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const fiscalYears = service.getFiscalYears();
      const activeYearId = yearId || selectedYearIdRef.current || fiscalYears[0]?.id || '';
      selectedYearIdRef.current = activeYearId;
      setYears(fiscalYears);
      setSelectedYearId(activeYearId);
      const fiscalPeriods = activeYearId ? service.getFiscalPeriods(activeYearId) : [];
      setPeriods(fiscalPeriods);
      const nextPeriodId = fiscalPeriods.some((period) => period.id === selectedPeriodId)
        ? selectedPeriodId
        : fiscalPeriods[0]?.id ?? '';
      setSelectedPeriodId(nextPeriodId);
      setReadiness(activeYearId ? service.getFiscalYearReadiness(activeYearId) : []);
      loadPeriodDetails(nextPeriodId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر تحميل بيانات السنة المالية.';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [service, toast, selectedPeriodId, loadPeriodDetails]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedYear = years.find((year) => year.id === selectedYearId);
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId);
  const closedPeriods = periods.filter((period) => period.status !== 'OPEN').length;
  const openPeriods = periods.length - closedPeriods;
  const failedChecks = checks.filter((check) => check.status === 'FAIL');
  const warningChecks = checks.filter((check) => check.status === 'WARNING');
  const completedTasks = tasks.filter((task) => ['COMPLETED', 'REVIEWED', 'APPROVED'].includes(task.status)).length;
  const allChecklistComplete = checks.length > 0 && failedChecks.length === 0;

  const reloadPeriod = (periodId = selectedPeriodId) => {
    loadData(selectedYearId);
    loadPeriodDetails(periodId);
  };

  const runAction = (action: () => void, successMessage: string, closeModal?: () => void) => {
    setActionBusy(true);
    try {
      action();
      toast.success(successMessage);
      closeModal?.();
      reloadPeriod();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تنفيذ الإجراء.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreateYear = (event: FormEvent) => {
    event.preventDefault();
    runAction(
      () => {
        const yearId = service.createFiscalYear({
          ...yearForm,
          previousYearId: yearForm.previousYearId || undefined,
        });
        selectedYearIdRef.current = yearId;
      },
      'تم إنشاء السنة المالية وفتراتها بنجاح.',
      () => setShowYearModal(false),
    );
  };

  const openCloseChecklist = (period: FiscalPeriod) => {
    try {
      setChecks(service.getPeriodCloseChecks(period.id));
      setCloseNotes('');
      setClosePeriodTarget(period);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل قائمة مراجعة الإقفال.');
    }
  };

  const handleClosePeriod = () => {
    if (!closePeriodTarget || !allChecklistComplete) return;
    runAction(
      () => service.closePeriod(closePeriodTarget.id, closeNotes.trim() || undefined),
      `تم إقفال الفترة ${closePeriodTarget.name} بنجاح.`,
      () => setClosePeriodTarget(null),
    );
  };

  const handleReopenPeriod = () => {
    if (!reopenPeriodTarget) return;
    runAction(
      () => service.reopenPeriod(reopenPeriodTarget.id, reopenReason),
      `تمت إعادة فتح الفترة ${reopenPeriodTarget.name}.`,
      () => { setReopenPeriodTarget(null); setReopenReason(''); },
    );
  };

  const handleCloseYear = () => {
    if (!closeYearTarget) return;
    runAction(
      () => service.closeFiscalYear(closeYearTarget.id, retainedEarningsAccount),
      'تم إقفال السنة المالية وترحيل الأرصدة الافتتاحية للسنة التالية.',
      () => setCloseYearTarget(null),
    );
  };

  const generateYearOpenings = () => {
    if (!selectedYear) return;
    runAction(
      () => {
        const count = service.generateFiscalYearOpenings(selectedYear.id, selectedYear.previousYearId || undefined);
        toast.success(`تم إنشاء ${count} حسابًا افتتاحيًا للسنة.`);
      },
      'تم إنشاء الأرصدة الافتتاحية.',
    );
  };

  const handleCreateTask = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPeriodId) return;
    runAction(
      () => service.createPeriodCloseTask({
        fiscalPeriodId: selectedPeriodId,
        title: taskForm.title,
        description: taskForm.description,
        department: taskForm.department,
        assigneeUserId: taskForm.assigneeUserId || undefined,
        dueDate: taskForm.dueDate || undefined,
        priority: taskForm.priority,
      }),
      'تمت إضافة مهمة الإقفال.',
      () => { setShowTaskModal(false); setTaskForm(initialTaskForm()); },
    );
  };

  const handleCreateAdjustment = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPeriodId) return;
    runAction(
      () => service.createPeriodAdjustment({
        fiscalPeriodId: selectedPeriodId,
        adjustmentType: adjustmentForm.adjustmentType as any,
        description: adjustmentForm.description,
        amount: Number(adjustmentForm.amount),
        debitAccountCode: adjustmentForm.debitAccountCode,
        creditAccountCode: adjustmentForm.creditAccountCode,
      }),
      'تم إنشاء مسودة التسوية. أرسلها للاعتماد ثم الترحيل.',
      () => { setShowAdjustmentModal(false); setAdjustmentForm(initialAdjustmentForm()); },
    );
  };

  const openLegacyReconcile = (partyType: 'CUSTOMER' | 'SUPPLIER') => {
    setLegacyReconcileForm(initialLegacyReconcileForm());
    setLegacyReconcileTarget({
      partyType,
      label: partyType === 'CUSTOMER' ? 'العملاء' : 'الموردون',
    });
  };

  const selectPeriod = (period: FiscalPeriod) => {
    setSelectedPeriodId(period.id);
    loadPeriodDetails(period.id);
  };

  return {
    service,
    toast,
    canViewFinance,
    canManage,
    canClose,
    canReopen,
    years,
    selectedYearId,
    setSelectedYearId,
    selectedYearIdRef,
    periods,
    selectedPeriodId,
    setSelectedPeriodId,
    loading,
    actionBusy,
    loadError,
    activeTab,
    setActiveTab,
    checks,
    setChecks,
    tasks,
    setTasks,
    adjustments,
    setAdjustments,
    report,
    audit,
    runs,
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
    loadPeriodDetails,
    selectedYear,
    selectedPeriod,
    closedPeriods,
    openPeriods,
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
    openLegacyReconcile,
    selectPeriod,
  };
}

export type FiscalClosingState = ReturnType<typeof useFiscalClosingPage>;
