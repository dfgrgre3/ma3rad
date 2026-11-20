import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { DataTable } from '../../../components/ui/DataTable';
import type { PlatformStaffLogin } from '../../../services/domains/platform/platformTypes';
import { EmptyState, StatusBadge, Toggle, formatDateTime } from '../components/PlatformUI';

interface LoginsTabProps {
  failedOnly: boolean;
  onFailedOnlyChange: (v: boolean) => void;
  logins: PlatformStaffLogin[];
}

export const LoginsTab: React.FC<LoginsTabProps> = ({ failedOnly, onFailedOnlyChange, logins }) => (
  <>
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line-strong bg-primary/60 p-3">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-bold text-muted cursor-pointer">
          <Toggle checked={failedOnly} onChange={(v) => onFailedOnlyChange(v)} label="" />
          الفاشلة/المحظورة فقط
        </label>
      </div>
      <span className="text-[11px] text-muted">آخر {logins.length} محاولة · كل المحاولات مسجلة في سجل التدقيق</span>
    </div>
    <div className="overflow-hidden rounded-xl border border-line-strong bg-primary/70">
      {logins.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="h-6 w-6 text-muted" />} title="لا توجد محاولات مسجلة" />
      ) : (
        <DataTable
          ariaLabel="محاولات تسجيل الدخول"
          rows={logins}
          rowKey={(login) => login.id}
          minWidth={760}
          dense
          columns={[
            { key: 'time', header: 'التوقيت', render: (login) => <span className="text-muted">{formatDateTime(login.attemptedAt)}</span> },
            { key: 'email', header: 'البريد', render: (login) => <span className="font-mono text-[10.5px] text-muted" dir="ltr">{login.email}</span> },
            { key: 'result', header: 'النتيجة', render: (login) => <StatusBadge value={login.status} label={login.status === 'SUCCESS' ? 'نجاح' : login.status === 'FAILED' ? 'فاشلة' : 'محظورة'} /> },
            { key: 'reason', header: 'السبب', render: (login) => <span className="text-muted">{login.failureReason || '—'}</span> },
          ]}
        />
      )}
    </div>
  </>
);
