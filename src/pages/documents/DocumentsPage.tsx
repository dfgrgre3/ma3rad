import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock, CheckCircle2, Download, FileText,
  Loader2, LockKeyhole, Plus, RefreshCw, Search, ShieldCheck,
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
import { CONFIDENTIALITY_LABEL, CONTRACT_STATUS_LABEL, DOC_STATUS_LABEL, SummaryCard, inputCls } from './documentsShared';
import type { ContractDraft, DocumentDraft, VersionDraft } from './documentsShared';
import { ContractsTable, DocumentsTable } from './DocumentsTables';
import { DocumentsDialogs } from './DocumentsDialogs';

type Mode = 'documents' | 'contracts';


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
  const navigate = useNavigate();
  const canViewDocuments = can('documents.view');
  const canViewContracts = can('contracts.view');
  const canExportDocuments = can('documents.export');
  const canExportContracts = can('contracts.export');
  const service = useMemo(() => new DocumentService(), []);
  const initialTab: Mode = mode === 'contracts' && canViewContracts
    ? 'contracts'
    : canViewDocuments
      ? 'documents'
      : 'contracts';
  const [tab, setTab] = useState<Mode>(initialTab);
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
  const [docDraft, setDocDraft] = useState<DocumentDraft>({
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
  const [versionDraft, setVersionDraft] = useState<VersionDraft>({
    fileName: '',
    mimeType: '',
    fileSize: null as number | null,
    checksum: '',
    storageName: '',
    notes: '',
  });

  const [contractOpen, setContractOpen] = useState(false);
  const [contractDraft, setContractDraft] = useState<ContractDraft>({
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

  useEffect(() => setTab(initialTab), [initialTab]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      const nextSummary = service.getSummary();
      setSummary({
        documents: canViewDocuments ? nextSummary.documents : 0,
        activeDocuments: canViewDocuments ? nextSummary.activeDocuments : 0,
        archivedDocuments: canViewDocuments ? nextSummary.archivedDocuments : 0,
        expiringDocuments: canViewDocuments ? nextSummary.expiringDocuments : 0,
        contracts: canViewContracts ? nextSummary.contracts : 0,
        activeContracts: canViewContracts ? nextSummary.activeContracts : 0,
        expiringContracts: canViewContracts ? nextSummary.expiringContracts : 0,
      });
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

      <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 md:grid-cols-4">
        {canViewDocuments && <SummaryCard label="المستندات" value={summary.documents} hint={`${summary.activeDocuments} نشط`} icon={FileText} />}
        {canViewDocuments && <SummaryCard label="مستندات قاربت الانتهاء" value={summary.expiringDocuments} hint="خلال 30 يومًا" icon={CalendarClock} tone="amber" />}
        {canViewContracts && <SummaryCard label="العقود السارية" value={summary.activeContracts} hint={`من ${summary.contracts} عقد`} icon={CheckCircle2} tone="emerald" />}
        {canViewContracts && <SummaryCard label="عقود قاربت الانتهاء" value={summary.expiringContracts} hint="تحتاج قرار تجديد" icon={ShieldCheck} tone="rose" />}
      </div>

      <div className="flex items-center gap-2 px-4 pt-3">
        {canViewDocuments && <button
          onClick={() => { navigate('/documents'); setStatusFilter('ALL'); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold border ${tab === 'documents' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}
        >
          المستندات ({documentTotal})
        </button>}
        {canViewContracts && <button
          onClick={() => { navigate('/contracts'); setStatusFilter('ALL'); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold border ${tab === 'contracts' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}
        >
          العقود ({contractTotal})
        </button>}
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
          <DocumentsTable documents={documents} onOpen={openDocument} />
        ) : (
          <ContractsTable
            contracts={contracts}
            can={can}
            onActivate={activateContract}
            onRenew={renewContract}
            onTerminate={terminateContract}
          />
        )}
      </div>

      <DocumentsDialogs
        can={can}
        saving={saving}
        companies={companies}
        documents={documents}
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        docDraft={docDraft}
        setDocDraft={setDocDraft}
        submitDocument={submitDocument}
        selected={selected}
        setSelected={setSelected}
        events={events}
        onChangeStatus={changeStatus}
        versionOpen={versionOpen}
        setVersionOpen={setVersionOpen}
        versionDraft={versionDraft}
        setVersionDraft={setVersionDraft}
        attachFile={attachFile}
        submitVersion={submitVersion}
        contractOpen={contractOpen}
        setContractOpen={setContractOpen}
        contractDraft={contractDraft}
        setContractDraft={setContractDraft}
        submitContract={submitContract}
      />
    </div>
  );
};
