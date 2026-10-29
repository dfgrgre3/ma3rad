import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileSignature, Loader2, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { ContractService } from '../../services/ContractService';
import { EmployeeService } from '../../services/EmployeeService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';
import type {
  ContractEffectiveStatus,
  ContractStatus,
  ContractType,
  EmployeeContract,
} from '../../types/hrContract';

const statusLabels: Record<ContractEffectiveStatus, string> = {
  DRAFT: 'مسودة',
  ACTIVE: 'نشط',
  SCHEDULED: 'مجدول',
  EXPIRING: 'قارب الانتهاء',
  EXPIRED: 'منتهي',
  TERMINATED: 'مُنهى',
};

const statusStyles: Record<ContractEffectiveStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SCHEDULED: 'bg-sky-50 text-sky-700 border-sky-200',
  EXPIRING: 'bg-amber-50 text-amber-700 border-amber-200',
  EXPIRED: 'bg-rose-50 text-rose-700 border-rose-200',
  TERMINATED: 'bg-slate-100 text-slate-500 border-slate-200',
};

const typeLabels: Record<ContractType, string> = {
  PERMANENT: 'دائم',
  FIXED_TERM: 'محدد المدة',
  PART_TIME: 'دوام جزئي',
  TEMPORARY: 'مؤقت',
};

const money = (value: number, currency: string) =>
  `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ${currency || 'EGP'}`;

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  employeeId: '',
  contractType: 'PERMANENT' as ContractType,
  jobTitle: '',
  startDate: today(),
  endDate: '',
  salary: '',
  renewalNoticeDays: '30',
  notes: '',
};

