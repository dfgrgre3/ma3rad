import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  CalendarClock,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type {
  PlatformBusinessPerformance,
  PlatformCustomerMetrics,
  PlatformSubscriptionMetrics,
  PlatformLicenseMetrics,
  PlatformOperationsMetrics,
  PlatformPeriod,
  PlatformPlan,
} from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import {
  formatMoney,
  formatNumber,
  formatDateTime,
  inputClass,
  downloadCsv,
} from './components/PlatformUI';

export const PlatformAnalyticsPage: React.FC = () => {
  const [period, setPeriod] = useState<PlatformPeriod>('30d');
  const [planId, setPlanId] = useState<string>('');
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Analytics states
  const [businessPerf, setBusinessPerf] = useState<PlatformBusinessPerformance | null>(null);
  const [customerMetrics, setCustomerMetrics] = useState<PlatformCustomerMetrics | null>(null);
  const [subMetrics, setSubMetrics] = useState<PlatformSubscriptionMetrics | null>(null);
  const [licenseMetrics, setLicenseMetrics] = useState<PlatformLicenseMetrics | null>(null);
  const [opsMetrics, setOpsMetrics] = useState<PlatformOperationsMetrics | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    try {
      const plns = platformAdminService.listPlans();
      setPlans(plns);

      const bp = platformAdminService.getBusinessPerformance(period, planId || undefined);
      const cm = platformAdminService.getCustomerMetrics(period, planId || undefined);
      const sm = platformAdminService.getSubscriptionMetrics(period, planId || undefined);
      const lm = platformAdminService.getLicenseMetrics(period, planId || undefined);
      const om = platformAdminService.getOperationsMetrics(period);

      setBusinessPerf(bp);
      setCustomerMetrics(cm);
      setSubMetrics(sm);
      setLicenseMetrics(lm);
      setOpsMetrics(om);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل التحليلات والتقارير.');
    } finally {
      setLoading(false);
    }
  }, [period, planId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const renderDelta = (percent?: number) => {
    if (percent === undefined || percent === null) return null;
    const isPositive = percent >= 0;
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${
          isPositive ? 'text-emerald-400' : 'text-rose-400'
        }`}
        dir="ltr"
      >
        {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {Math.abs(percent)}%
      </span>
    );
  };

  const exportReport = () => {
    if (!businessPerf || !customerMetrics || !subMetrics) return;
    downloadCsv(`platform-analytics-${period}.csv`, [
      ['المؤشر', 'القيمة الحالية', 'الفترة السابقة', 'نسبة التغير %'],
      ['الإيرادات المحصلة', businessPerf.revenue.current, businessPerf.revenue.previous, businessPerf.revenue.percentChange],
      ['MRR الإيراد الشهري المتكرر', businessPerf.mrr.current, businessPerf.mrr.previous, businessPerf.mrr.percentChange],
      ['ARR الإيراد السنوي المتوقع', businessPerf.arr.current, businessPerf.arr.previous, businessPerf.arr.percentChange],
      ['إجمالي العملاء', customerMetrics.totalCustomers.current, customerMetrics.totalCustomers.previous, customerMetrics.totalCustomers.percentChange],
      ['العملاء النشطون', customerMetrics.activeCustomers.current, customerMetrics.activeCustomers.previous, customerMetrics.activeCustomers.percentChange],
      ['الاشتراكات النشطة', subMetrics.activeSubscriptions.current, subMetrics.activeSubscriptions.previous, subMetrics.activeSubscriptions.percentChange],
      ['معدل فقدان العملاء Churn Rate', `${customerMetrics.churnRate.current}%`, `${customerMetrics.churnRate.previous}%`, customerMetrics.churnRate.percentChange],
    ]);
  };

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="التقارير والتحليلات المركزية (Platform Analytics & BI)"
        description="تحليلات الإيرادات (MRR/ARR)، معدلات النمو، سلوك العملاء، التراخيص، ومؤشرات الأداء التشغيلي."
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={exportReport}
              leadingIcon={<Download className="h-4 w-4" />}
            >
              تصدير التقرير CSV
            </Button>
            <Button
              size="sm"
              onClick={loadData}
              leadingIcon={<RefreshCw className="h-4 w-4" />}
            >
              تحديث الأرقام
            </Button>
          </div>
        }
      />

      {/* Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-200">الفترة الزمنية:</span>
          <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs">
            {(
              [
                { id: '7d', label: '7 أيام' },
                { id: '30d', label: '30 يوماً' },
                { id: '90d', label: 'ربع سنوي' },
                { id: '1y', label: 'سنة كاملة' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1 rounded font-bold transition-colors ${
                  period === p.id
                    ? 'bg-sky-500 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300">فلترة حسب الباقة:</span>
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className={`${inputClass} max-w-[200px]`}
          >
            <option value="">جميع الباقات</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs font-bold text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm font-semibold text-slate-500">جارٍ تجميع بيانات التحليلات...</div>
      ) : (
        <>
          {/* Revenue & Financial KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-slate-400">الإيراد المحصل بالفترة</p>
                {renderDelta(businessPerf?.revenue.percentChange)}
              </div>
              <p className="text-2xl font-black text-slate-100 mt-2">
                {formatMoney(businessPerf?.revenue.current || 0)}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                الفترة السابقة: {formatMoney(businessPerf?.revenue.previous || 0)}
              </p>
            </div>

            <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-xl">
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-emerald-400">MRR (الإيراد المتكرر شهرياً)</p>
                {renderDelta(businessPerf?.mrr.percentChange)}
              </div>
              <p className="text-2xl font-black text-emerald-300 mt-2">
                {formatMoney(businessPerf?.mrr.current || 0)}
              </p>
              <p className="text-[10px] text-emerald-500/70 mt-1">
                الفترة السابقة: {formatMoney(businessPerf?.mrr.previous || 0)}
              </p>
            </div>

            <div className="p-4 bg-sky-950/20 border border-sky-500/20 rounded-xl">
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-sky-400">ARR (الإيراد السنوي المتوقع)</p>
                {renderDelta(businessPerf?.arr.percentChange)}
              </div>
              <p className="text-2xl font-black text-sky-300 mt-2">
                {formatMoney(businessPerf?.arr.current || 0)}
              </p>
              <p className="text-[10px] text-sky-500/70 mt-1">
                الفترة السابقة: {formatMoney(businessPerf?.arr.previous || 0)}
              </p>
            </div>

            <div className="p-4 bg-purple-950/20 border border-purple-500/20 rounded-xl">
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-purple-400">متوسط قيمة العميل (ARPU)</p>
                {renderDelta(businessPerf?.arpu.percentChange)}
              </div>
              <p className="text-2xl font-black text-purple-300 mt-2">
                {formatMoney(businessPerf?.arpu.current || 0)}
              </p>
              <p className="text-[10px] text-purple-500/70 mt-1">
                الفترة السابقة: {formatMoney(businessPerf?.arpu.previous || 0)}
              </p>
            </div>
          </div>

          {/* Customer & Subscription Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
              <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Users className="h-4 w-4 text-sky-400" />
                ديناميكية العملاء ومعدلات التسرب
              </h3>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                  <p className="text-[11px] text-slate-400">العملاء النشطون</p>
                  <p className="text-lg font-black text-slate-100 mt-0.5">
                    {formatNumber(customerMetrics?.activeCustomers.current || 0)}
                  </p>
                  {renderDelta(customerMetrics?.activeCustomers.percentChange)}
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                  <p className="text-[11px] text-slate-400">عملاء جدد</p>
                  <p className="text-lg font-black text-emerald-400 mt-0.5">
                    +{formatNumber(customerMetrics?.newCustomers.current || 0)}
                  </p>
                  {renderDelta(customerMetrics?.newCustomers.percentChange)}
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                  <p className="text-[11px] text-slate-400">معدل الفقد (Churn)</p>
                  <p className="text-lg font-black text-rose-400 mt-0.5">
                    {customerMetrics?.churnRate.current || 0}%
                  </p>
                  {renderDelta(customerMetrics?.churnRate.percentChange)}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
              <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-emerald-400" />
                حركة الاشتراكات والتجديدات
              </h3>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                  <p className="text-[11px] text-slate-400">اشتراكات سارية</p>
                  <p className="text-lg font-black text-slate-100 mt-0.5">
                    {formatNumber(subMetrics?.activeSubscriptions.current || 0)}
                  </p>
                  {renderDelta(subMetrics?.activeSubscriptions.percentChange)}
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                  <p className="text-[11px] text-slate-400">فترة تجريبية (Trial)</p>
                  <p className="text-lg font-black text-amber-400 mt-0.5">
                    {formatNumber(subMetrics?.trialSubscriptions.current || 0)}
                  </p>
                  {renderDelta(subMetrics?.trialSubscriptions.percentChange)}
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                  <p className="text-[11px] text-slate-400">نسبة التحويل التجريبي</p>
                  <p className="text-lg font-black text-sky-400 mt-0.5">
                    {subMetrics?.trialConversionRate.current || 0}%
                  </p>
                  {renderDelta(subMetrics?.trialConversionRate.percentChange)}
                </div>
              </div>
            </div>
          </div>

          {/* Operational Health & Sync Overview */}
          <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-purple-400" />
              مؤشرات الأداء التشغيلي والمزامنة
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <p className="text-[11px] text-slate-400">التراخيص النشطة</p>
                <p className="text-lg font-black text-slate-100 mt-1">
                  {formatNumber(licenseMetrics?.activeLicenses.current || 0)}
                </p>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <p className="text-[11px] text-slate-400">أجهزة ومقاعد مستخدمة</p>
                <p className="text-lg font-black text-slate-100 mt-1">
                  {formatNumber(licenseMetrics?.deviceUtilization.usedDevices || 0)} / {formatNumber(licenseMetrics?.deviceUtilization.totalDevices || 0)}
                </p>
                <p className="text-[10px] text-sky-400 mt-0.5">
                  نسبة الاستخدام: {licenseMetrics?.deviceUtilization.percentUsed || 0}%
                </p>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <p className="text-[11px] text-slate-400">أخطاء المزامنة المسجلة</p>
                <p className="text-lg font-black text-amber-400 mt-1">
                  {formatNumber(opsMetrics?.syncErrors.current || 0)}
                </p>
                {renderDelta(opsMetrics?.syncErrors.percentChange)}
              </div>

              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <p className="text-[11px] text-slate-400">تذاكر الدعم المفتوحة</p>
                <p className="text-lg font-black text-rose-400 mt-1">
                  {formatNumber(opsMetrics?.supportTickets.open || 0)}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  إجمالي التذاكر: {formatNumber(opsMetrics?.supportTickets.total || 0)}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PlatformAnalyticsPage;
