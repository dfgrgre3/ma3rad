import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../ui/DataTable';
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Cloud, CloudOff, Inbox,
  Loader2, RefreshCw, ShieldAlert, Wifi, WifiOff,
} from 'lucide-react';
import { SyncStatusService } from '../../sync/SyncStatusService';
import type { SyncOverview } from '../../types/sync';
import { useToast } from '../ui/Toast';
import { StatCard as UiStatCard } from '../ui/Card';


const statTone = (cls: string): 'default' | 'success' | 'danger' | 'warning' =>
  /rose|red|danger/.test(cls) ? 'danger' : /amber|orange/.test(cls) ? 'warning' : /emerald|green|success/.test(cls) ? 'success' : 'default';

const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: string }> = ({ label, value, hint, icon, tone }: any) => (
  <UiStatCard label={label} value={value} hint={hint} icon={icon} tone={statTone(tone || '')} />
);
function formatTimestamp(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return value;
  }
}

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone: string;
}


/**
 * Live synchronization health: connection state, last successful contact,
 * queue depth, conflicts, pending owner approvals, and per-branch presence.
 */
export const SyncStatusPanel: React.FC<{ refreshToken?: number }> = ({ refreshToken = 0 }) => {
  const toast = useToast();
  const service = useMemo(() => new SyncStatusService(), []);
  const [overview, setOverview] = useState<SyncOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setOverview(service.overview());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل حالة المزامنة.');
    } finally {
      setLoading(false);
    }
  }, [service, toast]);

  useEffect(() => { load(); }, [load, refreshToken]);

  if (!overview) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-6 text-xs text-muted">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudOff className="h-4 w-4" />}
        {loading ? 'جارٍ تحميل حالة المزامنة…' : 'لا تتوفر بيانات مزامنة.'}
      </div>
    );
  }

  const connectionTone = overview.connected
    ? 'border-success-border bg-success-soft text-success'
    : overview.configured
      ? 'border-warning-border bg-warning-soft text-warning'
      : 'border-line bg-surface-muted text-ink-secondary';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-black text-ink">حالة المزامنة والاتصال</h3>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-bold text-ink hover:bg-surface-muted"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث
        </button>
      </div>

      {/* Connection banner */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${connectionTone}`}>
        <div className="flex items-center gap-3">
          {overview.connected ? <Wifi className="h-6 w-6" /> : <WifiOff className="h-6 w-6" />}
          <div>
            <p className="text-sm font-black">
              {!overview.configured
                ? 'المزامنة غير مُهيأة على هذا الجهاز'
                : overview.connected
                  ? 'متصل بخادم المزامنة'
                  : 'غير متصل — تعمل العمليات محليًا وتُرسل عند عودة الاتصال'}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold opacity-80">
              <Clock className="h-3 w-3" /> آخر مزامنة ناجحة: {formatTimestamp(overview.lastSuccessfulSyncAt)}
            </p>
          </div>
        </div>
        {overview.configured && (
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${overview.connected ? 'bg-success text-white' : 'bg-primary text-white'}`}>
            {overview.connected ? 'Online' : 'Offline'}
          </span>
        )}
      </div>

      {overview.lastError && (
        <div className="flex items-start gap-2 rounded-xl border border-danger-border bg-danger-soft p-3 text-[11px] text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-all">آخر خطأ: {overview.lastError}</span>
        </div>
      )}

      {/* Counters */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="عمليات بانتظار الإرسال" value={overview.pendingCount} icon={<Cloud className="h-4 w-4" />} tone="border-accent-border bg-accent-soft text-primary" />
        <StatCard label="فشل الإرسال" value={overview.failedCount} icon={<AlertTriangle className="h-4 w-4" />} tone="border-warning-border bg-warning-soft text-warning" />
        <StatCard label="تعارضات مفتوحة" value={overview.conflictCount} icon={<ShieldAlert className="h-4 w-4" />} tone="border-danger-border bg-danger-soft text-danger" />
        <StatCard label="تعديلات تحتاج اعتمادك" value={overview.pendingApprovalCount} icon={<CheckCircle2 className="h-4 w-4" />} tone="border-accent-border bg-accent-soft text-primary" />
        <StatCard label="وارد بانتظار التطبيق" value={overview.inboxPendingCount} icon={<Inbox className="h-4 w-4" />} tone="border-accent-border bg-accent-soft text-primary" />
      </div>

      {/* Branches */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-2.5">
          <h4 className="text-xs font-black text-ink">حالة الفروع وآخر اتصال</h4>
        </div>
        <DataTable
          ariaLabel="حالة الفروع"
          rows={overview.branches}
          rowKey={(branch: any) => String(branch.branchId)}
          dense
          tableClassName="text-xs"
          columns={[
            { key: 'name', header: 'الفرع', render: (branch: any) => <span className="font-bold text-ink">{branch.name}</span> },
            {
              key: 'status', header: 'الحالة',
              render: (branch: any) => (
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${branch.isVerified ? 'border-success-border bg-success-soft text-success' : 'border-warning-border bg-warning-soft text-warning'}`}>
                  {branch.isVerified ? 'موثّق' : 'غير موثّق'}
                </span>
              ),
            },
            {
              key: 'conn', header: 'الاتصال',
              render: (branch: any) => (
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${branch.online ? 'text-success' : 'text-muted'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${branch.online ? 'bg-success' : 'bg-surface-sunken'}`} />
                  {branch.online ? 'Online' : 'Offline'}
                </span>
              ),
            },
            { key: 'contact', header: 'آخر تواصل', render: (branch: any) => <span className="font-mono text-[10px] text-muted">{formatTimestamp(branch.lastContactAt)}</span> },
            { key: 'sync', header: 'آخر مزامنة', render: (branch: any) => <span className="font-mono text-[10px] text-muted">{formatTimestamp(branch.lastSyncAt)}</span> },
            { key: 'devices', header: 'الأجهزة', render: (branch: any) => <span className="text-[11px] font-bold text-ink">{branch.deviceCount}</span> },
            {
              key: 'pending', header: 'معلّق',
              render: (branch: any) => <span className={`text-[11px] font-black ${branch.pendingChanges > 0 ? 'text-warning' : 'text-muted'}`}>{branch.pendingChanges}</span>,
            },
          ]}
          emptyTitle="لا توجد فروع مسجّلة في المزامنة بعد."
        />
      </div>
    </div>
  );
};

export default SyncStatusPanel;
