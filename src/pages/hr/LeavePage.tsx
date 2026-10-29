import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { LeaveService } from '../../services/LeaveService';
import { EmployeeService } from '../../services/EmployeeService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';
import type { EmployeeLeaveRequest, LeaveStatus, LeaveType } from '../../types/hrLeave';

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

  const load = () => {
    setLoading(true);
    try {
      setRows(service.getRequests({ status }));
      const data = service.getSummary();
      setSummary({ pending: data.pending, approvedDays: data.approvedDays });
      if (canRequest && can('employees.view')) {
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
  }, [status]);

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
