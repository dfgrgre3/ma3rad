import React from 'react';
import { MonitorSmartphone, CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import type { PlatformStaffSession, PlatformTrustedDevice } from '../../../services/domains/platform/platformTypes';
import { EmptyState, formatDateTime } from '../components/PlatformUI';

interface SessionsTabProps {
  devices: PlatformTrustedDevice[];
  sessions: PlatformStaffSession[];
  currentDeviceTrusted: boolean;
  /** Central mode has no "trust current device" endpoint — hide that action. */
  centralActive?: boolean;
  canRevokeSessions: boolean;
  canUpdate: boolean;
  onTrustCurrentDevice: () => void;
  onRevokeAllOtherSessions: () => void;
  onRevokeSession: (session: PlatformStaffSession) => void;
  onRevokeTrustedDevice: (device: PlatformTrustedDevice) => void;
}

export const SessionsTab: React.FC<SessionsTabProps> = ({
  devices,
  sessions,
  currentDeviceTrusted,
  centralActive = false,
  canRevokeSessions,
  canUpdate,
  onTrustCurrentDevice,
  onRevokeAllOtherSessions,
  onRevokeSession,
  onRevokeTrustedDevice,
}) => (
  <>
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line-strong bg-primary/60 p-3">
      <div>
        <p className="text-xs font-bold text-muted">الأجهزة الموثوقة ({devices.length}) · الجلسات النشطة ({sessions.length})</p>
        <p className="text-[10px] text-muted mt-0.5">توثيق جهازك الحالي يجعل جلساته المستقبلية مميزة في مركز الأمان وسجل الدخول.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!centralActive && (!currentDeviceTrusted ? (
          <Button size="sm" variant="secondary" onClick={onTrustCurrentDevice} leadingIcon={<MonitorSmartphone className="h-4 w-4" />}>
            وثّق هذا الجهاز
          </Button>
        ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-success/10 border border-success/20 px-3 py-1.5 text-xs font-bold text-success">
            <CheckCircle2 className="h-4 w-4" /> هذا الجهاز موثوق
          </span>
        ))}
        {canRevokeSessions && (
          <Button size="sm" variant="ghost" onClick={onRevokeAllOtherSessions}>
            إنهاء كل الجلسات الأخرى
          </Button>
        )}
      </div>
    </div>

    <div className="overflow-hidden rounded-xl border border-line-strong bg-primary/70">
      <div className="border-b border-line-strong bg-primary/40 px-4 py-2.5 text-xs font-black text-muted">الجلسات النشطة</div>
      {sessions.length === 0 ? (
        <EmptyState icon={<MonitorSmartphone className="h-6 w-6 text-muted" />} title="لا توجد جلسات مسجلة" />
      ) : (
        <DataTable
          ariaLabel="الجلسات النشطة"
          rows={sessions}
          rowKey={(session) => session.id}
          minWidth={900}
          dense
          columns={[
            {
              key: 'staff', header: 'الموظف',
              render: (session) => (
                <div><div className="font-bold text-muted">{session.staffName}</div><div className="text-[9.5px] text-muted">{session.staffRole}</div></div>
              ),
            },
            {
              key: 'device', header: 'الجهاز',
              render: (session) => <span className="text-muted">{session.deviceName || 'غير معروف'}{session.isCurrent ? <span className="mr-1 text-[9px] font-black text-primary">(الحالية)</span> : ''}</span>,
            },
            { key: 'ip', header: 'عنوان IP', render: (session) => <span className="font-mono text-[10.5px] text-muted" dir="ltr">{session.ipAddress || '—'}</span> },
            { key: 'trusted', header: 'موثوقة', render: (session) => session.isTrustedDevice ? <span className="text-success font-bold">نعم</span> : <span className="text-muted">لا</span> },
            { key: 'started', header: 'بدأت', render: (session) => <span className="text-muted">{formatDateTime(session.createdAt)}</span> },
            { key: 'activity', header: 'آخر نشاط', render: (session) => <span className="text-muted">{formatDateTime(session.lastActivityAt)}</span> },
            {
              key: 'actions', header: '',
              render: (session) => !session.isCurrent && canRevokeSessions ? (
                <button onClick={() => onRevokeSession(session)} className="text-danger hover:text-danger text-[10.5px] font-bold">إنهاء الجلسة</button>
              ) : null,
            },
          ]}
        />
      )}
    </div>

    <div className="overflow-hidden rounded-xl border border-line-strong bg-primary/70">
      <div className="border-b border-line-strong bg-primary/40 px-4 py-2.5 text-xs font-black text-muted">الأجهزة الموثوقة</div>
      {devices.length === 0 ? (
        <EmptyState icon={<MonitorSmartphone className="h-6 w-6 text-muted" />} title="لا توجد أجهزة موثوقة بعد" description="كل موظف يمكنه توثيق جهازه الحالي لحماية الجلسات المميزة." />
      ) : (
        <DataTable
          ariaLabel="الأجهزة الموثوقة"
          rows={devices}
          rowKey={(device) => device.id}
          minWidth={760}
          dense
          columns={[
            { key: 'staff', header: 'الموظف', render: (device) => <span className="font-bold text-muted">{device.staffName || device.staffId}</span> },
            { key: 'device', header: 'الجهاز', render: (device) => <span className="text-muted">{device.deviceName || 'جهاز'}</span> },
            { key: 'fp', header: 'البصمة', render: (device) => <span className="font-mono text-[10.5px] text-muted" dir="ltr">{device.fingerprint ? `${device.fingerprint.slice(0, 18)}…` : '—'}</span> },
            { key: 'seen', header: 'آخر ظهور', render: (device) => <span className="text-muted">{device.lastSeenAt ? formatDateTime(device.lastSeenAt) : '—'}</span> },
            {
              key: 'actions', header: '',
              render: (device) => device.revokedAt ? <span className="text-[10px] text-ink-secondary">ملغى</span> : (!device.revokedAt && canUpdate ? (
                <button onClick={() => onRevokeTrustedDevice(device)} className="text-danger hover:text-danger text-[10.5px] font-bold">إلغاء التوثيق</button>
              ) : null),
            },
          ]}
        />
      )}
    </div>
  </>
);
