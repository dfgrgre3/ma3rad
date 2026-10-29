import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { KPI } from './types';

interface Props {
  kpis: KPI[];
}

export const ExecutiveKpiGrid: React.FC<Props> = ({ kpis }) => {
  return (
    <div className="grid min-w-0 grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div key={kpi.label} className={`min-w-0 rounded-xl border p-3 sm:p-4 ${kpi.bg} flex flex-col gap-2`}>
            <div className="flex items-center justify-between">
              <Icon className={`w-5 h-5 ${kpi.color}`} />
              {kpi.trend === 'up' && (
                <div className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold">
                  <ArrowUpRight className="w-3 h-3" />
                  {kpi.trendValue}
                </div>
              )}
              {kpi.trend === 'down' && (
                <div className="flex items-center gap-1 text-rose-600 text-[10px] font-bold">
                  <ArrowDownRight className="w-3 h-3" />
                  {kpi.trendValue}
                </div>
              )}
            </div>
            <div>
              <div className="break-words text-base sm:text-xl font-black text-slate-900 leading-tight">{kpi.value}</div>
              <div className="text-[11px] text-slate-500 font-medium mt-0.5">{kpi.label}</div>
              {kpi.sub && <div className="text-[10px] text-slate-500 mt-0.5">{kpi.sub}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};
