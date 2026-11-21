import React from 'react';
import { KeyRound, CheckCircle2, Ban, Clock, AlertTriangle } from 'lucide-react';
import type { PlatformLicense } from '../../../services/domains/platform/platformTypes';
import { daysUntilExpiry } from './licenseData';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'default' | 'warning' | 'danger';
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, tone = 'default' }) => {
  const toneClass =
    tone === 'warning'
      ? 'border-warning-border bg-warning-soft text-warning'
      : tone === 'danger'
        ? 'border-danger-border bg-danger-soft text-danger'
        : 'border-line bg-surface text-ink';
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm ${toneClass}`}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-lg font-extrabold leading-none">{value}</span>
        <span className="mt-1 block truncate text-[11px] font-semibold opacity-80">{label}</span>
      </span>
    </div>
  );
};

export const LicenseStatsBar: React.FC<{ licenses: PlatformLicense[] }> = ({ licenses }) => {
  const stats = React.useMemo(() => {
    let active = 0;
    let suspended = 0;
    let expired = 0;
    let expiringSoon = 0;
    for (const license of licenses) {
      if (license.status === 'ACTIVE' || license.status === 'ISSUED') active += 1;
      if (license.status === 'SUSPENDED') suspended += 1;
      const days = daysUntilExpiry(license.expiresAt);
      if (days !== null && days <= 0) expired += 1;
      else if (days !== null && days <= 30 && license.status !== 'REVOKED') expiringSoon += 1;
    }
    return { total: licenses.length, active, suspended, expired, expiringSoon };
  }, [licenses]);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard icon={<KeyRound className="h-4 w-4" />} label="إجمالي التراخيص" value={stats.total} />
      <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="نشطة / صادرة" value={stats.active} />
      <StatCard icon={<Ban className="h-4 w-4" />} label="موقوفة" value={stats.suspended} />
      <StatCard icon={<Clock className="h-4 w-4" />} label="تنتهي خلال 30 يوم" value={stats.expiringSoon} tone={stats.expiringSoon > 0 ? 'warning' : 'default'} />
      <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="منتهية" value={stats.expired} tone={stats.expired > 0 ? 'danger' : 'default'} />
    </div>
  );
};
