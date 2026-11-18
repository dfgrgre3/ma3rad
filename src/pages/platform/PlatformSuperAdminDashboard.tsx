import React from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  KeyRound,
  Wallet,
  TrendingUp,
  AlertTriangle,
  ReceiptText,
  ArrowLeft,
  Users,
  Package,
  ShieldCheck,
  Layers3,
  Cpu,
  GitBranch,
  CalendarClock,
  Activity,
  Boxes,
  ScrollText,
  ShieldAlert,
  CheckCircle2,
  Rocket,
  Sparkles,
  BarChart2,
  LineChart as LineChartIcon,
  PieChart,
  Users as UsersIcon,
  CreditCard,
  Zap,
  Server,
  Bell,
  Filter,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Target,
  AlertCircle,
  Clock,
  RotateCcw,
  XCircle,
  CheckCircle,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Wifi,
  WifiOff,
  HeartPulse,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type {
  PlatformOverview,
  PlatformPeriod,
  PlatformAlertDetail,
  PlatformBusinessPerformance,
  PlatformCustomerMetrics,
  PlatformSubscriptionMetrics,
  PlatformLicenseMetrics,
  PlatformOperationsMetrics,
  PlatformLicenseActivation,
} from '../../services/domains/platform/platformTypes';
import {
  formatMoney,
  formatNumber,
  formatDate,
  formatDateTime,
  StatusBadge,
  EmptyState,
} from './components/PlatformUI';
import { CentralUnsupportedNotice } from './components/CentralUnsupportedNotice';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import {
  LineChart,
  MetricCard,
  StatGrid,
  Panel,
  PeriodSelector,
  DrillDownLink,
  AlertCard,
} from './components/Charts';

const CHANNEL_LABELS: Record<string, string> = {
  STABLE: 'مستقر',
  BETA: 'تجريبي',
  NIGHTLY: 'ليلي',
};

const ENTITY_LABELS: Record<string, string> = {
  TENANT: 'عميل',
  PLAN: 'خطة',
  LICENSE: 'ترخيص',
  INVOICE: 'فاتورة',
  PAYMENT: 'دفعة',
  MODULE: 'وحدة',
  FEATURE: 'ميزة',
  RELEASE: 'إصدار',
  SETTINGS: 'إعدادات',
};

