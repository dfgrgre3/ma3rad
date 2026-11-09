import React from 'react';
import type { DashboardMetrics } from '../../services/finance/AccountingService';

export interface OverviewKpiGridProps {
  metrics: DashboardMetrics;
  monthlyComparison: any;
  profitMarginPercent: string;
  averageTicket: number;
}

export interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
}

export const TONE_CLASS: Record<NonNullable<KpiTileProps['tone']>, string> = {
  default: 'text-[#1b1b1b] dark:text-[#f0f0f0]',
  positive: 'text-[#107c10] dark:text-[#6cc36c]',
  negative: 'text-[#c42b1c] dark:text-[#f1707b]',
  warning: 'text-[#9d5d00] dark:text-[#e0a54a]',
};

export const KpiTile: React.FC<KpiTileProps> = ({ label, value, hint, icon: Icon, tone = 'default' }) => (
  <div className="group relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-[2px] border border-[#d9d9d9] bg-white p-2.5 dark:border-[#3d3d3d] dark:bg-[#2b2b2b] sm:p-3">
    <span className="absolute inset-y-0 right-0 w-1 bg-[#0078d4] opacity-70" aria-hidden="true" />
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-[10px] font-semibold text-[#4d4d4d] dark:text-[#c8c8c8] sm:text-[11px]">{label}</span>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] text-[#0078d4]">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </div>
    <div className={`truncate text-[clamp(0.82rem,3.7vw,1.05rem)] font-extrabold tabular-nums tracking-tight ${TONE_CLASS[tone]}`}>{value}</div>
    {hint && <div className="truncate text-[9px] text-[#767676] dark:text-[#a6a6a6] sm:text-[10px]">{hint}</div>}
  </div>
);