export const EmployeeContractsPage: React.FC = () => {
  const service = useMemo(() => new ContractService(), []);
  const toast = useToast();
  const can = usePermission();
  const canManage = can('hr.contracts.manage');
  const canTerminate = can('hr.contracts.terminate');

  const [rows, setRows] = useState<EmployeeContract[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [status, setStatus] = useState<ContractStatus | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [summary, setSummary] = useState({ active: 0, expiring: 0, expired: 0, draft: 0 });

  const load = useCallback(() => {
    setLoading(true);
    try {
      setRows(service.getContracts({ status }));
      const data = service.getSummary();
      setSummary({ active: data.active, expiring: data.expiring, expired: data.expired, draft: data.draft });
      if (canManage && can('employees.view')) {
        setEmployees(EmployeeService.getAll().map((employee) => ({ id: employee.id, name: employee.name })));
      }
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل عقود الموظفين.');
    } finally {
      setLoading(false);
    }
  }, [can, canManage, service, status, toast]);

  useEffect(() => { load(); }, [load]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.employeeId || !form.jobTitle.trim() || !form.startDate) {
      toast.error('اختر الموظف وأدخل المسمى الوظيفي وتاريخ البداية.');
      return;
    }
    setSaving(true);
    try {
      service.createContract({
        employeeId: form.employeeId,
        contractType: form.contractType,
        jobTitle: form.jobTitle,
        startDate: form.startDate,
        endDate: form.endDate || null,
        salary: Number(form.salary) || 0,
        renewalNoticeDays: Number(form.renewalNoticeDays) || 0,
        notes: form.notes,
      });
      toast.success('تم إنشاء العقد كمسودة.');
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إنشاء العقد.');
    } finally {
      setSaving(false);
    }
  };

  const activate = (row: EmployeeContract) => {
    if (!window.confirm(`تفعيل العقد ${row.contractNumber} للموظف ${row.employeeName}؟`)) return;
    try {
      service.activateContract(row.id);
      toast.success('تم تفعيل العقد.');
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تفعيل العقد.');
    }
  };

  const renew = (row: EmployeeContract) => {
    const suggested = row.endDate || today();
    const endDate = window.prompt('تاريخ نهاية التجديد (YYYY-MM-DD):', suggested);
    if (!endDate) return;
    const salaryInput = window.prompt('الراتب الجديد (اتركه فارغاً للإبقاء على الحالي):', '');
    try {
      service.renewContract(row.id, {
        endDate,
        salary: salaryInput?.trim() ? Number(salaryInput) : undefined,
      });
      toast.success('تم تجديد العقد.');
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تجديد العقد.');
    }
  };

  const terminate = (row: EmployeeContract) => {
    const reason = window.prompt(`سبب إنهاء العقد ${row.contractNumber}:`, '');
    if (!reason) return;
    try {
      service.terminateContract(row.id, reason);
      toast.success('تم إنهاء العقد.');
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إنهاء العقد.');
    }
  };

  const remove = (row: EmployeeContract) => {
    if (!window.confirm(`حذف مسودة العقد ${row.contractNumber}؟`)) return;
    try {
      service.deleteContract(row.id);
      toast.success('تم حذف المسودة.');
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر حذف العقد.');
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <FileSignature className="h-5 w-5 text-sky-600" /> عقود الموظفين
          </h1>
          <p className="text-sm text-slate-500">مسودات وعقود نشطة وتجديد وإنهاء مع تنبيه قرب الانتهاء.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as ContractStatus | 'ALL')}
          >
            <option value="ALL">كل الحالات</option>
            <option value="DRAFT">مسودة</option>
            <option value="ACTIVE">نشط</option>
            <option value="TERMINATED">مُنهى</option>
          </select>
          <button className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600" onClick={load} title="تحديث">
            <RefreshCw className="h-4 w-4" />
          </button>
          {canManage && (
            <button
              className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white"
              onClick={() => setShowForm((value) => !value)}
            >
              <Plus className="h-4 w-4" /> عقد جديد
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'عقود نشطة', value: summary.active, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
          { label: 'قاربت الانتهاء', value: summary.expiring, tone: 'border-amber-200 bg-amber-50 text-amber-800' },
          { label: 'منتهية', value: summary.expired, tone: 'border-rose-200 bg-rose-50 text-rose-800' },
          { label: 'مسودات', value: summary.draft, tone: 'border-slate-200 bg-slate-50 text-slate-800' },
        ].map((card) => (
          <div key={card.label} className={`rounded-xl border p-3 ${card.tone}`}>
            <p className="text-xs font-bold opacity-80">{card.label}</p>
            <p className="text-2xl font-black">{card.value}</p>
          </div>
        ))}
      </div>

      {showForm && canManage && (
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-4">
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
              نوع العقد
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.contractType}
                onChange={(event) => setForm({ ...form, contractType: event.target.value as ContractType })}
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              المسمى الوظيفي
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.jobTitle}
                onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
              />
            </label>
            <label className="text-xs text-slate-600">
              الراتب
              <input
                type="number" min="0" step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.salary}
                onChange={(event) => setForm({ ...form, salary: event.target.value })}
              />
            </label>
            <label className="text-xs text-slate-600">
              تاريخ البداية
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.startDate}
                onChange={(event) => setForm({ ...form, startDate: event.target.value })}
              />
            </label>
            <label className="text-xs text-slate-600">
              تاريخ النهاية (اختياري)
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.endDate}
                onChange={(event) => setForm({ ...form, endDate: event.target.value })}
              />
            </label>
            <label className="text-xs text-slate-600">
              تنبيه التجديد (أيام)
              <input
                type="number" min="0" max="365" step="1"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.renewalNoticeDays}
                onChange={(event) => setForm({ ...form, renewalNoticeDays: event.target.value })}
              />
            </label>
            <label className="text-xs text-slate-600">
              ملاحظات
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={() => setShowForm(false)}>
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} حفظ المسودة
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="p-3">الموظف</th>
              <th className="p-3">رقم العقد</th>
              <th className="p-3">النوع</th>
              <th className="p-3">الفترة</th>
              <th className="p-3">الراتب</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center text-slate-500">جارٍ التحميل…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-slate-500">لا توجد عقود مسجلة.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="p-3 font-medium text-slate-700">{row.employeeName}</td>
                <td className="p-3 font-mono text-xs text-slate-600">{row.contractNumber}</td>
                <td className="p-3">{typeLabels[row.contractType]}</td>
                <td className="p-3 text-slate-600">{row.startDate} → {row.endDate || 'مفتوح'}</td>
                <td className="p-3">{money(row.salary, row.currency)}</td>
                <td className="p-3">
                  <span className={`rounded-full border px-2 py-1 text-xs ${statusStyles[row.effectiveStatus || row.status]}`}>
                    {statusLabels[row.effectiveStatus || row.status]}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {canManage && row.status === 'DRAFT' && (
                      <>
                        <button className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700" onClick={() => activate(row)}>
                          تفعيل
                        </button>
                        <button className="rounded bg-rose-50 p-1 text-rose-700" title="حذف المسودة" onClick={() => remove(row)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {canManage && row.status === 'ACTIVE' && (
                      <button className="rounded bg-sky-50 px-2 py-1 text-xs text-sky-700" onClick={() => renew(row)}>
                        تجديد
                      </button>
                    )}
                    {canTerminate && row.status === 'ACTIVE' && (
                      <button className="flex items-center gap-1 rounded bg-rose-50 px-2 py-1 text-xs text-rose-700" onClick={() => terminate(row)}>
                        <XCircle className="h-3.5 w-3.5" /> إنهاء
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
