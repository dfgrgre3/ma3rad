import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock3, FileSignature, Loader2, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { ContractService } from '../../../services/domains/hr/ContractService';
import { EmployeeService } from '../../../services/domains/hr/EmployeeService';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { useToast } from '../../../components/ui/Toast';
import { localDateString } from '../../../utils/shared/date';
import type {
  ContractEffectiveStatus,
  ContractStatus,
  ContractType,
  EmployeeContract,
  EmployeeLifecycleHistory,
} from '../../../types/hr/contract';

const statusLabels: Record<ContractEffectiveStatus, string> = {
  DRAFT: 'مسودة',
  ACTIVE: 'نشط',
  SCHEDULED: 'مجدول',
  EXPIRING: 'قارب الانتهاء',
  EXPIRED: 'منتهي',
  TERMINATED: 'مُنهى',
};

const statusStyles: Record<ContractEffectiveStatus, string> = {
  DRAFT: 'bg-surface-sunken text-ink-secondary border-line',
  ACTIVE: 'bg-success-soft text-success border-success-border',
  SCHEDULED: 'bg-accent-soft text-primary border-accent-border',
  EXPIRING: 'bg-warning-soft text-warning border-warning-border',
  EXPIRED: 'bg-danger-soft text-danger border-danger-border',
  TERMINATED: 'bg-surface-sunken text-muted border-line',
};

const typeLabels: Record<ContractType, string> = {
  PERMANENT: 'دائم',
  FIXED_TERM: 'محدد المدة',
  PART_TIME: 'دوام جزئي',
  TEMPORARY: 'مؤقت',
};

const money = (value: number, currency: string) =>
  `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ${currency || 'EGP'}`;

const today = () => localDateString();

