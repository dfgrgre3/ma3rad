import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { DataTable } from '../../../components/ui/DataTable';
import type { PlatformOwnerAuditEntry } from '../../../services/domains/platform/PlatformBootstrapService';
import { StatusBadge } from '../components/PlatformUI';

interface OwnerAccountsSectionProps {
  ownerAccounts: PlatformOwnerAuditEntry[];
}

export const OwnerAccountsSection: React.FC<OwnerAccountsSectionProps> = ({ ownerAccounts }) => {
  if (ownerAccounts.length === 0) return null;

  return (
    <section className="rounded-2xl border border-line-strong bg-primary/70 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-black text-muted">حسابات مالك المنصة</h2>
        <span className="text-[11px] text-muted">
          مراجعة الحسابات التي تحمل دور مالك المنصة (SUPER_ADMIN) ومصدر اعتمادها.
        </span>
      </div>

      <DataTable
        ariaLabel="حسابات مالك المنصة"
        rows={ownerAccounts}
        rowKey={(account) => `${account.source}:${account.id}`}
        columns={[
          { key: 'account', header: 'الحساب', render: (account) => <span className="font-semibold text-muted" dir="ltr">{account.label}</span> },
          { key: 'source', header: 'المصدر', render: (account) => <span className="text-muted">{account.source === 'platform_staff' ? 'موظفو المنصة' : 'مستخدمو ERP'}</span> },
          { key: 'status', header: 'الحالة', render: (account) => <StatusBadge value={account.isActive ? 'success' : 'neutral'} label={account.isActive ? 'مفعّل' : 'غير مفعّل'} /> },
          { key: 'approval', header: 'الاعتماد', render: (account) => <StatusBadge value={account.approved ? 'success' : 'danger'} label={account.approved ? 'معتمد' : 'غير معتمد'} /> },
          { key: 'notes', header: 'ملاحظات', render: (account) => <span className="text-[11px] text-warning">{account.concerns.length > 0 ? account.concerns.join(' • ') : '—'}</span> },
        ]}
      />
    </section>
  );
};
