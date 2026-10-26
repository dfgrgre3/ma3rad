import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  RefreshCw,
  Loader2,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle,
  Wallet,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import { FinanceEnterpriseService } from '../../services/FinanceEnterpriseService';
import type { CashForecastDaySummary } from '../../types/finance';
import { useToast } from '../../components/ui/Toast';

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

  const loadData = () => {
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
  };

  useEffect(() => {
    loadData();
  }, [daysHorizon]);

  const hasNegativeDip = useMemo(() => {
    return forecastData?.days.some((d) => d.projectedClosingBalance < 0) || false;
  }, [forecastData]);

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-slate-900 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">توقع التدفقات النقدية والسيولة المستقبلية</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              نموذج تنبؤي استباقي للسيولة المالية بناءً على مواعيد استحقاق الفواتير والشيكات والأقساط والالتزامات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setDaysHorizon(30)}
              className={`px-3 py-1.5 rounded-lg transition ${daysHorizon === 30 ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600'}`}
            >
              30 يوم
            </button>
            <button
              onClick={() => setDaysHorizon(60)}
              className={`px-3 py-1.5 rounded-lg transition ${daysHorizon === 60 ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600'}`}
            >
              60 يوم
            </button>
            <button
              onClick={() => setDaysHorizon(90)}
              className={`px-3 py-1.5 rounded-lg transition ${daysHorizon === 90 ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600'}`}
            >
              90 يوم
            </button>
          </div>

          <button
            onClick={loadData}
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            title="تحديث الحسابات"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Risk Alert Banner if negative cash projected */}
      {hasNegativeDip && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center gap-3 text-rose-800 text-xs">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
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
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-500 block">رصيد السيولة الحاضرة الآن</span>
          <span className="text-lg font-bold font-mono text-slate-900">
            {(forecastData?.currentCashBalance || 0).toLocaleString()} ج.م
          </span>
          <span className="text-[10px] text-slate-400 block mt-1">إجمالي الخزائن + البنوك</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-500 block">التدفقات الداخلة المتوقعة</span>
          <span className="text-lg font-bold font-mono text-emerald-600">
            +{(forecastData?.totalExpectedInflow || 0).toLocaleString()} ج.م
          </span>
          <span className="text-[10px] text-slate-400 block mt-1">تحصيلات عملاء + شيكات واردة</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-500 block">التدفقات الخارجة المتوقعة</span>
          <span className="text-lg font-bold font-mono text-rose-600">
            -{(forecastData?.totalExpectedOutflow || 0).toLocaleString()} ج.م
          </span>
          <span className="text-[10px] text-slate-400 block mt-1">سداد موردين + شيكات صادرة</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-500 block">الرصيد التقديري في نهاية الأجل</span>
          <span
            className={`text-lg font-bold font-mono ${
              (forecastData?.projectedEndBalance || 0) >= 0 ? 'text-teal-600' : 'text-rose-600'
            }`}
          >
            {(forecastData?.projectedEndBalance || 0).toLocaleString()} ج.م
          </span>
          <span className="text-[10px] text-slate-400 block mt-1">بعد {daysHorizon} يوم من الآن</span>
        </div>
      </div>

      {/* Forecast Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Timeline Calendar Stream */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">الجدول الزمني لحركات الاستحقاق اليومية</h2>
            <span className="text-xs text-slate-400">انقر على أي يوم لاستعراض تفاصيل المستندات المستحقة</span>
          </div>

          <div className="flex-1 overflow-auto max-h-[500px]">
            {loading ? (
              <div className="p-12 flex justify-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-teal-500 ml-2" />
                <span>جاري محاكاة وتجميع التدفقات...</span>
              </div>
            ) : !forecastData?.days.length ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                لا توجد حركات استحقاق آجلة مسجلة خلال فترة {daysHorizon} يوم القادمة.
              </div>
            ) : (
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-3 font-semibold">تاريخ الاستحقاق</th>
                    <th className="p-3 font-semibold text-emerald-700">وارد متوقع (+)</th>
                    <th className="p-3 font-semibold text-rose-700">صادر متوقع (-)</th>
                    <th className="p-3 font-semibold">صافي اليوم</th>
                    <th className="p-3 font-semibold">الرصيد التراكمي المتوقع</th>
                    <th className="p-3 font-semibold text-center">عدد البنود</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {forecastData.days.map((day) => {
                    const isSelected = selectedDay?.date === day.date;
                    const isDeficit = day.projectedClosingBalance < 0;

                    return (
                      <tr
                        key={day.date}
                        onClick={() => setSelectedDay(day)}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-teal-50/70 font-bold' : isDeficit ? 'bg-rose-50/40 hover:bg-rose-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-3 font-mono font-bold text-slate-800">{day.date}</td>
                        <td className="p-3 font-mono text-emerald-600 font-bold">
                          {day.inflows > 0 ? `+${day.inflows.toLocaleString()}` : '-'}
                        </td>
                        <td className="p-3 font-mono text-rose-600 font-bold">
                          {day.outflows > 0 ? `-${day.outflows.toLocaleString()}` : '-'}
                        </td>
                        <td className="p-3 font-mono font-semibold">
                          <span className={day.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {day.net.toLocaleString()}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold">
                          <span className={day.projectedClosingBalance >= 0 ? 'text-slate-800' : 'text-rose-600 font-black'}>
                            {day.projectedClosingBalance.toLocaleString()} ج.م
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 bg-slate-100 rounded font-semibold text-[10px]">
                            {day.items.length} بند
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Col: Selected Day Item Details */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <span className="text-xs text-slate-400 block">تفاصيل استحقاقات يوم:</span>
            <h3 className="text-base font-bold text-slate-800 font-mono mt-0.5">
              {selectedDay ? selectedDay.date : 'اختر يوماً من الجدول'}
            </h3>
          </div>

          {!selectedDay ? (
            <p className="text-xs text-slate-400">حدد تاريخاً لمشاهدة تفاصيل الفواتير والشيكات المستحقة فيه.</p>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">إجمالي الوارد:</span>
                  <span className="font-bold text-emerald-600 font-mono">+{selectedDay.inflows.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">إجمالي الصادر:</span>
                  <span className="font-bold text-rose-600 font-mono">-{selectedDay.outflows.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                  <span>صافي الرصيد بنهاية اليوم:</span>
                  <span className={selectedDay.projectedClosingBalance >= 0 ? 'text-slate-800 font-mono' : 'text-rose-600 font-mono font-black'}>
                    {selectedDay.projectedClosingBalance.toLocaleString()} ج.م
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block">المستندات المستحقة:</span>
                <div className="space-y-2 max-h-72 overflow-auto">
                  {selectedDay.items.map((it) => {
                    const isInflow = it.type === 'INFLOW';
                    return (
                      <div
                        key={it.id}
                        className="p-2.5 rounded-xl border border-slate-100 bg-white shadow-xs flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-800 block">{it.description}</span>
                          <span className="text-[10px] text-slate-400">{it.category}</span>
                        </div>
                        <span className={`font-mono font-bold ${isInflow ? 'text-emerald-600' : 'text-rose-600'}`}>
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