const TONES = {
  default: { icon: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400' },
  success: { icon: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
  warning: { icon: 'bg-amber-50 text-amber-600', bar: 'bg-amber-500' },
  danger: { icon: 'bg-rose-50 text-rose-600', bar: 'bg-rose-500' },
  info: { icon: 'bg-sky-50 text-sky-600', bar: 'bg-sky-500' },
  violet: { icon: 'bg-violet-50 text-violet-600', bar: 'bg-violet-500' },
} as const;

type Tone = keyof typeof TONES;

const formatCompactNumber = (num: number): string => {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toLocaleString('ar-EG');
};

const getTrendIcon = (trend: 'up' | 'down' | 'flat') => {
  switch (trend) {
    case 'up': return <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />;
    case 'down': return <ArrowDownRight className="h-3.5 w-3.5 text-rose-600" />;
    default: return <Minus className="h-3.5 w-3.5 text-slate-400" />;
  }
};

const getTrendColor = (trend: 'up' | 'down' | 'flat') => {
  switch (trend) {
    case 'up': return 'text-emerald-600';
    case 'down': return 'text-rose-600';
    default: return 'text-slate-400';
  }
};

export const PlatformSuperAdminDashboard: React.FC = () => {
  const [overview, setOverview] = React.useState<PlatformOverview | null>(null);
  const [period, setPeriod] = React.useState<string>('30d');
  const [planFilter, setPlanFilter] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({
    business: true,
    customers: true,
    subscriptions: true,
    licenses: true,
    operations: true,
    alerts: true,
  });

  const loadOverview = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const centralState = getCentralDataSourceState();
    try {
      if (centralState.active) {
        const data = await centralPlatformClient.getOverview();
        setOverview(data as PlatformOverview);
      } else {
        const data = platformAdminService.getOverviewWithPeriod(period as PlatformPeriod, planFilter || undefined);
        setOverview(data);
      }
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات المنصة.');
    } finally {
      setLoading(false);
    }
  }, [period, planFilter]);

  React.useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Auto-refresh every 60 seconds
  React.useEffect(() => {
    const id = window.setInterval(() => {
      loadOverview();
    }, 60000);
    return () => window.clearInterval(id);
  }, [loadOverview]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
        {error}
        <button onClick={loadOverview} className="ml-3 text-emerald-700 hover:underline">إعادة المحاولة</button>
      </div>
    );
  }

  if (loading || !overview) {
    return <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل بيانات المنصة...</div>;
  }

  const latestRelease = overview.releases[0] ?? null;
  const maxModuleAdoption = Math.max(1, ...overview.moduleUsage.map((item) => item.licenseCount));

  // Extract metrics
  const bp = overview.businessPerformance;
  const cm = overview.customerMetrics;
  const sm = overview.subscriptionMetrics;
  const lm = overview.licenseMetrics;
  const om = overview.operationsMetrics;
  const alerts = overview.alertDetails ?? [];

  return (
    <div className="space-y-5">
      {/* Header with Period Selector */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-900 p-5 text-white shadow-lg md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              <ShieldCheck className="h-4 w-4" /> لوحة مالك المنصة — تحليلات متقدمة
            </p>
            <h2 className="mt-2 text-2xl font-black">مرحباً، {overview.currentInstallation?.companyName || 'سيراميسي'}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-6 text-slate-300">
              تحكم كامل في المنتج، عملاء المنصة، التراخيص، الاشتراكات والمبيعات — مع تحليلات مفصلة وفترات زمنية قابلة للتخصيص.
            </p>
            {latestRelease && (
              <p className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold text-slate-200">
                <Rocket className="h-3.5 w-3.5 text-emerald-300" />
                آخر إصدار: <span dir="ltr" className="font-mono">v{latestRelease.version}</span>
                <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-emerald-200">{CHANNEL_LABELS[latestRelease.channel]}</span>
                <span className="text-slate-400">· {formatDate(latestRelease.releasedAt || latestRelease.createdAt)}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PeriodSelector value={period} onChange={setPeriod} className="w-auto min-w-[150px]" />
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 w-auto min-w-[180px]"
              aria-label="تصفية حسب الخطة"
            >
              <option value="">كل الخطط</option>
              {platformAdminService.listPlans().map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({plan.code})
                </option>
              ))}
            </select>
            {lastUpdated && (
              <span className="text-[10px] text-slate-400">
                آخر تحديث: {lastUpdated.toLocaleTimeString('ar-EG')}
              </span>
            )}
            <button
              onClick={loadOverview}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              تحديث
            </button>
          </div>
        </div>
      </section>

      {/* Quick Stats Hero */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="إجمالي العملاء"
          value={formatNumber(overview.tenants.total)}
          comparison={cm?.activeCustomers}
          icon={<Building2 className="h-4 w-4" />}
          onClick={() => window.location.href = '/platform/tenants'}
        />
        <MetricCard
          label="العملاء النشطون"
          value={formatNumber(overview.tenants.active)}
          comparison={cm?.newCustomers}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
        />
        <MetricCard
          label="إجمالي الإيرادات"
          value={formatMoney(overview.billing.revenueTotal)}
          comparison={bp?.revenue.total}
          icon={<Wallet className="h-4 w-4" />}
          tone="success"
          onClick={() => window.location.href = '/platform/billing'}
        />
        <MetricCard
          label="الإيراد الشهري (MRR)"
          value={formatMoney(overview.billing.mrr)}
          comparison={bp?.revenue.mrr}
          icon={<Activity className="h-4 w-4" />}
          tone="info"
        />
        <MetricCard
          label="التراخيص السارية"
          value={formatNumber(overview.licenses.active)}
          comparison={lm?.activatedDevices}
          icon={<KeyRound className="h-4 w-4" />}
          tone="violet"
          onClick={() => window.location.href = '/platform/licenses'}
        />
      </section>

      {/* Business Performance Section */}
      <Panel
        title="الأداء التجاري"
        subtitle={`مقارنة ${period === '7d' ? 'آخر 7 أيام' : period === '30d' ? 'آخر 30 يوم' : period === '90d' ? 'آخر 90 يوم' : 'الفترة المحددة'} مع الفترة السابقة`}
        icon={<BarChart2 className="h-4 w-4" />}
        iconClass="bg-emerald-50 text-emerald-600"
        action={
          <DrillDownLink label="تقرير مفصل" href="/platform/reports/business" icon={<ExternalLink className="h-3.5 w-3.5" />} />
        }
        className="xl:col-span-2"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 mb-4">
          <MetricCard
            label="إجمالي الإيرادات"
            value={bp?.revenue.total.current ? formatMoney(bp.revenue.total.current) : '—'}
            comparison={bp?.revenue.total}
            icon={<DollarSign className="h-4 w-4" />}
          />
          <MetricCard
            label="الإيراد الشهري المتكرر (MRR)"
            value={bp?.revenue.mrr.current ? formatMoney(bp.revenue.mrr.current) : '—'}
            comparison={bp?.revenue.mrr}
            icon={<RotateCcw className="h-4 w-4" />}
          />
          <MetricCard
            label="الإيراد السنوي المتكرر (ARR)"
            value={bp?.revenue.arr.current ? formatMoney(bp.revenue.arr.current) : '—'}
            comparison={bp?.revenue.arr}
            icon={<Target className="h-4 w-4" />}
          />
          <MetricCard
            label="صافي الإيراد"
            value={bp?.revenue.netRevenue.current ? formatMoney(bp.revenue.netRevenue.current) : '—'}
            comparison={bp?.revenue.netRevenue}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <MetricCard
            label="معدل النمو"
            value={bp?.revenue.growthRate.current ? `${bp.revenue.growthRate.current.toFixed(1)}%` : '—'}
            comparison={bp?.revenue.growthRate}
            icon={<ArrowUpRight className="h-4 w-4" />}
            tone={bp?.revenue.growthRate.trend === 'up' ? 'success' : bp?.revenue.growthRate.trend === 'down' ? 'danger' : 'default'}
          />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="xl:col-span-2">
            <LineChart
              data={bp?.timeSeries.revenue ?? []}
              height={280}
              color="#10b981"
              yAxisFormatter={(v) => formatMoney(v).replace('EGP', '').trim()}
              aria-label="مخطط الإيرادات عبر الزمن"
            />
          </div>
        </div>
      </Panel>

      {/* Customers Section */}
      <Panel
        title="العملاء"
        subtitle={`جديد، نشط، ملغي، ومعدل الفقد (Churn Rate) — ${period === '7d' ? 'آخر 7 أيام' : period === '30d' ? 'آخر 30 يوم' : period === '90d' ? 'آخر 90 يوم' : 'الفترة المحددة'}`}
        icon={<UsersIcon className="h-4 w-4" />}
        iconClass="bg-sky-50 text-sky-600"
        action={
          <>
            <DrillDownLink label="العملاء" href="/platform/tenants" icon={<ExternalLink className="h-3.5 w-3.5" />} />
            <DrillDownLink label="التقرير" href="/platform/reports/customers" icon={<BarChart2 className="h-3.5 w-3.5" />} />
          </>
        }
        className="xl:col-span-2"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6 mb-4">
          <MetricCard
            label="عملاء جدد"
            value={cm?.newCustomers.current ? formatNumber(cm.newCustomers.current) : '—'}
            comparison={cm?.newCustomers}
            icon={<UsersIcon className="h-4 w-4" />}
          />
          <MetricCard
            label="عملاء نشطون"
            value={cm?.activeCustomers.current ? formatNumber(cm.activeCustomers.current) : '—'}
            comparison={cm?.activeCustomers}
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="success"
          />
          <MetricCard
            label="عملاء ملغون"
            value={cm?.cancelledCustomers.current ? formatNumber(cm.cancelledCustomers.current) : '—'}
            comparison={cm?.cancelledCustomers}
            icon={<XCircle className="h-4 w-4" />}
            tone="danger"
          />
          <MetricCard
            label="معدل الفقد (Churn)"
            value={cm?.churnRate.current ? `${cm.churnRate.current.toFixed(2)}%` : '—'}
            comparison={cm?.churnRate}
            icon={<TrendingDown className="h-4 w-4" />}
            tone={cm?.churnRate.trend === 'up' ? 'danger' : cm?.churnRate.trend === 'down' ? 'success' : 'default'}
          />
          <MetricCard
            label="تحويل تجريب → مدفوع"
            value={cm?.trialToPaidConversion.current ? `${cm.trialToPaidConversion.current.toFixed(1)}%` : '—'}
            comparison={cm?.trialToPaidConversion}
            icon={<RotateCcw className="h-4 w-4" />}
            tone="info"
          />
          <MetricCard
            label="متوسط الإيراد/عميل (ARPC)"
            value={cm?.averageRevenuePerCustomer.current ? formatMoney(cm.averageRevenuePerCustomer.current) : '—'}
            comparison={cm?.averageRevenuePerCustomer}
            icon={<DollarSign className="h-4 w-4" />}
          />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="xl:col-span-2">
            <LineChart
              data={cm?.timeSeries.newCustomers ?? []}
              height={280}
              color="#0ea5e9"
              yAxisFormatter={(v) => formatNumber(v)}
              aria-label="مخطط العملاء الجدد عبر الزمن"
            />
          </div>
        </div>
        {cm?.topCustomersByRevenue && cm.topCustomersByRevenue.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-sm font-bold text-slate-700">أعلى العملاء إيراداً</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="text-[10.5px] text-slate-500">
                    <th className="px-4 py-2 font-semibold">العميل</th>
                    <th className="px-4 py-2 font-semibold">الكود</th>
                    <th className="px-4 py-2 font-semibold">الحالة</th>
                    <th className="px-4 py-2 font-semibold">الإيراد</th>
                    <th className="px-4 py-2 font-semibold">الفواتير</th>
                  </tr>
                </thead>
                <tbody>
                  {cm.topCustomersByRevenue.slice(0, 10).map((cust) => (
                    <tr key={cust.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => window.location.href = `/platform/tenants/${cust.id}`}>
                      <td className="px-4 py-2 text-[12px] font-semibold text-slate-700">{cust.name}</td>
                      <td className="px-4 py-2 text-[11px] text-slate-500 font-mono">{cust.code}</td>
                      <td className="px-4 py-2"><StatusBadge value={cust.status} /></td>
                      <td className="px-4 py-2 text-[12px] font-bold text-emerald-700">{formatMoney(cust.revenue)}</td>
                      <td className="px-4 py-2 text-[11px] text-slate-500">{cust.invoicesCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>

      {/* Subscriptions Section */}
      <Panel
        title="الاشتراكات"
        subtitle={`تجارب منتهية، تجديدات قادمة، اشتراكات متعثرة — ${period === '7d' ? 'آخر 7 أيام' : period === '30d' ? 'آخر 30 يوم' : period === '90d' ? 'آخر 90 يوم' : 'الفترة المحددة'}`}
        icon={<CalendarClock className="h-4 w-4" />}
        iconClass="bg-violet-50 text-violet-600"
        action={
          <>
            <DrillDownLink label="الاشتراكات" href="/platform/subscriptions" icon={<ExternalLink className="h-3.5 w-3.5" />} />
            <DrillDownLink label="التجديدات" href="/platform/subscriptions?filter=renewals" icon={<RotateCcw className="h-3.5 w-3.5" />} />
          </>
        }
        className="xl:col-span-2"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6 mb-4">
          <MetricCard
            label="تجارب منتهية"
            value={sm?.expiredTrials.current ? formatNumber(sm.expiredTrials.current) : '—'}
            comparison={sm?.expiredTrials}
            icon={<Clock className="h-4 w-4" />}
            tone="warning"
          />
          <MetricCard
            label="تجديدات قادمة (30 يوم)"
            value={sm?.upcomingRenewals.current ? formatNumber(sm.upcomingRenewals.current) : '—'}
            comparison={sm?.upcomingRenewals}
            icon={<RotateCcw className="h-4 w-4" />}
            tone="info"
          />
          <MetricCard
            label="اشتراكات متعثرة"
            value={sm?.strugglingSubscriptions.current ? formatNumber(sm.strugglingSubscriptions.current) : '—'}
            comparison={sm?.strugglingSubscriptions}
            icon={<AlertCircle className="h-4 w-4" />}
            tone="danger"
          />
          <MetricCard
            label="معدل تحويل التجربة"
            value={sm?.trialConversionRate.current ? `${sm.trialConversionRate.current.toFixed(1)}%` : '—'}
            comparison={sm?.trialConversionRate}
            icon={<CheckCircle className="h-4 w-4" />}
            tone="success"
          />
          <MetricCard
            label="متوسط قيمة الاشتراك"
            value={sm?.averageSubscriptionValue.current ? formatMoney(sm.averageSubscriptionValue.current) : '—'}
            comparison={sm?.averageSubscriptionValue}
            icon={<Wallet className="h-4 w-4" />}
          />
          <MetricCard
            label="معدل التجديد"
            value={sm?.renewalRate.current ? `${sm.renewalRate.current.toFixed(1)}%` : '—'}
            comparison={sm?.renewalRate}
            icon={<RotateCcw className="h-4 w-4" />}
            tone="violet"
          />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-bold text-slate-700">التجديدات القادمة (30 يوم)</h4>
            {sm?.upcomingRenewalsList && sm.upcomingRenewalsList.length > 0 ? (
              <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {sm.upcomingRenewalsList.slice(0, 10).map((sub) => (
                  <li key={sub.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer" onClick={() => window.location.href = `/platform/tenants/${sub.tenantId}`}>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-bold text-slate-800">{sub.tenantName}</p>
                      <p className="text-[10.5px] text-slate-500">{sub.tenantCode} · {sub.planName}</p>
                    </div>
                    <div className="shrink-0 text-left">
                      <StatusBadge value={sub.status} />
                      <p className="mt-1 text-[10px] text-slate-500">{formatDate(sub.endDate)} · {formatMoney(sub.price)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="لا توجد تجديدات قادمة" />
            )}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-bold text-slate-700">الاشتراكات المتعثرة (PAST_DUE)</h4>
            {sm?.strugglingList && sm.strugglingList.length > 0 ? (
              <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {sm.strugglingList.slice(0, 10).map((sub) => (
                  <li key={sub.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer" onClick={() => window.location.href = `/platform/tenants/${sub.tenantId}`}>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-bold text-slate-800">{sub.tenantName || '—'}</p>
                      <p className="text-[10.5px] text-slate-500">{sub.planName || '—'} · {formatMoney(sub.price)}</p>
                    </div>
                    <div className="shrink-0 text-left">
                      <StatusBadge value={sub.status} />
                      <p className="mt-1 text-[10px] text-slate-500">ينتهي: {formatDate(sub.endDate)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<CheckCircle className="h-5 w-5" />} title="لا توجد اشتراكات متعثرة" />
            )}
          </div>
        </div>
      </Panel>

      {/* Licenses Section */}
      <Panel
        title="التراخيص"
        subtitle={`أجهزة مفعلة، استخدام، تراخيص معلقة، محاولات فاشلة — ${period === '7d' ? 'آخر 7 أيام' : period === '30d' ? 'آخر 30 يوم' : period === '90d' ? 'آخر 90 يوم' : 'الفترة المحددة'}`}
        icon={<KeyRound className="h-4 w-4" />}
        iconClass="bg-amber-50 text-amber-600"
        action={
          <>
            <DrillDownLink label="التراخيص" href="/platform/licenses" icon={<ExternalLink className="h-3.5 w-3.5" />} />
            <DrillDownLink label="التفعيلات" href="/platform/licenses/activations" icon={<Zap className="h-3.5 w-3.5" />} />
          </>
        }
        className="xl:col-span-2"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6 mb-4">
          <MetricCard
            label="أجهزة مفعلة"
            value={lm?.activatedDevices.current ? formatNumber(lm.activatedDevices.current) : '—'}
            comparison={lm?.activatedDevices}
            icon={<Cpu className="h-4 w-4" />}
            tone="success"
          />
          <MetricCard
            label="معدل الاستخدام"
            value={lm?.utilizationRate.current ? `${lm.utilizationRate.current.toFixed(1)}%` : '—'}
            comparison={lm?.utilizationRate}
            icon={<Activity className="h-4 w-4" />}
            tone="info"
          />
          <MetricCard
            label="تراخيص معلقة (ISSUED)"
            value={lm?.pendingLicenses.current ? formatNumber(lm.pendingLicenses.current) : '—'}
            comparison={lm?.pendingLicenses}
            icon={<Clock className="h-4 w-4" />}
            tone="warning"
          />
          <MetricCard
            label="تفعيلات فاشلة"
            value={lm?.failedActivations.current ? formatNumber(lm.failedActivations.current) : '—'}
            comparison={lm?.failedActivations}
            icon={<XCircle className="h-4 w-4" />}
            tone="danger"
          />
          <MetricCard
            label="معدل نجاح التفعيل"
            value={lm?.activationSuccessRate.current ? `${lm.activationSuccessRate.current.toFixed(1)}%` : '—'}
            comparison={lm?.activationSuccessRate}
            icon={<CheckCircle className="h-4 w-4" />}
            tone="success"
          />
          <MetricCard
            label="تنتهي قريباً (30 يوم)"
            value={lm?.expiringSoon.current ? formatNumber(lm.expiringSoon.current) : '—'}
            comparison={lm?.expiringSoon}
            icon={<AlertTriangle className="h-4 w-4" />}
            tone="warning"
          />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-bold text-slate-700">محاولات التفعيل الفاشلة (الأخيرة)</h4>
            {lm?.failedActivationsList && lm.failedActivationsList.length > 0 ? (
              <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {lm.failedActivationsList.slice(0, 10).map((act) => (
                  <li key={act.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-bold text-slate-800">{act.tenantName || '—'}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{act.licenseKey || act.licenseId}</p>
                    </div>
                    <div className="shrink-0 text-left">
                      <StatusBadge value={act.status} />
                      <p className="mt-1 text-[10px] text-slate-500">{formatDateTime(act.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<CheckCircle className="h-5 w-5" />} title="لا توجد تفعيلات فاشلة" />
            )}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-bold text-slate-700">التراخيص المعلقة (ISSUED)</h4>
            {lm?.pendingLicensesList && lm.pendingLicensesList.length > 0 ? (
              <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {lm.pendingLicensesList.slice(0, 10).map((lic) => (
                  <li key={lic.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer" onClick={() => window.location.href = `/platform/licenses/${lic.id}`}>
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-bold text-slate-800">{lic.tenantName || '—'}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{lic.licenseKey}</p>
                    </div>
                    <div className="shrink-0 text-left">
                      <StatusBadge value={lic.status} />
                      <p className="mt-1 text-[10px] text-slate-500">{lic.planName || '—'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<CheckCircle className="h-5 w-5" />} title="لا توجد تراخيص معلقة" />
            )}
          </div>
        </div>
      </Panel>

      {/* Operations Section */}
      <Panel
        title="التشغيل"
        subtitle={`أجهزة متصلة/غير متصلة، أخطاء مزامنة، صحة API — ${period === '7d' ? 'آخر 7 أيام' : period === '30d' ? 'آخر 30 يوم' : period === '90d' ? 'آخر 90 يوم' : 'الفترة المحددة'}`}
        icon={<Server className="h-4 w-4" />}
        iconClass="bg-slate-100 text-slate-600"
        action={
          <>
            <DrillDownLink label="الأجهزة" href="/platform/devices" icon={<ExternalLink className="h-3.5 w-3.5" />} />
            <DrillDownLink label="السجلات" href="/platform/audit" icon={<ScrollText className="h-3.5 w-3.5" />} />
          </>
        }
        className="xl:col-span-2"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 mb-4">
          <MetricCard
            label="أجهزة متصلة"
            value={om?.connectedDevices.current ? formatNumber(om.connectedDevices.current) : '—'}
            comparison={om?.connectedDevices}
            icon={<Wifi className="h-4 w-4" />}
            tone="success"
          />
          <MetricCard
            label="أجهزة غير متصلة"
            value={om?.disconnectedDevices.current ? formatNumber(om.disconnectedDevices.current) : '—'}
            comparison={om?.disconnectedDevices}
            icon={<WifiOff className="h-4 w-4" />}
            tone="danger"
          />
          <MetricCard
            label="أخطاء المزامنة"
            value={om?.syncErrors.current ? formatNumber(om.syncErrors.current) : '—'}
            comparison={om?.syncErrors}
            icon={<AlertTriangle className="h-4 w-4" />}
            tone={om?.syncErrors.trend === 'up' ? 'danger' : 'success'}
          />
          <MetricCard
            label="صحة API (نسبة النجاح)"
            value={om?.apiHealth.current ? `${om.apiHealth.current.toFixed(1)}%` : '—'}
            comparison={om?.apiHealth}
            icon={<HeartPulse className="h-4 w-4" />}
            tone="info"
          />
          <MetricCard
            label="متوسط وقت الاستجابة"
            value={om?.averageResponseTime.current ? `${Math.round(om.averageResponseTime.current)}ms` : '—'}
            comparison={om?.averageResponseTime}
            icon={<Clock className="h-4 w-4" />}
          />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-bold text-slate-700">أخطاء المزامنة الأخيرة</h4>
            {om?.recentSyncErrors && om.recentSyncErrors.length > 0 ? (
              <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {om.recentSyncErrors.slice(0, 10).map((err) => (
                  <li key={err.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-bold text-slate-800">{err.deviceName}</p>
                      <p className="text-[10px] text-slate-500">{err.tenantName} · {err.deviceId}</p>
                    </div>
                    <div className="shrink-0 text-left">
                      <StatusBadge value="FAILED" label="فشل" />
                      <p className="mt-1 text-[10px] text-slate-500">{formatDateTime(err.occurredAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<CheckCircle className="h-5 w-5" />} title="لا توجد أخطاء مزامنة" />
            )}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-bold text-slate-700">صحة نقاط API</h4>
            {om?.apiEndpointsHealth && om.apiEndpointsHealth.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {om.apiEndpointsHealth.map((ep) => (
                  <li key={ep.endpoint} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-mono text-slate-700">{ep.endpoint}</p>
                      <p className="text-[10px] text-slate-500">{ep.requests.toLocaleString('ar-EG')} طلب · {ep.avgResponseMs}ms متوسط</p>
                    </div>
                    <div className="shrink-0 text-left">
                      <div className="flex items-center gap-1">
                        <span className={`inline-flex h-2 w-2 rounded-full ${ep.successRate >= 99 ? 'bg-emerald-500' : ep.successRate >= 95 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                        <span className="text-[11px] font-bold text-slate-700">{ep.successRate.toFixed(1)}%</span>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-500">{ep.errors} خطأ</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Server className="h-5 w-5" />} title="لا توجد بيانات API" />
            )}
          </div>
        </div>
      </Panel>

      {/* Revenue by Plan Section */}
      <Panel
        title="الإيراد حسب الخطة"
        subtitle="إجمالي المدفوعات مجمّعة حسب خطة الاشتراك"
        icon={<Wallet className="h-4 w-4" />}
        iconClass="bg-emerald-50 text-emerald-600"
        className="xl:col-span-2"
      >
        {overview.revenueByPlan && overview.revenueByPlan.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="text-[10.5px] text-slate-500">
                  <th className="px-4 py-2 font-semibold">الخطة</th>
                  <th className="px-4 py-2 font-semibold">العملاء</th>
                  <th className="px-4 py-2 font-semibold">الإيراد</th>
                </tr>
              </thead>
              <tbody>
                {overview.revenueByPlan.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 text-[12px] font-semibold text-slate-700">{r.planName}</td>
                    <td className="px-4 py-2 text-[11px] text-slate-500">{r.tenants}</td>
                    <td className="px-4 py-2 text-[12px] font-bold text-emerald-700">{formatMoney(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="لا توجد بيانات إيراد" />
        )}
      </Panel>

      {/* Alerts Section */}
      <Panel
        title="التنبيهات الحرجة"
        subtitle={`${alerts.length} تنبيه يحتاج متابعة — مع إمكانية فتح العنصر ومعالجة المشكلة مباشرة`}
        icon={<Bell className="h-4 w-4" />}
        iconClass="bg-rose-50 text-rose-600"
        action={
          <DrillDownLink label="كل التنبيهات" href="/platform/alerts" icon={<ExternalLink className="h-3.5 w-3.5" />} count={alerts.length} />
        }
        className="xl:col-span-2"
      >
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-5 text-[12px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> كل التراخيص والاشتراكات والأنظمة في وضع سليم.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAction={(alertId, action) => {
                  console.log('Action triggered:', alertId, action);
                  // Navigate to relevant page based on entityType
                  if (alert.link) window.location.href = alert.link;
                }}
              />
            ))}
          </div>
        )}
      </Panel>

      {/* Reports / Quick Links */}
      <Panel
        title="التقارير والروابط السريعة"
        subtitle="مقارنة الفترات، مخططات، تصفية حسب الخطة والفترة"
        icon={<PieChart className="h-4 w-4" />}
        iconClass="bg-violet-50 text-violet-600"
        className="xl:col-span-2"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DrillDownLink
            label="تقرير الأداء التجاري"
            href={`/platform/reports/business?period=${period}${planFilter ? `&plan=${planFilter}` : ''}`}
            icon={<BarChart2 className="h-4 w-4" />}
          />
          <DrillDownLink
            label="تقرير العملاء"
            href={`/platform/reports/customers?period=${period}${planFilter ? `&plan=${planFilter}` : ''}`}
            icon={<UsersIcon className="h-4 w-4" />}
          />
          <DrillDownLink
            label="تقرير الاشتراكات"
            href={`/platform/reports/subscriptions?period=${period}${planFilter ? `&plan=${planFilter}` : ''}`}
            icon={<CalendarClock className="h-4 w-4" />}
          />
          <DrillDownLink
            label="تقرير التراخيص"
            href={`/platform/reports/licenses?period=${period}${planFilter ? `&plan=${planFilter}` : ''}`}
            icon={<KeyRound className="h-4 w-4" />}
          />
          <DrillDownLink
            label="تقرير التشغيل"
            href={`/platform/reports/operations?period=${period}`}
            icon={<Server className="h-4 w-4" />}
          />
          <DrillDownLink
            label="مقارنة الفترات"
            href={`/platform/reports/comparison?period=${period}${planFilter ? `&plan=${planFilter}` : ''}`}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <DrillDownLink
            label="تصدير بيانات (CSV)"
            href={`/platform/reports/export?period=${period}${planFilter ? `&plan=${planFilter}` : ''}`}
            icon={<Download className="h-4 w-4" />}
          />
          <DrillDownLink
            label="إعدادات التنبيهات"
            href="/platform/settings/alerts"
            icon={<Bell className="h-4 w-4" />}
          />
        </div>
      </Panel>
    </div>
  );
};

export default PlatformSuperAdminDashboard;