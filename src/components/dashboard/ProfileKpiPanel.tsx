import React, { useEffect, useState } from 'react';
import { getEffectiveBusinessType } from '../../services/domains/config/BusinessTypeService';
import { getBusinessProfile, getProfileDashboard } from '../../config/businessProfiles';
import { AccountingService } from '../../services/domains/finance/AccountingService';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { DashboardMetricsService } from '../../services/domains/dashboard/DashboardMetricsService';
import { useTheme } from '../../contexts/useTheme';

interface KpiWithValue {
  id: string;
  label: { ar: string; en: string };
  source: 'sales' | 'inventory' | 'finance' | 'customers' | 'manufacturing' | 'restaurant';
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
  const dashboardConfig = getProfileDashboard(businessType);
  const kpis = dashboardConfig?.kpis ?? [];

  // Default KPIs if profile doesn't define any
  const defaultKpis = [
    { id: 'today_sales', label: { ar: 'مبيعات اليوم', en: 'Today Sales' }, source: 'sales' as const, format: 'currency' as const },
    { id: 'month_sales', label: { ar: 'مبيعات الشهر', en: 'Month Sales' }, source: 'sales' as const, format: 'currency' as const },
    { id: 'net_profit', label: { ar: 'صافي الربح', en: 'Net Profit' }, source: 'finance' as const, format: 'currency' as const },
    { id: 'inventory_value', label: { ar: 'قيمة المخزون', en: 'Inventory Value' }, source: 'inventory' as const, format: 'currency' as const },
    { id: 'low_stock', label: { ar: 'نواقص المخزون', en: 'Low Stock Items' }, source: 'inventory' as const, format: 'number' as const },
    { id: 'receivables', label: { ar: 'ديون العملاء', en: 'Customer Receivables' }, source: 'finance' as const, format: 'currency' as const },
  ];

  const effectiveKpis = kpis.length > 0 ? kpis : defaultKpis;
  const [kpiValues, setKpiValues] = useState<Map<string, KpiWithValue>>(new Map());

  useEffect(() => {
    const fetchKpiValues = async () => {
      const accountingService = new AccountingService();
      const dashboardMetricsService = new DashboardMetricsService();
      
      try {
        // Fetch data for different sources
        const today = new Date().toISOString().split('T')[0];
        const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
        
        // Get metrics from AccountingService
        const metrics = accountingService.getDashboardMetrics();
        
        // Get executive data for more KPIs
        const execData = await dashboardMetricsService.getExecutiveDashboardData(monthStart, today);

        const newValues = new Map<string, KpiWithValue>();
        
        for (const kpi of effectiveKpis) {
          let value: number | string = 0;
          
          switch (kpi.id) {
            case 'today_sales':
              value = metrics.todaySales;
              break;
            case 'month_sales':
              value = metrics.monthSales;
              break;
            case 'net_profit':
              value = metrics.netProfit;
              break;
            case 'inventory_value':
              value = metrics.inventoryValuationCost ?? 0;
              break;
            case 'low_stock':
              value = metrics.lowStockCount;
              break;
            case 'receivables':
              value = metrics.totalReceivables;
              break;
            case 'today_purchases':
              value = metrics.todayPurchases;
              break;
            case 'gross_profit':
              value = metrics.grossProfit;
              break;
            case 'profit_margin':
              value = metrics.profitMargin;
              break;
            case 'avg_order':
              value = metrics.averageOrderValue;
              break;
            case 'total_debt':
              value = execData?.totalDebt ?? metrics.totalReceivables;
              break;
            case 'total_received':
              value = execData?.totalReceived ?? 0;
              break;
            default:
              // Try to match by source
              if (kpi.source === 'sales' && metrics.todaySales > 0) {
                value = metrics.todaySales;
              } else if (kpi.source === 'finance' && metrics.netProfit !== 0) {
                value = metrics.netProfit;
              } else if (kpi.source === 'inventory') {
                value = metrics.inventoryValuationCost ?? metrics.lowStockCount;
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
      } catch (error) {
        console.error('Failed to fetch KPI values:', error);
        // Set all KPIs as loaded with error state
        const newValues = new Map<string, KpiWithValue>();
        for (const kpi of effectiveKpis) {
          newValues.set(kpi.id, { ...kpi, value: '—', loading: false });
        }
        setKpiValues(newValues);
      }
    };

    fetchKpiValues();
  }, [businessType, effectiveKpis]);

  if (effectiveKpis.length === 0) return null;

  const { isDark } = useTheme();
  
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className="mb-2 text-xs font-bold text-slate-500 dark:text-slate-400">
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
                  ? 'animate-pulse bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500'
                  : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
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
