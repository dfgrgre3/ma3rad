import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Download, Eye, FileText, History, Loader2, Pencil, Plus, RefreshCw, Upload, X } from 'lucide-react';
import { EmployeeDocumentService } from '../../../services/domains/hr/EmployeeDocumentService';
import { EmployeeService } from '../../../services/domains/hr/EmployeeService';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { useToast } from '../../../components/ui/Toast';
import type {
  EmployeeDocument,
  EmployeeDocumentAuditEntry,
  EmployeeDocumentVersion,
  EmployeeDocumentVersionInput,
  HrDocumentType,
} from '../../../types/hr/document';

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
  const canDownload = can('hr.documents.download') || can('ui.hr.documents.documents.download') || canManage;

  const [rows, setRows] = useState<EmployeeDocument[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<HrDocumentType | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED' | 'ARCHIVED'>('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingDocument, setEditingDocument] = useState<EmployeeDocument | null>(null);
  const [historyDocument, setHistoryDocument] = useState<EmployeeDocument | null>(null);
  const [versions, setVersions] = useState<EmployeeDocumentVersion[]>([]);
  const [auditHistory, setAuditHistory] = useState<EmployeeDocumentAuditEntry[]>([]);
  const [preview, setPreview] = useState<{ document: EmployeeDocument; version: EmployeeDocumentVersion; url: string } | null>(null);
  const [summary, setSummary] = useState({ active: 0, expiring: 0, expired: 0, archived: 0 });
  const canViewRestricted = can('hr.documents.restricted.view') || canManage;
  const canViewConfidential = can('hr.documents.confidential.view') || canManage;

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

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview?.url]);

  const importEmployeeFile = async (): Promise<EmployeeDocumentVersionInput | null> => {
    const bridge = window.ceramisys?.documents;
    if (!bridge?.importFile) throw new Error('رفع الملفات غير متاح في هذه البيئة.');
    const result = await bridge.importFile({ purpose: 'employee' });
    if (!result.ok) {
      if (result.canceled) return null;
      throw new Error(result.error || 'تعذر رفع الملف.');
    }
    if (!result.storageName || !result.fileName || !result.mimeType || !result.fileSize || !result.checksum) {
      throw new Error('لم تكتمل بيانات الملف المرفوع.');
    }
    return {
      storageName: result.storageName,
      fileName: result.fileName,
      mimeType: result.mimeType,
      fileSize: result.fileSize,
      checksum: result.checksum,
      notes: null,
    };
  };

  const finalizeImportedFile = async (storageName: string, commit: boolean) => {
    const bridge = window.ceramisys?.documents;
    const result = commit
      ? await bridge?.commitEmployeeImport?.(storageName)
      : await bridge?.discardEmployeeImport?.(storageName);
    if (!result?.ok) throw new Error(result?.error || 'تعذرت معالجة الملف المرفوع.');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.employeeId || !form.title.trim()) {
      toast.error('اختر الموظف وأدخل عنوان المستند.');
      return;
    }
    setSaving(true);
    let imported: EmployeeDocumentVersionInput | null = null;
    try {
      if (!editingDocument) {
        imported = await importEmployeeFile();
        if (!imported) return;
      }
      const values = {
        documentType: form.documentType,
        title: form.title,
        documentNumber: form.documentNumber || null,
        issuedAt: form.issuedAt || null,
        expiresAt: form.expiresAt || null,
        confidentiality: form.confidentiality,
        notes: form.notes,
      };
      if (editingDocument) {
        service.updateDocument(editingDocument.id, values);
        toast.success('تم تحديث بيانات المستند.');
      } else {
        const attachment = imported;
        if (!attachment) throw new Error('يجب اختيار ملف قبل إنشاء سجل المستند.');
        const note = window.prompt('ملاحظة على النسخة الأولى (اختياري):') ?? '';
        service.createDocument({
          employeeId: form.employeeId,
          ...values,
          attachment,
          attachmentNotes: note,
        });
        await finalizeImportedFile(attachment.storageName, true);
        toast.success('تم حفظ المستند ورفع نسخته الأولى مشفرة.');
      }
      setForm(emptyForm);
      setEditingDocument(null);
      setShowForm(false);
      load();
    } catch (error: any) {
      if (imported) {
        try {
          if (!service.isVersionStorageAttached(imported.storageName)) {
            await finalizeImportedFile(imported.storageName, false);
          }
        } catch (cleanupError: any) {
          toast.error(cleanupError?.message || 'تعذر حذف الملف المرفوع غير المرتبط.');
        }
      }
      toast.error(error?.message || 'تعذر حفظ المستند.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (row: EmployeeDocument) => {
    setEditingDocument(row);
    setForm({
      employeeId: row.employeeId,
      documentType: row.documentType,
      title: row.title,
      documentNumber: row.documentNumber || '',
      issuedAt: row.issuedAt || '',
      expiresAt: row.expiresAt || '',
      confidentiality: row.confidentiality,
      notes: row.notes || '',
    });
    setShowForm(true);
  };

  const addVersion = async (row: EmployeeDocument) => {
    let imported: EmployeeDocumentVersionInput | null = null;
    try {
      imported = await importEmployeeFile();
      if (!imported) return;
      const note = window.prompt(`ملاحظة على النسخة الجديدة من "${row.title}" (اختياري):`) ?? '';
      service.addVersion(row.id, imported, note);
      await finalizeImportedFile(imported.storageName, true);
      toast.success('تمت إضافة نسخة جديدة مع حفظ النسخ السابقة.');
      load();
    } catch (error: any) {
      if (imported) {
        try {
          if (!service.isVersionStorageAttached(imported.storageName)) {
            await finalizeImportedFile(imported.storageName, false);
          }
        } catch (cleanupError: any) {
          toast.error(cleanupError?.message || 'تعذر حذف الملف المرفوع غير المرتبط.');
        }
      }
      toast.error(error?.message || 'تعذرت إضافة النسخة.');
    }
  };

  const showVersions = (row: EmployeeDocument) => {
    try {
      setVersions(service.getVersions(row.id));
      setAuditHistory(service.getAuditHistory(row.id));
      setHistoryDocument(row);
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل سجل النسخ.');
    }
  };

  const openVersion = async (row: EmployeeDocument, version: EmployeeDocumentVersion) => {
    try {
      const authorizedVersion = service.getVersionForAccess(row.id, version.id, 'OPEN');
      const bridge = window.ceramisys?.documents;
      if (!bridge?.readFile) throw new Error('فتح الملفات غير متاح في هذه البيئة.');
      const result = await bridge.readFile(authorizedVersion.storageName);
      if (!result.ok || !result.bytes) throw new Error(result.error || 'تعذر قراءة ملف المستند.');
      const bytes = new Uint8Array(result.bytes);
      const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], {
        type: authorizedVersion.mimeType,
      });
      setPreview({ document: row, version, url: URL.createObjectURL(blob) });
      setHistoryDocument(null);
    } catch (error: any) {
      toast.error(error?.message || 'تعذر فتح المستند.');
    }
  };

  const downloadVersion = async (row: EmployeeDocument, version: EmployeeDocumentVersion) => {
    try {
      const authorizedVersion = service.getVersionForAccess(row.id, version.id, 'DOWNLOAD');
      const bridge = window.ceramisys?.documents;
      if (!bridge?.downloadFile) throw new Error('تنزيل الملفات غير متاح في هذه البيئة.');
      const result = await bridge.downloadFile(authorizedVersion.storageName, authorizedVersion.fileName);
      if (result.canceled) return;
      if (!result.ok) throw new Error(result.error || 'تعذر تنزيل المستند.');
      toast.success('تم تنزيل نسخة المستند.');
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تنزيل المستند.');
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
              onClick={() => {
                setEditingDocument(null);
                setForm(emptyForm);
                setShowForm((value) => !value);
              }}
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

      {summary.expiring > 0 && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          تنبيه: يوجد {summary.expiring} مستند موظف تنتهي صلاحيته خلال 30 يوماً. راجع تاريخ الانتهاء وجدّد المستندات المطلوبة.
        </div>
      )}

      {showForm && canManage && (
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">{editingDocument ? 'تعديل بيانات المستند' : 'تسجيل مستند ورفع ملفه'}</h2>
            <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100"
              onClick={() => { setShowForm(false); setEditingDocument(null); setForm(emptyForm); }}
              aria-label="إغلاق النموذج"><X className="h-4 w-4" /></button>
          </div>
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
                {Object.entries(confidentialityLabels)
                  .filter(([value]) => value === 'INTERNAL'
                    || (value === 'RESTRICTED' && canViewRestricted)
                    || (value === 'CONFIDENTIAL' && canViewConfidential))
                  .map(([value, label]) => (
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
          {!editingDocument && (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
              <Upload className="h-4 w-4 shrink-0" />
              سيُطلب اختيار ملف PDF أو صورة عند الحفظ. يُشفّر الملف قبل تخزينه على الجهاز (حد أقصى 25 ميجابايت).
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              onClick={() => { setShowForm(false); setEditingDocument(null); setForm(emptyForm); }}>
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingDocument ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingDocument ? 'حفظ التعديلات' : 'اختيار الملف وحفظ المستند'}
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
              <th className="p-3">الملف والنسخ</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-8 text-center text-slate-500">جارٍ التحميل…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="p-8 text-center text-slate-500">لا توجد مستندات مسجلة.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="p-3 font-medium text-slate-700">{row.employeeName}</td>
                <td className="p-3">{typeLabels[row.documentType]}</td>
                <td className="p-3">{row.title}</td>
                <td className="p-3 font-mono text-xs text-slate-600">{row.documentNumber || '—'}</td>
                <td className="p-3 text-slate-600">{row.expiresAt || '—'}</td>
                <td className="p-3 text-slate-600">{confidentialityLabels[row.confidentiality]}</td>
                <td className="p-3">
                  {row.latestVersionId ? (
                    <div className="text-xs">
                      <p className="max-w-40 truncate font-medium text-slate-700" title={row.latestFileName || ''}>
                        {row.latestFileName} — v{row.latestVersionNumber}
                      </p>
                      <p className="mt-1 text-slate-500">{row.versionCount} نسخة · رفعها {row.latestUploaderName || '—'}</p>
                      <p className="mt-1 text-slate-500">
                        آخر تعديل: {row.updatedByName || row.createdByName || '—'} · {new Date(row.updatedAt).toLocaleDateString('ar')}
                      </p>
                    </div>
                  ) : <span className="text-xs text-amber-700">لا يوجد ملف مرفق</span>}
                </td>
                <td className="p-3">
                  <span className={`rounded-full border px-2 py-1 text-xs ${statusStyles[row.effectiveStatus]}`}>
                    {statusLabels[row.effectiveStatus]}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {row.latestVersionId && (
                      <>
                        <button className="flex items-center gap-1 rounded bg-sky-50 px-2 py-1 text-xs text-sky-700"
                          onClick={() => {
                            try {
                              const version = service.getVersions(row.id)[0];
                              if (version) void openVersion(row, version);
                            } catch (error: any) { toast.error(error?.message || 'تعذر فتح المستند.'); }
                          }} title="فتح داخل النظام">
                          <Eye className="h-3.5 w-3.5" /> فتح
                        </button>
                        {canDownload && <button className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700"
                          onClick={() => {
                            try {
                              const version = service.getVersions(row.id)[0];
                              if (version) void downloadVersion(row, version);
                            } catch (error: any) { toast.error(error?.message || 'تعذر تنزيل المستند.'); }
                          }} title="تنزيل">
                          <Download className="h-3.5 w-3.5" /> تنزيل
                        </button>}
                      </>
                    )}
                    <button className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600"
                      onClick={() => showVersions(row)} title="سجل النسخ">
                      <History className="h-3.5 w-3.5" /> النسخ
                    </button>
                    {canManage && row.status !== 'ARCHIVED' && (
                      <>
                        <button className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600"
                          onClick={() => edit(row)} title="تعديل بيانات المستند">
                          <Pencil className="h-3.5 w-3.5" /> تعديل
                        </button>
                        <button className="flex items-center gap-1 rounded bg-sky-50 px-2 py-1 text-xs text-sky-700"
                          onClick={() => void addVersion(row)} title="إضافة نسخة جديدة">
                          <Upload className="h-3.5 w-3.5" /> رفع نسخة
                        </button>
                        <button className="flex items-center gap-1 rounded bg-rose-50 px-2 py-1 text-xs text-rose-700"
                          onClick={() => archive(row)} title="أرشفة">
                          <Archive className="h-3.5 w-3.5" /> أرشفة
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {historyDocument && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4" dir="rtl">
          <section role="dialog" aria-modal="true" aria-labelledby="employee-document-history-title"
            className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b p-4">
              <div>
                <h2 id="employee-document-history-title" className="font-bold text-slate-900">سجل نسخ المستند</h2>
                <p className="mt-1 text-xs text-slate-500">{historyDocument.title}</p>
              </div>
              <button onClick={() => setHistoryDocument(null)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="إغلاق">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="max-h-[68vh] overflow-auto p-4">
              {versions.length ? (
                <>
                <ol className="space-y-3">
                  {versions.map((version) => (
                    <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">v{version.versionNumber} · {version.fileName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {version.createdByName || 'مستخدم غير معروف'} · {new Date(version.createdAt).toLocaleString('ar')}
                          · {(version.fileSize / 1024 / 1024).toFixed(2)} ميجابايت
                        </p>
                        {version.notes && <p className="mt-1 text-xs text-slate-600">{version.notes}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button className="rounded bg-sky-50 px-3 py-2 text-xs text-sky-700"
                          onClick={() => void openVersion(historyDocument, version)}><Eye className="inline h-3.5 w-3.5" /> فتح</button>
                        {canDownload && <button className="rounded bg-slate-100 px-3 py-2 text-xs text-slate-700"
                          onClick={() => void downloadVersion(historyDocument, version)}><Download className="inline h-3.5 w-3.5" /> تنزيل</button>}
                      </div>
                    </li>
                  ))}
                </ol>
                </>
              ) : <p className="py-8 text-center text-sm text-slate-500">لا توجد ملفات مرفقة لهذا المستند.</p>}
              <section className="mt-6 border-t pt-4">
                <h3 className="mb-3 text-sm font-bold text-slate-800">سجل التعديلات والعمليات</h3>
                {auditHistory.length ? (
                  <ol className="space-y-2">
                    {auditHistory.map((entry) => (
                      <li key={entry.id} className="rounded-lg bg-slate-50 p-3 text-xs">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-bold text-slate-800">{entry.action} — {entry.userName}</span>
                          <time className="text-slate-500">{new Date(entry.createdAt).toLocaleString('ar')}</time>
                        </div>
                        {entry.newValues && (
                          <pre className="mt-2 whitespace-pre-wrap break-words text-[10px] text-slate-500">{entry.newValues}</pre>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : <p className="text-xs text-slate-500">لا يوجد سجل تغييرات.</p>}
              </section>
            </div>
          </section>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6" dir="rtl">
          <section role="dialog" aria-modal="true" aria-labelledby="employee-document-preview-title"
            className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b bg-slate-50 p-3">
              <div className="min-w-0">
                <h2 id="employee-document-preview-title" className="truncate text-sm font-bold text-slate-900">{preview.document.title}</h2>
                <p className="truncate text-xs text-slate-500">{preview.version.fileName} · v{preview.version.versionNumber}</p>
              </div>
              <button onClick={() => setPreview(null)} className="rounded-lg p-2 hover:bg-slate-200" aria-label="إغلاق المعاينة">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 overflow-auto bg-slate-200 p-3">
              {preview.version.mimeType === 'application/pdf' ? (
                <iframe title={preview.version.fileName} src={preview.url} className="h-full min-h-[70vh] w-full rounded bg-white" />
              ) : (
                <div className="flex min-h-full items-center justify-center">
                  <img src={preview.url} alt={preview.document.title} className="max-h-full max-w-full object-contain" />
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