const addDateDays = (date: string, days: number) => {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};

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
  const [searchParams] = useSearchParams();
  const service = useMemo(() => new ContractService(), []);
  const toast = useToast();
  const can = usePermission();
  const canManage = can('hr.contracts.manage');
  const canTerminate = can('hr.contracts.terminate');
  const canApprove = can('hr.contracts.approve');

  const [rows, setRows] = useState<EmployeeContract[]>([]);
  const [settlements, setSettlements] = useState<Array<{
    id: string; employeeName: string; contractNumber: string; terminationDate: string;
    earnedWages: number; unusedAnnualLeaveDays: number; leavePayout: number; totalAmount: number;
  }>>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [status, setStatus] = useState<ContractStatus | 'ALL'>('ALL');
  const [employeeFilter, setEmployeeFilter] = useState(searchParams.get('employeeId') || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [salaryComponents, setSalaryComponents] = useState<Array<{ name: string; amount: string }>>([]);
  const [summary, setSummary] = useState({ active: 0, expiring: 0, expired: 0, draft: 0 });
  const [lifecycleHistory, setLifecycleHistory] = useState<EmployeeLifecycleHistory | null>(null);
  const [historyEmployeeName, setHistoryEmployeeName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(service.getContracts({ status, employeeId: employeeFilter || undefined }));
      setSettlements(service.getFinalSettlements(employeeFilter || undefined));
      const data = service.getSummary();
      setSummary({ active: data.active, expiring: data.expiring, expired: data.expired, draft: data.draft });
      if (canManage && can('employees.view')) {
        setEmployees((await EmployeeService.getAllAsync())
          .filter((employee) => !['RESIGNED', 'TERMINATED'].includes(employee.status))
          .map((employee) => ({ id: employee.id, name: employee.name })));
      }
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل عقود الموظفين.');
    } finally {
      setLoading(false);
    }
  }, [can, canManage, employeeFilter, service, status, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setEmployeeFilter(searchParams.get('employeeId') || ''); }, [searchParams]);

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
        salaryComponents: salaryComponents
          .filter((component) => component.name.trim() || component.amount.trim())
          .map((component) => ({ name: component.name.trim(), amount: Number(component.amount) })),
        renewalNoticeDays: Number(form.renewalNoticeDays) || 0,
        notes: form.notes,
      });
      toast.success('تم إنشاء العقد كمسودة.');
      setForm(emptyForm);
      setSalaryComponents([]);
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

  const approve = (row: EmployeeContract) => {
    try {
      service.approveContract(row.id);
      toast.success('تم اعتماد العقد، ويمكن تفعيله.');
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر اعتماد العقد.');
    }
  };

  const renew = (row: EmployeeContract) => {
    const suggestedStart = row.endDate && row.endDate >= today()
      ? addDateDays(row.endDate, 1)
      : row.startDate >= today() ? addDateDays(row.startDate, 1) : today();
    const startDate = window.prompt('تاريخ بداية العقد المجدد (YYYY-MM-DD):', suggestedStart);
    if (!startDate) return;
    const suggestedEnd = new Date(`${startDate}T00:00:00Z`);
    suggestedEnd.setUTCFullYear(suggestedEnd.getUTCFullYear() + 1);
    const endDate = window.prompt('تاريخ نهاية العقد المجدد (YYYY-MM-DD):', suggestedEnd.toISOString().slice(0, 10));
    if (!endDate) return;
    const salaryInput = window.prompt('الراتب الجديد (اتركه فارغاً للإبقاء على الحالي):', '');
    try {
      service.renewContract(row.id, {
        startDate,
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
    const terminationDate = window.prompt('تاريخ إنهاء الخدمة (YYYY-MM-DD):', today());
    if (!terminationDate) return;
    const employeeStatus = window.prompt('اكتب RESIGNED للاستقالة أو TERMINATED لإنهاء الخدمة:', 'RESIGNED');
    if (!employeeStatus) return;
    try {
      service.terminateContract(row.id, {
        reason,
        terminationDate,
        employeeStatus: employeeStatus.trim().toUpperCase() as 'RESIGNED' | 'TERMINATED',
      });
      toast.success('تم إنهاء الخدمة وحفظ التسوية النهائية.');
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

  const showHistory = (row: EmployeeContract) => {
    try {
      setLifecycleHistory(service.getEmployeeLifecycleHistory(row.employeeId));
      setHistoryEmployeeName(row.employeeName || '');
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل سجل الموظف.');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<FileSignature className="h-5 w-5" />}
        title="عقود الموظفين"
        description="مسودات وعقود نشطة وتجديد وإنهاء مع تنبيه قرب الانتهاء."
        actions={<>
          <select
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as ContractStatus | 'ALL')}
          >
            <option value="ALL">كل الحالات</option>
            <option value="DRAFT">مسودة</option>
            <option value="ACTIVE">نشط</option>
            <option value="TERMINATED">مُنهى</option>
          </select>
          <button className="rounded-lg border border-line bg-surface p-2 text-ink-secondary" onClick={load} title="تحديث">
            <RefreshCw className="h-4 w-4" />
          </button>
          {canManage && (
            <button
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white"
              onClick={() => setShowForm((value) => !value)}
            >
              <Plus className="h-4 w-4" /> عقد جديد
            </button>
          )}
        </>}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'عقود نشطة', value: summary.active, tone: 'border-success-border bg-success-soft text-success' },
          { label: 'قاربت الانتهاء', value: summary.expiring, tone: 'border-warning-border bg-warning-soft text-warning' },
          { label: 'منتهية', value: summary.expired, tone: 'border-danger-border bg-danger-soft text-danger' },
          { label: 'مسودات', value: summary.draft, tone: 'border-line bg-surface-muted text-ink' },
        ].map((card) => (
          <div key={card.label} className={`rounded-xl border p-3 ${card.tone}`}>
            <p className="text-xs font-bold opacity-80">{card.label}</p>
            <p className="text-2xl font-black">{card.value}</p>
          </div>
        ))}
      </div>

      {showForm && canManage && (
        <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-xs text-ink-secondary">
              الموظف
              <select
                className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm"
                value={form.employeeId}
                onChange={(event) => setForm({ ...form, employeeId: event.target.value })}
              >
                <option value="">اختر الموظف</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-secondary">
              نوع العقد
              <select
                className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm"
                value={form.contractType}
                onChange={(event) => setForm({ ...form, contractType: event.target.value as ContractType })}
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-secondary">
              المسمى الوظيفي
              <input
                className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm"
                value={form.jobTitle}
                onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
              />
            </label>
            <label className="text-xs text-ink-secondary">
              الراتب
              <input
                type="number" min="0" step="0.01"
                className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm"
                value={form.salary}
                onChange={(event) => setForm({ ...form, salary: event.target.value })}
              />
            </label>
            {salaryComponents.map((component, index) => (
              <div key={index} className="flex items-end gap-1">
                <label className="flex-1 text-xs text-ink-secondary">
                  مكون راتب
                  <input
                    className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm"
                    placeholder="بدل سكن"
                    value={component.name}
                    onChange={(event) => setSalaryComponents((current) => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, name: event.target.value } : item
                    ))}
                  />
                </label>
                <label className="w-28 text-xs text-ink-secondary">
                  المبلغ
                  <input
                    type="number" min="0" step="0.01"
                    className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm"
                    value={component.amount}
                    onChange={(event) => setSalaryComponents((current) => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, amount: event.target.value } : item
                    ))}
                  />
                </label>
                <button
                  type="button"
                  className="mb-1 rounded p-2 text-danger hover:bg-danger-soft"
                  title="حذف المكون"
                  onClick={() => setSalaryComponents((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="self-end rounded-lg border border-line px-3 py-2 text-xs text-ink-secondary"
              onClick={() => setSalaryComponents((current) => [...current, { name: '', amount: '' }])}
            >
              + إضافة مكون راتب
            </button>
            <label className="text-xs text-ink-secondary">
              تاريخ البداية
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm"
                value={form.startDate}
                onChange={(event) => setForm({ ...form, startDate: event.target.value })}
              />
            </label>
            <label className="text-xs text-ink-secondary">
              تاريخ النهاية (اختياري)
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm"
                value={form.endDate}
                onChange={(event) => setForm({ ...form, endDate: event.target.value })}
              />
            </label>
            <label className="text-xs text-ink-secondary">
              تنبيه التجديد (أيام)
              <input
                type="number" min="0" max="365" step="1"
                className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm"
                value={form.renewalNoticeDays}
                onChange={(event) => setForm({ ...form, renewalNoticeDays: event.target.value })}
              />
            </label>
            <label className="text-xs text-ink-secondary">
              ملاحظات
              <input
                className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="rounded-lg border border-line px-3 py-2 text-sm" onClick={() => setShowForm(false)}>
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} حفظ المسودة
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <DataTable
          ariaLabel="عقود الموظفين"
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="لا توجد عقود مسجلة."
          columns={[
            { key: 'employee', header: 'الموظف', render: (row) => <span className="font-medium text-ink">{row.employeeName}</span> },
            { key: 'number', header: 'رقم العقد', render: (row) => <span className="font-mono text-xs text-ink-secondary">{row.contractNumber}</span> },
            { key: 'type', header: 'النوع', render: (row) => typeLabels[row.contractType] },
            { key: 'period', header: 'الفترة', render: (row) => <span className="text-ink-secondary">{row.startDate} → {row.endDate || 'مفتوح'}</span> },
            { key: 'salary', header: 'الراتب', render: (row) => money(row.salary, row.currency) },
            {
              key: 'status', header: 'الحالة',
              render: (row) => (
                <span className={`rounded-full border px-2 py-1 text-xs ${statusStyles[row.effectiveStatus || row.status]}`}>
                  {statusLabels[row.effectiveStatus || row.status]}
                </span>
              ),
            },
            {
              key: 'action', header: 'الإجراء',
              render: (row) => (
                <div className="flex flex-wrap gap-1">
                  {row.status === 'DRAFT' && (
                    <>
                      {canApprove && !row.approvedAt && (
                        <button className="rounded bg-warning-soft px-2 py-1 text-xs text-warning" onClick={() => approve(row)}>
                          اعتماد
                        </button>
                      )}
                      {canManage && row.approvedAt && (
                        <button className="rounded bg-success-soft px-2 py-1 text-xs text-success" onClick={() => activate(row)}>
                          تفعيل
                        </button>
                      )}
                      {canManage && (
                        <button className="rounded bg-danger-soft p-1 text-danger" title="حذف المسودة" onClick={() => remove(row)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </>
                  )}
                  {canManage && row.status === 'ACTIVE' && (
                    <button className="rounded bg-accent-soft px-2 py-1 text-xs text-primary" onClick={() => renew(row)}>
                      تجديد
                    </button>
                  )}
                  {canTerminate && row.status === 'ACTIVE' && ['ACTIVE', 'EXPIRING'].includes(row.effectiveStatus || '') && (
                    <button className="flex items-center gap-1 rounded bg-danger-soft px-2 py-1 text-xs text-danger" onClick={() => terminate(row)}>
                      <XCircle className="h-3.5 w-3.5" /> إنهاء
                    </button>
                  )}
                  {can('hr.contracts.view') && (
                    <button
                      className="flex items-center gap-1 rounded bg-surface-muted px-2 py-1 text-xs text-ink-secondary"
                      onClick={() => showHistory(row)}
                    >
                      <Clock3 className="h-3.5 w-3.5" /> السجل
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>

      {settlements.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-warning-border bg-surface">
          <div className="border-b border-warning-border bg-warning-soft px-4 py-3">
            <h2 className="font-bold text-warning">التسويات النهائية</h2>
            <p className="text-xs text-warning">تشمل الأجور المكتسبة حتى تاريخ الخدمة ورصيد الإجازة السنوية غير المستخدم.</p>
          </div>
          <div className="overflow-x-auto">
            <DataTable
              ariaLabel="التسويات النهائية"
              rows={settlements}
              rowKey={(settlement) => settlement.id}
              columns={[
                { key: 'employee', header: 'الموظف', render: (settlement) => settlement.employeeName },
                { key: 'contract', header: 'العقد', render: (settlement) => <span className="font-mono text-xs">{settlement.contractNumber}</span> },
                { key: 'date', header: 'تاريخ الخدمة', render: (settlement) => settlement.terminationDate },
                { key: 'wages', header: 'الأجور', render: (settlement) => money(settlement.earnedWages, 'EGP') },
                { key: 'leave', header: 'رصيد الإجازة', render: (settlement) => settlement.unusedAnnualLeaveDays },
                { key: 'leavePay', header: 'مقابل الإجازة', render: (settlement) => money(settlement.leavePayout, 'EGP') },
                { key: 'total', header: 'الإجمالي', render: (settlement) => <span className="font-bold">{money(settlement.totalAmount, 'EGP')}</span> },
              ]}
            />
          </div>
        </section>
      )}

      {lifecycleHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4" role="presentation">
          <section className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-surface shadow-xl" role="dialog" aria-modal="true">
            <header className="sticky top-0 flex items-center justify-between border-b border-line bg-surface p-4">
              <div>
                <h2 className="font-bold text-ink">السجل الوظيفي: {historyEmployeeName}</h2>
                <p className="text-xs text-muted">تغييرات الحالة والراتب المسجلة مع تاريخ السريان والمستخدم المنفذ.</p>
              </div>
              <button className="rounded p-2 text-muted hover:bg-surface-sunken" onClick={() => setLifecycleHistory(null)} aria-label="إغلاق">
                <XCircle className="h-5 w-5" />
              </button>
            </header>
            <div className="grid gap-4 p-4 md:grid-cols-2">
              <section>
                <h3 className="mb-2 font-semibold text-ink">تاريخ الرواتب</h3>
                <div className="space-y-2">
                  {lifecycleHistory.salaryChanges.length === 0 ? (
                    <p className="text-sm text-muted">لا توجد تغييرات راتب مسجلة.</p>
                  ) : lifecycleHistory.salaryChanges.map((change) => (
                    <article key={change.id} className="rounded-lg border border-line p-3 text-sm">
                      <p className="font-semibold">{change.previousSalary ?? '—'} → {change.nextSalary} ({change.salaryType})</p>
                      <p className="text-xs text-muted">السريان: {change.effectiveDate} · {change.actorName}</p>
                      <p className="mt-1 text-xs text-ink-secondary">{change.reason}</p>
                    </article>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="mb-2 font-semibold text-ink">تاريخ الحالة الوظيفية</h3>
                <div className="space-y-2">
                  {lifecycleHistory.statusChanges.length === 0 ? (
                    <p className="text-sm text-muted">لا توجد تغييرات حالة مسجلة.</p>
                  ) : lifecycleHistory.statusChanges.map((change) => (
                    <article key={change.id} className="rounded-lg border border-line p-3 text-sm">
                      <p className="font-semibold">{change.previousStatus || '—'} → {change.nextStatus}</p>
                      <p className="text-xs text-muted">السريان: {change.effectiveDate} · {change.actorName}</p>
                      <p className="mt-1 text-xs text-ink-secondary">{change.reason}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
