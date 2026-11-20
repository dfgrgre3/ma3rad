import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Clock, Package } from 'lucide-react';
import type { DashboardMetrics } from '../../services/domains/finance/AccountingService';

interface AttentionRequiredSectionProps {
  metrics: DashboardMetrics;
}

export const AttentionRequiredSection: React.FC<AttentionRequiredSectionProps> = ({ metrics }) => {
  if (!(metrics.lowStockCount > 0 || metrics.outOfStockCount > 0 || metrics.urgentDebtsCount > 0)) return null;

  return (
    <section aria-label="يتطلب انتباهك" className="relative overflow-hidden rounded-xl border border-warning-border bg-[#fffdf5] p-3.5 dark:border-warning/70 dark:bg-warning/20">
      <div className="absolute inset-y-0 right-0 w-1 bg-warning" />
      <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-ink ">
        <AlertTriangle className="h-4 w-4 text-warning" /> يتطلب انتباهك
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { label: 'أصناف عند حد إعادة الطلب', value: metrics.lowStockCount, to: '/inventory/reorder-planning', tone: 'text-warning ', icon: Package },
          { label: 'أصناف نفد مخزونها', value: metrics.outOfStockCount, to: '/inventory', tone: 'text-danger ', icon: AlertTriangle },
          { label: 'ديون متأخرة لأكثر من 30 يوماً', value: metrics.urgentDebtsCount, to: '/finance/debts', tone: 'text-warning ', icon: Clock },
        ].filter(({ value }) => value > 0).map(({ label, value, to, tone, icon: Icon }) => (
          <Link key={label} to={to} className="flex items-center gap-2.5 rounded-lg border border-line/80 bg-surface/80 px-3 py-2.5 transition hover:border-warning hover:bg-surface dark:border-line-strong dark:bg-primary/70 dark:hover:border-warning">
            <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink-secondary ">{label}</span>
            <span className={`text-base font-black tabular-nums ${tone}`}>{value}</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted" />
          </Link>
        ))}
      </div>
    </section>
  );
};
