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

interface StatCard {
  key: string;
  label: string;
  value: number | string;
  icon: React.ReactNode;
  chip: string;
  status?: string;
  hint?: string;
}

const STATUS_DOT: Record<string, string> = {
  ACTIVE: 'bg-success',
  TRIAL: 'bg-warning',
  SUSPENDED: 'bg-danger',
  EXPIRED: 'bg-line-strong',
  CANCELLED: 'bg-surface-sunken',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'نشط',
  TRIAL: 'تجريبي',
  SUSPENDED: 'موقوف',
  EXPIRED: 'منتهي',
  CANCELLED: 'ملغي',
};

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

  const devicePct = stats.devicesLimit > 0 ? Math.min(100, Math.round((stats.devicesUsed / stats.devicesLimit) * 100)) : 0;

  const cards: StatCard[] = [
    {
      key: 'total',
      label: 'إجمالي العملاء',
      value: formatNumber(tenants.length),
      icon: <Building2 className="h-[18px] w-[18px]" />,
      chip: 'bg-accent-soft text-primary',
      status: '',
      hint: 'كافة العملاء المسجلين',
    },
    {
      key: 'ACTIVE',
      label: 'عملاء نشطون',
      value: formatNumber(stats.byStatus.ACTIVE ?? 0),
      icon: <CheckCircle2 className="h-[18px] w-[18px]" />,
      chip: 'bg-success/10 text-success',
      status: 'ACTIVE',
      hint: 'اشتراك ساري المفعول',
    },
    {
      key: 'TRIAL',
      label: 'عملاء تجريبيون',
      value: formatNumber(stats.byStatus.TRIAL ?? 0),
      icon: <Clock className="h-[18px] w-[18px]" />,
      chip: 'bg-warning/10 text-warning',
      status: 'TRIAL',
      hint: 'فترة تقييم مجانية',
    },
    {
      key: 'SUSPENDED',
      label: 'عملاء موقوفون',
      value: formatNumber(stats.byStatus.SUSPENDED ?? 0),
      icon: <XCircle className="h-[18px] w-[18px]" />,
      chip: 'bg-danger/10 text-danger',
      status: 'SUSPENDED',
      hint: 'موقوفون مؤقتاً أو نهائياً',
    },
    {
      key: 'expiring',
      label: 'اشتراك ينتهي قريباً',
      value: formatNumber(stats.expiringSoon),
      icon: <AlarmClock className="h-[18px] w-[18px]" />,
      chip: 'bg-accent-soft text-primary',
      hint: 'خلال الـ 30 يوماً القادمة',
    },
    {
      key: 'outstanding',
      label: 'إجمالي المستحقات',
      value: stats.outstanding > 0 ? formatMoney(stats.outstanding) : '—',
      icon: <Banknote className="h-[18px] w-[18px]" />,
      chip: 'bg-danger/10 text-danger',
      hint: stats.devicesLimit > 0
        ? `الأجهزة: ${formatNumber(stats.devicesUsed)} / ${formatNumber(stats.devicesLimit)} (${devicePct}%)`
        : undefined,
    },
  ];

  const statuses: PlatformTenantStatus[] = ['ACTIVE', 'TRIAL', 'SUSPENDED', 'EXPIRED', 'CANCELLED'];
  const total = Math.max(1, tenants.length);

  return (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {cards.map((card) => {
          const isActive = card.status !== undefined && card.status === activeStatus;
          const clickable = card.status !== undefined;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => clickable && card.status !== undefined && onSelectStatus(card.status === activeStatus ? '' : card.status)}
              disabled={!clickable}
              className={`group relative overflow-hidden rounded-2xl border bg-surface p-4 text-right shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition ${
                clickable
                  ? 'cursor-pointer hover:-translate-y-0.5 hover:border-success/60 hover:shadow-md'
                  : 'cursor-default'
              } ${isActive ? 'border-success ring-2 ring-success/30' : 'border-line'}`}
            >
              <span className={`absolute inset-x-0 top-0 h-1 ${isActive ? 'bg-success' : 'bg-transparent group-hover:bg-success/40'} transition`} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-muted">{card.label}</p>
                  <p className="mt-1.5 truncate text-[22px] font-black leading-none tracking-tight text-ink">{card.value}</p>
                  {card.hint && <p className="mt-2 text-[10px] font-medium text-muted">{card.hint}</p>}
                </div>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.chip} transition group-hover:scale-105`}>
                  {card.icon}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* شريط توزيع الحالات */}
      <div className="rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[11.5px] font-black text-ink">
            <Users className="h-4 w-4 text-primary" /> توزيع حالات العملاء
          </p>
          <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-[10.5px] font-bold text-ink-secondary">{formatNumber(tenants.length)} عميل</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-surface-sunken ring-1 ring-line/60">
          {statuses.map((status) => {
            const count = stats.byStatus[status] ?? 0;
            if (count === 0) return null;
            const colors: Record<string, string> = {
              ACTIVE: 'bg-success',
              TRIAL: 'bg-warning',
              SUSPENDED: 'bg-danger',
              EXPIRED: 'bg-line-strong',
              CANCELLED: 'bg-surface-sunken',
            };
            return (
              <div
                key={status}
                className={`${colors[status]} transition-all`}
                style={{ width: `${(count / total) * 100}%` }}
                title={`${STATUS_LABEL[status]}: ${count}`}
              />
            );
          })}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {statuses.map((status) => {
            const count = stats.byStatus[status] ?? 0;
            return (
              <button
                key={status}
                type="button"
                onClick={() => onSelectStatus(status === activeStatus ? '' : status)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold transition ${
                  activeStatus === status
                    ? 'border-success bg-success-soft text-success'
                    : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                {STATUS_LABEL[status]}: {formatNumber(count)}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
