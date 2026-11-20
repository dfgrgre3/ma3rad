import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { PeriodSelector } from './components/Charts';
import {
  formatMoney,
  formatNumber,
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
  const [isCentral, setIsCentral] = useState(false);
  // Guards against stale responses when filters change quickly.
  const requestSeq = useRef(0);

  const loadData = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    const centralState = getCentralDataSourceState();
    setIsCentral(centralState.active);
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
        if (seq !== requestSeq.current) return;
        setPlans(plns);
        setBusinessPerf(bp);
        setCustomerMetrics(cm);
        setSubMetrics(sm);
        setLicenseMetrics(lm);
        setOpsMetrics(om);
      } else {
        if (seq !== requestSeq.current) return;
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
      if (seq !== requestSeq.current) return; // a newer request superseded this one
      setError(null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : 'تعذر تحميل التحليلات والتقارير.');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [period, planId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // `invert` is for metrics where a DECREASE is good (churn, error counts).
  const renderDelta = (percent?: number, invert = false) => {
    if (percent === undefined || percent === null) return null;
    const isPositive = percent >= 0;
    const isGood = invert ? !isPositive : isPositive;
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${
          isGood ? 'text-success' : 'text-danger'
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
    // Raw numeric values (no locale formatting) so the CSV stays machine-readable.
    downloadCsv(`platform-analytics-${period}.csv`, [
      ['المؤشر', 'القيمة الحالية', 'الفترة السابقة', 'نسبة التغير %'],
      ['الإيرادات المحصلة', businessPerf.revenue.total.current, businessPerf.revenue.total.previous, businessPerf.revenue.total.changePercent],
      ['MRR الإيراد الشهري المتكرر', businessPerf.revenue.mrr.current, businessPerf.revenue.mrr.previous, businessPerf.revenue.mrr.changePercent],
      ['ARR الإيراد السنوي المتوقع', businessPerf.revenue.arr.current, businessPerf.revenue.arr.previous, businessPerf.revenue.arr.changePercent],
      ['العملاء النشطون', customerMetrics.activeCustomers.current, customerMetrics.activeCustomers.previous, customerMetrics.activeCustomers.changePercent],
      ['عملاء جدد', customerMetrics.newCustomers.current, customerMetrics.newCustomers.previous, customerMetrics.newCustomers.changePercent],
      ['متوسط قيمة العميل ARPU', customerMetrics.averageRevenuePerCustomer.current, customerMetrics.averageRevenuePerCustomer.previous, customerMetrics.averageRevenuePerCustomer.changePercent],
      ['تجديدات قادمة', subMetrics.upcomingRenewals.current, subMetrics.upcomingRenewals.previous, subMetrics.upcomingRenewals.changePercent],
      ['معدل فقدان العملاء Churn Rate', customerMetrics.churnRate.current, customerMetrics.churnRate.previous, customerMetrics.churnRate.changePercent],
    ]);
  };

  const hasMetrics = Boolean(businessPerf || customerMetrics || subMetrics || licenseMetrics || opsMetrics);

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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-strong bg-primary/60 p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted" />
          <span className="text-xs font-bold text-muted">الفترة الزمنية:</span>
          <PeriodSelector
            value={period}
            onChange={(v) => setPeriod(v as PlatformPeriod)}
            options={[
              { value: '7d', label: '7 أيام' },
              { value: '30d', label: '30 يوماً' },
              { value: '90d', label: 'ربع سنوي' },
              { value: '365d', label: 'سنة كاملة' },
            ]}
            className="w-auto"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted">فلترة حسب الباقة:</span>
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            disabled={isCentral}
            title={isCentral ? 'تصفية الباقات غير مدعومة في الوضع المركزي' : undefined}
            className={`${inputClass} max-w-[200px] disabled:opacity-50`}
          >
            <option value="">جميع الباقات</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {isCentral && (
            <span className="text-[10px] text-muted">غير مدعومة في الوضع المركزي</span>
          )}
        </div>
      </div>

      {/* Honest scope note: not every metric honours period/plan filters. */}
      <p className="text-[10.5px] text-muted">
        مؤشرات الأداء والأعمال والعملاء تحترم الفترة المحددة{isCentral ? '' : ' وفلتر الباقة'}؛
        مؤشرات الاشتراكات والتراخيص والتشغيل تُحسب على كل الفترات
        {isCentral ? ' ولا تدعم فلتر الباقة.' : ' جزئياً فقط.'}
      </p>

      {error && (
        <div className="flex items-center justify-between gap-2 p-3 bg-danger/10 border border-danger/20 rounded-lg text-xs font-bold text-danger">
          <span>{error}</span>
          <button onClick={loadData} className="text-success hover:underline">إعادة المحاولة</button>
        </div>
      )}

      {loading && !hasMetrics ? (
        <div className="py-20 text-center text-sm font-semibold text-muted">جارٍ تجميع بيانات التحليلات...</div>
      ) : !hasMetrics && error ? (
        <div className="py-16 text-center">
          <p className="text-sm font-semibold text-danger">تعذر تحميل بيانات التحليلات.</p>
          <button onClick={loadData} className="mt-2 text-xs font-bold text-success hover:underline">إعادة المحاولة</button>
        </div>
      ) : !hasMetrics ? (
        <div className="py-16 text-center text-sm font-semibold text-muted">لا تتوفر بيانات تحليلات حالياً.</div>
      ) : (
        <>
          {/* Revenue & Financial KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-4 bg-primary/80 border border-line-strong rounded-xl">
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-muted">الإيراد المحصل بالفترة</p>
                {renderDelta(businessPerf?.revenue.total.changePercent)}
              </div>
              <p className="text-2xl font-black text-muted mt-2">
                {formatMoney(businessPerf?.revenue.total.current || 0)}
              </p>
              <p className="text-[10px] text-muted mt-1">
                الفترة السابقة: {formatMoney(businessPerf?.revenue.total.previous || 0)}
              </p>
            </div>

            <div className="p-4 bg-success/20 border border-success/20 rounded-xl">
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-success">MRR (الإيراد المتكرر شهرياً)</p>
                {renderDelta(businessPerf?.revenue.mrr.changePercent)}
              </div>
              <p className="text-2xl font-black text-success mt-2">
                {formatMoney(businessPerf?.revenue.mrr.current || 0)}
              </p>
              <p className="text-[10px] text-success/70 mt-1">
                الفترة السابقة: {formatMoney(businessPerf?.revenue.mrr.previous || 0)}
              </p>
            </div>

            <div className="p-4 bg-primary/20 border border-primary/20 rounded-xl">
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-primary">ARR (الإيراد السنوي المتوقع)</p>
                {renderDelta(businessPerf?.revenue.arr.changePercent)}
              </div>
              <p className="text-2xl font-black text-primary mt-2">
                {formatMoney(businessPerf?.revenue.arr.current || 0)}
              </p>
              <p className="text-[10px] text-primary/70 mt-1">
                الفترة السابقة: {formatMoney(businessPerf?.revenue.arr.previous || 0)}
              </p>
            </div>

            <div className="p-4 bg-primary/20 border border-primary/20 rounded-xl">
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-primary">متوسط قيمة العميل (ARPU)</p>
                {renderDelta(customerMetrics?.averageRevenuePerCustomer.changePercent)}
              </div>
              <p className="text-2xl font-black text-primary mt-2">
                {formatMoney(customerMetrics?.averageRevenuePerCustomer.current || 0)}
              </p>
              <p className="text-[10px] text-primary/70 mt-1">
                الفترة السابقة: {formatMoney(customerMetrics?.averageRevenuePerCustomer.previous || 0)}
              </p>
            </div>
          </div>

          {/* Customer & Subscription Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-primary/70 border border-line-strong rounded-xl space-y-3">
              <h3 className="text-xs font-bold text-muted flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                ديناميكية العملاء ومعدلات التسرب
              </h3>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 bg-primary/60 rounded-lg border border-line-strong">
                  <p className="text-[11px] text-muted">العملاء النشطون</p>
                  <p className="text-lg font-black text-muted mt-0.5">
                    {formatNumber(customerMetrics?.activeCustomers.current || 0)}
                  </p>
                  {renderDelta(customerMetrics?.activeCustomers.changePercent)}
                </div>

                <div className="p-2.5 bg-primary/60 rounded-lg border border-line-strong">
                  <p className="text-[11px] text-muted">عملاء جدد</p>
                  <p className="text-lg font-black text-success mt-0.5">
                    +{formatNumber(customerMetrics?.newCustomers.current || 0)}
                  </p>
                  {renderDelta(customerMetrics?.newCustomers.changePercent)}
                </div>

                <div className="p-2.5 bg-primary/60 rounded-lg border border-line-strong">
                  <p className="text-[11px] text-muted">معدل الفقد (Churn)</p>
                  <p className="text-lg font-black text-danger mt-0.5">
                    {customerMetrics?.churnRate.current || 0}%
                  </p>
                  {renderDelta(customerMetrics?.churnRate.changePercent, true)}
                </div>
              </div>
            </div>

            <div className="p-4 bg-primary/70 border border-line-strong rounded-xl space-y-3">
              <h3 className="text-xs font-bold text-muted flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-success" />
                حركة الاشتراكات والتجديدات
              </h3>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 bg-primary/60 rounded-lg border border-line-strong">
                  <p className="text-[11px] text-muted">تجديدات قادمة</p>
                  <p className="text-lg font-black text-muted mt-0.5">
                    {formatNumber(subMetrics?.upcomingRenewals.current || 0)}
                  </p>
                  {renderDelta(subMetrics?.upcomingRenewals.changePercent)}
                </div>

                <div className="p-2.5 bg-primary/60 rounded-lg border border-line-strong">
                  <p className="text-[11px] text-muted">فترات تجريبية منتهية</p>
                  <p className="text-lg font-black text-warning mt-0.5">
                    {formatNumber(subMetrics?.expiredTrials.current || 0)}
                  </p>
                  {renderDelta(subMetrics?.expiredTrials.changePercent)}
                </div>

                <div className="p-2.5 bg-primary/60 rounded-lg border border-line-strong">
                  <p className="text-[11px] text-muted">نسبة التحويل التجريبي</p>
                  <p className="text-lg font-black text-primary mt-0.5">
                    {subMetrics?.trialConversionRate.current || 0}%
                  </p>
                  {renderDelta(subMetrics?.trialConversionRate.changePercent)}
                </div>
              </div>
            </div>
          </div>

          {/* Operational Health & Sync Overview */}
          <div className="p-4 bg-primary/70 border border-line-strong rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-muted flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              مؤشرات الأداء التشغيلي والمزامنة
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-primary/60 rounded-lg border border-line-strong">
                <p className="text-[11px] text-muted">الأجهزة المنشطة</p>
                <p className="text-lg font-black text-muted mt-1">
                  {formatNumber(licenseMetrics?.activatedDevices.current || 0)}
                </p>
                {renderDelta(licenseMetrics?.activatedDevices.changePercent)}
              </div>

              <div className="p-3 bg-primary/60 rounded-lg border border-line-strong">
                <p className="text-[11px] text-muted">نسبة استخدام التراخيص</p>
                <p className="text-lg font-black text-primary mt-1">
                  {licenseMetrics?.utilizationRate.current || 0}%
                </p>
                {renderDelta(licenseMetrics?.utilizationRate.changePercent)}
              </div>

              <div className="p-3 bg-primary/60 rounded-lg border border-line-strong">
                <p className="text-[11px] text-muted">أخطاء المزامنة المسجلة</p>
                <p className="text-lg font-black text-warning mt-1">
                  {formatNumber(opsMetrics?.syncErrors.current || 0)}
                </p>
                {renderDelta(opsMetrics?.syncErrors.changePercent, true)}
              </div>

              <div className="p-3 bg-primary/60 rounded-lg border border-line-strong">
                <p className="text-[11px] text-muted">صحة واجهات API</p>
                <p className="text-lg font-black text-success mt-1">
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
