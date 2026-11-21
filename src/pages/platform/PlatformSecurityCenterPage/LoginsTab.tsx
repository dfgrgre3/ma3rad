import React from 'react';
import { Search, CheckCircle2, XCircle, Ban, Download } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import type { PlatformStaffLogin } from '../../../services/domains/platform/platformTypes';
import { downloadCsv, formatDateTime, inputClass } from '../components/PlatformUI';

interface LoginsTabProps {
  logins: PlatformStaffLogin[];
  loginSearch: string;
  onLoginSearchChange: (v: string) => void;
  loginFilterFailed: boolean;
  onLoginFilterFailedChange: (v: boolean) => void;
  /** Central mode: rows are derived from security events; IP ban is available. */
  isCentral?: boolean;
  canManageSecurity?: boolean;
  onBanIp?: (ip: string) => void;
}

const statusLabel = (login: PlatformStaffLogin) =>
  login.status === 'SUCCESS' ? 'ناجح' : login.status === 'BLOCKED' ? 'محظور IP' : 'فشل كلمة المرور';

export const LoginsTab: React.FC<LoginsTabProps> = ({
  logins,
  loginSearch,
  onLoginSearchChange,
  loginFilterFailed,
  onLoginFilterFailedChange,
  isCentral = false,
  canManageSecurity = false,
  onBanIp,
}) => {
  const handleExport = () => {
    downloadCsv('staff-logins.csv', [
      ['البريد', 'IP', 'الحالة', 'السبب', 'التوقيت'],
      ...logins.map((login) => [
        login.email,
        login.ipAddress ?? '',
        statusLabel(login),
        login.failureReason ?? '',
        login.attemptedAt,
      ]),
    ]);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-strong bg-primary/80 p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px]">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={loginSearch}
              onChange={(e) => onLoginSearchChange(e.target.value)}
              placeholder="ابحث بالبريد أو عنوان IP..."
              className={`${inputClass} pr-9 text-xs`}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={loginFilterFailed}
              onChange={(e) => onLoginFilterFailedChange(e.target.checked)}
              className="rounded border-line-strong bg-primary text-danger focus:ring-danger"
            />
            <span className={loginFilterFailed ? 'text-danger font-bold' : ''}>
              عرض المحاولات الفاشلة والمحظورة فقط
            </span>
          </label>
        </div>

        <Button size="sm" variant="secondary" onClick={handleExport} leadingIcon={<Download className="h-3.5 w-3.5" />}>
          تصدير CSV
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-line-strong bg-primary/70 shadow-sm">
        <DataTable
          ariaLabel="سجل محاولات الدخول"
          rows={logins}
          rowKey={(login) => login.id}
          minWidth={900}
          emptyTitle="لا توجد سجلات دخول تطابق البحث."
          columns={[
            { key: 'email', header: 'البريد الإلكتروني', render: (login) => <span className="text-xs font-bold text-muted">{login.email}</span> },
            { key: 'ip', header: 'عنوان IP', render: (login) => <span className="text-xs font-mono text-muted">{login.ipAddress || '—'}</span> },
            {
              key: 'status', header: 'حالة المحاولة',
              render: (login) => (
                <span
                  className={`inline-flex items-center gap-1 font-bold text-xs ${
                    login.status === 'SUCCESS'
                      ? 'text-success'
                      : login.status === 'BLOCKED'
                      ? 'text-danger'
                      : 'text-warning'
                  }`}
                >
                  {login.status === 'SUCCESS' ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  {statusLabel(login)}
                </span>
              ),
            },
            { key: 'reason', header: 'السبب / الملاحظات', render: (login) => <span className="text-xs text-muted">{login.failureReason || '—'}</span> },
            { key: 'time', header: 'التوقيت', render: (login) => <span className="text-xs text-muted whitespace-nowrap">{formatDateTime(login.attemptedAt)}</span> },
            {
              key: 'actions', header: 'إجراءات', align: 'center',
              render: (login) =>
                isCentral && onBanIp && login.ipAddress && login.status !== 'SUCCESS' ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!canManageSecurity}
                    onClick={() => onBanIp(login.ipAddress!)}
                    leadingIcon={<Ban className="h-3 w-3" />}
                  >
                    حظر IP
                  </Button>
                ) : null,
            },
          ]}
        />
      </div>
    </section>
  );
};
