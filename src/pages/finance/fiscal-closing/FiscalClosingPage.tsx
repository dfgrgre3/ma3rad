import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardList,
  FileBarChart2,
  FileCheck2,
  History,
  ListChecks,
  Lock,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Unlock,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { FinanceEnterpriseService } from '../../../services/domains/finance/FinanceEnterpriseService';
import type {
  FiscalCloseCheck,
  PeriodAdjustment,
  PeriodCloseReport,
  PeriodCloseTask,
} from '../../../services/domains/finance/FinancePeriodCloseService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { useToast } from '../../../components/ui/Toast';
import type { FiscalPeriod, FiscalYear } from '../../../types/finance';

const formatDate = (value: string) => new Intl.DateTimeFormat('ar-EG', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date(`${value.slice(0, 10)}T00:00:00`));

const formatClosedAt = (value: string) => new Intl.DateTimeFormat('ar-EG', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

const formatMoney = (value: number) => new Intl.NumberFormat('ar-EG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const periodStatus = (period: FiscalPeriod) => {
  const state = period.workflowState || (period.status === 'LOCKED' ? 'LOCKED' : period.status === 'CLOSED' ? 'CLOSED' : 'OPEN');
  if (state === 'LOCKED') return { label: 'مؤمّن نهائيًا', className: 'border-rose-200 bg-rose-50 text-rose-800' };
  if (state === 'CLOSED') return { label: 'مقفلة', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
  if (state === 'PENDING_APPROVAL') return { label: 'بانتظار الاعتماد', className: 'border-violet-200 bg-violet-50 text-violet-800' };
  if (state === 'IN_REVIEW') return { label: 'قيد المراجعة', className: 'border-amber-200 bg-amber-50 text-amber-800' };
  return { label: 'مفتوحة', className: 'border-sky-200 bg-sky-50 text-sky-800' };
};

const checkStatusStyle = (status: FiscalCloseCheck['status']) => {
  if (status === 'PASS') return { label: 'ناجح', className: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2 };
  if (status === 'WARNING') return { label: 'تحذير', className: 'border-amber-200 bg-amber-50 text-amber-950', icon: AlertTriangle };
  if (status === 'FAIL') return { label: 'فشل', className: 'border-rose-200 bg-rose-50 text-rose-950', icon: AlertCircle };
  return { label: 'غير منطبق', className: 'border-slate-200 bg-slate-50 text-slate-700', icon: Circle };
};

const taskStatusLabel: Record<string, string> = {
  PENDING: 'معلقة',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'منفذة',
  REVIEWED: 'مراجعة',
  APPROVED: 'معتمدة',
  CANCELLED: 'ملغاة',
};

const priorityLabel: Record<string, string> = {
  LOW: 'منخفضة',
  MEDIUM: 'متوسطة',
  HIGH: 'عالية',
  CRITICAL: 'حرجة',
};

const adjustmentTypeLabel: Record<string, string> = {
  ACCRUED_EXPENSE: 'مصروف مستحق',
  PREPAID_EXPENSE: 'مصروف مقدم',
  ACCRUED_REVENUE: 'إيراد مستحق',
  DEFERRED_REVENUE: 'إيراد مقدم',
  DEPRECIATION: 'إهلاك',
  BAD_DEBT_PROVISION: 'مخصص ديون مشكوك فيها',
  INVENTORY_VARIANCE: 'فروقات مخزون',
  COGS_ADJUSTMENT: 'تسوية تكلفة مبيعات',
  CASH_VARIANCE: 'فروقات خزينة',
  BANK_VARIANCE: 'فروقات بنوك',
  PAYROLL_ACCRUAL: 'تسويات رواتب',
  OTHER: 'أخرى',
};

type PeriodTab = 'overview' | 'checks' | 'tasks' | 'adjustments' | 'reports' | 'audit';

export const FiscalClosingPage: React.FC = () => {
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
  const [yearForm, setYearForm] = useState({
    yearCode: '', name: '', startDate: '', endDate: '', companyId: 'cmp_main',
    currency: 'EGP', yearType: 'STANDARD', previousYearId: '',
  });
  const [closePeriodTarget, setClosePeriodTarget] = useState<FiscalPeriod | null>(null);
  const [closeNotes, setCloseNotes] = useState('');
  const [reopenPeriodTarget, setReopenPeriodTarget] = useState<FiscalPeriod | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [closeYearTarget, setCloseYearTarget] = useState<FiscalYear | null>(null);
  const [retainedEarningsAccount, setRetainedEarningsAccount] = useState('3102');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '', description: '', department: '', assigneeUserId: '', dueDate: '',
    priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  });
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    adjustmentType: 'ACCRUED_EXPENSE',
    description: '',
    amount: '',
    debitAccountCode: '',
    creditAccountCode: '',
  });
  const [legacyReconcileTarget, setLegacyReconcileTarget] = useState<{
    partyType: 'CUSTOMER' | 'SUPPLIER';
    label: string;
  } | null>(null);
  const [legacyReconcileForm, setLegacyReconcileForm] = useState({
    balance: '',
    evidenceReference: '',
    notes: '',
  });

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

  const handleCreateYear = (event: React.FormEvent) => {
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

  const handleCreateTask = (event: React.FormEvent) => {
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
      () => { setShowTaskModal(false); setTaskForm({ title: '', description: '', department: '', assigneeUserId: '', dueDate: '', priority: 'MEDIUM' }); },
    );
  };

  const handleCreateAdjustment = (event: React.FormEvent) => {
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
      () => { setShowAdjustmentModal(false); setAdjustmentForm({ adjustmentType: 'ACCRUED_EXPENSE', description: '', amount: '', debitAccountCode: '', creditAccountCode: '' }); },
    );
  };

  const tabs: Array<{ id: PeriodTab; label: string; icon: React.ElementType; badge?: number }> = [
    { id: 'overview', label: 'نظرة عامة', icon: CalendarDays },
    { id: 'checks', label: 'الفحص الآلي', icon: ListChecks, badge: failedChecks.length + warningChecks.length },
    { id: 'tasks', label: 'المهام', icon: ClipboardList, badge: tasks.length - completedTasks },
    { id: 'adjustments', label: 'التسويات', icon: Sparkles, badge: adjustments.length },
    { id: 'reports', label: 'تقرير الإقفال', icon: FileBarChart2 },
    { id: 'audit', label: 'السجل والاعتمادات', icon: History },
  ];

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-4 text-slate-900 sm:p-6" dir="rtl">
      <header className="flex flex-col gap-4 border-b border-slate-200 px-1 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-cyan-700 shadow-sm">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold tracking-wide text-cyan-800">إدارة الفترات المالية</p>
            <h2 className="mt-0.5 text-xl font-black text-slate-900">السنة المالية والإقفال الشهري</h2>
            <p className="mt-1 text-sm text-slate-500">فحص آلي، مهام إقفال، تسويات، تقارير معتمدة، وإقفال سنوي بأرصدة افتتاحية.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </header>

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
              <p className="mt-1 text-2xl font-black text-emerald-700">{closedPeriods} <span className="text-sm font-semibold text-slate-400">/ {periods.length}</span></p>
              <p className="mt-1 text-xs text-slate-500">{openPeriods} فترة مفتوحة</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">المهام</p>
              <p className="mt-1 text-2xl font-black text-cyan-700">{completedTasks} <span className="text-sm font-semibold text-slate-400">/ {tasks.length}</span></p>
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
                onClick={() => setCloseYearTarget(selectedYear)}
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
                onClick={() => runAction(
                  () => {
                    const count = service.generateFiscalYearOpenings(selectedYear.id, selectedYear.previousYearId || undefined);
                    toast.success(`تم إنشاء ${count} حسابًا افتتاحيًا للسنة.`);
                  },
                  'تم إنشاء الأرصدة الافتتاحية.',
                )}
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
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">الشهر / الفترة</th>
                      <th className="px-4 py-3 font-semibold">بداية الفترة</th>
                      <th className="px-4 py-3 font-semibold">نهاية الفترة</th>
                      <th className="px-4 py-3 font-semibold">الحالة</th>
                      <th className="px-4 py-3 font-semibold">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {periods.map((period) => {
                      const status = periodStatus(period);
                      const isSelected = selectedPeriodId === period.id;
                      const state = period.workflowState || period.status;
                      return (
                        <tr
                          key={period.id}
                          onClick={() => { setSelectedPeriodId(period.id); loadPeriodDetails(period.id); }}
                          className={`cursor-pointer transition ${isSelected ? 'bg-cyan-50/70' : 'hover:bg-slate-50'}`}
                        >
                          <td className="px-4 py-3 font-bold text-slate-800">
                            {period.name}
                            <span className="mr-2 text-xs font-medium text-slate-400">#{period.periodNumber}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(period.startDate)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(period.endDate)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${status.className}`}>
                              {state === 'OPEN' ? <Circle className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {(state === 'OPEN' || state === 'IN_REVIEW') && canClose && (
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); openCloseChecklist(period); }}
                                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
                                >
                                  فحص وإقفال
                                </button>
                              )}
                              {state === 'CLOSED' && canReopen && (
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); setReopenReason(''); setReopenPeriodTarget(period); }}
                                  className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                                >
                                  إعادة فتح
                                </button>
                              )}
                              {state === 'CLOSED' && canClose && (
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); runAction(() => service.lockPeriod(period.id), 'تم تأمين الفترة نهائيًا.'); }}
                                  className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                                >
                                  تأمين
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {selectedPeriod && (
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-slate-800">{selectedPeriod.name}</h2>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${periodStatus(selectedPeriod).className}`}>
                      {periodStatus(selectedPeriod).label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    من {formatDate(selectedPeriod.startDate)} إلى {formatDate(selectedPeriod.endDate)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(selectedPeriod.workflowState === 'OPEN' || !selectedPeriod.workflowState) && canClose && selectedPeriod.status === 'OPEN' && (
                    <button type="button" onClick={() => runAction(() => service.startPeriodReview(selectedPeriod.id), 'بدأت مراجعة الفترة.')} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100">
                      بدء المراجعة
                    </button>
                  )}
                  {selectedPeriod.workflowState === 'IN_REVIEW' && canClose && (
                    <button type="button" onClick={() => runAction(() => service.submitPeriodForApproval(selectedPeriod.id), 'تم إرسال الفترة للاعتماد.')} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800 hover:bg-violet-100">
                      إرسال للاعتماد
                    </button>
                  )}
                  {selectedPeriod.workflowState === 'PENDING_APPROVAL' && canManage && (
                    <button type="button" onClick={() => runAction(() => service.approveAndClosePeriod(selectedPeriod.id, closeNotes || undefined), 'تم اعتماد وإقفال الفترة.')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800">
                      اعتماد وإقفال
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 pt-3">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex items-center gap-2 rounded-t-xl px-3 py-2 text-sm font-bold transition ${activeTab === tab.id ? 'bg-cyan-50 text-cyan-800' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                      {!!tab.badge && <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">{tab.badge}</span>}
                    </button>
                  );
                })}
              </div>

              <div className="p-4 sm:p-5">
                {activeTab === 'overview' && (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-xs text-slate-500">الفحوص الحاجبة</p>
                      <p className={`mt-1 text-2xl font-black ${failedChecks.length ? 'text-rose-700' : 'text-emerald-700'}`}>{failedChecks.length}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-xs text-slate-500">التحذيرات</p>
                      <p className="mt-1 text-2xl font-black text-amber-700">{warningChecks.length}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-xs text-slate-500">المهام المكتملة</p>
                      <p className="mt-1 text-2xl font-black text-cyan-700">{completedTasks} / {tasks.length}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-xs text-slate-500">التسويات</p>
                      <p className="mt-1 text-2xl font-black text-violet-700">{adjustments.length}</p>
                    </div>
                    {selectedPeriod.closingNotes && (
                      <div className="sm:col-span-2 xl:col-span-4 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600 whitespace-pre-wrap">
                        {selectedPeriod.closingNotes}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'checks' && (
                  <div className="space-y-2">
                    {checks.length === 0 && <p className="text-sm text-slate-500">لا توجد فحوص متاحة.</p>}
                    {checks.map((check) => {
                      const style = checkStatusStyle(check.status);
                      const Icon = style.icon;
                      return (
                        <article key={check.id} className={`rounded-xl border p-3 text-sm ${style.className}`}>
                          <div className="flex flex-wrap items-center gap-2 font-bold">
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{check.label}</span>
                            <span className="mr-auto text-xs font-semibold">{style.label}{check.issueCount ? ` · ${check.issueCount} ملاحظة` : ''}</span>
                          </div>
                          {check.details.length > 0 && (
                            <ul className="mt-2 space-y-1 text-xs">
                              {check.details.map((detail, index) => (
                                <li key={`${check.id}-${index}`} className="flex flex-wrap items-center gap-2">
                                  <span>• {detail.message}</span>
                                  {detail.route && (
                                    <Link to={detail.route} className="font-bold underline underline-offset-2">فتح المستند</Link>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          {canManage && selectedPeriod && check.status === 'FAIL'
                            && (check.id.includes('customer_subledger') || check.id.includes('supplier_subledger'))
                            && check.details.some((detail) => detail.message.includes('قبل تاريخ تغطية') || detail.message.includes('المطابقة اليدوية المسجلة'))
                            && (
                              <button
                                type="button"
                                onClick={() => {
                                  const partyType = check.id.includes('customer_subledger') ? 'CUSTOMER' : 'SUPPLIER';
                                  setLegacyReconcileForm({ balance: '', evidenceReference: '', notes: '' });
                                  setLegacyReconcileTarget({
                                    partyType,
                                    label: partyType === 'CUSTOMER' ? 'العملاء' : 'الموردون',
                                  });
                                }}
                                className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
                              >
                                تسجيل مطابقة يدوية موثقة
                              </button>
                            )}
                        </article>
                      );
                    })}
                  </div>
                )}

                {activeTab === 'tasks' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {canManage && (
                        <>
                          <button type="button" onClick={() => setShowTaskModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-800">
                            <Plus className="h-4 w-4" /> مهمة جديدة
                          </button>
                          <button type="button" onClick={() => runAction(() => service.generateDefaultPeriodTasks(selectedPeriod.id), 'تم توليد مهام الإقفال القياسية.')} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                            توليد المهام القياسية
                          </button>
                        </>
                      )}
                    </div>
                    {tasks.length === 0 && <p className="text-sm text-slate-500">لا توجد مهام لهذه الفترة بعد.</p>}
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <article key={task.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-slate-800">{task.title}</p>
                              <p className="mt-1 text-xs text-slate-500">{task.department || 'بدون قسم'} · {task.assigneeName || 'غير مسندة'} · استحقاق {task.dueDate ? formatDate(task.dueDate) : 'غير محدد'}</p>
                              {task.notes && <p className="mt-1 text-xs text-slate-500">{task.notes}</p>}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700">{priorityLabel[task.priority]}</span>
                              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-bold text-cyan-800">{taskStatusLabel[task.status]}</span>
                              {canManage && task.status !== 'APPROVED' && task.status !== 'CANCELLED' && (
                                <select
                                  value={task.status}
                                  onChange={(event) => runAction(() => service.updatePeriodCloseTask(task.id, { status: event.target.value as any }), 'تم تحديث حالة المهمة.')}
                                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                                >
                                  {Object.entries(taskStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'adjustments' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {canManage && (
                        <button type="button" onClick={() => setShowAdjustmentModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-800">
                          <Plus className="h-4 w-4" /> تسوية جديدة
                        </button>
                      )}
                      <span className="text-xs text-slate-500">تُنشأ التسويات كمسودة، ثم تُرسل للاعتماد، ثم تُرحّل كقيد محاسبي متوازن.</span>
                    </div>
                    {adjustments.length === 0 && <p className="text-sm text-slate-500">لا توجد تسويات لهذه الفترة.</p>}
                    <div className="space-y-2">
                      {adjustments.map((adjustment) => (
                        <article key={adjustment.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-slate-800">{adjustmentTypeLabel[adjustment.adjustmentType] || adjustment.adjustmentType}: {adjustment.description}</p>
                              <p className="mt-1 text-xs text-slate-500">مدين {adjustment.debitAccountCode} / دائن {adjustment.creditAccountCode} · {formatMoney(adjustment.amount)}</p>
                              {adjustment.journalEntryId && <p className="mt-1 text-xs text-emerald-700">قيد الترحيل: {adjustment.journalEntryId}</p>}
                              {adjustment.rejectionReason && <p className="mt-1 text-xs text-rose-700">سبب الرفض: {adjustment.rejectionReason}</p>}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700">{adjustment.status}</span>
                              {canManage && adjustment.status === 'DRAFT' && (
                                <button type="button" onClick={() => runAction(() => service.submitPeriodAdjustment(adjustment.id), 'تم إرسال التسوية للاعتماد.')} className="rounded-lg bg-violet-50 px-2 py-1 text-xs font-bold text-violet-800">إرسال</button>
                              )}
                              {canManage && adjustment.status === 'PENDING_APPROVAL' && (
                                <button type="button" onClick={() => runAction(() => service.approvePeriodAdjustment(adjustment.id), 'تم اعتماد التسوية.')} className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">اعتماد</button>
                              )}
                              {canClose && adjustment.status === 'APPROVED' && (
                                <button type="button" onClick={() => runAction(() => service.postPeriodAdjustment(adjustment.id), 'تم ترحيل التسوية.')} className="rounded-lg bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-800">ترحيل</button>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'reports' && (
                  <div className="space-y-4">
                    {!report ? (
                      <p className="text-sm text-slate-500">لا توجد نسخة تقارير معتمدة لهذه الفترة بعد. تُحفظ النسخة لحظة الإقفال.</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <FileBarChart2 className="h-4 w-4" />
                          نسخة محفوظة بتاريخ {formatClosedAt(report.createdAt)} — لا تتغير بعد الإقفال.
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500">الإيرادات</p><p className="mt-1 text-lg font-black text-emerald-700">{formatMoney(report.payload.profitAndLoss.revenue)}</p></div>
                          <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500">المصروفات</p><p className="mt-1 text-lg font-black text-rose-700">{formatMoney(report.payload.profitAndLoss.expenses)}</p></div>
                          <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500">صافي الربح</p><p className={`mt-1 text-lg font-black ${report.payload.profitAndLoss.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatMoney(report.payload.profitAndLoss.netProfit)}</p></div>
                          <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500">تقييم المخزون</p><p className="mt-1 text-lg font-black text-slate-800">{formatMoney(report.payload.inventoryValuation)}</p></div>
                        </div>
                        {report.payload.partySubledgerBalances && (
                          <div className="rounded-xl border border-slate-200 p-4">
                            <h3 className="font-bold text-slate-800">لقطة أرصدة العملاء والموردين</h3>
                            <p className="mt-1 text-xs text-slate-500">تغطية السجل تبدأ من {report.payload.subledgerCoverageStartDate ? formatDate(report.payload.subledgerCoverageStartDate) : 'غير محدد'}.</p>
                            <div className="mt-3 max-h-72 overflow-y-auto">
                              <table className="w-full text-right text-xs">
                                <thead className="bg-slate-50 text-slate-500">
                                  <tr><th className="px-2 py-1">النوع</th><th className="px-2 py-1">معرّف الطرف</th><th className="px-2 py-1">حساب الرقابة</th><th className="px-2 py-1">الرصيد</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {report.payload.partySubledgerBalances.map((row) => (
                                    <tr key={`${row.partyType}-${row.partyId}`}>
                                      <td className="px-2 py-1">{row.partyType === 'CUSTOMER' ? 'عميل' : 'مورد'}</td>
                                      <td className="px-2 py-1">{row.partyId}</td>
                                      <td className="px-2 py-1">{row.controlAccountCode}</td>
                                      <td className="px-2 py-1">{formatMoney(row.balance)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                        {!!report.payload.legacyManualSubledgerMatches?.length && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                            <h3 className="font-bold text-amber-950">مطابقات تاريخية يدوية</h3>
                            <div className="mt-2 space-y-2">
                              {report.payload.legacyManualSubledgerMatches.map((match) => (
                                <div key={match.partyType} className="rounded-lg border border-amber-100 bg-white p-3 text-xs">
                                  <p className="font-bold">{match.partyType === 'CUSTOMER' ? 'العملاء' : 'الموردون'} · {match.evidenceReference}</p>
                                  <p className="mt-1 text-slate-600">دفتر الأطراف {formatMoney(match.verifiedSubledgerBalance)} / الأستاذ العام {formatMoney(match.controlBalance)} · {match.createdByName} · {formatClosedAt(match.createdAt)}</p>
                                  {match.notes && <p className="mt-1 text-slate-600">{match.notes}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="grid gap-3 lg:grid-cols-2">
                          <div className="rounded-xl border border-slate-200 p-4">
                            <h3 className="font-bold text-slate-800">ميزان المراجعة</h3>
                            <div className="mt-2 max-h-72 overflow-y-auto">
                              <table className="w-full text-right text-xs">
                                <thead className="bg-slate-50 text-slate-500"><tr><th className="px-2 py-1">الحساب</th><th className="px-2 py-1">مدين</th><th className="px-2 py-1">دائن</th><th className="px-2 py-1">الرصيد</th></tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                  {report.payload.trialBalance.map((row) => (
                                    <tr key={row.code}><td className="px-2 py-1">{row.code} - {row.name}</td><td className="px-2 py-1">{formatMoney(row.debit)}</td><td className="px-2 py-1">{formatMoney(row.credit)}</td><td className="px-2 py-1">{formatMoney(row.balance)}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="rounded-xl border border-slate-200 p-4">
                              <h3 className="font-bold text-slate-800">الميزانية العمومية</h3>
                              <div className="mt-2 space-y-1 text-sm">
                                <p className="flex justify-between"><span>الأصول</span><span className="font-bold">{formatMoney(report.payload.balanceSheet.assets)}</span></p>
                                <p className="flex justify-between"><span>الالتزامات</span><span className="font-bold">{formatMoney(report.payload.balanceSheet.liabilities)}</span></p>
                                <p className="flex justify-between"><span>حقوق الملكية</span><span className="font-bold">{formatMoney(report.payload.balanceSheet.equity)}</span></p>
                                <p className={`text-xs font-bold ${report.payload.balanceSheet.balanced ? 'text-emerald-700' : 'text-rose-700'}`}>{report.payload.balanceSheet.balanced ? 'متزنة' : 'غير متزنة'}</p>
                              </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 p-4">
                              <h3 className="font-bold text-slate-800">التدفقات النقدية</h3>
                              <div className="mt-2 space-y-1 text-sm">
                                <p className="flex justify-between"><span>افتتاحي</span><span>{formatMoney(report.payload.cashFlow.opening)}</span></p>
                                <p className="flex justify-between"><span>داخل</span><span className="text-emerald-700">{formatMoney(report.payload.cashFlow.inflow)}</span></p>
                                <p className="flex justify-between"><span>خارج</span><span className="text-rose-700">{formatMoney(report.payload.cashFlow.outflow)}</span></p>
                                <p className="flex justify-between font-bold"><span>ختامي</span><span>{formatMoney(report.payload.cashFlow.closing)}</span></p>
                              </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 p-4">
                              <h3 className="font-bold text-slate-800">أعمار ديون العملاء</h3>
                              <div className="mt-2 space-y-1 text-sm">
                                {report.payload.receivablesAging.length === 0 && <p className="text-xs text-slate-500">لا توجد أرصدة مستحقة.</p>}
                                {report.payload.receivablesAging.map((row) => <p key={row.bucket} className="flex justify-between"><span>{row.bucket}</span><span>{formatMoney(row.amount)}</span></p>)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activeTab === 'audit' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-bold text-slate-800">سجل النشاط والاعتمادات</h3>
                      <div className="mt-2 space-y-2">
                        {audit.length === 0 && <p className="text-sm text-slate-500">لا يوجد سجل لهذه الفترة بعد.</p>}
                        {audit.map((entry) => (
                          <article key={entry.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-bold text-slate-800">{entry.action}</p>
                              <span className="text-xs text-slate-500">{formatClosedAt(entry.createdAt)}</span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {entry.actorName} · {entry.previousState || '—'} ← {entry.newState || '—'}
                              {entry.reason ? ` · السبب: ${entry.reason}` : ''}
                            </p>
                          </article>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">عمليات الإقفال</h3>
                      <div className="mt-2 space-y-2">
                        {runs.length === 0 && <p className="text-sm text-slate-500">لا توجد عمليات إقفال مسجلة.</p>}
                        {runs.map((run) => (
                          <article key={run.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-bold text-slate-800">محاولة إقفال #{run.runNumber} · {run.status}</p>
                              <span className="text-xs text-slate-500">{run.startedByName || run.startedBy} · {formatClosedAt(run.startedAt)}</span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">{(run.summary || []).filter((item: any) => item.status !== 'PASS' && item.status !== 'NOT_APPLICABLE').length} ملاحظة في هذه المحاولة</p>
                          </article>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {showYearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-black text-slate-800">إنشاء سنة مالية</h2>
              <button type="button" onClick={() => setShowYearModal(false)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleCreateYear} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700">رمز السنة<input required value={yearForm.yearCode} onChange={(event) => setYearForm({ ...yearForm, yearCode: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
                <label className="block text-sm font-semibold text-slate-700">اسم السنة<input required value={yearForm.name} onChange={(event) => setYearForm({ ...yearForm, name: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
                <label className="block text-sm font-semibold text-slate-700">تاريخ البداية<input type="date" required value={yearForm.startDate} onChange={(event) => setYearForm({ ...yearForm, startDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
                <label className="block text-sm font-semibold text-slate-700">تاريخ النهاية<input type="date" required min={yearForm.startDate} value={yearForm.endDate} onChange={(event) => setYearForm({ ...yearForm, endDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
                <label className="block text-sm font-semibold text-slate-700">الشركة<input value={yearForm.companyId} onChange={(event) => setYearForm({ ...yearForm, companyId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
                <label className="block text-sm font-semibold text-slate-700">العملة<input value={yearForm.currency} onChange={(event) => setYearForm({ ...yearForm, currency: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
                <label className="block text-sm font-semibold text-slate-700">نوع السنة
                  <select value={yearForm.yearType} onChange={(event) => setYearForm({ ...yearForm, yearType: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5">
                    <option value="STANDARD">قياسية (12 شهرًا)</option>
                    <option value="CUSTOM">مخصصة</option>
                    <option value="SHORT">سنة قصيرة</option>
                    <option value="TRANSITION">فترة انتقالية</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-700">السنة السابقة
                  <select value={yearForm.previousYearId} onChange={(event) => setYearForm({ ...yearForm, previousYearId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5">
                    <option value="">غير مرتبطة</option>
                    {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
                  </select>
                </label>
              </div>
              <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                سيتم منع إنشاء سنة متداخلة لنفس الشركة، وتوليد فترة شهرية لكل شهر داخل النطاق. يمكن إضافة فترات تسوية إضافية من طبقة الخدمة.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowYearModal(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">إلغاء</button>
                <button type="submit" disabled={actionBusy} className="rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-800 disabled:opacity-50">{actionBusy ? 'جارٍ الحفظ...' : 'إنشاء السنة والفترات'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {closePeriodTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-cyan-50 p-2.5 text-cyan-700"><FileCheck2 className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-black text-slate-800">فحص وإقفال الفترة</h2>
                  <p className="mt-1 text-sm text-slate-500">{closePeriodTarget.name} · {formatDate(closePeriodTarget.startDate)} إلى {formatDate(closePeriodTarget.endDate)}</p>
                </div>
              </div>
              <button type="button" onClick={() => setClosePeriodTarget(null)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-5 space-y-2">
              {checks.map((check) => {
                const style = checkStatusStyle(check.status);
                const Icon = style.icon;
                return (
                  <article key={check.id} className={`rounded-xl border p-3 text-sm ${style.className}`}>
                    <div className="flex items-center gap-2 font-bold">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{check.label}</span>
                      <span className="mr-auto text-xs font-semibold">{style.label}{check.issueCount ? ` · ${check.issueCount}` : ''}</span>
                    </div>
                    {check.details.length > 0 && (
                      <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                        {check.details.slice(0, 5).map((detail, index) => <li key={`${check.id}-${index}`}>{detail.message}</li>)}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>

            <label className="mt-4 block text-sm font-semibold text-slate-700">
              ملاحظات الإقفال أو رقم محضر المطابقة
              <textarea value={closeNotes} onChange={(event) => setCloseNotes(event.target.value)} placeholder="أضف ملاحظات أو مرجع محضر الإقفال..." className="mt-1.5 min-h-20 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal" />
            </label>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setClosePeriodTarget(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">إلغاء</button>
              <button type="button" onClick={handleClosePeriod} disabled={actionBusy || !allChecklistComplete} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
                <ShieldCheck className="h-4 w-4" />
                {actionBusy ? 'جارٍ الإقفال...' : 'تأكيد إقفال الفترة'}
              </button>
            </div>
          </section>
        </div>
      )}

      {reopenPeriodTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center gap-2">
              <Unlock className="h-5 w-5 text-amber-600" />
              <h2 className="font-black text-slate-800">إعادة فتح {reopenPeriodTarget.name}</h2>
            </div>
            <p className="mt-2 text-sm text-slate-500">إعادة الفتح إجراء منفصل يتطلب سببًا ويسجل في سجل التدقيق.</p>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              سبب إعادة الفتح
              <textarea required value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setReopenPeriodTarget(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">إلغاء</button>
              <button type="button" onClick={handleReopenPeriod} disabled={actionBusy || !reopenReason.trim()} className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-800 disabled:opacity-50">{actionBusy ? 'جارٍ التنفيذ...' : 'تأكيد إعادة الفتح'}</button>
            </div>
          </section>
        </div>
      )}

      {closeYearTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-rose-700" />
              <h2 className="font-black text-slate-800">إقفال {closeYearTarget.name}</h2>
            </div>
            <p className="mt-2 text-sm text-slate-500">سيتم تصفير الإيرادات والمصروفات، وترحيل صافي النتيجة إلى الأرباح المرحلة، ثم إنشاء أرصدة افتتاحية للسنة التالية إن وُجدت.</p>
            <div className="mt-4 space-y-2">
              {readiness.map((check) => {
                const style = checkStatusStyle(check.status);
                const Icon = style.icon;
                return (
                  <article key={check.id} className={`rounded-xl border p-3 text-sm ${style.className}`}>
                    <div className="flex items-center gap-2 font-bold">
                      <Icon className="h-4 w-4" />
                      <span>{check.label}</span>
                      <span className="mr-auto text-xs">{style.label}</span>
                    </div>
                    {check.details.length > 0 && <p className="mt-1 text-xs">{check.details[0].message}</p>}
                  </article>
                );
              })}
            </div>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              رمز حساب الأرباح المرحلة (يجب أن يكون حساب حقوق ملكية نشطًا)
              <input required value={retainedEarningsAccount} onChange={(event) => setRetainedEarningsAccount(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCloseYearTarget(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">إلغاء</button>
              <button type="button" onClick={handleCloseYear} disabled={actionBusy || !retainedEarningsAccount.trim() || readiness.some((check) => check.status === 'FAIL')} className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50">{actionBusy ? 'جارٍ الإقفال...' : 'تأكيد الإقفال السنوي'}</button>
            </div>
          </section>
        </div>
      )}

      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-black text-slate-800">إضافة مهمة إقفال</h2>
              <button type="button" onClick={() => setShowTaskModal(false)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">عنوان المهمة<input required value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
              <label className="block text-sm font-semibold text-slate-700">الوصف<textarea value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} className="mt-1.5 min-h-16 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700">القسم<input value={taskForm.department} onChange={(event) => setTaskForm({ ...taskForm, department: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
                <label className="block text-sm font-semibold text-slate-700">المسؤول (معرف المستخدم)<input value={taskForm.assigneeUserId} onChange={(event) => setTaskForm({ ...taskForm, assigneeUserId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
                <label className="block text-sm font-semibold text-slate-700">تاريخ الاستحقاق<input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
                <label className="block text-sm font-semibold text-slate-700">الأولوية
                  <select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value as any })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5">
                    {Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTaskModal(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">إلغاء</button>
                <button type="submit" disabled={actionBusy} className="rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-800 disabled:opacity-50">حفظ المهمة</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showAdjustmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-black text-slate-800">إنشاء تسوية شهرية</h2>
              <button type="button" onClick={() => setShowAdjustmentModal(false)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleCreateAdjustment} className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">نوع التسوية
                <select value={adjustmentForm.adjustmentType} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, adjustmentType: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5">
                  {Object.entries(adjustmentTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700">الوصف<input required value={adjustmentForm.description} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, description: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
              <label className="block text-sm font-semibold text-slate-700">المبلغ<input required type="number" min="0.01" step="0.01" value={adjustmentForm.amount} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, amount: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700">الحساب المدين<input required placeholder="مثال: 5201" value={adjustmentForm.debitAccountCode} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, debitAccountCode: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
                <label className="block text-sm font-semibold text-slate-700">الحساب الدائن<input required placeholder="مثال: 2101" value={adjustmentForm.creditAccountCode} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, creditAccountCode: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdjustmentModal(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">إلغاء</button>
                <button type="submit" disabled={actionBusy} className="rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-800 disabled:opacity-50">حفظ المسودة</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {legacyReconcileTarget && selectedPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              runAction(
                () => service.recordLegacySubledgerReconciliation(
                  selectedPeriod.id,
                  legacyReconcileTarget.partyType,
                  Number(legacyReconcileForm.balance),
                  legacyReconcileForm.evidenceReference,
                  legacyReconcileForm.notes || undefined,
                ),
                'تم حفظ المطابقة اليدوية مع سجل التدقيق.',
                () => setLegacyReconcileTarget(null),
              );
            }}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl"
          >
            <div>
              <h2 className="text-lg font-black text-slate-900">مطابقة تاريخية — {legacyReconcileTarget.label}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                أدخل رصيد دفتر الأطراف بعد مراجعته مقابل الأستاذ العام، وسجّل مرجع التقرير أو المستند المؤيد. لن تُقبل المطابقة إذا لم يتساوَ الرصيدان.
              </p>
            </div>
            <label className="block space-y-1 text-sm font-bold text-slate-700">
              رصيد دفتر الأطراف في نهاية الفترة
              <input
                type="number"
                step="0.01"
                required
                value={legacyReconcileForm.balance}
                onChange={(event) => setLegacyReconcileForm((current) => ({ ...current, balance: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block space-y-1 text-sm font-bold text-slate-700">
              مرجع مستند المطابقة
              <input
                required
                value={legacyReconcileForm.evidenceReference}
                onChange={(event) => setLegacyReconcileForm((current) => ({ ...current, evidenceReference: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="رقم تقرير أو ملف أو مستند"
              />
            </label>
            <label className="block space-y-1 text-sm font-bold text-slate-700">
              ملاحظات
              <textarea
                value={legacyReconcileForm.notes}
                onChange={(event) => setLegacyReconcileForm((current) => ({ ...current, notes: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                rows={3}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setLegacyReconcileTarget(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
                إلغاء
              </button>
              <button type="submit" disabled={actionBusy} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                حفظ المطابقة
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default FiscalClosingPage;
