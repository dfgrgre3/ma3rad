import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { LockKeyhole } from 'lucide-react';
import type { EnterpriseContract, EnterpriseDocument } from '../../../types';
import { CONFIDENTIALITY_LABEL, DOC_STATUS_LABEL, DOC_STATUS_STYLE } from './documentsShared';

export interface DocumentsTableProps {
  documents: EnterpriseDocument[];
  onOpen: (document: EnterpriseDocument) => void;
}

export const DocumentsTable: React.FC<DocumentsTableProps> = ({ documents, onOpen }) => (
<div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
  <DataTable
    ariaLabel="المستندات"
    rows={documents}
    rowKey={(document) => document.id}
    onRowClick={onOpen}
    dense
    tableClassName="text-xs"
    columns={[
      { key: 'num', header: 'الرقم', render: (document) => <span className="font-mono text-[11px]">{document.documentNumber}</span> },
      { key: 'title', header: 'العنوان', render: (document) => <span className="font-bold">{document.title}</span> },
      { key: 'category', header: 'التصنيف', render: (document) => <span className="text-slate-500">{document.category}</span> },
      { key: 'company', header: 'الشركة', render: (document) => <span className="text-slate-500">{document.companyName}</span> },
      {
        key: 'conf', header: 'السرية',
        render: (document) => <span className="inline-flex items-center gap-1"><LockKeyhole className="w-3 h-3" />{CONFIDENTIALITY_LABEL[document.confidentiality]}</span>,
      },
      { key: 'ver', header: 'الإصدار', render: (document) => <span className="font-mono">v{document.currentVersion}</span> },
      { key: 'expiry', header: 'الانتهاء', render: (document) => <span className="text-slate-500">{document.expiresAt || '—'}</span> },
      {
        key: 'status', header: 'الحالة',
        render: (document) => <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${DOC_STATUS_STYLE[document.status]}`}>{DOC_STATUS_LABEL[document.status]}</span>,
      },
    ]}
    emptyTitle="لا توجد مستندات مطابقة."
  />
</div>
);

export interface ContractsTableProps {
  contracts: EnterpriseContract[];
  can: (permission: string) => boolean;
  onActivate: (contract: EnterpriseContract) => void;
  onRenew: (contract: EnterpriseContract) => void;
  onTerminate: (contract: EnterpriseContract) => void;
}
