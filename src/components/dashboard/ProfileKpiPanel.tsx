import React from 'react';
import { getEffectiveBusinessType } from '../../services/domains/config/BusinessTypeService';
import { getBusinessProfile } from '../../config/businessProfiles';

/**
 * Phase 3 wiring proof: renders the KPIs declared by the active business
 * profile so the dashboard visibly reflects the chosen activity.
 */
export const ProfileKpiPanel: React.FC = () => {
  const profile = getBusinessProfile(getEffectiveBusinessType());
  const kpis = profile.dashboard?.kpis ?? [];
  if (kpis.length === 0) return null;

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-2 text-xs font-bold text-slate-500 dark:text-slate-400">
        مؤشرات النشاط: {profile.name.ar}
      </div>
      <div className="flex flex-wrap gap-2">
        {kpis.map((kpi) => (
          <span
            key={kpi.id}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            title={`${kpi.source} · ${kpi.format ?? 'number'}`}
          >
            {kpi.label.ar}
          </span>
        ))}
      </div>
    </div>
  );
};
