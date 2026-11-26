import React, { useEffect, useMemo, useState } from 'react';
import { getEffectiveBusinessType } from '../../services/domains/config/BusinessTypeService';
import { getBusinessProfile } from '../../config/businessProfiles';
import { getProfileKpiCatalog } from '../../config/profileDashboardKpis';
import { useDashboardPrefs } from '../../hooks/domains/dashboard/useDashboardPrefs';
import { AccountingService } from '../../services/domains/finance/AccountingService';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { DashboardMetricsService } from '../../services/domains/dashboard/DashboardMetricsService';
import { ProjectExecutionService } from '../../services/domains/projects/ProjectExecutionService';
import { useTheme } from '../../contexts/useTheme';

interface KpiWithValue {
  id: string;
  label: { ar: string; en: string };
  source: 'sales' | 'purchases' | 'inventory' | 'finance' | 'customers' | 'manufacturing' | 'projects';
  format?: 'number' | 'currency' | 'm2' | 'percent';
  value?: number | string;
  loading: boolean;
}

/**
 * Profile-specific KPI panel that fetches and displays actual KPI values
 * based on the active business profile's dashboard configuration.
 */
export const ProfileKpiPanel: React.FC = () => {
  const businessType = getEffectiveBusinessType();
  const profile = getBusinessProfile(businessType);
  const prefs = useDashboardPrefs();
  const kpiCatalog = useMemo(() => getProfileKpiCatalog(businessType), [businessType]);

  // User-selected KPIs (order matters); falls back to the full catalog.
  const effectiveKpis = useMemo(() => {
    if (!prefs.kpis) return kpiCatalog;
    const byId = new Map(kpiCatalog.map((kpi) => [kpi.id, kpi]));
    return prefs.kpis.map((id) => byId.get(id)).filter((kpi): kpi is NonNullable<typeof kpi> => Boolean(kpi));
  }, [kpiCatalog, prefs.kpis]);
  const [kpiValues, setKpiValues] = useState<Map<string, KpiWithValue>>(new Map());

  useEffect(() => {
    const fetchKpiValues = async () => {
      const accountingService = new AccountingService();
      const dashboardMetricsService = new DashboardMetricsService();

      // Each source fails independently so one outage doesn't blank the rest.
      const settle = <T,>(promise: Promise<T>) =>
        promise.then((value) => ({ ok: true as const, value })).catch((error) => {
          console.error('Failed to fetch KPI source:', error);
          return { ok: false as const };
        });

      const today = new Date().toISOString().split('T')[0];
      const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

      const needsExecData = effectiveKpis.some((k) => k.id === 'total_debt' || k.id === 'total_received');
      const needsProjects = effectiveKpis.some((k) => k.source === 'projects');

      const [metricsResult, execResult, projectResult] = await Promise.all([
        settle(accountingService.getDashboardMetricsAsync()),
        needsExecData
          ? settle(dashboardMetricsService.getExecutiveDashboardData(monthStart, today))
          : Promise.resolve({ ok: false as const }),
        needsProjects
          ? settle(Promise.resolve().then(() => new ProjectExecutionService().getPortfolioSummary()))
          : Promise.resolve({ ok: false as const }),
      ]);

      const metrics = metricsResult.ok ? metricsResult.value : null;
      const execData = execResult.ok ? execResult.value : null;
      const projectPortfolio = projectResult.ok ? projectResult.value : null;

      {
        const newValues = new Map<string, KpiWithValue>();

        for (const kpi of effectiveKpis) {
          // A KPI shows '—' only when every source that can feed it failed.
          const hasSource = kpi.source === 'projects'
            ? projectPortfolio !== null
            : metrics !== null
              || ((kpi.id === 'total_debt' || kpi.id === 'total_received') && execData !== null);
          if (!hasSource) {
            newValues.set(kpi.id, { ...kpi, value: '—', loading: false });
            continue;
          }

          let value: number | string = 0;

          switch (kpi.id) {
            case 'today_sales':
              value = metrics?.todaySales ?? 0;
              break;
            case 'month_sales':
              value = metrics?.monthSales ?? 0;
              break;
            case 'net_profit':
              value = metrics?.netProfit ?? 0;
              break;
            case 'inventory_value':
              value = metrics?.inventoryValuationCost ?? 0;
              break;
            case 'low_stock':
              value = metrics?.lowStockCount ?? 0;
              break;
            case 'receivables':
              value = metrics?.totalReceivables ?? 0;
              break;
            case 'today_purchases':
              value = metrics?.todayPurchases ?? 0;
              break;
            case 'gross_profit':
              value = metrics?.grossProfit ?? 0;
              break;
            case 'profit_margin':
              value = metrics?.profitMargin ?? 0;
              break;
            case 'avg_order':
              value = metrics?.averageOrderValue ?? 0;
              break;
            case 'total_debt':
              value = execData?.totalDebt ?? metrics?.totalReceivables ?? 0;
              break;
            case 'total_received':
              value = execData?.totalReceived ?? 0;
              break;
            case 'active_projects':
              value = projectPortfolio?.filter((p) => p.status === 'ACTIVE').length ?? 0;
              break;
            case 'overdue_projects':
              value = projectPortfolio?.filter((p) => p.isOverdue).length ?? 0;
              break;
            case 'contract_value_total':
              value = projectPortfolio?.reduce((s, p) => s + (Number(p.contractValue) || 0), 0) ?? 0;
              break;
            case 'certified_amount_total':
              value = projectPortfolio?.reduce((s, p) => s + (Number(p.certifiedAmount) || 0), 0) ?? 0;
              break;
            case 'collection_gap_total':
              value = projectPortfolio?.reduce((s, p) => s + (Number(p.collectionGap) || 0), 0) ?? 0;
              break;
            case 'actual_cost_total':
              value = projectPortfolio?.reduce((s, p) => s + (Number(p.actualCost) || 0), 0) ?? 0;
              break;
            default:
              // Try to match by source
              if (kpi.source === 'sales' && (metrics?.todaySales ?? 0) > 0) {
                value = metrics?.todaySales ?? 0;
              } else if (kpi.source === 'purchases' && (metrics?.todayPurchases ?? 0) > 0) {
                value = metrics?.todayPurchases ?? 0;
              } else if (kpi.source === 'finance' && (metrics?.netProfit ?? 0) !== 0) {
                value = metrics?.netProfit ?? 0;
              } else if (kpi.source === 'inventory') {
                value = metrics?.inventoryValuationCost ?? metrics?.lowStockCount ?? 0;
              } else if (kpi.source === 'projects' && projectPortfolio?.length) {
                value = projectPortfolio.reduce((s, p) => s + (Number(p.contractValue) || 0), 0);
              }
          }

          // Format the value based on format type
          let formattedValue: string;
          if (kpi.format === 'currency') {
            formattedValue = CeramicMath.formatCurrency(Number(value));
          } else if (kpi.format === 'percent') {
            formattedValue = `${Number(value).toFixed(1)}%`;
          } else if (kpi.format === 'm2') {
            formattedValue = `${Number(value).toLocaleString('ar-EG')} م²`;
          } else {
            formattedValue = Number(value).toLocaleString('ar-EG');
          }

          newValues.set(kpi.id, { ...kpi, value: formattedValue, loading: false });
        }

        setKpiValues(newValues);
      }
    };

    fetchKpiValues();
  }, [businessType, effectiveKpis]);

  const { isDark } = useTheme();

  if (effectiveKpis.length === 0) return null;
  
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${isDark ? 'bg-primary border-line-strong' : 'bg-surface border-line'}`}>
      <div className="mb-2 text-xs font-bold text-muted ">
        مؤشرات النشاط: {profile.name.ar}
      </div>
      <div className="flex flex-wrap gap-2">
        {effectiveKpis.map((kpi) => {
          const kpiData = kpiValues.get(kpi.id);
          const isLoading = kpiData?.loading ?? true;
          const displayValue = kpiData?.value ?? (isLoading ? '...' : '—');
          
          return (
            <span
              key={kpi.id}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                isLoading 
                  ? 'animate-pulse bg-surface-sunken border-line text-muted'
                  : 'bg-surface-muted border-line text-ink '
              }`}
              title={`${kpi.source} · ${kpi.format ?? 'number'}`}
            >
              <span className="mr-1">{kpi.label.ar}</span>
              <span className="font-mono text-[10px] opacity-80">{displayValue}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};
