import React from 'react';
import { format } from 'date-fns';
import { useExecutiveDashboard } from './executive/useExecutiveDashboard';
import { ExecutiveKpiGrid } from './executive/ExecutiveKpiGrid';
import { ExecutiveSalesChart } from './executive/ExecutiveSalesChart';
import { LowStockAlertsCard } from './executive/LowStockAlertsCard';
import { ExecutiveBottomGrid } from './executive/ExecutiveBottomGrid';
import type { DateRange } from './executive/types';

const RANGES: { id: DateRange; label: string }[] = [
  { id: 'today', label: 'اليوم' },
  { id: 'week', label: 'الأسبوع' },
  { id: 'month', label: 'الشهر' },
  { id: 'year', label: 'السنة' },
];

export const ExecutiveDashboard: React.FC = () => {
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

  return (
    <div className="h-full min-w-0 overflow-y-auto bg-slate-50 text-slate-900 p-3 sm:p-4 lg:p-5 space-y-4 lg:space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex min-w-0 items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-black text-slate-900">لوحة المعلومات التنفيذية</h1>
          <p className="text-xs text-slate-500 mt-0.5">آخر تحديث: {format(lastRefresh, 'HH:mm:ss')}</p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`min-h-9 flex-1 px-2 sm:flex-none sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                range === r.id ? 'bg-sky-600 text-white shadow-md shadow-sky-600/25' : 'bg-slate-100 hover:bg-slate-200'
              }`}
            >
              {r.label}
            </button>
          ))}

          <button
            onClick={refresh}
            disabled={loading}
            className="min-h-9 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition disabled:cursor-not-allowed disabled:opacity-50"
            title="تحديث"
          >
            تحديث
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600 animate-bounce" />
            <p className="text-sm text-slate-500">جاري تحميل البيانات...</p>
          </div>
        </div>
      ) : (
        <>
          {loadError && (
            <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              تعذر تحميل بعض المؤشرات: {loadError}
            </div>
          )}

          <ExecutiveKpiGrid kpis={kpis} />

          <ExecutiveSalesChart dailySales={dailySales} branchData={branchData} />

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
