import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, FileText, Loader2, Plus, RefreshCw } from 'lucide-react';
import { EmployeeDocumentService } from '../../services/EmployeeDocumentService';
import { EmployeeService } from '../../services/EmployeeService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';
import type { EmployeeDocument, HrDocumentType } from '../../types/hrDocument';

const typeLabels: Record<HrDocumentType, string> = {
  IDENTITY: 'هوية',
  CONTRACT: 'عقد',
  CERTIFICATE: 'شهادة',
  MEDICAL: 'طبي',
  EDUCATION: 'تعليمي',
  OTHER: 'أخرى',
};

const statusLabels: Record<string, string> = {
  ACTIVE: 'نشط',
  EXPIRING: 'قارب الانتهاء',
  EXPIRED: 'منتهي',
  ARCHIVED: 'مؤرشف',
};

const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXPIRING: 'bg-amber-50 text-amber-700 border-amber-200',
  EXPIRED: 'bg-rose-50 text-rose-700 border-rose-200',
  ARCHIVED: 'bg-slate-100 text-slate-500 border-slate-200',
};

const confidentialityLabels = {
  INTERNAL: 'داخلي',
  RESTRICTED: 'مقيّد',
  CONFIDENTIAL: 'سري',
};

const emptyForm = {
  employeeId: '',
  documentType: 'OTHER' as HrDocumentType,
  title: '',
  documentNumber: '',
  issuedAt: '',
  expiresAt: '',
  confidentiality: 'INTERNAL' as 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL',
  notes: '',
};

export const EmployeeDocumentsPage: React.FC = () => {
  const service = useMemo(() => new EmployeeDocumentService(), []);
  const toast = useToast();
  const can = usePermission();
  const canManage = can('hr.documents.manage');

  const [rows, setRows] = useState<EmployeeDocument[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<HrDocumentType | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED' | 'ARCHIVED'>('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [summary, setSummary] = useState({ active: 0, expiring: 0, expired: 0, archived: 0 });

  const load = useCallback(() => {
    setLoading(true);
    try {
      setRows(service.getDocuments({
        employeeId: employeeFilter || undefined,
        documentType: typeFilter,
        status: statusFilter,
      }));
      setSummary(service.getSummary(employeeFilter || undefined));
      if (canManage && can('employees.view')) {
        setEmployees(EmployeeService.getAll().map((employee) => ({ id: employee.id, name: employee.name })));
      }
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل مستندات الموظفين.');
    } finally {
      setLoading(false);
    }
  }, [can, canManage, employeeFilter, service, statusFilter, toast, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.employeeId || !form.title.trim()) {
      toast.error('اختر الموظف وأدخل عنوان المستند.');
      return;
    }
    setSaving(true);
    try {
      service.createDocument({
        employeeId: form.employeeId,
        documentType: form.documentType,
        title: form.title,
        documentNumber: form.documentNumber || null,
        issuedAt: form.issuedAt || null,
        expiresAt: form.expiresAt || null,
        confidentiality: form.confidentiality,
        notes: form.notes,
      });
      toast.success('تم حفظ مستند الموظف.');
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر حفظ المستند.');
    } finally {
      setSaving(false);
    }
  };

  const archive = (row: EmployeeDocument) => {
    const note = window.prompt(`أرشفة مستند "${row.title}" — ملاحظة (اختياري):`) ?? '';
    try {
      service.archiveDocument(row.id, note);
      toast.success('تمت أرشفة المستند.');
      load();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر أرشفة المستند.');
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <FileText className="h-5 w-5 text-sky-600" /> مستندات الموظفين
          </h1>
          <p className="text-sm text-slate-500">هويات، شهادات، تقارير طبية ومستندات أخرى مع تتبع الانتهاء.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={employeeFilter}
            onChange={(event) => setEmployeeFilter(event.target.value)}
          >
            <option value="">كل الموظفين</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as HrDocumentType | 'ALL')}
          >
            <option value="ALL">كل الأنواع</option>
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'ALL' | 'ACTIVE' | 'EXPIRED' | 'ARCHIVED')}
          >
            <option value="ALL">كل الحالات</option>
            <option value="ACTIVE">نشط</option>
            <option value="EXPIRED">منتهي</option>
            <option value="ARCHIVED">مؤرشف</option>
          </select>
          <button className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600" onClick={load} title="تحديث">
            <RefreshCw className="h-4 w-4" />
          </button>
          {canManage && (
            <button
              className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white"
              onClick={() => setShowForm((value) => !value)}
            >
              <Plus className="h-4 w-4" /> مستند جديد
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'نشطة', value: summary.active, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
          { label: 'قاربت الانتهاء (30 يوم)', value: summary.expiring, tone: 'border-amber-200 bg-amber-50 text-amber-800' },
          { label: 'منتهية', value: summary.expired, tone: 'border-rose-200 bg-rose-50 text-rose-800' },
          { label: 'مؤرشفة', value: summary.archived, tone: 'border-slate-200 bg-slate-50 text-slate-800' },
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
              نوع المستند
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.documentType}
                onChange={(event) => setForm({ ...form, documentType: event.target.value as HrDocumentType })}
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              عنوان المستند
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </label>
            <label className="text-xs text-slate-600">
              رقم المستند
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.documentNumber}
                onChange={(event) => setForm({ ...form, documentNumber: event.target.value })}
              />
            </label>
            <label className="text-xs text-slate-600">
              تاريخ الإصدار
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.issuedAt}
                onChange={(event) => setForm({ ...form, issuedAt: event.target.value })}
              />
            </label>
            <label className="text-xs text-slate-600">
              تاريخ الانتهاء
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.expiresAt}
                onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
              />
            </label>
            <label className="text-xs text-slate-600">
              مستوى السرية
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={form.confidentiality}
                onChange={(event) => setForm({ ...form, confidentiality: event.target.value as any })}
              >
                {Object.entries(confidentialityLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
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
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} حفظ المستند
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="p-3">الموظف</th>
              <th className="p-3">النوع</th>
              <th className="p-3">العنوان</th>
              <th className="p-3">الرقم</th>
              <th className="p-3">الانتهاء</th>
              <th className="p-3">السرية</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="p-8 text-center text-slate-500">جارٍ التحميل…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-slate-500">لا توجد مستندات مسجلة.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="p-3 font-medium text-slate-700">{row.employeeName}</td>
                <td className="p-3">{typeLabels[row.documentType]}</td>
                <td className="p-3">{row.title}</td>
                <td className="p-3 font-mono text-xs text-slate-600">{row.documentNumber || '—'}</td>
                <td className="p-3 text-slate-600">{row.expiresAt || '—'}</td>
                <td className="p-3 text-slate-600">{confidentialityLabels[row.confidentiality]}</td>
                <td className="p-3">
                  <span className={`rounded-full border px-2 py-1 text-xs ${statusStyles[row.effectiveStatus]}`}>
                    {statusLabels[row.effectiveStatus]}
                  </span>
                </td>
                <td className="p-3">
                  {canManage && row.status !== 'ARCHIVED' && (
                    <button
                      className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600"
                      onClick={() => archive(row)}
                      title="أرشفة"
                    >
                      <Archive className="h-3.5 w-3.5" /> أرشفة
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
