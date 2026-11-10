import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { LeaveService } from '../../../services/domains/hr/LeaveService';
import { EmployeeService } from '../../../services/domains/hr/EmployeeService';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { useToast } from '../../../components/ui/Toast';
import type { EmployeeLeaveRequest, LeaveStatus, LeaveType } from '../../../types/hr/leave';
import type {
  AnnualLeaveAccrualPolicyState,
  LeaveBalanceSummary,
  LeaveBalanceTransaction,
  LeaveCalendarEntry,
  LeaveTypePolicy,
} from '../../../services/domains/hr/LeaveService';

const statusLabels: Record<LeaveStatus, string> = {
  PENDING: 'قيد الانتظار',
  APPROVED: 'معتمدة',
  REJECTED: 'مرفوضة',
  CANCELLED: 'ملغاة',
};

const statusStyles: Record<LeaveStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};

const typeLabels: Record<LeaveType, string> = {
  ANNUAL: 'سنوية',
  SICK: 'مرضية',
  UNPAID: 'بدون أجر',
  OTHER: 'أخرى',
};

const emptyForm = {
  employeeId: '',
  leaveType: 'ANNUAL' as LeaveType,
  startDate: '',
  endDate: '',
  reason: '',
};

const today = new Date();
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const currentDate = `${currentMonth}-${String(today.getDate()).padStart(2, '0')}`;
const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
const nextMonthPeriod = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

