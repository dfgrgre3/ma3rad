import React from 'react';
import { LockKeyhole, Paperclip } from 'lucide-react';
import type { EnterpriseContract, EnterpriseDocument } from '../../types';
import {
  CONFIDENTIALITY_LABEL,
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_STYLE,
  DOC_STATUS_LABEL,
  DOC_STATUS_STYLE,
  PARTY_LABEL,
} from './documentsShared';

interface DocumentsTableProps {
  documents: EnterpriseDocument[];
  onOpen: (document: EnterpriseDocument) => void;
}

export const DocumentsTable: React.FC<DocumentsTableProps> = ({ documents, onOpen }) => (
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
        <tr key={document.id} onClick={() => onOpen(document)} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer">
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
);

interface ContractsTableProps {
  contracts: EnterpriseContract[];
  can: (permission: string) => boolean;
  onActivate: (contract: EnterpriseContract) => void;
  onRenew: (contract: EnterpriseContract) => void;
  onTerminate: (contract: EnterpriseContract) => void;
}

export const ContractsTable: React.FC<ContractsTableProps> = ({ contracts, can, onActivate, onRenew, onTerminate }) => (
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
                <button onClick={() => onActivate(contract)} className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">تفعيل</button>
              )}
              {contract.status !== 'TERMINATED' && can('contracts.update') && (
                <button onClick={() => onRenew(contract)} className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold">تجديد</button>
              )}
              {contract.status === 'ACTIVE' && can('contracts.terminate') && (
                <button onClick={() => onTerminate(contract)} className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">فسخ</button>
              )}
            </div>
          </td>
        </tr>
      ))}
      {contracts.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-slate-500">لا توجد عقود مطابقة.</td></tr>}
    </tbody>
  </table>
</div>
);
