import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, CalendarClock, CheckCircle2, ClipboardList, Download, FileText,
  Loader2, LockKeyhole, Paperclip, Plus, RefreshCw, Search, ShieldCheck,
  Sparkles, X, XCircle,
} from 'lucide-react';
import { DocumentService } from '../../services/DocumentService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';
import { exportToExcel } from '../../utils/export';
import type {
  ContractEffectiveStatus,
  ContractPartyType,
  CreateContractDTO,
  DocumentCompanyOption,
  DocumentConfidentiality,
  DocumentModuleSummary,
  DocumentStatus,
  EnterpriseContract,
  EnterpriseDocument,
  EnterpriseDocumentVersion,
} from '../../types';

type Mode = 'documents' | 'contracts';

const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/30';
const labelCls = 'font-bold text-slate-700 dark:text-slate-300 block mb-1';

const DOC_STATUS_LABEL: Record<DocumentStatus, string> = {
  DRAFT: 'مسودة',
  ACTIVE: 'نشط',
  ARCHIVED: 'مؤرشف',
};
const DOC_STATUS_STYLE: Record<DocumentStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  ARCHIVED: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};
const CONFIDENTIALITY_LABEL: Record<DocumentConfidentiality, string> = {
  INTERNAL: 'داخلي',
  RESTRICTED: 'مقيد',
  CONFIDENTIAL: 'سري',
};
const CONTRACT_STATUS_LABEL: Record<ContractEffectiveStatus, string> = {
  DRAFT: 'مسودة',
  SCHEDULED: 'مجدول',
  ACTIVE: 'ساري',
  EXPIRING: 'قارب الانتهاء',
  EXPIRED: 'منتهي',
  TERMINATED: 'مفسوخ',
};
const CONTRACT_STATUS_STYLE: Record<ContractEffectiveStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  SCHEDULED: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  EXPIRING: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/30',
  EXPIRED: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
  TERMINATED: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};
const PARTY_LABEL: Record<ContractPartyType, string> = {
  CUSTOMER: 'عميل',
  SUPPLIER: 'مورد',
  EMPLOYEE: 'موظف',
  OTHER: 'أخرى',
};

const emptySummary: DocumentModuleSummary = {
  documents: 0,
  activeDocuments: 0,
  archivedDocuments: 0,
  expiringDocuments: 0,
  contracts: 0,
  activeContracts: 0,
  expiringContracts: 0,
};

const todayString = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

async function pickAttachment(): Promise<EnterpriseDocumentVersion | null> {
  const bridge = window.ceramisys?.documents;
  if (!bridge?.importFile) return null;
  const result = await bridge.importFile();
  if (!result?.ok) {
    if (result?.error) throw new Error(result.error);
    return null;
  }
  return {
    id: '',
    documentId: '',
    versionNumber: 0,
    fileName: result.fileName || 'ملف',
    mimeType: result.mimeType || null,
    fileSize: result.fileSize ?? null,
    checksum: result.checksum || null,
    storageName: result.storageName || null,
    notes: null,
    createdBy: null,
    createdAt: '',
  };
}

