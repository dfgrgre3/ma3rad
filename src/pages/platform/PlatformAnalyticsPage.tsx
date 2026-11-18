import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Users,
  CalendarClock,
  ShieldCheck,
  RefreshCw,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { CentralUnsupportedNotice } from './components/CentralUnsupportedNotice';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource'; 
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

  const loadData = useCallback(async () => {
    setLoading(true);
    const centralState = getCentralDataSourceState();
    try {
      if (centralState.active) {
        const [plns, bp, cm, sm, lm, om] = await Promise.all([
          centralPlatformClient.listPlans(),
          centralPlatformClient.getBusinessPerformance(period),
          centralPlatformClient.getCustomerMetrics(period),
          centralPlatformClient.getSubscriptionMetrics(),
          centralPlatformClient.getLicenseMetrics(),
          centralPlatformClient.getOperationsMetrics(),
        ]);
        setPlans(plns);
        setBusinessPerf(bp);
        setCustomerMetrics(cm);
        setSubMetrics(sm);
        setLicenseMetrics(lm);
        setOpsMetrics(om);
      } else {
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
      }
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
      ['الإيرادات المحصلة', businessPerf.revenue.total.current, businessPerf.revenue.total.previous, businessPerf.revenue.total.changePercent],
      ['MRR الإيراد الشهري المتكرر', businessPerf.revenue.mrr.current, businessPerf.revenue.mrr.previous, businessPerf.revenue.mrr.changePercent],
      ['ARR الإيراد السنوي المتوقع', businessPerf.revenue.arr.current, businessPerf.revenue.arr.previous, businessPerf.revenue.arr.changePercent],
      ['العملاء النشطون', customerMetrics.activeCustomers.current, customerMetrics.activeCustomers.previous, customerMetrics.activeCustomers.changePercent],
      ['عملاء جدد', customerMetrics.newCustomers.current, customerMetrics.newCustomers.previous, customerMetrics.newCustomers.changePercent],
      ['متوسط قيمة العميل ARPU', customerMetrics.averageRevenuePerCustomer.current, customerMetrics.averageRevenuePerCustomer.previous, customerMetrics.averageRevenuePerCustomer.changePercent],
      ['تجديدات قادمة', subMetrics.upcomingRenewals.current, subMetrics.upcomingRenewals.previous, subMetrics.upcomingRenewals.changePercent],
      ['معدل فقدان العملاء Churn Rate', `${customerMetrics.churnRate.current}%`, `${customerMetrics.churnRate.previous}%`, customerMetrics.churnRate.changePercent],
    ]);
  };

  return (
    <div className="space-y-4 text-right">
      <CentralUnsupportedNotice feature="التحليلات والتقارير المتقدمة" />
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
                { id: '365d', label: 'سنة كاملة' },
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
                {renderDelta(businessPerf?.revenue.total.changePercent)}
              </div>
              <p className="text-2xl font-black text-slate-100 mt-2">
                {formatMoney(businessPerf?.revenue.total.current || 0)}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                الفترة السابقة: {formatMoney(businessPerf?.revenue.total.previous || 0)}
              </p>
            </div>

            <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-xl">
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-emerald-400">MRR (الإيراد المتكرر شهرياً)</p>
                {renderDelta(businessPerf?.revenue.mrr.changePercent)}
              </div>
              <p className="text-2xl font-black text-emerald-300 mt-2">
                {formatMoney(businessPerf?.revenue.mrr.current || 0)}
              </p>
              <p className="text-[10px] text-emerald-500/70 mt-1">
                الفترة السابقة: {formatMoney(businessPerf?.revenue.mrr.previous || 0)}
              </p>
            </div>

            <div className="p-4 bg-sky-950/20 border border-sky-500/20 rounded-xl">
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-sky-400">ARR (الإيراد السنوي المتوقع)</p>
                {renderDelta(businessPerf?.revenue.arr.changePercent)}
              </div>
              <p className="text-2xl font-black text-sky-300 mt-2">
                {formatMoney(businessPerf?.revenue.arr.current || 0)}
              </p>
              <p className="text-[10px] text-sky-500/70 mt-1">
                الفترة السابقة: {formatMoney(businessPerf?.revenue.arr.previous || 0)}
              </p>
            </div>

            <div className="p-4 bg-purple-950/20 border border-purple-500/20 rounded-xl">
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-purple-400">متوسط قيمة العميل (ARPU)</p>
                {renderDelta(customerMetrics?.averageRevenuePerCustomer.changePercent)}
              </div>
              <p className="text-2xl font-black text-purple-300 mt-2">
                {formatMoney(customerMetrics?.averageRevenuePerCustomer.current || 0)}
              </p>
              <p className="text-[10px] text-purple-500/70 mt-1">
                الفترة السابقة: {formatMoney(customerMetrics?.averageRevenuePerCustomer.previous || 0)}
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
                  {renderDelta(customerMetrics?.activeCustomers.changePercent)}
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                  <p className="text-[11px] text-slate-400">عملاء جدد</p>
                  <p className="text-lg font-black text-emerald-400 mt-0.5">
                    +{formatNumber(customerMetrics?.newCustomers.current || 0)}
                  </p>
                  {renderDelta(customerMetrics?.newCustomers.changePercent)}
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                  <p className="text-[11px] text-slate-400">معدل الفقد (Churn)</p>
                  <p className="text-lg font-black text-rose-400 mt-0.5">
                    {customerMetrics?.churnRate.current || 0}%
                  </p>
                  {renderDelta(customerMetrics?.churnRate.changePercent)}
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
                  <p className="text-[11px] text-slate-400">تجديدات قادمة</p>
                  <p className="text-lg font-black text-slate-100 mt-0.5">
                    {formatNumber(subMetrics?.upcomingRenewals.current || 0)}
                  </p>
                  {renderDelta(subMetrics?.upcomingRenewals.changePercent)}
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                  <p className="text-[11px] text-slate-400">فترات تجريبية منتهية</p>
                  <p className="text-lg font-black text-amber-400 mt-0.5">
                    {formatNumber(subMetrics?.expiredTrials.current || 0)}
                  </p>
                  {renderDelta(subMetrics?.expiredTrials.changePercent)}
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                  <p className="text-[11px] text-slate-400">نسبة التحويل التجريبي</p>
                  <p className="text-lg font-black text-sky-400 mt-0.5">
                    {subMetrics?.trialConversionRate.current || 0}%
                  </p>
                  {renderDelta(subMetrics?.trialConversionRate.changePercent)}
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
                <p className="text-[11px] text-slate-400">الأجهزة المنشطة</p>
                <p className="text-lg font-black text-slate-100 mt-1">
                  {formatNumber(licenseMetrics?.activatedDevices.current || 0)}
                </p>
                {renderDelta(licenseMetrics?.activatedDevices.changePercent)}
              </div>

              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <p className="text-[11px] text-slate-400">نسبة استخدام التراخيص</p>
                <p className="text-lg font-black text-sky-400 mt-1">
                  {licenseMetrics?.utilizationRate.current || 0}%
                </p>
                {renderDelta(licenseMetrics?.utilizationRate.changePercent)}
              </div>

              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <p className="text-[11px] text-slate-400">أخطاء المزامنة المسجلة</p>
                <p className="text-lg font-black text-amber-400 mt-1">
                  {formatNumber(opsMetrics?.syncErrors.current || 0)}
                </p>
                {renderDelta(opsMetrics?.syncErrors.changePercent)}
              </div>

              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <p className="text-[11px] text-slate-400">صحة واجهات API</p>
                <p className="text-lg font-black text-emerald-400 mt-1">
                  {opsMetrics?.apiHealth.current || 0}%
                </p>
                {renderDelta(opsMetrics?.apiHealth.changePercent)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PlatformAnalyticsPage;
