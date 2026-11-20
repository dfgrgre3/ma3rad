import React, { useState } from 'react';
import { Activity, Link2, ShieldCheck, RefreshCw } from 'lucide-react';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { SyncStatusPanel } from '../../../components/sync/SyncStatusPanel';
import { PageHeader } from '../../../components/ui/PageHeader';
import { AccountLinksPanel } from '../../../components/sync/AccountLinksPanel';
import { SyncChangeApprovalsPanel } from '../../../components/sync/SyncChangeApprovalsPanel';

type TabKey = 'status' | 'links' | 'approvals';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'status', label: 'حالة المزامنة', icon: <Activity className="h-4 w-4" /> },
  { key: 'links', label: 'الحسابات المرتبطة', icon: <Link2 className="h-4 w-4" /> },
  { key: 'approvals', label: 'اعتماد التعديلات', icon: <ShieldCheck className="h-4 w-4" /> },
];

/**
 * مركز مزامنة الفروع والحسابات: حالة الاتصال، ربط الحسابات بكود/API،
 * واعتماد التعديلات الواردة من الفروع الفرعية والحسابات المرتبطة.
 */
export const SyncStatusPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('status');
  const [refreshToken, setRefreshToken] = useState(0);
  const user = AuthService.getCurrentUser();
  const canManage = PermissionService.can(user, 'ui.admin.sync_center.manage');
  const isOwner = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-muted text-ink">
      <div className="border-b border-line bg-surface px-6 pt-4">
        <PageHeader
          icon={<Activity className="h-5 w-5" />}
          title="مركز مزامنة الفروع والحسابات"
          description="حالة الاتصال، ربط حساب شركة أخرى بكود أو مفتاح API، واعتماد تعديلات الفروع"
          actions={
            <button
              type="button"
              onClick={() => setRefreshToken((value) => value + 1)}
              className="flex items-center gap-2 self-start rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-muted sm:self-auto"
            >
              <RefreshCw className="h-4 w-4" /> تحديث الكل
            </button>
          }
        />
      </div>

      <div className="border-b border-line bg-surface px-4">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-bold transition ${
                tab === item.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'status' && <SyncStatusPanel refreshToken={refreshToken} />}
        {tab === 'links' && (canManage
          ? <AccountLinksPanel />
          : <div className="rounded-2xl border border-warning-border bg-warning-soft p-6 text-center text-sm text-warning">إدارة الحسابات المرتبطة متاحة لصاحب النشاط فقط.</div>)}
        {tab === 'approvals' && (
          <SyncChangeApprovalsPanel
            canDecide={isOwner}
            requestedBy={isOwner ? undefined : user?.id}
          />
        )}
      </div>
    </div>
  );
};

export default SyncStatusPage;