export const DocumentsPage: React.FC<{ mode?: Mode }> = ({ mode = 'documents' }) => {
  const toast = useToast();
  const can = usePermission();
  const service = useMemo(() => new DocumentService(), []);
  const [tab, setTab] = useState<Mode>(mode);
  const [summary, setSummary] = useState<DocumentModuleSummary>(emptySummary);
  const [companies, setCompanies] = useState<DocumentCompanyOption[]>([]);
  const [documents, setDocuments] = useState<EnterpriseDocument[]>([]);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [contracts, setContracts] = useState<EnterpriseContract[]>([]);
  const [contractTotal, setContractTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [docDraft, setDocDraft] = useState({
    companyId: '',
    title: '',
    category: 'GENERAL',
    confidentiality: 'INTERNAL' as DocumentConfidentiality,
    expiresAt: '',
    description: '',
  });

  const [selected, setSelected] = useState<EnterpriseDocument | null>(null);
  const [events, setEvents] = useState<Array<{ id: string; action: string; actorName: string | null; details: string | null; createdAt: string }>>([]);
  const [versionOpen, setVersionOpen] = useState(false);
  const [versionDraft, setVersionDraft] = useState({
    fileName: '',
    mimeType: '',
    fileSize: null as number | null,
    checksum: '',
    storageName: '',
    notes: '',
  });

  const [contractOpen, setContractOpen] = useState(false);
  const [contractDraft, setContractDraft] = useState({
    companyId: '',
    title: '',
    partyType: 'OTHER' as ContractPartyType,
    partyName: '',
    startDate: todayString(),
    endDate: '',
    value: '0',
    currency: 'EGP',
    renewalNoticeDays: '30',
    autoRenew: false,
    documentId: '',
    notes: '',
  });

  const canViewDocuments = can('documents.view');
  const canViewContracts = can('contracts.view');
  const canExportDocuments = can('documents.export');
  const canExportContracts = can('contracts.export');

  useEffect(() => setTab(mode), [mode]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      const nextSummary = service.getSummary();
      setSummary(nextSummary);
      try {
        setCompanies(service.getCompanyOptions());
      } catch {
        setCompanies([]);
      }
      if (canViewDocuments) {
        const result = service.getDocuments({
          search: search || undefined,
          status: (statusFilter as DocumentStatus | 'ALL') || 'ALL',
          pageSize: 100,
        });
        setDocuments(result.documents);
        setDocumentTotal(result.total);
      } else {
        setDocuments([]);
        setDocumentTotal(0);
      }
      if (canViewContracts) {
        const result = service.getContracts({
          search: search || undefined,
          status: (statusFilter as ContractEffectiveStatus | 'ALL') || 'ALL',
          pageSize: 100,
        });
        setContracts(result.contracts);
        setContractTotal(result.total);
      } else {
        setContracts([]);
        setContractTotal(0);
      }
      setError('');
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل المستندات والعقود.');
    } finally {
      setLoading(false);
    }
  }, [canViewDocuments, canViewContracts, search, service, statusFilter]);

  useEffect(() => {
    if (!canViewDocuments && !canViewContracts) {
      setLoading(false);
      return;
    }
    load();
  }, [load, canViewDocuments, canViewContracts]);

  if (!canViewDocuments && !canViewContracts) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-950" dir="rtl">
        <div className="text-center">
          <LockKeyhole className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">ليس لديك صلاحية الوصول إلى المستندات أو العقود.</p>
        </div>
      </div>
    );
  }

  const openCreate = () => {
    if (tab === 'documents') {
      setDocDraft({
        companyId: companies[0]?.id || '',
        title: '',
        category: 'GENERAL',
        confidentiality: 'INTERNAL',
        expiresAt: '',
        description: '',
      });
      setCreateOpen(true);
    } else {
      setContractDraft({
        companyId: companies[0]?.id || '',
        title: '',
        partyType: 'OTHER',
        partyName: '',
        startDate: todayString(),
        endDate: '',
        value: '0',
        currency: 'EGP',
        renewalNoticeDays: '30',
        autoRenew: false,
        documentId: '',
        notes: '',
      });
      setContractOpen(true);
    }
  };

  const submitDocument = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const created = service.createDocument({
        companyId: docDraft.companyId,
        title: docDraft.title,
        category: docDraft.category,
        confidentiality: docDraft.confidentiality,
        expiresAt: docDraft.expiresAt || null,
        description: docDraft.description || undefined,
      });
      setCreateOpen(false);
      load();
      toast.success('تم إنشاء المستند', created.documentNumber);
    } catch (err: any) {
      toast.error('تعذر إنشاء المستند', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const openDocument = (document: EnterpriseDocument) => {
    try {
      const full = service.getDocument(document.id);
      setSelected(full);
      setEvents(service.getEvents('DOCUMENT', document.id));
    } catch (err: any) {
      toast.error('تعذر فتح المستند', err?.message || String(err));
    }
  };

  const changeStatus = (document: EnterpriseDocument, status: DocumentStatus) => {
    try {
      const updated = service.setDocumentStatus(document.id, status);
      setSelected(updated);
      setEvents(service.getEvents('DOCUMENT', document.id));
      load();
      toast.success('تم تحديث حالة المستند', DOC_STATUS_LABEL[status]);
    } catch (err: any) {
      toast.error('تعذر تحديث حالة المستند', err?.message || String(err));
    }
  };

  const attachFile = async () => {
    try {
      const file = await pickAttachment();
      if (!file) {
        toast.info('لم يتم اختيار ملف', 'المرفقات متاحة داخل تطبيق سطح المكتب.');
        return;
      }
      setVersionDraft({
        fileName: file.fileName,
        mimeType: file.mimeType || '',
        fileSize: file.fileSize ?? null,
        checksum: file.checksum || '',
        storageName: file.storageName || '',
        notes: versionDraft.notes,
      });
    } catch (err: any) {
      toast.error('تعذر إرفاق الملف', err?.message || String(err));
    }
  };

  const submitVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const updated = service.addDocumentVersion(selected.id, {
        fileName: versionDraft.fileName,
        mimeType: versionDraft.mimeType || null,
        fileSize: versionDraft.fileSize,
        checksum: versionDraft.checksum || null,
        storageName: versionDraft.storageName || null,
        notes: versionDraft.notes || null,
      });
      setSelected(updated);
      setEvents(service.getEvents('DOCUMENT', selected.id));
      setVersionOpen(false);
      load();
      toast.success('تمت إضافة نسخة جديدة', `الإصدار ${updated.currentVersion}`);
    } catch (err: any) {
      toast.error('تعذر إضافة النسخة', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const submitContract = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const dto: CreateContractDTO = {
        companyId: contractDraft.companyId,
        title: contractDraft.title,
        partyType: contractDraft.partyType,
        partyName: contractDraft.partyName,
        startDate: contractDraft.startDate,
        endDate: contractDraft.endDate,
        value: Number(contractDraft.value) || 0,
        currency: contractDraft.currency,
        renewalNoticeDays: Number(contractDraft.renewalNoticeDays) || 0,
        autoRenew: contractDraft.autoRenew,
        documentId: contractDraft.documentId || null,
        notes: contractDraft.notes || null,
      };
      const created = service.createContract(dto);
      setContractOpen(false);
      load();
      toast.success('تم إنشاء العقد', created.contractNumber);
    } catch (err: any) {
      toast.error('تعذر إنشاء العقد', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const activateContract = (contract: EnterpriseContract) => {
    try {
      service.activateContract(contract.id);
      load();
      toast.success('تم تفعيل العقد', contract.contractNumber);
    } catch (err: any) {
      toast.error('تعذر تفعيل العقد', err?.message || String(err));
    }
  };

  const renewContract = (contract: EnterpriseContract) => {
    const value = window.prompt('تاريخ النهاية الجديد (YYYY-MM-DD):', contract.endDate);
    if (!value) return;
    try {
      service.renewContract(contract.id, value);
      load();
      toast.success('تم تجديد العقد', contract.contractNumber);
    } catch (err: any) {
      toast.error('تعذر تجديد العقد', err?.message || String(err));
    }
  };

  const terminateContract = (contract: EnterpriseContract) => {
    const reason = window.prompt('سبب فسخ العقد:');
    if (!reason) return;
    try {
      service.terminateContract(contract.id, reason);
      load();
      toast.success('تم فسخ العقد', contract.contractNumber);
    } catch (err: any) {
      toast.error('تعذر فسخ العقد', err?.message || String(err));
    }
  };

  const exportDocuments = () => {
    try {
      exportToExcel({
        title: 'سجل المستندات',
        columns: [
          { key: 'documentNumber', label: 'رقم المستند' },
          { key: 'title', label: 'العنوان' },
          { key: 'category', label: 'التصنيف' },
          { key: 'companyName', label: 'الشركة' },
          { key: 'status', label: 'الحالة' },
          { key: 'confidentiality', label: 'السرية' },
          { key: 'currentVersion', label: 'الإصدار' },
          { key: 'expiresAt', label: 'تاريخ الانتهاء' },
        ],
        rows: documents.map((document) => ({
          ...document,
          status: DOC_STATUS_LABEL[document.status],
          confidentiality: CONFIDENTIALITY_LABEL[document.confidentiality],
        })),
        fileName: 'documents-register',
        permission: 'documents.export',
      });
    } catch (err: any) {
      toast.error('تعذر التصدير', err?.message || String(err));
    }
  };

  const exportContracts = () => {
    try {
      exportToExcel({
        title: 'سجل العقود',
        columns: [
          { key: 'contractNumber', label: 'رقم العقد' },
          { key: 'title', label: 'العنوان' },
          { key: 'partyName', label: 'الطرف' },
          { key: 'startDate', label: 'البداية' },
          { key: 'endDate', label: 'النهاية' },
          { key: 'value', label: 'القيمة' },
          { key: 'currency', label: 'العملة' },
          { key: 'effectiveStatus', label: 'الحالة' },
        ],
        rows: contracts.map((contract) => ({
          ...contract,
          effectiveStatus: CONTRACT_STATUS_LABEL[contract.effectiveStatus],
        })),
        fileName: 'contracts-register',
        permission: 'contracts.export',
      });
    } catch (err: any) {
      toast.error('تعذر التصدير', err?.message || String(err));
    }
  };

  const statusOptions = tab === 'documents'
    ? Object.entries(DOC_STATUS_LABEL)
    : Object.entries(CONTRACT_STATUS_LABEL);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden" dir="rtl">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center">
            <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
          </div>
          <div>
            <h1 className="text-base font-black">مركز المستندات والعقود</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">نسخ موثقة، صلاحيات وصول، ومتابعة تجديد العقود</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50" title="تحديث">
            <RefreshCw className="w-4 h-4" />
          </button>
          {(tab === 'documents' ? can('documents.create') : can('contracts.create')) && (
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition">
              <Plus className="w-4 h-4" /> {tab === 'documents' ? 'مستند جديد' : 'عقد جديد'}
            </button>
          )}
          {(tab === 'documents' ? canExportDocuments : canExportContracts) && (
            <button onClick={tab === 'documents' ? exportDocuments : exportContracts} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold">
              <Download className="w-4 h-4" /> تصدير
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <SummaryCard label="المستندات" value={summary.documents} hint={`${summary.activeDocuments} نشط`} icon={FileText} />
        <SummaryCard label="مستندات قاربت الانتهاء" value={summary.expiringDocuments} hint="خلال 30 يومًا" icon={CalendarClock} tone="amber" />
        <SummaryCard label="العقود السارية" value={summary.activeContracts} hint={`من ${summary.contracts} عقد`} icon={CheckCircle2} tone="emerald" />
        <SummaryCard label="عقود قاربت الانتهاء" value={summary.expiringContracts} hint="تحتاج قرار تجديد" icon={ShieldCheck} tone="rose" />
      </div>

      <div className="flex items-center gap-2 px-4 pt-3">
        <button
          onClick={() => { setTab('documents'); setStatusFilter('ALL'); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold border ${tab === 'documents' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}
        >
          المستندات ({documentTotal})
        </button>
        <button
          onClick={() => { setTab('contracts'); setStatusFilter('ALL'); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold border ${tab === 'contracts' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}
        >
          العقود ({contractTotal})
        </button>
      </div>

      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 mt-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'documents' ? 'بحث بالعنوان أو الرقم...' : 'بحث بالعقد أو الطرف...'}
            className="w-full pl-4 pr-10 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:border-indigo-400"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputCls} sm:w-48 py-2.5`}>
          <option value="ALL">كل الحالات</option>
          {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
        ) : tab === 'documents' ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                <tr>
                  <th className="text-right p-3 font-bold">الرقم</th>
                  <th className="text-right p-3 font-bold">العنوان</th>
                  <th className="text-right p-3 font-bold">التصنيف</th>
                  <th className="text-right p-3 font-bold">الشركة</th>
                  <th className="text-right p-3 font-bold">السرية</th>
                  <th className="text-right p-3 font-bold">الإصدار</th>
                  <th className="text-right p-3 font-bold">الانتهاء</th>
                  <th className="text-right p-3 font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id} onClick={() => openDocument(document)} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer">
                    <td className="p-3 font-mono text-[11px]">{document.documentNumber}</td>
                    <td className="p-3 font-bold">{document.title}</td>
                    <td className="p-3 text-slate-500">{document.category}</td>
                    <td className="p-3 text-slate-500">{document.companyName}</td>
                    <td className="p-3"><span className="inline-flex items-center gap-1"><LockKeyhole className="w-3 h-3" />{CONFIDENTIALITY_LABEL[document.confidentiality]}</span></td>
                    <td className="p-3 font-mono">v{document.currentVersion}</td>
                    <td className="p-3 text-slate-500">{document.expiresAt || '—'}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${DOC_STATUS_STYLE[document.status]}`}>{DOC_STATUS_LABEL[document.status]}</span></td>
                  </tr>
                ))}
                {documents.length === 0 && <tr><td colSpan={8} className="p-12 text-center text-slate-500">لا توجد مستندات مطابقة.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                <tr>
                  <th className="text-right p-3 font-bold">رقم العقد</th>
                  <th className="text-right p-3 font-bold">العنوان</th>
                  <th className="text-right p-3 font-bold">الطرف</th>
                  <th className="text-right p-3 font-bold">الفترة</th>
                  <th className="text-right p-3 font-bold">القيمة</th>
                  <th className="text-right p-3 font-bold">الحالة</th>
                  <th className="text-right p-3 font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr key={contract.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-[11px]">{contract.contractNumber}</td>
                    <td className="p-3 font-bold">
                      {contract.title}
                      {contract.documentTitle && <div className="text-[10px] text-slate-400 font-normal flex items-center gap-1 mt-0.5"><Paperclip className="w-3 h-3" />{contract.documentTitle}</div>}
                    </td>
                    <td className="p-3">{contract.partyName}<div className="text-[10px] text-slate-400">{PARTY_LABEL[contract.partyType]}</div></td>
                    <td className="p-3 text-slate-500">{contract.startDate} → {contract.endDate}</td>
                    <td className="p-3 font-mono">{contract.value.toLocaleString()} {contract.currency}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${CONTRACT_STATUS_STYLE[contract.effectiveStatus]}`}>
                        {CONTRACT_STATUS_LABEL[contract.effectiveStatus]}
                      </span>
                      {contract.effectiveStatus === 'EXPIRING' && contract.daysToExpiry !== null && (
                        <div className="text-[10px] text-orange-500 mt-1">{contract.daysToExpiry} يوم</div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {contract.status === 'DRAFT' && can('contracts.update') && (
                          <button onClick={() => activateContract(contract)} className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">تفعيل</button>
                        )}
                        {contract.status !== 'TERMINATED' && can('contracts.update') && (
                          <button onClick={() => renewContract(contract)} className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold">تجديد</button>
                        )}
                        {contract.status === 'ACTIVE' && can('contracts.terminate') && (
                          <button onClick={() => terminateContract(contract)} className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">فسخ</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {contracts.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-slate-500">لا توجد عقود مطابقة.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create document */}
      {createOpen && (
        <Modal title="مستند جديد" onClose={() => setCreateOpen(false)}>
          <form onSubmit={submitDocument} className="space-y-3 text-xs">
            <div>
              <label className={labelCls}>الشركة *</label>
              <select required value={docDraft.companyId} onChange={(e) => setDocDraft({ ...docDraft, companyId: e.target.value })} className={inputCls}>
                <option value="">اختر الشركة</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>عنوان المستند *</label><input required value={docDraft.title} onChange={(e) => setDocDraft({ ...docDraft, title: e.target.value })} className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>التصنيف</label><input value={docDraft.category} onChange={(e) => setDocDraft({ ...docDraft, category: e.target.value })} className={inputCls} placeholder="GENERAL" /></div>
              <div>
                <label className={labelCls}>درجة السرية</label>
                <select value={docDraft.confidentiality} onChange={(e) => setDocDraft({ ...docDraft, confidentiality: e.target.value as DocumentConfidentiality })} className={inputCls}>
                  {Object.entries(CONFIDENTIALITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            <div><label className={labelCls}>تاريخ الانتهاء</label><input type="date" value={docDraft.expiresAt} onChange={(e) => setDocDraft({ ...docDraft, expiresAt: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>الوصف</label><textarea rows={3} value={docDraft.description} onChange={(e) => setDocDraft({ ...docDraft, description: e.target.value })} className={inputCls} /></div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 font-bold rounded-xl">إلغاء</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إنشاء</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Document details */}
      {selected && (
        <Modal title={`${selected.documentNumber} — ${selected.title}`} onClose={() => setSelected(null)} wide>
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-0.5 rounded-full border font-bold ${DOC_STATUS_STYLE[selected.status]}`}>{DOC_STATUS_LABEL[selected.status]}</span>
              <span className="px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">{CONFIDENTIALITY_LABEL[selected.confidentiality]}</span>
              <span className="px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">{selected.companyName}</span>
              {selected.expiresAt && <span className="px-2 py-0.5 rounded-full border border-amber-200 text-amber-700">ينتهي {selected.expiresAt}</span>}
            </div>
            {selected.description && <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{selected.description}</p>}
            <div className="flex flex-wrap gap-2">
              {selected.status === 'DRAFT' && can('documents.update') && (
                <button onClick={() => changeStatus(selected, 'ACTIVE')} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> تفعيل المستند</button>
              )}
              {selected.status !== 'ARCHIVED' && can('documents.archive') && (
                <button onClick={() => changeStatus(selected, 'ARCHIVED')} className="px-3 py-1.5 rounded-xl bg-slate-700 text-white font-bold flex items-center gap-1"><Archive className="w-3.5 h-3.5" /> أرشفة</button>
              )}
              {selected.status === 'ARCHIVED' && can('documents.archive') && (
                <button onClick={() => changeStatus(selected, 'ACTIVE')} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> استعادة</button>
              )}
              {selected.status !== 'ARCHIVED' && can('documents.update') && (
                <button onClick={() => { setVersionDraft({ fileName: '', mimeType: '', fileSize: null, checksum: '', storageName: '', notes: '' }); setVersionOpen(true); }} className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> إضافة إصدار</button>
              )}
            </div>

            <div>
              <h4 className="font-black mb-2">الإصدارات ({selected.versions?.length || 0})</h4>
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                {(selected.versions || []).map((version) => (
                  <div key={version.id} className="p-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold">v{version.versionNumber} — {version.fileName}</div>
                      <div className="text-[10px] text-slate-400">
                        {version.fileSize !== null ? `${Math.max(1, Math.round(version.fileSize / 1024))} KB` : 'بدون ملف مرفق'}
                        {version.checksum ? ` • ${version.checksum.slice(0, 12)}…` : ''}
                        {version.createdByName ? ` • ${version.createdByName}` : ''}
                      </div>
                      {version.notes && <div className="text-[11px] text-slate-500 mt-1">{version.notes}</div>}
                    </div>
                    {version.storageName && window.ceramisys?.documents?.openFile && (
                      <button
                        onClick={() => window.ceramisys?.documents?.openFile?.(version.storageName!)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-[10px] flex items-center gap-1 shrink-0"
                      >
                        <Paperclip className="w-3 h-3" /> فتح
                      </button>
                    )}
                  </div>
                ))}
                {(selected.versions || []).length === 0 && <div className="p-6 text-center text-slate-400">لا توجد إصدارات بعد.</div>}
              </div>
            </div>

            <div>
              <h4 className="font-black mb-2">سجل الأحداث</h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {events.map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-2 text-[11px] border-b border-slate-100 dark:border-slate-800 py-1.5">
                    <span className="font-bold">{event.action}</span>
                    <span className="text-slate-400">{event.actorName || 'النظام'} • {new Date(event.createdAt).toLocaleString()}</span>
                  </div>
                ))}
                {events.length === 0 && <div className="text-slate-400">لا توجد أحداث مسجلة.</div>}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Add version */}
      {versionOpen && selected && (
        <Modal title={`إصدار جديد — ${selected.documentNumber}`} onClose={() => setVersionOpen(false)}>
          <form onSubmit={submitVersion} className="space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div>
                <div className="font-bold">ملف المستند</div>
                <div className="text-[10px] text-slate-400">{versionDraft.fileName || 'لم يتم اختيار ملف بعد'}</div>
              </div>
              <button type="button" onClick={attachFile} className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold flex items-center gap-1">
                <Paperclip className="w-3.5 h-3.5" /> اختيار ملف
              </button>
            </div>
            {!window.ceramisys?.documents?.importFile && (
              <p className="text-[10px] text-amber-600">إرفاق الملفات متاح داخل تطبيق سطح المكتب. يمكنك تسجيل نسخة ببياناتها فقط.</p>
            )}
            <div><label className={labelCls}>اسم الملف / وصف النسخة *</label><input required value={versionDraft.fileName} onChange={(e) => setVersionDraft({ ...versionDraft, fileName: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>ملاحظات</label><textarea rows={2} value={versionDraft.notes} onChange={(e) => setVersionDraft({ ...versionDraft, notes: e.target.value })} className={inputCls} /></div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => setVersionOpen(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 font-bold rounded-xl">إلغاء</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إضافة</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create contract */}
      {contractOpen && (
        <Modal title="عقد جديد" onClose={() => setContractOpen(false)} wide>
          <form onSubmit={submitContract} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>الشركة *</label>
                <select required value={contractDraft.companyId} onChange={(e) => setContractDraft({ ...contractDraft, companyId: e.target.value })} className={inputCls}>
                  <option value="">اختر الشركة</option>
                  {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>عنوان العقد *</label><input required value={contractDraft.title} onChange={(e) => setContractDraft({ ...contractDraft, title: e.target.value })} className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>نوع الطرف</label>
                <select value={contractDraft.partyType} onChange={(e) => setContractDraft({ ...contractDraft, partyType: e.target.value as ContractPartyType })} className={inputCls}>
                  {Object.entries(PARTY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>اسم الطرف *</label><input required value={contractDraft.partyName} onChange={(e) => setContractDraft({ ...contractDraft, partyName: e.target.value })} className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><label className={labelCls}>البداية *</label><input required type="date" value={contractDraft.startDate} onChange={(e) => setContractDraft({ ...contractDraft, startDate: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls}>النهاية *</label><input required type="date" value={contractDraft.endDate} onChange={(e) => setContractDraft({ ...contractDraft, endDate: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls}>القيمة</label><input type="number" min="0" step="0.01" value={contractDraft.value} onChange={(e) => setContractDraft({ ...contractDraft, value: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls}>العملة</label><input maxLength={3} value={contractDraft.currency} onChange={(e) => setContractDraft({ ...contractDraft, currency: e.target.value.toUpperCase() })} className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div><label className={labelCls}>تنبيه قبل الانتهاء (أيام)</label><input type="number" min="0" max="3650" value={contractDraft.renewalNoticeDays} onChange={(e) => setContractDraft({ ...contractDraft, renewalNoticeDays: e.target.value })} className={inputCls} /></div>
              <div>
                <label className={labelCls}>مستند مرتبط</label>
                <select value={contractDraft.documentId} onChange={(e) => setContractDraft({ ...contractDraft, documentId: e.target.value })} className={inputCls}>
                  <option value="">بدون</option>
                  {documents.filter((document) => document.companyId === contractDraft.companyId).map((document) => (
                    <option key={document.id} value={document.id}>{document.documentNumber} — {document.title}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 pt-5 font-bold text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={contractDraft.autoRenew} onChange={(e) => setContractDraft({ ...contractDraft, autoRenew: e.target.checked })} />
                تجديد تلقائي
              </label>
            </div>
            <div><label className={labelCls}>ملاحظات</label><textarea rows={2} value={contractDraft.notes} onChange={(e) => setContractDraft({ ...contractDraft, notes: e.target.value })} className={inputCls} /></div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => setContractOpen(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 font-bold rounded-xl">إلغاء</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إنشاء</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{
  label: string;
  value: number;
  hint: string;
  icon: React.ElementType;
  tone?: 'amber' | 'emerald' | 'rose' | 'indigo';
}> = ({ label, value, hint, icon: Icon, tone = 'indigo' }) => {
  const tones: Record<string, string> = {
    indigo: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 dark:text-indigo-300',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300',
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300',
    rose: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-300',
  };
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tones[tone]}`}><Icon className="w-4 h-4" /></div>
      <div>
        <div className="text-[10px] font-bold text-slate-500">{label}</div>
        <div className="text-lg font-black leading-tight">{value}</div>
        <div className="text-[10px] text-slate-400">{hint}</div>
      </div>
    </div>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} p-6 max-h-[90vh] overflow-y-auto`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-extrabold">{title}</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
      </div>
      {children}
    </div>
  </div>
);
