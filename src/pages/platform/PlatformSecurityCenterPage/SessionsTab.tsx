import React, { useMemo, useState } from 'react';
import { Laptop, LogOut, CheckCircle2, AlertTriangle, Search, Ban } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import type { PlatformStaffSession } from '../../../services/domains/platform/platformTypes';
import { formatDateTime, inputClass } from '../components/PlatformUI';

interface SessionsTabProps {
  sessions: PlatformStaffSession[];
  canManageSecurity: boolean;
  isCentral?: boolean;
  onRevokeSession: (sessionId: string) => void;
  onRevokeAllOtherSessions: () => void;
  onBanIp?: (ip: string) => void;
}

export const SessionsTab: React.FC<SessionsTabProps> = ({
  sessions,
  canManageSecurity,
  isCentral = false,
  onRevokeSession,
  onRevokeAllOtherSessions,
  onBanIp,
}) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((sess) =>
      [sess.staffName, sess.staffRole, sess.ipAddress, sess.deviceName, sess.userAgent]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    );
  }, [sessions, search]);

  return (
    <section className="overflow-hidden rounded-xl border border-line-strong bg-primary/70 shadow-sm">
      <header className="border-b border-line-strong px-4 py-3 bg-primary/40 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-muted">
            الجلسات النشطة لمديري وموظفي المنصة ({filtered.length}{filtered.length !== sessions.length ? ` / ${sessions.length}` : ''})
          </h3>
          <p className="text-[10.5px] text-muted">
            يمكن إنهاء أي جلسة مشبوهة أو غير معتادة عن بعد فوراً لحماية النظام.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بموظف أو IP أو جهاز..."
              className={`${inputClass} w-52 py-1.5 pr-8 text-[11px]`}
            />
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
        </div>
      </header>

      <DataTable
        ariaLabel="الجلسات المركزية والأجهزة الموثوقة"
        rows={filtered}
        rowKey={(sess) => sess.id}
        minWidth={900}
        emptyTitle="لا توجد جلسات تطابق البحث."
        columns={[
          {
            key: 'staff', header: 'الموظف والدور',
            render: (sess) => (
              <div className="text-xs">
                <p className="font-bold text-muted flex items-center gap-1.5">
                  {sess.staffName}
                  {sess.isCurrent && (
                    <span className="rounded bg-success/20 text-success text-[9px] px-1.5 py-0.5 font-bold">
                      جلستك الحالية
                    </span>
                  )}
                </p>
                <p className="text-[10.5px] text-muted">{sess.staffRole}</p>
              </div>
            ),
          },
          {
            key: 'device', header: 'الجهاز والمتصفح',
            render: (sess) => (
              <span className="flex items-center gap-1.5 text-xs text-muted" title={sess.userAgent || undefined}>
                <Laptop className="h-3.5 w-3.5 text-muted shrink-0" />
                <span className="truncate max-w-[180px]">{sess.deviceName || sess.userAgent || 'غير محدد'}</span>
              </span>
            ),
          },
          { key: 'ip', header: 'عنوان IP', render: (sess) => <span className="text-xs font-mono text-muted">{sess.ipAddress || '—'}</span> },
          {
            key: 'trusted', header: 'موثوقية الجهاز',
            render: (sess) => sess.isTrustedDevice ? (
              <span className="inline-flex items-center gap-1 text-success font-bold text-xs"><CheckCircle2 className="h-3 w-3" /> موثوق</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-warning font-bold text-xs"><AlertTriangle className="h-3 w-3" /> غير مصادق</span>
            ),
          },
          { key: 'activity', header: 'آخر نشاط', render: (sess) => <span className="text-xs text-muted whitespace-nowrap">{formatDateTime(sess.lastActivityAt)}</span> },
          {
            key: 'action', header: 'الإجراءات', align: 'center',
            render: (sess) => (
              <div className="flex items-center justify-center gap-1.5">
                {isCentral && onBanIp && sess.ipAddress && !sess.isCurrent && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onBanIp(sess.ipAddress!)}
                    disabled={!canManageSecurity}
                    leadingIcon={<Ban className="h-3 w-3" />}
                    title="حظر عنوان IP هذا"
                  >
                    حظر IP
                  </Button>
                )}
                {!sess.isCurrent && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onRevokeSession(sess.id)}
                    disabled={!canManageSecurity}
                    leadingIcon={<LogOut className="h-3 w-3" />}
                  >
                    إنهاء الجلسة
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />
    </section>
  );
};
