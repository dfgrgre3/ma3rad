import React from 'react';
import { AlarmClock, Banknote, Building2, CheckCircle2, Clock, Users, XCircle } from 'lucide-react';
import type { PlatformTenant, PlatformTenantStatus } from '../../../services/domains/platform/platformTypes';
import { formatMoney, formatNumber } from '../components/PlatformUI';

interface TenantStatsSectionProps {
  tenants: PlatformTenant[];
  activeStatus: string;
  onSelectStatus: (status: string) => void;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const TenantStatsSection: React.FC<TenantStatsSectionProps> = ({ tenants, activeStatus, onSelectStatus }) => {
  const stats = React.useMemo(() => {
    const now = Date.now();
    const byStatus = tenants.reduce<Record<string, number>>((acc, tenant) => {
      acc[tenant.status] = (acc[tenant.status] ?? 0) + 1;
      return acc;
    }, {});
    const expiringSoon = tenants.filter((tenant) => {
      if (!tenant.subscriptionExpiresAt) return false;
      const expiry = new Date(tenant.subscriptionExpiresAt).getTime();
      return Number.isFinite(expiry) && expiry >= now && expiry <= now + THIRTY_DAYS_MS;
    }).length;
    const outstanding = tenants.reduce((sum, tenant) => sum + (Number(tenant.outstanding) || 0), 0);
    const devicesUsed = tenants.reduce((sum, tenant) => sum + (Number(tenant.devicesUsed) || 0), 0);
    const devicesLimit = tenants.reduce((sum, tenant) => sum + (Number(tenant.devicesLimit) || 0), 0);
    return { byStatus, expiringSoon, outstanding, devicesUsed, devicesLimit };
  }, [tenants]);

  const cards: Array<{
    key: string;
    label: string;
    value: number | string;
    icon: React.ReactNode;
    tone: string;
    status?: string;
    hint?: string;
  }> = [
    {
      key: 'total',
      label: 'إجمالي العملاء',
      value: formatNumber(tenants.length),
      icon: <Building2 className="h-4 w-4" />,
      tone: 'bg-slate-100 text-slate-600',
      status: '',
    },
    {
      key: 'ACTIVE',
      label: 'نشط',
      value: formatNumber(stats.byStatus.ACTIVE ?? 0),
      icon: <CheckCircle2 className="h-4 w-4" />,
      tone: 'bg-emerald-50 text-emerald-600',
      status: 'ACTIVE',
    },
    {
      key: 'TRIAL',
      label: 'تجريبي',
      value: formatNumber(stats.byStatus.TRIAL ?? 0),
      icon: <Clock className="h-4 w-4" />,
      tone: 'bg-amber-50 text-amber-600',
      status: 'TRIAL',
    },
    {
      key: 'SUSPENDED',
      label: 'موقوف',
      value: formatNumber(stats.byStatus.SUSPENDED ?? 0),
      icon: <XCircle className="h-4 w-4" />,
      tone: 'bg-rose-50 text-rose-600',
      status: 'SUSPENDED',
    },
    {
      key: 'expiring',
      label: 'اشتراك ينتهي (30 يوم)',
      value: formatNumber(stats.expiringSoon),
      icon: <AlarmClock className="h-4 w-4" />,
      tone: 'bg-sky-50 text-sky-600',
    },
    {
      key: 'outstanding',
      label: 'إجمالي المستحقات',
      value: stats.outstanding > 0 ? formatMoney(stats.outstanding) : '—',
      icon: <Banknote className="h-4 w-4" />,
      tone: 'bg-violet-50 text-violet-600',
      hint: stats.devicesLimit > 0 ? `الأجهزة: ${formatNumber(stats.devicesUsed)} / ${formatNumber(stats.devicesLimit)}` : undefined,
    },
  ];

  const statuses: PlatformTenantStatus[] = ['ACTIVE', 'TRIAL', 'SUSPENDED', 'EXPIRED', 'CANCELLED'];
  const total = Math.max(1, tenants.length);

  return (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => card.status !== undefined && onSelectStatus(card.status === activeStatus ? '' : card.status)}
            className={`rounded-xl border bg-white p-3.5 text-right shadow-sm transition ${
              card.status !== undefined ? 'hover:border-emerald-300 hover:shadow cursor-pointer' : 'cursor-default'
            } ${card.status !== undefined && card.status === activeStatus ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-200'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-500">{card.label}</p>
                <p className="mt-1 truncate text-[20px] font-black leading-tight text-slate-900">{card.value}</p>
                {card.hint && <p className="mt-1 text-[10px] text-slate-400">{card.hint}</p>}
              </div>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.tone}`}>{card.icon}</span>
            </div>
          </button>
        ))}
      </div>

      {/* شريط توزيع الحالات */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-slate-700">
            <Users className="h-3.5 w-3.5 text-slate-400" /> توزيع حالات العملاء
          </p>
          <span className="text-[10.5px] text-slate-400">{tenants.length} عميل</span>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
          {statuses.map((status) => {
            const count = stats.byStatus[status] ?? 0;
            if (count === 0) return null;
            const colors: Record<string, string> = {
              ACTIVE: 'bg-emerald-500',
              TRIAL: 'bg-amber-400',
              SUSPENDED: 'bg-rose-500',
              EXPIRED: 'bg-slate-400',
              CANCELLED: 'bg-slate-300',
            };
            return (
              <div
                key={status}
                className={`${colors[status]} transition-all`}
                style={{ width: `${(count / total) * 100}%` }}
                title={`${status}: ${count}`}
              />
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {statuses.map((status) => {
            const count = stats.byStatus[status] ?? 0;
            const labels: Record<string, string> = {
              ACTIVE: 'نشط',
              TRIAL: 'تجريبي',
              SUSPENDED: 'موقوف',
              EXPIRED: 'منتهي',
              CANCELLED: 'ملغي',
            };
            const dots: Record<string, string> = {
              ACTIVE: 'bg-emerald-500',
              TRIAL: 'bg-amber-400',
              SUSPENDED: 'bg-rose-500',
              EXPIRED: 'bg-slate-400',
              CANCELLED: 'bg-slate-300',
            };
            return (
              <button
                key={status}
                type="button"
                onClick={() => onSelectStatus(status === activeStatus ? '' : status)}
                className={`flex items-center gap-1.5 text-[10.5px] font-semibold transition ${activeStatus === status ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <span className={`h-2 w-2 rounded-full ${dots[status]}`} />
                {labels[status]}: {formatNumber(count)}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
