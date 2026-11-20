import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { FinanceEnterpriseService } from '../../../services/domains/finance/FinanceEnterpriseService';
import type { CashForecastDaySummary } from '../../../types/finance';
import { useToast } from '../../../components/ui/Toast';

export const CashFlowForecastPage: React.FC = () => {
  const service = useMemo(() => new FinanceEnterpriseService(), []);
  const toast = useToast();

  const [daysHorizon, setDaysHorizon] = useState<number>(60);
  const [forecastData, setForecastData] = useState<{
    currentCashBalance: number;
    projectedEndBalance: number;
    totalExpectedInflow: number;
    totalExpectedOutflow: number;
    days: CashForecastDaySummary[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<CashForecastDaySummary | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    try {
      const data = service.getCashFlowForecast(daysHorizon);
      setForecastData(data);
      if (data.days.length > 0) {
        setSelectedDay(data.days[0]);
      }
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحميل توقعات التدفق النقدي.');
    } finally {
      setLoading(false);
    }
  }, [service, toast, daysHorizon, setLoading, setForecastData, setSelectedDay]);

  useEffect(() => {
    loadData();
  }, [loadData, daysHorizon]);

  const hasNegativeDip = useMemo(() => {
    return forecastData?.days.some((d) => d.projectedClosingBalance < 0) || false;
  }, [forecastData]);

  return (
    <div className="p-3 lg:p-4 bg-surface-muted min-h-0 text-ink space-y-4">
      {/* Header */}
      <div className="bg-surface px-5 py-3 rounded-2xl border border-line shadow-sm">
        <PageHeader
          icon={<TrendingUp className="h-5 w-5" />}
          title="توقع التدفقات النقدية والسيولة المستقبلية"
          description="نموذج تنبؤي استباقي للسيولة المالية بناءً على مواعيد استحقاق الفواتير والشيكات والأقساط والالتزامات"
          actions={<>
            <div className="flex items-center bg-surface-sunken rounded-xl p-1 border border-line text-xs font-semibold">
              <button
                onClick={() => setDaysHorizon(30)}
                className={`px-3 py-1.5 rounded-lg transition ${daysHorizon === 30 ? 'bg-surface text-ink shadow-sm font-bold' : 'text-ink-secondary'}`}
              >
                30 يوم
              </button>
              <button
                onClick={() => setDaysHorizon(60)}
                className={`px-3 py-1.5 rounded-lg transition ${daysHorizon === 60 ? 'bg-surface text-ink shadow-sm font-bold' : 'text-ink-secondary'}`}
              >
                60 يوم
              </button>
              <button
                onClick={() => setDaysHorizon(90)}
                className={`px-3 py-1.5 rounded-lg transition ${daysHorizon === 90 ? 'bg-surface text-ink shadow-sm font-bold' : 'text-ink-secondary'}`}
              >
                90 يوم
              </button>
            </div>

            <button
              onClick={loadData}
              className="p-2.5 text-ink-secondary hover:text-ink bg-surface-sunken hover:bg-surface-sunken rounded-xl transition"
              title="تحديث الحسابات"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </>}
        />
      </div>

      {/* Risk Alert Banner if negative cash projected */}
      {hasNegativeDip && (
        <div className="bg-danger-soft border border-danger-border p-4 rounded-2xl flex items-center gap-3 text-danger text-xs">
          <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
          <div>
            <span className="font-bold block">تحذير سيولة نقدية: عجز نقدي متوقع خلال الفترة القادمة</span>
            <span>
              تشير التوقعات إلى هبوط رصيد النقدية والبنك دون الصفر في بعض الأيام نتيجة تقارب التزامات الموردين والشيكات الصادرة.
            </span>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-xl border border-line">
          <span className="text-xs text-muted block">رصيد السيولة الحاضرة الآن</span>
          <span className="text-lg font-bold font-mono text-ink">
            {(forecastData?.currentCashBalance || 0).toLocaleString()} ج.م
          </span>
          <span className="text-[10px] text-muted block mt-1">إجمالي الخزائن + البنوك</span>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line">
          <span className="text-xs text-muted block">التدفقات الداخلة المتوقعة</span>
          <span className="text-lg font-bold font-mono text-success">
            +{(forecastData?.totalExpectedInflow || 0).toLocaleString()} ج.م
          </span>
          <span className="text-[10px] text-muted block mt-1">تحصيلات عملاء + شيكات واردة</span>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line">
          <span className="text-xs text-muted block">التدفقات الخارجة المتوقعة</span>
          <span className="text-lg font-bold font-mono text-danger">
            -{(forecastData?.totalExpectedOutflow || 0).toLocaleString()} ج.م
          </span>
          <span className="text-[10px] text-muted block mt-1">سداد موردين + شيكات صادرة</span>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line">
          <span className="text-xs text-muted block">الرصيد التقديري في نهاية الأجل</span>
          <span
            className={`text-lg font-bold font-mono ${
              (forecastData?.projectedEndBalance || 0) >= 0 ? 'text-success' : 'text-danger'
            }`}
          >
            {(forecastData?.projectedEndBalance || 0).toLocaleString()} ج.م
          </span>
          <span className="text-[10px] text-muted block mt-1">بعد {daysHorizon} يوم من الآن</span>
        </div>
      </div>

      {/* Forecast Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Timeline Calendar Stream */}
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-line shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">الجدول الزمني لحركات الاستحقاق اليومية</h2>
            <span className="text-xs text-muted">انقر على أي يوم لاستعراض تفاصيل المستندات المستحقة</span>
          </div>

          <div className="flex-1 overflow-auto max-h-[500px]">
            {loading ? (
              <div className="p-12 flex justify-center text-muted">
                <Loader2 className="w-6 h-6 animate-spin text-success ml-2" />
                <span>جاري محاكاة وتجميع التدفقات...</span>
              </div>
            ) : !forecastData?.days.length ? (
              <div className="p-12 text-center text-muted text-xs">
                لا توجد حركات استحقاق آجلة مسجلة خلال فترة {daysHorizon} يوم القادمة.
              </div>
            ) : (
              <DataTable
                ariaLabel="التدفقات المتوقعة يومياً"
                rows={forecastData.days}
                rowKey={(day: any) => day.date}
                onRowClick={(day: any) => setSelectedDay(day)}
                stickyHeader
                dense
                tableClassName="text-xs"
                rowClassName={(day: any) => {
                  const isSelected = selectedDay?.date === day.date;
                  const isDeficit = day.projectedClosingBalance < 0;
                  return isSelected ? 'bg-success-soft/70 font-bold' : isDeficit ? 'bg-danger-soft/40 hover:bg-danger-soft/70' : 'hover:bg-surface-muted';
                }}
                columns={[
                  { key: 'date', header: 'تاريخ الاستحقاق', render: (day: any) => <span className="font-mono font-bold text-ink">{day.date}</span> },
                  { key: 'in', header: 'وارد متوقع (+)', render: (day: any) => <span className="font-mono font-bold text-success">{day.inflows > 0 ? `+${day.inflows.toLocaleString()}` : '-'}</span> },
                  { key: 'out', header: 'صادر متوقع (-)', render: (day: any) => <span className="font-mono font-bold text-danger">{day.outflows > 0 ? `-${day.outflows.toLocaleString()}` : '-'}</span> },
                  {
                    key: 'net', header: 'صافي اليوم',
                    render: (day: any) => <span className={`font-mono font-semibold ${day.net >= 0 ? 'text-success' : 'text-danger'}`}>{day.net.toLocaleString()}</span>,
                  },
                  {
                    key: 'closing', header: 'الرصيد التراكمي المتوقع',
                    render: (day: any) => <span className={`font-mono font-bold ${day.projectedClosingBalance >= 0 ? 'text-ink' : 'text-danger font-black'}`}>{day.projectedClosingBalance.toLocaleString()} ج.م</span>,
                  },
                  {
                    key: 'items', header: 'عدد البنود', align: 'center',
                    render: (day: any) => <span className="rounded bg-surface-sunken px-2 py-0.5 font-semibold text-[10px]">{day.items.length} بند</span>,
                  },
                ]}
              />
            )}
          </div>
        </div>

        {/* Right Col: Selected Day Item Details */}
        <div className="bg-surface p-5 rounded-2xl border border-line shadow-sm space-y-4">
          <div className="border-b border-line pb-3">
            <span className="text-xs text-muted block">تفاصيل استحقاقات يوم:</span>
            <h3 className="text-base font-bold text-ink font-mono mt-0.5">
              {selectedDay ? selectedDay.date : 'اختر يوماً من الجدول'}
            </h3>
          </div>

          {!selectedDay ? (
            <p className="text-xs text-muted">حدد تاريخاً لمشاهدة تفاصيل الفواتير والشيكات المستحقة فيه.</p>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-surface-muted rounded-xl space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted">إجمالي الوارد:</span>
                  <span className="font-bold text-success font-mono">+{selectedDay.inflows.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">إجمالي الصادر:</span>
                  <span className="font-bold text-danger font-mono">-{selectedDay.outflows.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-line font-bold">
                  <span>صافي الرصيد بنهاية اليوم:</span>
                  <span className={selectedDay.projectedClosingBalance >= 0 ? 'text-ink font-mono' : 'text-danger font-mono font-black'}>
                    {selectedDay.projectedClosingBalance.toLocaleString()} ج.م
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-ink block">المستندات المستحقة:</span>
                <div className="space-y-2 max-h-72 overflow-auto">
                  {selectedDay.items.map((it) => {
                    const isInflow = it.type === 'INFLOW';
                    return (
                      <div
                        key={it.id}
                        className="p-2.5 rounded-xl border border-line bg-surface shadow-xs flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-ink block">{it.description}</span>
                          <span className="text-[10px] text-muted">{it.category}</span>
                        </div>
                        <span className={`font-mono font-bold ${isInflow ? 'text-success' : 'text-danger'}`}>
                          {isInflow ? '+' : '-'}{it.amount.toLocaleString()} ج.م
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