export const LeavePage: React.FC = () => {
  const service = useMemo(() => new LeaveService(), []);
  const toast = useToast();
  const can = usePermission();
  const canRequest = can('hr.leave.request');
  const canApprove = can('hr.leave.approve');
  const [rows, setRows] = useState<EmployeeLeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [status, setStatus] = useState<LeaveStatus | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [summary, setSummary] = useState({ pending: 0, approvedDays: 0 });
  const [calendarPeriod, setCalendarPeriod] = useState(currentMonth);
  const [calendar, setCalendar] = useState<LeaveCalendarEntry[]>([]);
  const [policies, setPolicies] = useState<LeaveTypePolicy[]>([]);
  const [annualPolicyState, setAnnualPolicyState] = useState<AnnualLeaveAccrualPolicyState>({
    branchPolicy: null,
    employeePolicy: null,
    effectivePolicy: null,
  });
  const [annualPolicyDraft, setAnnualPolicyDraft] = useState({
    employeeId: '',
    annualEntitlementDays: '',
    carryoverLimitDays: '',
    prorateOnService: true,
    effectiveFrom: nextMonthPeriod,
    inheritBranchPolicy: false,
  });
  const [policyDraft, setPolicyDraft] = useState<Record<LeaveType, string>>({
    ANNUAL: '', SICK: '', UNPAID: '', OTHER: '',
  });
  const [requestBalance, setRequestBalance] = useState<LeaveBalanceSummary | null>(null);
  const [balanceTransactions, setBalanceTransactions] = useState<LeaveBalanceTransaction[]>([]);
  const [balanceForm, setBalanceForm] = useState({
    employeeId: '',
    year: String(today.getFullYear()),
    daysDelta: '',
    transactionType: 'ALLOCATION' as 'ALLOCATION' | 'CARRYOVER' | 'ADJUSTMENT',
    effectiveDate: currentDate,
    reason: '',
  });

  const load = () => {
    setLoading(true);
    try {
      setRows(service.getRequests({ status }));
      const data = service.getSummary();
      setSummary({ pending: data.pending, approvedDays: data.approvedDays });
      setCalendar(service.getCalendar(calendarPeriod));
      const currentPolicies = service.getTypePolicies();
      setPolicies(currentPolicies);
      setPolicyDraft(Object.fromEntries(currentPolicies.map((item) => [
        item.leaveType,
        item.maxDaysPerYear == null ? '' : String(item.maxDaysPerYear),
      ])) as Record<LeaveType, string>);
      setAnnualPolicyState(service.getAnnualAccrualPolicyState(annualPolicyDraft.employeeId || undefined));
      if ((canRequest || canApprove) && can('employees.view')) {
        setEmployees(EmployeeService.getAll().map((employee) => ({ id: employee.id, name: employee.name })));
      }
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل الإجازات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, calendarPeriod]);

  useEffect(() => {
    const employeeId = form.employeeId;
    if (!employeeId) {
      setRequestBalance(null);
      return;
    }
    try {
      const year = form.startDate ? Number(form.startDate.slice(0, 4)) : today.getFullYear();
      const asOfDate = form.startDate || (year === today.getFullYear() ? currentDate : `${year}-01-01`);
      setRequestBalance(service.getBalanceSummary(employeeId, year, asOfDate));
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل رصيد الإجازة السنوية.');
    }
  }, [form.employeeId, form.startDate, service, toast]);

  useEffect(() => {
    if (!balanceForm.employeeId) {
      setBalanceTransactions([]);
      return;
    }
    try {
      const year = Number(balanceForm.year);
      setBalanceTransactions(service.getBalanceTransactions(balanceForm.employeeId, year));
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل سجل الرصيد.');
    }
  }, [balanceForm.employeeId, balanceForm.year, service, toast]);

  const submit = () => {
    if (!form.employeeId || !form.startDate || !form.endDate) {
      toast.error('اختر الموظف وتاريخ البداية والنهاية.');
      return;
    }
    setSaving(true);
    try {
      service.requestLeave({
        employeeId: form.employeeId,
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
      });
      toast.success('تم تسجيل طلب الإجازة.');
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تسجيل طلب الإجازة.');
    } finally {
      setSaving(false);
    }
  };

  const decide = (row: EmployeeLeaveRequest, decision: 'APPROVED' | 'REJECTED') => {
    const label = decision === 'APPROVED' ? 'اعتماد' : 'رفض';
    const note = window.prompt(`${label} إجازة ${row.employeeName} — ملاحظة (اختياري):`) ?? '';
    try {
      service.decide(row.id, decision, note);
      toast.success(`تم ${label} الطلب.`);
      load();
    } catch (error: any) {
      toast.error(error?.message || `تعذر ${label} الطلب.`);
    }
  };

  const cancel = (row: EmployeeLeaveRequest) => {
    if (!window.confirm(`إلغاء إجازة ${row.employeeName}؟`)) return;
    try {
      service.cancel(row.id);
      toast.success('تم إلغاء الطلب.');
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إلغاء الطلب.');
    }
  };

  const adjustBalance = () => {
    try {
      service.adjustAnnualBalance({
        employeeId: balanceForm.employeeId,
        year: Number(balanceForm.year),
        daysDelta: Number(balanceForm.daysDelta),
        transactionType: balanceForm.transactionType,
        effectiveDate: balanceForm.effectiveDate,
        reason: balanceForm.reason,
      });
      toast.success('تم تحديث رصيد الإجازة السنوية.');
      setBalanceForm({ ...balanceForm, daysDelta: '', reason: '' });
      const year = Number(balanceForm.year);
      setBalanceTransactions(service.getBalanceTransactions(balanceForm.employeeId, year));
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تعديل الرصيد.');
    }
  };

  const savePolicy = (leaveType: LeaveType) => {
    try {
      const value = policyDraft[leaveType].trim();
      service.saveTypePolicy(leaveType, value ? Number(value) : null);
      toast.success(`تم تحديث الحد السنوي: ${typeLabels[leaveType]}.`);
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر حفظ حد الإجازة.');
    }
  };

  const selectAnnualPolicyTarget = (employeeId: string, asOfDate?: string) => {
    try {
      const state = service.getAnnualAccrualPolicyState(employeeId || undefined, asOfDate);
      const selectedPolicy = employeeId
        ? state.employeePolicy ?? state.branchPolicy
        : state.branchPolicy;
      setAnnualPolicyState(state);
      setAnnualPolicyDraft({
        employeeId,
        annualEntitlementDays: selectedPolicy?.annualEntitlementDays == null
          ? '' : String(selectedPolicy.annualEntitlementDays),
        carryoverLimitDays: selectedPolicy?.carryoverLimitDays == null
          ? '' : String(selectedPolicy.carryoverLimitDays),
        prorateOnService: selectedPolicy?.prorateOnService ?? true,
        effectiveFrom: nextMonthPeriod,
        inheritBranchPolicy: Boolean(employeeId && !state.employeePolicy),
      });
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل سياسة استحقاق الإجازة.');
    }
  };

  const saveAnnualPolicy = () => {
    try {
      service.saveAnnualAccrualPolicy({
        employeeId: annualPolicyDraft.employeeId || undefined,
        effectiveFrom: `${annualPolicyDraft.effectiveFrom}-01`,
        annualEntitlementDays: annualPolicyDraft.inheritBranchPolicy
          ? undefined : Number(annualPolicyDraft.annualEntitlementDays),
        carryoverLimitDays: annualPolicyDraft.inheritBranchPolicy
          ? undefined : Number(annualPolicyDraft.carryoverLimitDays),
        prorateOnService: annualPolicyDraft.inheritBranchPolicy
          ? undefined : annualPolicyDraft.prorateOnService,
        inheritBranchPolicy: annualPolicyDraft.inheritBranchPolicy,
      });
      toast.success('تم حفظ سياسة الاستحقاق السنوي.');
      selectAnnualPolicyTarget(
        annualPolicyDraft.employeeId,
        `${annualPolicyDraft.effectiveFrom}-01`
      );
    } catch (error: any) {
      toast.error(error?.message || 'تعذر حفظ سياسة الاستحقاق السنوي.');
    }
  };

  const entriesByDate = calendar.reduce<Record<string, LeaveCalendarEntry[]>>((grouped, entry) => {
    grouped[entry.date] = [...(grouped[entry.date] ?? []), entry];
    return grouped;
  }, {});

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <CalendarDays className="h-5 w-5 text-sky-600" /> الإجازات
          </h1>
          <p className="text-sm text-slate-500">طلبات الإجازة واعتمادها ومتابعة الأرصدة المستخدمة.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as LeaveStatus | 'ALL')}
          >
            <option value="ALL">كل الحالات</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600" onClick={load} title="تحديث">
            <RefreshCw className="h-4 w-4" />
          </button>
          {canRequest && (
            <button
              className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white"
              onClick={() => setShowForm((value) => !value)}
            >
              <Plus className="h-4 w-4" /> طلب إجازة
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-700">طلبات قيد الانتظار</p>
          <p className="text-2xl font-bold text-amber-800">{summary.pending}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-700">أيام الإجازات المعتمدة هذا العام</p>
          <p className="text-2xl font-bold text-emerald-800">{summary.approvedDays}</p>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-slate-800">تقويم الإجازات والموظفون الغائبون</h2>
            <p className="text-xs text-slate-500">يعرض الإجازات المعتمدة والطلبات المعلقة في الفرع المحدد.</p>
          </div>
          <input
            type="month"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={calendarPeriod}
            onChange={(event) => setCalendarPeriod(event.target.value)}
          />
        </div>
        {Object.keys(entriesByDate).length ? (
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                <tr><th className="p-2">التاريخ</th><th className="p-2">الموظفون</th></tr>
              </thead>
              <tbody>
                {Object.entries(entriesByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, entries]) => (
                  <tr key={date} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap p-2 font-medium">{date}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {entries.map((entry) => (
                          <span key={`${entry.employeeId}-${entry.status}`} className={`rounded-full px-2 py-1 text-xs ${
                            entry.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700'
                              : entry.status === 'ABSENT' ? 'bg-rose-50 text-rose-700'
                                : 'bg-amber-50 text-amber-700'
                          }`}>
                            {entry.employeeName} · {entry.leaveType ? typeLabels[entry.leaveType] : 'غياب'}
                            {' · '}{entry.status === 'APPROVED' ? 'في إجازة' : entry.status === 'ABSENT' ? 'غائب' : 'طلب معلق'}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">لا توجد إجازات أو طلبات معلقة في هذا الشهر.</p>}
      </section>

      {showForm && canRequest && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-5">
            <label className="text-xs text-slate-600">
              الموظف
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.employeeId}
                onChange={(event) => setForm({ ...form, employeeId: event.target.value })}
              >
                <option value="">اختر الموظف</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              النوع
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.leaveType}
                onChange={(event) => setForm({ ...form, leaveType: event.target.value as LeaveType })}
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              من
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.startDate}
                onChange={(event) => setForm({ ...form, startDate: event.target.value })}
              />
            </label>
            <label className="text-xs text-slate-600">
              إلى
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.endDate}
                onChange={(event) => setForm({ ...form, endDate: event.target.value })}
              />
            </label>
            <label className="text-xs text-slate-600">
              السبب
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.reason}
                onChange={(event) => setForm({ ...form, reason: event.target.value })}
              />
            </label>
          </div>
          {form.leaveType === 'ANNUAL' && form.employeeId && requestBalance && (
            <div className="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
              رصيد سنة {requestBalance.year}: {requestBalance.availableDays} يوم متاح
              <span className="mr-2 text-xs text-sky-700">
                (مخصص {requestBalance.grantedDays} · معتمد {requestBalance.approvedDays} · معلق {requestBalance.pendingDays})
              </span>
              <p className="mt-1 text-xs text-sky-700">الرصيد لا يشمل الاستحقاق الشهري الذي لم يحل تاريخ إضافته بعد.</p>
            </div>
          )}
          <p className="mt-2 text-xs text-amber-700">
            تُستثنى العطلات المسجلة وأيام الراحة وفق وردية الموظف. عند عدم تعيين وردية تُحسب أيام التقويم بعد استثناء العطلات المسجلة، لعدم توفر جدول أسبوعي للموظف.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={() => setShowForm(false)}>
              إلغاء
            </button>
            <button
              className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={saving}
              onClick={submit}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} حفظ الطلب
            </button>
          </div>
        </div>
      )}

      {canApprove && (
        <section className="space-y-4 rounded-xl border border-sky-200 bg-white p-4">
          <div>
            <h2 className="font-bold text-slate-800">سياسة الاستحقاق والترحيل التلقائي</h2>
            <p className="text-xs text-slate-500">
              تُضاف أيام الاستحقاق شهريًا في نهاية الشهر، ويُرحل الرصيد المتبقي تلقائيًا وفق الحد المحدد.
              أيام الراحة والعطلات تُحسب حسب وردية الموظف.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs text-slate-600">نطاق السياسة
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={annualPolicyDraft.employeeId}
                onChange={(event) => selectAnnualPolicyTarget(event.target.value)}
              >
                <option value="">الافتراضي للفرع</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>تخصيص: {employee.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">الاستحقاق السنوي (أيام)
              <input
                type="number" min="0" max="366" step="0.5"
                disabled={annualPolicyDraft.inheritBranchPolicy}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-100"
                value={annualPolicyDraft.annualEntitlementDays}
                onChange={(event) => setAnnualPolicyDraft({ ...annualPolicyDraft, annualEntitlementDays: event.target.value })}
              />
            </label>
            <label className="text-xs text-slate-600">حد الترحيل (أيام)
              <input
                type="number" min="0" max="366" step="0.5"
                disabled={annualPolicyDraft.inheritBranchPolicy}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-100"
                value={annualPolicyDraft.carryoverLimitDays}
                onChange={(event) => setAnnualPolicyDraft({ ...annualPolicyDraft, carryoverLimitDays: event.target.value })}
              />
            </label>
            <label className="text-xs text-slate-600">سريان من شهر
              <input
                type="month"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={annualPolicyDraft.effectiveFrom}
                onChange={(event) => setAnnualPolicyDraft({ ...annualPolicyDraft, effectiveFrom: event.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 p-2 text-xs text-slate-700">
              <input
                type="checkbox"
                disabled={annualPolicyDraft.inheritBranchPolicy}
                checked={annualPolicyDraft.prorateOnService}
                onChange={(event) => setAnnualPolicyDraft({ ...annualPolicyDraft, prorateOnService: event.target.checked })}
              />
              احتساب نسبي حسب مدة الخدمة
            </label>
          </div>
          {annualPolicyDraft.employeeId && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={annualPolicyDraft.inheritBranchPolicy}
                onChange={(event) => setAnnualPolicyDraft({ ...annualPolicyDraft, inheritBranchPolicy: event.target.checked })}
              />
              استخدام سياسة الفرع بدل التخصيص الفردي
            </label>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              السياسة الحالية: {annualPolicyState.effectivePolicy
                ? `${annualPolicyState.effectivePolicy.annualEntitlementDays} يوم سنويًا · ترحيل حتى ${annualPolicyState.effectivePolicy.carryoverLimitDays} يوم`
                : 'لا يوجد استحقاق تلقائي؛ يمكن إضافة الرصيد يدويًا'}
            </p>
            <button
              disabled={!annualPolicyDraft.effectiveFrom || (!annualPolicyDraft.inheritBranchPolicy
                && (!annualPolicyDraft.annualEntitlementDays || !annualPolicyDraft.carryoverLimitDays))}
              className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={saveAnnualPolicy}
            >
              حفظ السياسة
            </button>
          </div>
        </section>
      )}

      {canApprove && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <h2 className="font-bold text-slate-800">إدارة رصيد الإجازة السنوية</h2>
                <p className="text-xs text-slate-500">يمكن تسجيل التسويات اليدوية، مع حفظ سجل جميع الحركات التلقائية واليدوية.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <label className="text-xs text-slate-600">الموظف
                  <select className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={balanceForm.employeeId} onChange={(event) => setBalanceForm({ ...balanceForm, employeeId: event.target.value })}>
                    <option value="">اختر الموظف</option>
                    {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-600">السنة
                  <input type="number" min="2000" max="2100" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={balanceForm.year} onChange={(event) => setBalanceForm({ ...balanceForm, year: event.target.value })} />
                </label>
                <label className="text-xs text-slate-600">نوع الحركة
                  <select className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={balanceForm.transactionType} onChange={(event) => setBalanceForm({ ...balanceForm, transactionType: event.target.value as typeof balanceForm.transactionType })}>
                    <option value="ALLOCATION">استحقاق يدوي</option>
                    <option value="CARRYOVER">ترحيل رصيد</option>
                    <option value="ADJUSTMENT">تسوية</option>
                  </select>
                </label>
                <label className="text-xs text-slate-600">الأيام (+ / −)
                  <input type="number" step="0.5" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={balanceForm.daysDelta} onChange={(event) => setBalanceForm({ ...balanceForm, daysDelta: event.target.value })} />
                </label>
                <label className="text-xs text-slate-600">تاريخ الاستحقاق
                  <input type="date" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={balanceForm.effectiveDate} onChange={(event) => setBalanceForm({ ...balanceForm, effectiveDate: event.target.value })} />
                </label>
                <label className="text-xs text-slate-600">السبب
                  <input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={balanceForm.reason} onChange={(event) => setBalanceForm({ ...balanceForm, reason: event.target.value })} />
                </label>
              </div>
              <button disabled={!balanceForm.employeeId || !balanceForm.daysDelta || !balanceForm.reason.trim()}
                className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" onClick={adjustBalance}>
                حفظ حركة الرصيد
              </button>
              {balanceForm.employeeId && (
                <div className="overflow-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 text-slate-500"><tr>
                      <th className="p-2">التاريخ</th><th className="p-2">الحركة</th><th className="p-2">الأيام</th><th className="p-2">السبب</th><th className="p-2">بواسطة</th>
                    </tr></thead>
                    <tbody>{balanceTransactions.map((transaction) => (
                      <tr key={transaction.id} className="border-t border-slate-100">
                        <td className="p-2">{transaction.effectiveDate}</td>
                        <td className="p-2">{transaction.transactionType === 'CARRYOVER' ? 'ترحيل' : transaction.transactionType === 'ALLOCATION' ? 'استحقاق' : 'تسوية'}</td>
                        <td className={`p-2 ${transaction.daysDelta < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{transaction.daysDelta > 0 ? '+' : ''}{transaction.daysDelta}</td>
                        <td className="p-2">{transaction.reason}</td><td className="p-2">{transaction.createdByName}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
        </section>
      )}

      {canApprove && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 font-bold text-slate-800">الحد الأقصى السنوي لأنواع الإجازات</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {policies.map((policy) => (
                  <div key={policy.leaveType} className="flex items-end gap-2">
                    <label className="flex-1 text-xs text-slate-600">{typeLabels[policy.leaveType]} (اتركه فارغًا لغير محدود)
                      <input type="number" min="0" step="0.5" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                        value={policyDraft[policy.leaveType]} onChange={(event) => setPolicyDraft({
                          ...policyDraft, [policy.leaveType]: event.target.value,
                        })} />
                    </label>
                    <button className="rounded-lg border border-slate-200 px-3 py-2 text-xs" onClick={() => savePolicy(policy.leaveType)}>حفظ</button>
                  </div>
                ))}
              </div>
        </section>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="p-3">الموظف</th>
              <th className="p-3">النوع</th>
              <th className="p-3">الفترة</th>
              <th className="p-3">الأيام</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">جارٍ التحميل…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">لا توجد طلبات إجازة.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="p-3 font-medium text-slate-700">{row.employeeName}</td>
                <td className="p-3">{typeLabels[row.leaveType]}</td>
                <td className="p-3 text-slate-600">{row.startDate} → {row.endDate}</td>
                <td className="p-3">{row.days}</td>
                <td className="p-3">
                  <span className={`rounded-full border px-2 py-1 text-xs ${statusStyles[row.status]}`}>
                    {statusLabels[row.status]}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex gap-1">
                    {canApprove && row.status === 'PENDING' && (
                      <>
                        <button className="rounded bg-emerald-50 p-1 text-emerald-700" title="اعتماد" onClick={() => decide(row, 'APPROVED')}>
                          <Check className="h-4 w-4" />
                        </button>
                        <button className="rounded bg-rose-50 p-1 text-rose-700" title="رفض" onClick={() => decide(row, 'REJECTED')}>
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    {(row.status === 'PENDING' || row.status === 'APPROVED') && (canApprove || canRequest) && (
                      <button className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600" onClick={() => cancel(row)}>
                        إلغاء
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
