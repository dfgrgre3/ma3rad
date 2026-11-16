import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useTheme } from '../../../contexts/useTheme';
import type { KPI } from '../../../types/dashboard/executive';

interface Props {
  kpis: KPI[];
}

export const ExecutiveKpiGrid: React.FC<Props> = ({ kpis }) => {
  const { isDark } = useTheme();
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className="grid min-w-0 grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div key={kpi.label} className={`min-w-0 rounded-xl border p-3 sm:p-4 flex flex-col gap-2 ${kpi.bg} ${isDark ? 'border-slate-700 bg-slate-800/50' : ''}`}>
            <div className="flex items-center justify-between">
              <Icon className={`w-5 h-5 ${kpi.color}`} />
              {kpi.trend === 'up' && (
                <div className="flex items-center gap-1 text-emerald-500 text-[10px] font-bold">
                  <ArrowUpRight className="w-3 h-3" />
                  {kpi.trendValue}
                </div>
              )}
              {kpi.trend === 'down' && (
                <div className="flex items-center gap-1 text-rose-500 text-[10px] font-bold">
                  <ArrowDownRight className="w-3 h-3" />
                  {kpi.trendValue}
                </div>
              )}
            </div>
            <div>
              <div className={`break-words text-base sm:text-xl font-black leading-tight ${textPrimary}`}>{kpi.value}</div>
              <div className={`text-[11px] font-medium mt-0.5 ${textSecondary}`}>{kpi.label}</div>
              {kpi.sub && <div className={`text-[10px] mt-0.5 ${textSecondary}`}>{kpi.sub}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};
