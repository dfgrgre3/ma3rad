import React from 'react';
import { Search, CheckCircle2, XCircle } from 'lucide-react';
import { DataTable } from '../../../components/ui/DataTable';
import type { PlatformStaffLogin } from '../../../services/domains/platform/platformTypes';
import { formatDateTime, inputClass } from '../components/PlatformUI';

interface LoginsTabProps {
  logins: PlatformStaffLogin[];
  loginSearch: string;
  onLoginSearchChange: (v: string) => void;
  loginFilterFailed: boolean;
  onLoginFilterFailedChange: (v: boolean) => void;
}

export const LoginsTab: React.FC<LoginsTabProps> = ({
  logins,
  loginSearch,
  onLoginSearchChange,
  loginFilterFailed,
  onLoginFilterFailedChange,
}) => (
  <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3 shadow-sm">
      <div className="relative min-w-[240px]">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={loginSearch}
          onChange={(e) => onLoginSearchChange(e.target.value)}
          placeholder="ابحث بالبريد أو عنوان IP..."
          className={`${inputClass} pr-9 text-xs`}
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={loginFilterFailed}
          onChange={(e) => onLoginFilterFailedChange(e.target.checked)}
          className="rounded border-slate-700 bg-slate-800 text-rose-500 focus:ring-rose-500"
        />
        <span className={loginFilterFailed ? 'text-rose-400 font-bold' : ''}>
          عرض المحاولات الفاشلة والمحظورة فقط
        </span>
      </label>
    </div>

    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
      <DataTable
        ariaLabel="سجل محاولات الدخول"
        rows={logins}
        rowKey={(login) => login.id}
        minWidth={800}
        emptyTitle="لا توجد سجلات دخول تطابق البحث."
        columns={[
          { key: 'email', header: 'البريد الإلكتروني', render: (login) => <span className="text-xs font-bold text-slate-100">{login.email}</span> },
          { key: 'ip', header: 'عنوان IP', render: (login) => <span className="text-xs font-mono text-slate-300">{login.ipAddress || '—'}</span> },
          {
            key: 'status', header: 'حالة المحاولة',
            render: (login) => (
              <span
                className={`inline-flex items-center gap-1 font-bold text-xs ${
                  login.status === 'SUCCESS'
                    ? 'text-emerald-400'
                    : login.status === 'BLOCKED'
                    ? 'text-rose-500'
                    : 'text-amber-400'
                }`}
              >
                {login.status === 'SUCCESS' ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <XCircle className="h-3 w-3" />
                )}
                {login.status === 'SUCCESS'
                  ? 'ناجح'
                  : login.status === 'BLOCKED'
                  ? 'محظور IP'
                  : 'فشل كلمة المرور'}
              </span>
            ),
          },
          { key: 'reason', header: 'السبب / الملاحظات', render: (login) => <span className="text-xs text-slate-400">{login.failureReason || '—'}</span> },
          { key: 'time', header: 'التوقيت', render: (login) => <span className="text-xs text-slate-400">{formatDateTime(login.attemptedAt)}</span> },
        ]}
      />
    </div>
  </section>
);
