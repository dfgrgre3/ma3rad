import React from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronLeft } from 'lucide-react';

export interface CommandKpiCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'positive' | 'negative' | 'warning' | 'info';
  change?: number | null;
  badge?: string;
  onClick: () => void;
}

const TONE: Record<NonNullable<CommandKpiCardProps['tone']>, { value: string; icon: string; bar: string }> = {
  default: { value: 'text-[#1b1b1b] dark:text-[#f0f0f0]', icon: 'text-[#0078d4]', bar: 'bg-[#0078d4]' },
  positive: { value: 'text-[#107c10] dark:text-[#7bd67b]', icon: 'text-[#107c10] dark:text-[#7bd67b]', bar: 'bg-[#107c10]' },
  negative: { value: 'text-[#c42b1c] dark:text-[#ff9a91]', icon: 'text-[#c42b1c] dark:text-[#ff9a91]', bar: 'bg-[#c42b1c]' },
  warning: { value: 'text-[#9d5d00] dark:text-[#f0bb63]', icon: 'text-[#9d5d00] dark:text-[#f0bb63]', bar: 'bg-[#ca7d00]' },
  info: { value: 'text-[#0067b8] dark:text-[#8ec8f5]', icon: 'text-[#0067b8] dark:text-[#8ec8f5]', bar: 'bg-[#0067b8]' },
};

export const CommandKpiCard: React.FC<CommandKpiCardProps> = ({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  change,
  badge,
  onClick,
}) => {
  const palette = TONE[tone];
  const hasChange = typeof change === 'number' && Number.isFinite(change);
  const changePositive = hasChange && (change as number) >= 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex min-h-[92px] min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-[2px] border border-[#d9d9d9] bg-white p-3 text-right transition-colors hover:border-[#0078d4] hover:bg-[#f8fbfe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0078d4] dark:border-[#3d3d3d] dark:bg-[#2b2b2b] dark:hover:bg-[#30363b]"
      aria-label={`فتح تفاصيل ${label}`}
    >
      <span className={`absolute inset-y-0 right-0 w-1 ${palette.bar} opacity-80`} aria-hidden="true" />
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-[10px] font-semibold text-[#4d4d4d] dark:text-[#c8c8c8] sm:text-[11px]">{label}</span>
          {badge && (
            <span className="mt-1 inline-block rounded-[2px] bg-[#eef6fd] px-1.5 py-0.5 text-[9px] font-bold text-[#0067b8] dark:bg-[#0f3550] dark:text-[#8ec8f5]">
              {badge}
            </span>
          )}
        </span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] bg-[#f0f6fc] dark:bg-[#1d2a35] ${palette.icon}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </span>

      <span className={`truncate text-[clamp(0.92rem,3.8vw,1.2rem)] font-extrabold tabular-nums tracking-tight ${palette.value}`}>
        {value}
      </span>

      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[9px] text-[#767676] dark:text-[#a6a6a6] sm:text-[10px]">{hint ?? 'اضغط لعرض السجلات'}</span>
        <span className="flex shrink-0 items-center gap-1 text-[9px] font-bold">
          {hasChange && (
            <span className={`flex items-center gap-0.5 ${changePositive ? 'text-[#107c10] dark:text-[#7bd67b]' : 'text-[#c42b1c] dark:text-[#ff9a91]'}`}>
              {changePositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(change as number).toLocaleString('ar-EG', { maximumFractionDigits: 1 })}%
            </span>
          )}
          <ChevronLeft className="h-3 w-3 text-[#767676] transition-transform group-hover:-translate-x-0.5 dark:text-[#a6a6a6]" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
};
