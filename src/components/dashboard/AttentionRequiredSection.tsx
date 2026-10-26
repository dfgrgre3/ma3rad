import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Clock, Package } from 'lucide-react';
import type { DashboardMetrics } from '../../services/AccountingService';

interface AttentionRequiredSectionProps {
  metrics: DashboardMetrics;
}

export const AttentionRequiredSection: React.FC<AttentionRequiredSectionProps> = ({ metrics }) => {
  if (!(metrics.lowStockCount > 0 || metrics.outOfStockCount > 0 || metrics.urgentDebtsCount > 0)) return null;

  return (
    <section aria-label="يتطلب انتباهك" className="relative overflow-hidden rounded-xl border border-amber-200 bg-[#fffdf5] p-3.5 dark:border-amber-900/70 dark:bg-amber-950/20">
      <div className="absolute inset-y-0 right-0 w-1 bg-amber-400" />
      <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-slate-800 dark:text-slate-100">
        <AlertTriangle className="h-4 w-4 text-amber-600" /> يتطلب انتباهك
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { label: 'أصناف عند حد إعادة الطلب', value: metrics.lowStockCount, to: '/inventory/reorder-planning', tone: 'text-amber-800 dark:text-amber-300', icon: Package },
          { label: 'أصناف نفد مخزونها', value: metrics.outOfStockCount, to: '/inventory', tone: 'text-rose-700 dark:text-rose-300', icon: AlertTriangle },
          { label: 'ديون متأخرة لأكثر من 30 يوماً', value: metrics.urgentDebtsCount, to: '/finance/debts', tone: 'text-orange-800 dark:text-orange-300', icon: Clock },
        ].filter(({ value }) => value > 0).map(({ label, value, to, tone, icon: Icon }) => (
          <Link key={label} to={to} className="flex items-center gap-2.5 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2.5 transition hover:border-amber-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-amber-800">
            <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-600 dark:text-slate-300">{label}</span>
            <span className={`text-base font-black tabular-nums ${tone}`}>{value}</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-300" />
          </Link>
        ))}
      </div>
    </section>
  );
};
