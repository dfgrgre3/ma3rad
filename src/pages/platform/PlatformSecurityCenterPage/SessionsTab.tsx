import React from 'react';
import { Laptop, LogOut, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import type { PlatformStaffSession } from '../../../services/domains/platform/platformTypes';
import { formatDateTime } from '../components/PlatformUI';

interface SessionsTabProps {
  sessions: PlatformStaffSession[];
  canManageSecurity: boolean;
  onRevokeSession: (sessionId: string) => void;
  onRevokeAllOtherSessions: () => void;
}

export const SessionsTab: React.FC<SessionsTabProps> = ({ sessions, canManageSecurity, onRevokeSession, onRevokeAllOtherSessions }) => (
  <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
    <header className="border-b border-slate-800 px-4 py-3 bg-slate-950/40 flex items-center justify-between">
      <div>
        <h3 className="text-xs font-bold text-slate-200">
          الجلسات النشطة لمديري وموظفي المنصة ({sessions.length})
        </h3>
        <p className="text-[10.5px] text-slate-400">
          يمكن إنهاء أي جلسة مشبوهة أو غير معتادة عن بعد فوراً لحماية النظام.
        </p>
      </div>
      <Button
        size="sm"
        variant="danger"
        onClick={onRevokeAllOtherSessions}
        disabled={!canManageSecurity}
        leadingIcon={<LogOut className="h-3.5 w-3.5" />}
      >
        إنهاء كافة الجلسات الأخرى
      </Button>
    </header>

    <DataTable
      ariaLabel="الجلسات المركزية والأجهزة الموثوقة"
      rows={sessions}
      rowKey={(sess) => sess.id}
      minWidth={800}
      columns={[
        {
          key: 'staff', header: 'الموظف والدور',
          render: (sess) => (
            <div className="text-xs">
              <p className="font-bold text-slate-100 flex items-center gap-1.5">
                {sess.staffName}
                {sess.isCurrent && (
                  <span className="rounded bg-emerald-500/20 text-emerald-300 text-[9px] px-1.5 py-0.5 font-bold">
                    جلستك الحالية
                  </span>
                )}
              </p>
              <p className="text-[10.5px] text-slate-400">{sess.staffRole}</p>
            </div>
          ),
        },
        {
          key: 'device', header: 'الجهاز والمتصفح',
          render: (sess) => (
            <span className="flex items-center gap-1.5 text-xs text-slate-300">
              <Laptop className="h-3.5 w-3.5 text-slate-400" />
              {sess.deviceName || 'غير محدد'}
            </span>
          ),
        },
        { key: 'ip', header: 'عنوان IP', render: (sess) => <span className="text-xs font-mono text-slate-300">{sess.ipAddress || '—'}</span> },
        {
          key: 'trusted', header: 'موثوقية الجهاز',
          render: (sess) => sess.isTrustedDevice ? (
            <span className="inline-flex items-center gap-1 text-emerald-400 font-bold text-xs"><CheckCircle2 className="h-3 w-3" /> موثوق</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-400 font-bold text-xs"><AlertTriangle className="h-3 w-3" /> غير مصادق</span>
          ),
        },
        { key: 'activity', header: 'آخر نشاط', render: (sess) => <span className="text-xs text-slate-400">{formatDateTime(sess.lastActivityAt)}</span> },
        {
          key: 'action', header: 'الإجراء', align: 'center',
          render: (sess) => !sess.isCurrent ? (
            <Button
              size="sm"
              variant="danger"
              onClick={() => onRevokeSession(sess.id)}
              disabled={!canManageSecurity}
              leadingIcon={<LogOut className="h-3 w-3" />}
            >
              إنهاء الجلسة
            </Button>
          ) : null,
        },
      ]}
    />
  </section>
);
