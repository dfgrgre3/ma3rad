import React, { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useExecutiveDashboard } from '../../../hooks/domains/dashboard/useExecutiveDashboard';
import { useDashboardRefresh } from '../../../contexts/DashboardRefreshContext';
import { ExecutiveKpiGrid } from './ExecutiveKpiGrid';
import { ExecutiveSalesChart } from './ExecutiveSalesChart';
import { LowStockAlertsCard } from './LowStockAlertsCard';
import { ExecutiveBottomGrid } from './ExecutiveBottomGrid';
import { useTheme } from '../../../contexts/useTheme';
import { PageHeader } from '../../../components/ui/PageHeader';
import type { DateRange } from '../../../types/dashboard/executive';

const RANGES: { id: DateRange; label: string }[] = [
  { id: 'today', label: 'اليوم' },
  { id: 'week', label: 'الأسبوع' },
  { id: 'month', label: 'الشهر' },
  { id: 'year', label: 'السنة' },
];

export const ExecutiveDashboard: React.FC = () => {
  const { isDark } = useTheme();
  const {
    range,
    setRange,
    loading,
    loadError,
    kpis,
    dailySales,
    topProducts,
    recentInvoices,
    debtCustomers,
    branchData,
    lowStock,
    lastRefresh,
    refresh,
  } = useExecutiveDashboard();
  const refreshToken = useDashboardRefresh()?.refreshToken;
  const initialRef = useRef(true);
  useEffect(() => {
    if (refreshToken === undefined) return;
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }
    refresh();
  }, [refreshToken, refresh]);

  return (
    <div className={`h-full min-w-0 overflow-y-auto p-3 sm:p-4 lg:p-5 space-y-4 lg:space-y-5 ${isDark ? 'bg-primary text-white' : 'bg-surface-muted text-ink'}`}>
      {/* Header */}
      <PageHeader
        title="لوحة المعلومات التنفيذية"
        description={`آخر تحديث: ${format(lastRefresh, 'HH:mm:ss')}`}
        actions={<>
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`min-h-9 flex-1 px-2 sm:flex-none sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                range === r.id 
                  ? 'bg-primary text-white shadow-md shadow-primary/25' 
                  : isDark 
                    ? 'bg-primary hover:bg-primary text-muted' 
                    : 'bg-surface-sunken hover:bg-surface-sunken text-ink'
              }`}
            >
              {r.label}
            </button>
          ))}

          <button
            onClick={refresh}
            disabled={loading}
            className={`min-h-9 px-3 py-1.5 text-xs font-semibold rounded-lg transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isDark 
                ? 'bg-primary text-muted hover:bg-primary hover:text-white' 
                : 'bg-surface-sunken text-muted hover:text-ink hover:bg-surface-sunken'
            }`}
            title="تحديث"
          >
            تحديث
          </button>
        </>}
      />

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary animate-bounce" />
            <p className="text-sm text-muted ">جاري تحميل البيانات...</p>
          </div>
        </div>
      ) : (
        <>
          {loadError && (
            <div role="alert" className={`rounded-xl border px-4 py-3 text-sm ${
              isDark ? 'border-danger bg-danger/30 text-danger' : 'border-danger bg-danger-soft text-danger'
            }`}>
              تعذر تحميل بعض المؤشرات: {loadError}
            </div>
          )}

          <ExecutiveKpiGrid kpis={kpis} />

          <ExecutiveSalesChart dailySales={dailySales} branchData={branchData} range={range} />

          <LowStockAlertsCard lowStock={lowStock} />

          <ExecutiveBottomGrid
            topProducts={topProducts}
            recentInvoices={recentInvoices}
            debtCustomers={debtCustomers}
          />
        </>
      )}
    </div>
  );
};

export default ExecutiveDashboard;
