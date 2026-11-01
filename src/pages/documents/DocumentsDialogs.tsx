import React from 'react';
import { Archive, CheckCircle2, Loader2, Paperclip, RefreshCw, Sparkles } from 'lucide-react';
import type {
  ContractPartyType,
  DocumentConfidentiality,
  DocumentStatus,
  DocumentCompanyOption,
  EnterpriseDocument,
} from '../../types';
import {
  CONFIDENTIALITY_LABEL,
  DOC_STATUS_LABEL,
  DOC_STATUS_STYLE,
  Modal,
  PARTY_LABEL,
  inputCls,
  labelCls,
} from './documentsShared';
import type { ContractDraft, DocumentDraft, VersionDraft } from './documentsShared';

interface DocumentEvent {
  id: string;
  action: string;
  actorName: string | null;
  details: string | null;
  createdAt: string;
}

interface DocumentsDialogsProps {
  can: (permission: string) => boolean;
  saving: boolean;
  companies: DocumentCompanyOption[];
  documents: EnterpriseDocument[];
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  docDraft: DocumentDraft;
  setDocDraft: React.Dispatch<React.SetStateAction<DocumentDraft>>;
  submitDocument: (e: React.FormEvent) => void;
  selected: EnterpriseDocument | null;
  setSelected: (document: EnterpriseDocument | null) => void;
  events: DocumentEvent[];
  onChangeStatus: (document: EnterpriseDocument, status: DocumentStatus) => void;
  versionOpen: boolean;
  setVersionOpen: (open: boolean) => void;
  versionDraft: VersionDraft;
  setVersionDraft: React.Dispatch<React.SetStateAction<VersionDraft>>;
  attachFile: () => void;
  submitVersion: (e: React.FormEvent) => void;
  contractOpen: boolean;
  setContractOpen: (open: boolean) => void;
  contractDraft: ContractDraft;
  setContractDraft: React.Dispatch<React.SetStateAction<ContractDraft>>;
  submitContract: (e: React.FormEvent) => void;
}

export const DocumentsDialogs: React.FC<DocumentsDialogsProps> = ({
  can,
  saving,
  companies,
  documents,
  createOpen,
  setCreateOpen,
  docDraft,
  setDocDraft,
  submitDocument,
  selected,
  setSelected,
  events,
  onChangeStatus,
  versionOpen,
  setVersionOpen,
  versionDraft,
  setVersionDraft,
  attachFile,
  submitVersion,
  contractOpen,
  setContractOpen,
  contractDraft,
  setContractDraft,
  submitContract,
}) => (
  <>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
          <button onClick={() => onChangeStatus(selected, 'ACTIVE')} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> تفعيل المستند</button>
        )}
        {selected.status !== 'ARCHIVED' && can('documents.archive') && (
          <button onClick={() => onChangeStatus(selected, 'ARCHIVED')} className="px-3 py-1.5 rounded-xl bg-slate-700 text-white font-bold flex items-center gap-1"><Archive className="w-3.5 h-3.5" /> أرشفة</button>
        )}
        {selected.status === 'ARCHIVED' && can('documents.archive') && (
          <button onClick={() => onChangeStatus(selected, 'ACTIVE')} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> استعادة</button>
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
      <div className="grid grid-cols-1  sm:grid-cols-4 gap-2">
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
  </>
);
