import React from 'react';
import { LockKeyhole } from 'lucide-react';
import type { EnterpriseContract, EnterpriseDocument } from '../../../types';
import { CONFIDENTIALITY_LABEL, DOC_STATUS_LABEL, DOC_STATUS_STYLE } from './documentsShared';

export interface DocumentsTableProps {
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

export interface ContractsTableProps {
  contracts: EnterpriseContract[];
  can: (permission: string) => boolean;
  onActivate: (contract: EnterpriseContract) => void;
  onRenew: (contract: EnterpriseContract) => void;
  onTerminate: (contract: EnterpriseContract) => void;
}
