import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Building2, RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import {
  ActivityDashboardService,
  type ActivityDashboardData,
  type ActivityListSection,
} from '../../../services/domains/dashboard/ActivityDashboardService';
import { useDashboardRefresh } from '../../../contexts/DashboardRefreshContext';
import { useTheme } from '../../../contexts/useTheme';
import { BranchAccessService } from '../../../services/domains/auth/BranchAccessService';

const service = new ActivityDashboardService();

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { isDark } = useTheme();
  return (
    <div className={`min-w-0 rounded-xl border px-3 py-2.5 ${isDark ? 'border-line-strong bg-primary/60' : 'border-line bg-surface'}`}>
      <div className="truncate text-[11px] font-semibold text-muted ">{label}</div>
      <div className="mt-0.5 truncate text-lg font-bold text-ink " dir="ltr">{value}</div>
      {hint && <div className="truncate text-[10px] text-muted ">{hint}</div>}
    </div>
  );
}

function ListBlock({ section }: { section: ActivityListSection }) {
  const { isDark } = useTheme();
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${isDark ? 'border-line-strong bg-primary/60' : 'border-line bg-surface'}`}>
      <div className="mb-2 text-xs font-bold text-ink-secondary ">{section.title}</div>
      {section.rows.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-muted ">{section.emptyText}</p>
      ) : (
        <ul className="divide-y divide-line-strong dark:divide-primary/60">
          {section.rows.map((row, i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-1.5 text-xs">
              <span className="min-w-0 truncate font-semibold text-ink ">{row.label}</span>
              <span className="shrink-0 text-muted ">
                <span className="font-mono font-bold text-ink " dir="ltr">{row.value}</span>
                {row.meta && <span className="mr-1.5 text-[10px] opacity-70">{row.meta}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Activity-specific dashboard panel. The data shape is normalized by
 * ActivityDashboardService so each business activity renders its own KPIs,
 * progress bars and lists (hotel occupancy, workshop bays, school
 * attendance, production orders, etc.).
 */
export const ActivityDashboardPanel: React.FC = () => {
  const [data, setData] = useState<ActivityDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState('');
  const refreshToken = useDashboardRefresh()?.refreshToken;

  // الفروع المتاحة للمستخدم — يُعرض المنتقي فقط عند وجود أكثر من فرع.
  const branches = useMemo(() => {
    try {
      return new BranchAccessService().getSelectableBranches();
    } catch {
      return [];
    }
  }, []);
  const showBranchFilter = branches.length > 1;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await service.getDashboard(undefined, branchId ? { branchId } : undefined);
      setData(result);
      if (result.warnings && result.warnings.length > 0) {
        console.warn('Activity dashboard warnings:', result.warnings);
      }
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل مؤشرات النشاط');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-xs font-semibold text-muted">
        <RefreshCw className="h-4 w-4 animate-spin" /> جاري تحميل مؤشرات النشاط...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-danger-border bg-danger-soft p-6 text-center dark:bg-danger/30" role="alert">
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-danger" />
        <p className="text-xs font-bold text-danger ">{error || 'لا توجد بيانات'}</p>
        <button type="button" onClick={load} className="mt-3 rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-white hover:bg-danger">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      {showBranchFilter && (
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted" />
          <label htmlFor="activity-branch-filter" className="text-[11px] font-semibold text-muted">الفرع</label>
          <select
            id="activity-branch-filter"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-semibold text-ink focus:border-primary focus:outline-none"
          >
            <option value="">الافتراضي</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
      {data.warnings && data.warnings.length > 0 && (
        <div className="rounded-xl border border-warning-border bg-warning-soft px-3 py-2 text-[11px] font-semibold text-warning dark:bg-warning/20" role="status">
          تعذر تحميل بعض المؤشرات: {data.warnings.join(' · ')}
        </div>
      )}
      {data.tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {data.tiles.map((tile) => (
            <Tile key={tile.id} label={tile.label} value={tile.value} hint={tile.hint} />
          ))}
        </div>
      )}

      {data.hourly && data.hourly.some((point) => point.revenue > 0) && (
        <div className="rounded-xl border border-line bg-surface p-3 dark:bg-primary/60">
          <div className="mb-2 text-xs font-bold text-ink-secondary ">المبيعات بالساعة (اليوم)</div>
          <div className="h-40 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 160 }}>
              <BarChart data={data.hourly} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cerami-chart-grid)" />
                <XAxis
                  dataKey="hour"
                  stroke="var(--cerami-muted)"
                  fontSize={9}
                  tickLine={false}
                  interval={2}
                  tickFormatter={(value: number) => `${String(value).padStart(2, '0')}:00`}
                />
                <YAxis stroke="var(--cerami-muted)" fontSize={9} tickLine={false} width={44} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--cerami-tooltip-surface)', borderColor: 'var(--cerami-tooltip-border)', color: 'var(--cerami-text)', borderRadius: '6px', fontSize: '11px', padding: '4px 8px' }}
                  labelFormatter={(value: unknown) => `${String(value).padStart(2, '0')}:00`}
                  formatter={(value: unknown) => [CeramicMath.formatCurrency(Number(value)), 'المبيعات']}
                />
                <Bar isAnimationActive={false} dataKey="revenue" fill="var(--win-accent)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {data.progress.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {data.progress.map((p, i) => (
            <div key={i} className="rounded-xl border border-line bg-surface p-3 dark:bg-primary/60">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-bold text-ink-secondary ">{p.label}</span>
                <span className="font-mono font-bold text-ink " dir="ltr">{p.percent.toFixed(0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-sunken ">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, p.percent))}%` }} />
              </div>
              {p.caption && <div className="mt-1 text-[10px] text-muted ">{p.caption}</div>}
            </div>
          ))}
        </div>
      )}

      {data.sections.length > 0 && (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {data.sections.map((section) => (
            <ListBlock key={section.id} section={section} />
          ))}
        </div>
      )}

      {data.tiles.length === 0 && data.sections.length === 0 && (
        <div className="flex items-center gap-2 py-6 text-xs text-muted">
          <BarChart3 className="h-4 w-4" /> لا توجد مؤشرات مخصصة لهذا النشاط بعد — راجع قسم «نبض حركة اليوم» للبيانات العامة.
        </div>
      )}
    </div>
  );
};

export default ActivityDashboardPanel;
