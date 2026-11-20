import React, { useEffect, useState } from 'react';
import { ActivityDashboardService, type ActivityDashboardData } from '../../../services/domains/dashboard/ActivityDashboardService';
import { getActivityDashboardSpec } from '../../../config/activityDashboard';

const service = new ActivityDashboardService();

/**
 * Compact activity-KPI strip rendered above the main landing tabs of the
 * sales / inventory / purchasing hubs. Shows the first tiles produced by
 * ActivityDashboardService for the selected activity — the same numbers the
 * dedicated dashboard panel shows, condensed to a single row.
 */
export const ActivityHubSummary: React.FC<{ maxTiles?: number }> = ({ maxTiles = 6 }) => {
  const [data, setData] = useState<ActivityDashboardData | null>(null);

  useEffect(() => {
    let cancelled = false;
    service.getDashboard().then((d) => { if (!cancelled) setData(d); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (!data || data.tiles.length === 0) return null;
  const spec = getActivityDashboardSpec();
  const tiles = data.tiles.slice(0, maxTiles);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--win-border)] bg-[var(--win-surface)] px-3 py-2">
      <span className="text-[11px] font-black text-[var(--win-accent-readable)]">{spec.navLabel}</span>
      {tiles.map((tile) => (
        <span
          key={tile.id}
          className="inline-flex items-baseline gap-1.5 rounded-lg bg-[var(--win-surface-sunken)] px-2.5 py-1 text-[11px]"
          title={tile.hint}
        >
          <span className="font-semibold text-[var(--win-text-secondary)]">{tile.label}</span>
          <span className="font-mono font-bold text-[var(--win-text)]" dir="ltr">{tile.value}</span>
        </span>
      ))}
    </div>
  );
};

export default ActivityHubSummary;
