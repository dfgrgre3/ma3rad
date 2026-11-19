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
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-purple-400" />
        <h2 className="text-sm font-black text-slate-100">حسابات مالك المنصة</h2>
        <span className="text-[11px] text-slate-400">
          مراجعة الحسابات التي تحمل دور مالك المنصة (SUPER_ADMIN) ومصدر اعتمادها.
        </span>
      </div>

      <DataTable
        ariaLabel="حسابات مالك المنصة"
        rows={ownerAccounts}
        rowKey={(account) => `${account.source}:${account.id}`}
        columns={[
          { key: 'account', header: 'الحساب', render: (account) => <span className="font-semibold text-slate-200" dir="ltr">{account.label}</span> },
          { key: 'source', header: 'المصدر', render: (account) => <span className="text-slate-400">{account.source === 'platform_staff' ? 'موظفو المنصة' : 'مستخدمو ERP'}</span> },
          { key: 'status', header: 'الحالة', render: (account) => <StatusBadge value={account.isActive ? 'success' : 'neutral'} label={account.isActive ? 'مفعّل' : 'غير مفعّل'} /> },
          { key: 'approval', header: 'الاعتماد', render: (account) => <StatusBadge value={account.approved ? 'success' : 'danger'} label={account.approved ? 'معتمد' : 'غير معتمد'} /> },
          { key: 'notes', header: 'ملاحظات', render: (account) => <span className="text-[11px] text-amber-300">{account.concerns.length > 0 ? account.concerns.join(' • ') : '—'}</span> },
        ]}
      />
    </section>
  );
};
