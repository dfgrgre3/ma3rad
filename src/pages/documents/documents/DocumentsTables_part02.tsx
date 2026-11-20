import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Paperclip } from 'lucide-react';
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_STYLE, PARTY_LABEL } from './documentsShared';
import type { ContractsTableProps } from './DocumentsTables_part01';

export const ContractsTable: React.FC<ContractsTableProps> = ({ contracts, can, onActivate, onRenew, onTerminate }) => (
<div className="bg-surface border border-line rounded-2xl overflow-hidden">
  <DataTable
    ariaLabel="العقود"
    rows={contracts}
    rowKey={(contract) => contract.id}
    dense
    tableClassName="text-xs"
    columns={[
      { key: 'num', header: 'رقم العقد', render: (contract) => <span className="font-mono text-[11px]">{contract.contractNumber}</span> },
      {
        key: 'title', header: 'العنوان',
        render: (contract) => (
          <span>
            <span className="font-bold">{contract.title}</span>
            {contract.documentTitle && <span className="mt-0.5 flex items-center gap-1 text-[10px] font-normal text-muted"><Paperclip className="w-3 h-3" />{contract.documentTitle}</span>}
          </span>
        ),
      },
      {
        key: 'party', header: 'الطرف',
        render: (contract) => <span>{contract.partyName}<span className="block text-[10px] text-muted">{PARTY_LABEL[contract.partyType]}</span></span>,
      },
      { key: 'period', header: 'الفترة', render: (contract) => <span className="text-muted">{contract.startDate} → {contract.endDate}</span> },
      { key: 'value', header: 'القيمة', render: (contract) => <span className="font-mono">{contract.value.toLocaleString()} {contract.currency}</span> },
      {
        key: 'status', header: 'الحالة',
        render: (contract) => (
          <span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${CONTRACT_STATUS_STYLE[contract.effectiveStatus]}`}>
              {CONTRACT_STATUS_LABEL[contract.effectiveStatus]}
            </span>
            {contract.effectiveStatus === 'EXPIRING' && contract.daysToExpiry !== null && (
              <span className="mt-1 block text-[10px] text-warning">{contract.daysToExpiry} يوم</span>
            )}
          </span>
        ),
      },
      {
        key: 'actions', header: 'إجراءات',
        render: (contract) => (
          <div className="flex flex-wrap gap-1">
            {contract.status === 'DRAFT' && can('contracts.update') && (
              <button onClick={() => onActivate(contract)} className="rounded-lg border border-success-border bg-success-soft px-2 py-1 text-[10px] font-bold text-success">تفعيل</button>
            )}
            {contract.status !== 'TERMINATED' && can('contracts.update') && (
              <button onClick={() => onRenew(contract)} className="rounded-lg border border-accent-border bg-accent-soft px-2 py-1 text-[10px] font-bold text-primary">تجديد</button>
            )}
            {contract.status === 'ACTIVE' && can('contracts.terminate') && (
              <button onClick={() => onTerminate(contract)} className="rounded-lg border border-danger-border bg-danger-soft px-2 py-1 text-[10px] font-bold text-danger">فسخ</button>
            )}
          </div>
        ),
      },
    ]}
    emptyTitle="لا توجد عقود مطابقة."
  />
</div>
);
