import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Circle,
  FileCheck2,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Unlock,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { FinanceEnterpriseService } from '../../../services/finance/FinanceEnterpriseService';
import { AuthService } from '../../../services/auth/AuthService';
import { PermissionService } from '../../../services/auth/PermissionService';
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

const checklistItems = [
  { id: 'documents', label: 'اكتمال تسجيل فواتير المبيعات والمشتريات والمصروفات' },
  { id: 'cash', label: 'مطابقة أرصدة الصندوق والحسابات البنكية' },
  { id: 'balances', label: 'مراجعة أرصدة العملاء والموردين والحسابات' },
  { id: 'adjustments', label: 'مراجعة التسويات والفروقات والمستندات المعلقة' },
] as const;

type ChecklistId = typeof checklistItems[number]['id'];

const periodStatus = (period: FiscalPeriod) => {
  if (period.status === 'LOCKED') return { label: 'مؤمّن نهائيًا', className: 'border-rose-200 bg-rose-50 text-rose-800' };
  if (period.status === 'CLOSED') return { label: 'مقفلة', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
  return { label: 'مفتوحة', className: 'border-sky-200 bg-sky-50 text-sky-800' };
};

const yearStatus = (year: FiscalYear) => year.status === 'OPEN' ? 'مفتوحة' : 'مقفلة';

export const FiscalClosingPage: React.FC = () => {
  const service = useMemo(() => new FinanceEnterpriseService(), []);
  const toast = useToast();
  const actor = AuthService.getCurrentUser();
  const canViewFinance = PermissionService.can(actor, 'ui.finance.fiscal_closing.view');
  const canManage = PermissionService.can(actor, 'ui.finance.fiscal_closing.approve');
  const canClose = PermissionService.can(actor, 'ui.finance.fiscal_closing.close');
  const canReopen = PermissionService.can(actor, 'ui.finance.fiscal_closing.reopen');

  const [years, setYears] = useState<FiscalYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState('');
  const selectedYearIdRef = useRef('');
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showYearModal, setShowYearModal] = useState(false);
  const [yearForm, setYearForm] = useState({ yearCode: '', name: '', startDate: '', endDate: '' });
  const [closePeriodTarget, setClosePeriodTarget] = useState<FiscalPeriod | null>(null);
  const [unpostedCount, setUnpostedCount] = useState(0);
  const [completedChecklist, setCompletedChecklist] = useState<ChecklistId[]>([]);
  const [closeNotes, setCloseNotes] = useState('');
  const [reopenPeriodTarget, setReopenPeriodTarget] = useState<FiscalPeriod | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [closeYearTarget, setCloseYearTarget] = useState<FiscalYear | null>(null);
  const [retainedEarningsAccount, setRetainedEarningsAccount] = useState('3102');

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
      setSelectedPeriodId((current) => fiscalPeriods.some((period) => period.id === current)
        ? current
        : fiscalPeriods[0]?.id ?? '');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر تحميل بيانات السنة المالية.';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [service, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedYear = years.find((year) => year.id === selectedYearId);
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId);
  const closedPeriods = periods.filter((period) => period.status !== 'OPEN').length;
  const openPeriods = periods.length - closedPeriods;
  const allChecklistComplete = completedChecklist.length === checklistItems.length && unpostedCount === 0;

  const handleCreateYear = (event: React.FormEvent) => {
    event.preventDefault();
    setActionBusy(true);
    try {
      const yearId = service.createFiscalYear(yearForm);
      toast.success('تم إنشاء السنة المالية وفتراتها الشهرية بنجاح.');
      setShowYearModal(false);
      loadData(yearId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إنشاء السنة المالية.');
    } finally {
      setActionBusy(false);
    }
  };

  const openCloseChecklist = (period: FiscalPeriod) => {
    try {
      setUnpostedCount(service.getUnpostedJournalEntryCount(period.startDate, period.endDate));
      setCompletedChecklist([]);
      setCloseNotes('');
      setClosePeriodTarget(period);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل قائمة مراجعة الإقفال.');
    }
  };

  const handleClosePeriod = () => {
    if (!closePeriodTarget || !allChecklistComplete) return;
    setActionBusy(true);
    const confirmations = checklistItems.map((item) => `✓ ${item.label}`).join('\n');
    const notes = [
      `قائمة مراجعة إقفال الشهر:\n${confirmations}`,
      closeNotes.trim() ? `ملاحظات الإقفال:\n${closeNotes.trim()}` : '',
    ].filter(Boolean).join('\n\n');
    try {
      service.closePeriod(closePeriodTarget.id, notes);
      toast.success(`تم إقفال الفترة ${closePeriodTarget.name} بنجاح.`);
      setClosePeriodTarget(null);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إقفال الفترة.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReopenPeriod = () => {
    if (!reopenPeriodTarget) return;
    setActionBusy(true);
    try {
      service.reopenPeriod(reopenPeriodTarget.id, reopenReason);
      toast.success(`تمت إعادة فتح الفترة ${reopenPeriodTarget.name}.`);
      setReopenPeriodTarget(null);
      setReopenReason('');
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إعادة فتح الفترة.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCloseYear = () => {
    if (!closeYearTarget) return;
    setActionBusy(true);
    try {
      const entryId = service.closeFiscalYear(closeYearTarget.id, retainedEarningsAccount);
      toast.success(`تم إقفال السنة المالية وترحيل الأرباح والخسائر (رقم القيد: ${entryId || 'مكتمل'}).`);
      setCloseYearTarget(null);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إقفال السنة المالية.');
    } finally {
      setActionBusy(false);
    }
  };

  const toggleChecklistItem = (itemId: ChecklistId) => {
    setCompletedChecklist((current) => current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId]);
  };

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
            <p className="mt-1 text-sm text-slate-500">راجع حالة الأشهر، وأدر تواريخ الإقفال وقوائم المراجعة.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canViewFinance && (
            <Link
              to="/finance/calendar"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
            >
              <CalendarDays className="h-4 w-4" />
              التقويم المالي
            </Link>
          )}
          <select
            aria-label="السنة المالية"
            value={selectedYearId}
            onChange={(event) => loadData(event.target.value)}
            disabled={loading || years.length === 0}
            className="min-w-52 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-500"
          >
            {years.length === 0 && <option value="">لا توجد سنوات مالية</option>}
            {years.map((year) => <option key={year.id} value={year.id}>{year.name} · {yearStatus(year)}</option>)}
          </select>
          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            aria-label="تحديث بيانات السنة المالية"
            className="rounded-xl border border-slate-300 bg-white p-2.5 text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50"
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
                });
                setShowYearModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-3.5 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2"
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
            {canManage ? 'أنشئ سنة مالية لتظهر الأشهر ومواعيد إقفالها هنا.' : 'لا توجد سنوات مالية لعرضها.'}
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                const nextYear = new Date().getFullYear() + 1;
                setYearForm({ yearCode: `FY${nextYear}`, name: `السنة المالية ${nextYear}`, startDate: `${nextYear}-01-01`, endDate: `${nextYear}-12-31` });
                setShowYearModal(true);
              }}
              className="mt-4 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-800"
            >
              إنشاء سنة مالية
            </button>
          )}
        </section>
      )}

      {selectedYear && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">السنة المالية</p>
              <p className="mt-1 text-lg font-black text-slate-800">{selectedYear.name}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDate(selectedYear.startDate)} — {formatDate(selectedYear.endDate)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">حالة السنة</p>
              <p className={`mt-1 text-lg font-black ${selectedYear.status === 'OPEN' ? 'text-emerald-700' : 'text-slate-700'}`}>
                {selectedYear.status === 'OPEN' ? 'مفتوحة' : 'مقفلة'}
              </p>
              {selectedYear.closedAt && <p className="mt-1 text-xs text-slate-500">تاريخ الإقفال: {formatClosedAt(selectedYear.closedAt)}</p>}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">الأشهر المقفلة</p>
              <p className="mt-1 text-2xl font-black text-emerald-700">{closedPeriods} <span className="text-sm font-semibold text-slate-400">/ {periods.length}</span></p>
              <p className="mt-1 text-xs text-slate-500">فترة مقفلة أو مؤمنة نهائيًا</p>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <p className="text-xs font-medium text-slate-500">الأشهر المفتوحة</p>
                <p className="mt-1 text-2xl font-black text-sky-700">{openPeriods}</p>
                {selectedYear.status === 'OPEN' && canClose && (
                  <button
                    type="button"
                    onClick={() => setCloseYearTarget(selectedYear)}
                    disabled={openPeriods > 0}
                    className="mt-1 text-xs font-bold text-rose-700 hover:text-rose-900 disabled:cursor-not-allowed disabled:text-slate-400"
                    title={openPeriods > 0 ? 'يجب إقفال جميع الأشهر قبل إقفال السنة' : 'إقفال السنة المالية'}
                  >
                    إقفال السنة المالية
                  </button>
                )}
              </div>
              <Unlock className="h-6 w-6 text-sky-600" />
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="font-bold text-slate-800">حالة الأشهر والإقفالات</h2>
                <p className="mt-1 text-xs text-slate-500">حدد الشهر لمراجعة تفاصيله أو بدء قائمة إقفال الشهر.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-semibold text-sky-800">مفتوحة</span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">مقفلة</span>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-800">مؤمنة نهائيًا</span>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-sm text-slate-500">جاري تحميل الفترات المالية...</div>
            ) : periods.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">لا توجد فترات مسجلة لهذه السنة المالية.</div>
            ) : (
              <>
                <div className="space-y-2 p-3 xl:hidden">
                  {periods.map((period) => {
                    const status = periodStatus(period);
                    const isSelected = selectedPeriodId === period.id;
                    return (
                      <article
                        key={period.id}
                        className={`rounded-xl border p-3 transition ${isSelected ? 'border-cyan-300 bg-cyan-50/60' : 'border-slate-200 bg-white'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-bold text-slate-800">
                              <button type="button" aria-pressed={isSelected} onClick={() => setSelectedPeriodId(period.id)} className="text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
                                {period.name}<span className="mr-2 text-xs font-medium text-slate-400">#{period.periodNumber}</span>
                              </button>
                            </h3>
                            <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${status.className}`}>
                              {period.status === 'OPEN' ? <Circle className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                              {status.label}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500">{period.closedAt ? formatClosedAt(period.closedAt) : 'لم تُقفل بعد'}</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-white/80 p-2.5 text-xs">
                          <div><p className="text-slate-500">بداية الفترة</p><p className="mt-1 font-semibold text-slate-800">{formatDate(period.startDate)}</p></div>
                          <div><p className="text-slate-500">نهاية الفترة</p><p className="mt-1 font-semibold text-slate-800">{formatDate(period.endDate)}</p></div>
                        </div>
                        <div className="mt-3 flex justify-end">
                          {period.status === 'OPEN' ? (
                            canClose ? (
                              <button
                                type="button"
                                onClick={() => openCloseChecklist(period)}
                                className="min-h-10 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
                              >
                                مراجعة وإقفال
                              </button>
                            ) : <span className="py-2 text-xs text-slate-400">غير مصرح بالإقفال</span>
                          ) : period.status === 'CLOSED' && canReopen ? (
                            <button
                              type="button"
                              onClick={() => {
                                setReopenReason('');
                                setReopenPeriodTarget(period);
                              }}
                              className="min-h-10 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                            >
                              إعادة فتح
                            </button>
                          ) : <span className="py-2 text-xs text-slate-400">—</span>}
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className="hidden overflow-x-auto xl:block">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">الشهر / الفترة</th>
                      <th className="px-4 py-3 font-semibold">بداية الفترة</th>
                      <th className="px-4 py-3 font-semibold">نهاية الفترة</th>
                      <th className="px-4 py-3 font-semibold">الحالة</th>
                      <th className="px-4 py-3 font-semibold">تاريخ ووقت الإقفال</th>
                      <th className="px-4 py-3 font-semibold">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {periods.map((period) => {
                      const status = periodStatus(period);
                      const isSelected = selectedPeriodId === period.id;
                      return (
                        <tr
                          key={period.id}
                          onClick={() => setSelectedPeriodId(period.id)}
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
                              {period.status === 'OPEN' ? <Circle className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {period.closedAt ? formatClosedAt(period.closedAt) : <span className="text-slate-400">لم تُقفل بعد</span>}
                          </td>
                          <td className="px-4 py-3">
                            {period.status === 'OPEN' ? (
                              canClose ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openCloseChecklist(period);
                                  }}
                                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
                                >
                                  مراجعة وإقفال
                                </button>
                              ) : <span className="text-xs text-slate-400">غير مصرح بالإقفال</span>
                            ) : period.status === 'CLOSED' && canReopen ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setReopenReason('');
                                  setReopenPeriodTarget(period);
                                }}
                                className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                              >
                                إعادة فتح
                              </button>
                            ) : <span className="text-xs text-slate-400">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </section>

          {selectedPeriod && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
                {selectedPeriod.closedAt && (
                  <p className="text-sm text-slate-600">
                    <span className="font-semibold">أُقفلت في:</span> {formatClosedAt(selectedPeriod.closedAt)}
                  </p>
                )}
              </div>
              {selectedPeriod.closingNotes && (
                <div className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                  {selectedPeriod.closingNotes}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {showYearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="create-year-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="create-year-title" className="font-black text-slate-800">إنشاء سنة مالية</h2>
              <button type="button" onClick={() => setShowYearModal(false)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleCreateYear} className="space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                رمز السنة
                <input required value={yearForm.yearCode} onChange={(event) => setYearForm({ ...yearForm, yearCode: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                اسم السنة
                <input required value={yearForm.name} onChange={(event) => setYearForm({ ...yearForm, name: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700">
                  تاريخ البداية
                  <input type="date" required value={yearForm.startDate} onChange={(event) => setYearForm({ ...yearForm, startDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  تاريخ النهاية
                  <input type="date" required min={yearForm.startDate} value={yearForm.endDate} onChange={(event) => setYearForm({ ...yearForm, endDate: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
                </label>
              </div>
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
          <section role="dialog" aria-modal="true" aria-labelledby="close-period-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-cyan-50 p-2.5 text-cyan-700"><FileCheck2 className="h-5 w-5" /></div>
                <div>
                  <h2 id="close-period-title" className="font-black text-slate-800">قائمة مراجعة إقفال الشهر</h2>
                  <p className="mt-1 text-sm text-slate-500">{closePeriodTarget.name} · {formatDate(closePeriodTarget.startDate)} إلى {formatDate(closePeriodTarget.endDate)}</p>
                </div>
              </div>
              <button type="button" onClick={() => setClosePeriodTarget(null)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>

            <div className={`mt-5 rounded-xl border p-3 text-sm ${unpostedCount === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
              <div className="flex items-center gap-2 font-bold">
                {unpostedCount === 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {unpostedCount === 0 ? 'لا توجد قيود غير مرحلة' : `يوجد ${unpostedCount} قيد غير مرحل`}
              </div>
              {unpostedCount > 0 && (
                <p className="mt-1">
                  لا يمكن إقفال الفترة قبل ترحيل القيود أو حذفها.
                  {' '}<Link to="/finance/journal" onClick={() => setClosePeriodTarget(null)} className="font-bold underline">فتح القيود اليومية</Link>
                </p>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {checklistItems.map((item) => {
                const checked = completedChecklist.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleChecklistItem(item.id)}
                    aria-pressed={checked}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-right text-sm transition ${
                      checked ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {checked ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 shrink-0 text-slate-300" />}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            <label className="mt-4 block text-sm font-semibold text-slate-700">
              ملاحظات الإقفال أو رقم محضر المطابقة
              <textarea value={closeNotes} onChange={(event) => setCloseNotes(event.target.value)} placeholder="أضف ملاحظات أو مرجع محضر الإقفال..." className="mt-1.5 min-h-20 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal" />
            </label>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setClosePeriodTarget(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">إلغاء</button>
              <button
                type="button"
                onClick={handleClosePeriod}
                disabled={actionBusy || !allChecklistComplete}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ShieldCheck className="h-4 w-4" />
                {actionBusy ? 'جارٍ الإقفال...' : 'تأكيد إقفال الشهر'}
              </button>
            </div>
          </section>
        </div>
      )}

      {reopenPeriodTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="reopen-period-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h2 id="reopen-period-title" className="font-black text-slate-800">إعادة فتح {reopenPeriodTarget.name}</h2>
            </div>
            <p className="mt-2 text-sm text-slate-500">يجب تسجيل سبب إعادة الفتح لأغراض المراجعة والتدقيق.</p>
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
          <section role="dialog" aria-modal="true" aria-labelledby="close-year-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-rose-700" />
              <h2 id="close-year-title" className="font-black text-slate-800">إقفال {closeYearTarget.name}</h2>
            </div>
            <p className="mt-2 text-sm text-slate-500">سيتم ترحيل أرصدة الإيرادات والمصروفات إلى الأرباح المحتجزة. لا يمكن التراجع عن هذا الإجراء من هذه الصفحة.</p>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              رمز حساب الأرباح المحتجزة
              <input required value={retainedEarningsAccount} onChange={(event) => setRetainedEarningsAccount(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCloseYearTarget(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">إلغاء</button>
              <button type="button" onClick={handleCloseYear} disabled={actionBusy || !retainedEarningsAccount.trim()} className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50">{actionBusy ? 'جارٍ الإقفال...' : 'تأكيد الإقفال السنوي'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default FiscalClosingPage;
