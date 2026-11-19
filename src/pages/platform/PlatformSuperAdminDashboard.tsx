import React from 'react';
import { DataTable } from '../../components/ui/DataTable';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  KeyRound,
  Wallet,
  TrendingUp,
  AlertTriangle,
  Users,
  ShieldCheck,
  Cpu,
  CalendarClock,
  Activity,
  Boxes,
  ScrollText,
  ShieldAlert,
  CheckCircle2,
  Rocket,
  BarChart2,
  PieChart,
  Zap,
  Server,
  Bell,
  ExternalLink,
  RefreshCw,
  Target,
  AlertCircle,
  Clock,
  RotateCcw,
  XCircle,
  CheckCircle,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  Wifi,
  WifiOff,
  HeartPulse,
  ReceiptText,
  Plus,
  UserPlus,
  Banknote,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type {
  PlatformOverview,
  PlatformPeriod,
  PlatformMetricComparison,
  PlatformPlan,
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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'نقدي',
  BANK: 'تحويل بنكي',
  CARD: 'بطاقة',
  WALLET: 'محفظة إلكترونية',
  OTHER: 'أخرى',
};

const TENANT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'نشط',
  TRIAL: 'تجريبي',
  SUSPENDED: 'موقوف',
  EXPIRED: 'منتهي',
  CANCELLED: 'ملغي',
};

const TENANT_STATUS_TONES: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  TRIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  SUSPENDED: 'bg-rose-50 text-rose-700 border-rose-200',
  EXPIRED: 'bg-slate-100 text-slate-600 border-slate-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'violet';

type DashMetric = {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: Tone;
  comparison?: PlatformMetricComparison;
};

/** Flat analytics payloads returned by the central server endpoints. */
interface CentralAnalytics {
  business?: {
    revenue?: number;
    newTenants?: number;
    newLicenses?: number;
    invoices?: number;
    invoiceTotal?: number;
  };
  customers?: {
    total?: number;
    active?: number;
    trial?: number;
    churned?: number;
    churnRate?: number | string;
  };
  subscriptions?: {
    total?: number;
    active?: number;
    cancelled?: number;
    mrr?: number;
  };
  licenses?: {
    total?: number;
    active?: number;
    revoked?: number;
    expiringSoon?: number;
  };
  operations?: {
    jobs?: Array<{ status: string; count: number }>;
    backups?: Array<{ status: string; count: number }>;
    errors?: Array<{ status: string; count: number }>;
  };
}

const ALERT_SEVERITY_MAP: Record<string, 'danger' | 'warning' | 'info' | 'success'> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  ERROR: 'danger',
  MEDIUM: 'warning',
  LOW: 'info',
  danger: 'danger',
  warning: 'warning',
  info: 'info',
  success: 'success',
};

const SEVERITY_ORDER = { danger: 0, warning: 1, info: 2, success: 3 } as const;

const cmpText = (
  c: PlatformMetricComparison | undefined,
  fmt: (n: number) => string = formatNumber,
): string =>
  c && typeof c.current === 'number' && Number.isFinite(c.current) ? fmt(c.current) : '—';

const pctText = (c: PlatformMetricComparison | undefined, digits = 1): string =>
  cmpText(c, (n) => `${n.toFixed(digits)}%`);

const sumStatusCounts = (rows?: Array<{ status: string; count: number }>): number =>
  Array.isArray(rows) ? rows.reduce((acc, r) => acc + (Number(r.count) || 0), 0) : 0;

const periodLabel = (period: string): string =>
  period === '7d' ? 'آخر 7 أيام'
    : period === '30d' ? 'آخر 30 يوم'
    : period === '90d' ? 'آخر 90 يوم'
    : period === '180d' ? 'آخر 180 يوم'
    : period === '365d' ? 'آخر 365 يوم'
    : period === 'ytd' ? 'منذ بداية السنة'
    : 'الفترة المحددة';

export const PlatformSuperAdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = React.useState<PlatformOverview | null>(null);
  const [centralAnalytics, setCentralAnalytics] = React.useState<CentralAnalytics | null>(null);
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [isCentral, setIsCentral] = React.useState(false);
  const [period, setPeriod] = React.useState<string>('30d');
  const [planFilter, setPlanFilter] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  const loadOverview = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const centralState = getCentralDataSourceState();
    setIsCentral(centralState.active);
    try {
      if (centralState.active) {
        const [data, plns] = await Promise.all([
          centralPlatformClient.getOverview(),
          centralPlatformClient.listPlans().catch(() => [] as PlatformPlan[]),
        ]);
        setOverview(data as PlatformOverview);
        setPlans(Array.isArray(plns) ? plns : []);
        setCentralAnalytics(null);

        // The central overview endpoint returns empty metric shells — fetch the
        // dedicated analytics endpoints (best-effort; they need analytics permission).
        const [bp, cm, sm, lm, om] = await Promise.allSettled([
          centralPlatformClient.getBusinessPerformance(period),
          centralPlatformClient.getCustomerMetrics(period),
          centralPlatformClient.getSubscriptionMetrics(),
          centralPlatformClient.getLicenseMetrics(),
          centralPlatformClient.getOperationsMetrics(),
        ]);
        setCentralAnalytics({
          business: bp.status === 'fulfilled' ? bp.value : undefined,
          customers: cm.status === 'fulfilled' ? cm.value : undefined,
          subscriptions: sm.status === 'fulfilled' ? sm.value : undefined,
          licenses: lm.status === 'fulfilled' ? lm.value : undefined,
          operations: om.status === 'fulfilled' ? om.value : undefined,
        });
      } else {
        const data = platformAdminService.getOverviewWithPeriod(period as PlatformPeriod, planFilter || undefined);
        setOverview(data);
        setPlans(platformAdminService.listPlans());
        setCentralAnalytics(null);
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

  // Auto-refresh every 60 seconds (skip while the tab is hidden)
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) loadOverview();
    }, 60000);
    return () => window.clearInterval(id);
  }, [loadOverview]);

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

  const latestReleaseRaw = overview.releases?.[0] as any;
  const latestReleaseDate = latestReleaseRaw
    ? (latestReleaseRaw.releasedAt ?? latestReleaseRaw.releaseDate ?? latestReleaseRaw.released_at ?? latestReleaseRaw.createdAt ?? latestReleaseRaw.created_at)
    : null;
  const latestReleaseChannel = latestReleaseRaw ? (CHANNEL_LABELS[latestReleaseRaw.channel] ?? latestReleaseRaw.channel) : null;

  // Rich analytics are only present in local mode; the central overview endpoint
  // returns empty shells ({}), so validate the shape before using them.
  const bp = overview.businessPerformance?.revenue?.total ? overview.businessPerformance : undefined;
  const cm = overview.customerMetrics?.newCustomers ? overview.customerMetrics : undefined;
  const sm = overview.subscriptionMetrics?.upcomingRenewals ? overview.subscriptionMetrics : undefined;
  const lm = overview.licenseMetrics?.activatedDevices ? overview.licenseMetrics : undefined;
  const om = overview.operationsMetrics?.connectedDevices ? overview.operationsMetrics : undefined;
  const ca = centralAnalytics;

  const go = (path: string) => navigate(path);

  // ── Section metric builders ──────────────────────────────────────────────
  const businessMetrics: DashMetric[] = bp
    ? [
        { label: 'إجمالي الإيرادات', value: cmpText(bp.revenue.total, formatMoney), comparison: bp.revenue.total, icon: <DollarSign className="h-4 w-4" /> },
        { label: 'الإيراد الشهري المتكرر (MRR)', value: cmpText(bp.revenue.mrr, formatMoney), comparison: bp.revenue.mrr, icon: <RotateCcw className="h-4 w-4" /> },
        { label: 'الإيراد السنوي المتكرر (ARR)', value: cmpText(bp.revenue.arr, formatMoney), comparison: bp.revenue.arr, icon: <Target className="h-4 w-4" /> },
        { label: 'صافي الإيراد', value: cmpText(bp.revenue.netRevenue, formatMoney), comparison: bp.revenue.netRevenue, icon: <TrendingUp className="h-4 w-4" /> },
        {
          label: 'معدل النمو',
          value: pctText(bp.revenue.growthRate),
          comparison: bp.revenue.growthRate,
          icon: <ArrowUpRight className="h-4 w-4" />,
          tone: bp.revenue.growthRate.trend === 'up' ? 'success' : bp.revenue.growthRate.trend === 'down' ? 'danger' : 'default',
        },
      ]
    : ca?.business
      ? [
          { label: `إيرادات ${periodLabel(period)}`, value: ca.business.revenue != null ? formatMoney(ca.business.revenue) : '—', icon: <DollarSign className="h-4 w-4" />, tone: 'success' },
          { label: 'إجمالي قيمة الفواتير', value: ca.business.invoiceTotal != null ? formatMoney(ca.business.invoiceTotal) : '—', icon: <ReceiptText /> },
          { label: 'عدد الفواتير', value: ca.business.invoices != null ? formatNumber(ca.business.invoices) : '—', icon: <ReceiptText /> },
          { label: 'عملاء جدد', value: ca.business.newTenants != null ? formatNumber(ca.business.newTenants) : '—', icon: <Users className="h-4 w-4" /> },
          { label: 'تراخيص جديدة', value: ca.business.newLicenses != null ? formatNumber(ca.business.newLicenses) : '—', icon: <KeyRound className="h-4 w-4" />, tone: 'violet' },
        ]
      : [];

  const customerMetrics: DashMetric[] = cm
    ? [
        { label: 'عملاء جدد', value: cmpText(cm.newCustomers), comparison: cm.newCustomers, icon: <Users className="h-4 w-4" /> },
        { label: 'عملاء نشطون', value: cmpText(cm.activeCustomers), comparison: cm.activeCustomers, icon: <CheckCircle2 className="h-4 w-4" />, tone: 'success' },
        { label: 'عملاء ملغون', value: cmpText(cm.cancelledCustomers), comparison: cm.cancelledCustomers, icon: <XCircle className="h-4 w-4" />, tone: 'danger' },
        {
          label: 'معدل الفقد (Churn)',
          value: pctText(cm.churnRate, 2),
          comparison: cm.churnRate,
          icon: <TrendingDown className="h-4 w-4" />,
          tone: cm.churnRate.trend === 'up' ? 'danger' : cm.churnRate.trend === 'down' ? 'success' : 'default',
        },
        { label: 'تحويل تجريب → مدفوع', value: pctText(cm.trialToPaidConversion), comparison: cm.trialToPaidConversion, icon: <RotateCcw className="h-4 w-4" />, tone: 'info' },
        { label: 'متوسط الإيراد/عميل (ARPC)', value: cmpText(cm.averageRevenuePerCustomer, formatMoney), comparison: cm.averageRevenuePerCustomer, icon: <DollarSign className="h-4 w-4" /> },
      ]
    : ca?.customers
      ? [
          { label: 'إجمالي العملاء', value: ca.customers.total != null ? formatNumber(ca.customers.total) : '—', icon: <Users className="h-4 w-4" /> },
          { label: 'عملاء نشطون', value: ca.customers.active != null ? formatNumber(ca.customers.active) : '—', icon: <CheckCircle2 className="h-4 w-4" />, tone: 'success' },
          { label: 'عملاء تجريبيون', value: ca.customers.trial != null ? formatNumber(ca.customers.trial) : '—', icon: <Clock className="h-4 w-4" />, tone: 'warning' },
          { label: 'عملاء ملغون (30 يوم)', value: ca.customers.churned != null ? formatNumber(ca.customers.churned) : '—', icon: <XCircle className="h-4 w-4" />, tone: 'danger' },
          { label: 'معدل الفقد (Churn)', value: ca.customers.churnRate != null ? `${Number(ca.customers.churnRate).toFixed(2)}%` : '—', icon: <TrendingDown className="h-4 w-4" />, tone: 'danger' },
        ]
      : [];

  const subscriptionMetrics: DashMetric[] = sm
    ? [
        { label: 'تجارب منتهية', value: cmpText(sm.expiredTrials), comparison: sm.expiredTrials, icon: <Clock className="h-4 w-4" />, tone: 'warning' },
        { label: 'تجديدات قادمة (30 يوم)', value: cmpText(sm.upcomingRenewals), comparison: sm.upcomingRenewals, icon: <RotateCcw className="h-4 w-4" />, tone: 'info' },
        { label: 'اشتراكات متعثرة', value: cmpText(sm.strugglingSubscriptions), comparison: sm.strugglingSubscriptions, icon: <AlertCircle className="h-4 w-4" />, tone: 'danger' },
        { label: 'معدل تحويل التجربة', value: pctText(sm.trialConversionRate), comparison: sm.trialConversionRate, icon: <CheckCircle className="h-4 w-4" />, tone: 'success' },
        { label: 'متوسط قيمة الاشتراك', value: cmpText(sm.averageSubscriptionValue, formatMoney), comparison: sm.averageSubscriptionValue, icon: <Wallet className="h-4 w-4" /> },
        { label: 'معدل التجديد', value: pctText(sm.renewalRate), comparison: sm.renewalRate, icon: <RotateCcw className="h-4 w-4" />, tone: 'violet' },
      ]
    : ca?.subscriptions
      ? [
          { label: 'إجمالي الاشتراكات', value: ca.subscriptions.total != null ? formatNumber(ca.subscriptions.total) : '—', icon: <CalendarClock className="h-4 w-4" /> },
          { label: 'اشتراكات نشطة', value: ca.subscriptions.active != null ? formatNumber(ca.subscriptions.active) : '—', icon: <CheckCircle2 className="h-4 w-4" />, tone: 'success' },
          { label: 'اشتراكات ملغاة', value: ca.subscriptions.cancelled != null ? formatNumber(ca.subscriptions.cancelled) : '—', icon: <XCircle className="h-4 w-4" />, tone: 'danger' },
          { label: 'الإيراد الشهري (MRR)', value: ca.subscriptions.mrr != null ? formatMoney(ca.subscriptions.mrr) : '—', icon: <Wallet className="h-4 w-4" />, tone: 'info' },
        ]
      : [];

  const licenseMetrics: DashMetric[] = lm
    ? [
        { label: 'أجهزة مفعلة', value: cmpText(lm.activatedDevices), comparison: lm.activatedDevices, icon: <Cpu className="h-4 w-4" />, tone: 'success' },
        { label: 'معدل الاستخدام', value: pctText(lm.utilizationRate), comparison: lm.utilizationRate, icon: <Activity className="h-4 w-4" />, tone: 'info' },
        { label: 'تراخيص معلقة (ISSUED)', value: cmpText(lm.pendingLicenses), comparison: lm.pendingLicenses, icon: <Clock className="h-4 w-4" />, tone: 'warning' },
        { label: 'تفعيلات فاشلة', value: cmpText(lm.failedActivations), comparison: lm.failedActivations, icon: <XCircle className="h-4 w-4" />, tone: 'danger' },
        { label: 'معدل نجاح التفعيل', value: pctText(lm.activationSuccessRate), comparison: lm.activationSuccessRate, icon: <CheckCircle className="h-4 w-4" />, tone: 'success' },
        { label: 'تنتهي قريباً (30 يوم)', value: cmpText(lm.expiringSoon), comparison: lm.expiringSoon, icon: <AlertTriangle className="h-4 w-4" />, tone: 'warning' },
      ]
    : ca?.licenses
      ? [
          { label: 'إجمالي التراخيص', value: ca.licenses.total != null ? formatNumber(ca.licenses.total) : '—', icon: <KeyRound className="h-4 w-4" /> },
          { label: 'تراخيص نشطة', value: ca.licenses.active != null ? formatNumber(ca.licenses.active) : '—', icon: <CheckCircle2 className="h-4 w-4" />, tone: 'success' },
          { label: 'تراخيص ملغاة', value: ca.licenses.revoked != null ? formatNumber(ca.licenses.revoked) : '—', icon: <XCircle className="h-4 w-4" />, tone: 'danger' },
          { label: 'تنتهي قريباً (30 يوم)', value: ca.licenses.expiringSoon != null ? formatNumber(ca.licenses.expiringSoon) : '—', icon: <AlertTriangle className="h-4 w-4" />, tone: 'warning' },
        ]
      : [];

  const operationsMetrics: DashMetric[] = om
    ? [
        { label: 'أجهزة متصلة', value: cmpText(om.connectedDevices), comparison: om.connectedDevices, icon: <Wifi className="h-4 w-4" />, tone: 'success' },
        { label: 'أجهزة غير متصلة', value: cmpText(om.disconnectedDevices), comparison: om.disconnectedDevices, icon: <WifiOff className="h-4 w-4" />, tone: 'danger' },
        { label: 'أخطاء المزامنة', value: cmpText(om.syncErrors), comparison: om.syncErrors, icon: <AlertTriangle className="h-4 w-4" />, tone: om.syncErrors.trend === 'up' ? 'danger' : 'success' },
        { label: 'صحة المزامنة (نسبة النجاح)', value: pctText(om.apiHealth), comparison: om.apiHealth, icon: <HeartPulse className="h-4 w-4" />, tone: 'info' },
        { label: 'متوسط وقت الاستجابة', value: om.averageResponseTime.current ? `${Math.round(om.averageResponseTime.current)}ms` : '—', comparison: om.averageResponseTime, icon: <Clock className="h-4 w-4" /> },
      ]
    : ca?.operations
      ? [
          { label: 'مهام التشغيل', value: formatNumber(sumStatusCounts(ca.operations.jobs)), icon: <Server className="h-4 w-4" /> },
          { label: 'النسخ الاحتياطية', value: formatNumber(sumStatusCounts(ca.operations.backups)), icon: <Boxes className="h-4 w-4" />, tone: 'info' },
          { label: 'تقارير الأخطاء', value: formatNumber(sumStatusCounts(ca.operations.errors)), icon: <AlertTriangle className="h-4 w-4" />, tone: 'danger' },
        ]
      : [];

  const metricGridClass = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-6 mb-4';

  const renderMetricGrid = (items: DashMetric[]) => (
    <div className={metricGridClass}>
      {items.map((m) => (
        <MetricCard
          key={m.label}
          label={m.label}
          value={m.value}
          comparison={m.comparison}
          icon={m.icon}
          tone={m.tone}
        />
      ))}
    </div>
  );

  const renderEmptyMetrics = (title: string) => (
    <EmptyState icon={<BarChart2 className="h-5 w-5" />} title={title} />
  );

  // ── Alerts normalization ─────────────────────────────────────────────────
  const rawAlerts: any[] = Array.isArray(overview.alertDetails) && overview.alertDetails.length > 0
    ? overview.alertDetails
    : Array.isArray(overview.alerts) ? overview.alerts : [];

  const alerts = rawAlerts
    .map((a: any, index: number) => ({
      id: String(a.id ?? `alert-${index}`),
      severity: ALERT_SEVERITY_MAP[String(a.severity ?? '').toUpperCase()] ?? ALERT_SEVERITY_MAP[String(a.severity ?? '').toLowerCase()] ?? 'info',
      title: String(a.title ?? a.message ?? 'تنبيه'),
      description: String(a.description ?? ''),
      link: a.link ?? (isCentral ? '/platform/emergency' : undefined),
      entityType: a.entityType,
      entityId: a.entityId != null ? String(a.entityId) : undefined,
      actionRequired: Boolean(a.actionRequired),
      suggestedActions: Array.isArray(a.suggestedActions) ? a.suggestedActions.map(String) : undefined,
    }))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

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
            {latestReleaseRaw && (
              <p className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold text-slate-200">
                <Rocket className="h-3.5 w-3.5 text-emerald-300" />
                آخر إصدار: <span dir="ltr" className="font-mono">v{latestReleaseRaw.version}</span>
                {latestReleaseChannel && <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-emerald-200">{latestReleaseChannel}</span>}
                <span className="text-slate-400">· {formatDate(latestReleaseDate)}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PeriodSelector value={period} onChange={setPeriod} className="w-auto min-w-[150px]" />
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              disabled={isCentral}
              title={isCentral ? 'تصفية الخطط غير مدعومة في الوضع المركزي' : undefined}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 w-auto min-w-[180px] disabled:opacity-50"
              aria-label="تصفية حسب الخطة"
            >
              <option value="">كل الخطط</option>
              {plans.map((plan) => (
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

      {isCentral && (
        <CentralUnsupportedNotice feature="الرسوم البيانية والقوائم التفصيلية" />
      )}

      {/* Quick Stats Hero */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="إجمالي العملاء"
          value={formatNumber(overview.tenants?.total ?? 0)}
          comparison={cm?.newCustomers}
          icon={<Building2 className="h-4 w-4" />}
          onClick={() => go('/platform/tenants')}
        />
        <MetricCard
          label="العملاء النشطون"
          value={formatNumber(overview.tenants?.active ?? 0)}
          comparison={cm?.activeCustomers}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
        />
        <MetricCard
          label="إجمالي الإيرادات"
          value={formatMoney(overview.billing?.revenueTotal ?? 0)}
          comparison={bp?.revenue.total}
          icon={<Wallet className="h-4 w-4" />}
          tone="success"
          onClick={() => go('/platform/billing')}
        />
        <MetricCard
          label="الإيراد الشهري (MRR)"
          value={formatMoney(overview.billing?.mrr ?? 0)}
          comparison={bp?.revenue.mrr}
          icon={<Activity className="h-4 w-4" />}
          tone="info"
        />
        <MetricCard
          label="التراخيص السارية"
          value={formatNumber(overview.licenses?.active ?? 0)}
          comparison={lm?.activatedDevices}
          icon={<KeyRound className="h-4 w-4" />}
          tone="violet"
          onClick={() => go('/platform/licenses')}
        />
      </section>

      {/* Quick Actions */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'عميل جديد',
            hint: 'معالج خطوة بخطوة',
            href: '/platform/tenants?new=1',
            icon: <UserPlus className="h-5 w-5" />,
            chip: 'bg-emerald-50 text-emerald-600',
          },
          {
            label: 'إنشاء فاتورة',
            hint: 'الفوترة والمدفوعات',
            href: '/platform/billing',
            icon: <ReceiptText className="h-5 w-5" />,
            chip: 'bg-sky-50 text-sky-600',
          },
          {
            label: 'إدارة الاشتراكات',
            hint: 'تجديدات وتجارب',
            href: '/platform/subscriptions',
            icon: <CalendarClock className="h-5 w-5" />,
            chip: 'bg-violet-50 text-violet-600',
          },
          {
            label: 'مركز الطوارئ',
            hint: alerts.length > 0 ? `${alerts.length} تنبيه نشط` : 'كل الأنظمة سليمة',
            href: '/platform/emergency',
            icon: <ShieldAlert className="h-5 w-5" />,
            chip: alerts.length > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500',
          },
        ].map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => go(action.href)}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-right shadow-sm transition hover:border-emerald-300 hover:shadow"
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${action.chip}`}>{action.icon}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-slate-800 group-hover:text-emerald-700">{action.label}</span>
              <span className="block truncate text-[10.5px] text-slate-500">{action.hint}</span>
            </span>
            <Plus className="mr-auto h-4 w-4 text-slate-300 transition group-hover:text-emerald-500" />
          </button>
        ))}
      </section>

      {/* Tenant Status Overview */}
      <Panel
        title="حالة العملاء"
        subtitle="توزيع العملاء حسب الحالة — اضغط على أي حالة لعرضها في صفحة العملاء"
        icon={<Users className="h-4 w-4" />}
        iconClass="bg-sky-50 text-sky-600"
        action={
          <DrillDownLink label="كل العملاء" href="/platform/tenants" icon={<ExternalLink className="h-3.5 w-3.5" />} />
        }
      >
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {(['ACTIVE', 'TRIAL', 'SUSPENDED', 'EXPIRED', 'CANCELLED'] as const).map((status) => {
            const count = overview.tenants?.[status.toLowerCase() as keyof typeof overview.tenants] as number | undefined;
            return (
              <button
                key={status}
                type="button"
                onClick={() => go(`/platform/tenants?status=${status}`)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-right transition hover:shadow-sm ${TENANT_STATUS_TONES[status]}`}
              >
                <div>
                  <p className="text-[11px] font-semibold opacity-80">{TENANT_STATUS_LABELS[status]}</p>
                  <p className="mt-0.5 text-[20px] font-black leading-tight">{formatNumber(count ?? 0)}</p>
                </div>
                <StatusBadge value={status} label={TENANT_STATUS_LABELS[status]} />
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => go('/platform/subscriptions')}
            className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-right transition hover:shadow-sm"
          >
            <div>
              <p className="text-[11px] font-semibold text-amber-700">اشتراك ينتهي قريباً</p>
              <p className="mt-0.5 text-[20px] font-black leading-tight text-amber-800">{formatNumber(overview.tenants?.expiringSoon ?? 0)}</p>
            </div>
            <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-bold text-amber-700">30 يوم</span>
          </button>
        </div>
      </Panel>

      {/* Business Performance Section */}
      <Panel
        title="الأداء التجاري"
        subtitle={`مقارنة ${periodLabel(period)} مع الفترة السابقة`}
        icon={<BarChart2 className="h-4 w-4" />}
        iconClass="bg-emerald-50 text-emerald-600"
        action={
          <DrillDownLink label="التحليلات" href="/platform/analytics" icon={<ExternalLink className="h-3.5 w-3.5" />} />
        }
      >
        {businessMetrics.length === 0 ? renderEmptyMetrics('لا تتوفر بيانات الأداء التجاري') : (
          <>
            {renderMetricGrid(businessMetrics)}
            {bp?.timeSeries?.revenue && bp.timeSeries.revenue.length > 0 && (
              <LineChart
                data={bp.timeSeries.revenue}
                height={280}
                color="#10b981"
                yAxisFormatter={(v) => formatMoney(v).replace('EGP', '').trim()}
                aria-label="مخطط الإيرادات عبر الزمن"
              />
            )}
          </>
        )}
      </Panel>

      {/* Customers Section */}
      <Panel
        title="العملاء"
        subtitle={`جديد، نشط، ملغي، ومعدل الفقد (Churn Rate) — ${periodLabel(period)}`}
        icon={<Users className="h-4 w-4" />}
        iconClass="bg-sky-50 text-sky-600"
        action={
          <>
            <DrillDownLink label="العملاء" href="/platform/tenants" icon={<ExternalLink className="h-3.5 w-3.5" />} />
            <DrillDownLink label="التحليلات" href="/platform/analytics" icon={<BarChart2 className="h-3.5 w-3.5" />} />
          </>
        }
      >
        {customerMetrics.length === 0 ? renderEmptyMetrics('لا تتوفر بيانات العملاء') : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6 mb-4">
              {customerMetrics.map((m) => (
                <MetricCard key={m.label} label={m.label} value={m.value} comparison={m.comparison} icon={m.icon} tone={m.tone} />
              ))}
            </div>
            {cm?.timeSeries?.newCustomers && cm.timeSeries.newCustomers.length > 0 && (
              <LineChart
                data={cm.timeSeries.newCustomers}
                height={280}
                color="#0ea5e9"
                yAxisFormatter={(v) => formatNumber(v)}
                aria-label="مخطط العملاء الجدد عبر الزمن"
              />
            )}
            {cm?.topCustomersByRevenue && cm.topCustomersByRevenue.length > 0 && (
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-bold text-slate-700">أعلى العملاء إيراداً</h4>
                <div className="overflow-x-auto">
                  <DataTable
                    ariaLabel="أعلى العملاء إيراداً"
                    rows={cm.topCustomersByRevenue.slice(0, 10)}
                    rowKey={(cust) => cust.id}
                    onRowClick={() => go('/platform/tenants')}
                    tableClassName="text-sm"
                    columns={[
                      { key: 'name', header: 'العميل', render: (cust) => <span className="text-[12px] font-semibold text-slate-700">{cust.name}</span> },
                      { key: 'code', header: 'الكود', render: (cust) => <span className="text-[11px] text-slate-500 font-mono">{cust.code}</span> },
                      { key: 'status', header: 'الحالة', render: (cust) => <StatusBadge value={cust.status} /> },
                      { key: 'revenue', header: 'الإيراد', render: (cust) => <span className="text-[12px] font-bold text-emerald-700">{formatMoney(cust.revenue)}</span> },
                      { key: 'invoices', header: 'الفواتير', render: (cust) => <span className="text-[11px] text-slate-500">{cust.invoicesCount}</span> },
                    ]}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </Panel>

      {/* Recent Tenants */}
      <Panel
        title="أحدث العملاء المسجلين"
        subtitle="آخر العملاء الذين انضموا إلى المنصة"
        icon={<UserPlus className="h-4 w-4" />}
        iconClass="bg-emerald-50 text-emerald-600"
        action={
          <DrillDownLink label="كل العملاء" href="/platform/tenants" icon={<ExternalLink className="h-3.5 w-3.5" />} />
        }
      >
        {Array.isArray(overview.recentTenants) && overview.recentTenants.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {overview.recentTenants.slice(0, 8).map((tenant) => (
              <li key={tenant.id} className="flex items-center justify-between gap-3 px-2 py-3 hover:bg-slate-50 cursor-pointer" onClick={() => go('/platform/tenants')}>
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-bold text-slate-800">{tenant.name}</p>
                  <p className="text-[10.5px] text-slate-500">
                    <span dir="ltr" className="font-mono">{tenant.code}</span>
                    {tenant.planName ? ` · ${tenant.planName}` : ''}
                    {tenant.businessType ? ` · ${tenant.businessType}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-left">
                  <div>
                    <StatusBadge value={tenant.status} />
                    <p className="mt-1 text-[10px] text-slate-500">{formatDate(tenant.createdAt)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Building2 className="h-5 w-5" />} title="لا يوجد عملاء جدد" />
        )}
      </Panel>

      {/* Subscriptions Section */}
      <Panel
        title="الاشتراكات"
        subtitle={`تجارب منتهية، تجديدات قادمة، اشتراكات متعثرة — ${periodLabel(period)}`}
        icon={<CalendarClock className="h-4 w-4" />}
        iconClass="bg-violet-50 text-violet-600"
        action={
          <>
            <DrillDownLink label="الاشتراكات" href="/platform/subscriptions" icon={<ExternalLink className="h-3.5 w-3.5" />} />
            <DrillDownLink label="التجديدات" href="/platform/subscriptions?filter=renewals" icon={<RotateCcw className="h-3.5 w-3.5" />} />
          </>
        }
      >
        {subscriptionMetrics.length === 0 ? renderEmptyMetrics('لا تتوفر بيانات الاشتراكات') : (
          <>
            {renderMetricGrid(subscriptionMetrics)}
            {sm && (
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-sm font-bold text-slate-700">التجديدات القادمة (30 يوم)</h4>
                  {sm.upcomingRenewalsList && sm.upcomingRenewalsList.length > 0 ? (
                    <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                      {sm.upcomingRenewalsList.slice(0, 10).map((sub) => (
                        <li key={sub.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer" onClick={() => go('/platform/tenants')}>
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
                  {sm.strugglingList && sm.strugglingList.length > 0 ? (
                    <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                      {sm.strugglingList.slice(0, 10).map((sub) => (
                        <li key={sub.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer" onClick={() => go('/platform/tenants')}>
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
            )}
          </>
        )}
      </Panel>

      {/* Licenses Section */}
      <Panel
        title="التراخيص"
        subtitle={`أجهزة مفعلة، استخدام، تراخيص معلقة، محاولات فاشلة — ${periodLabel(period)}`}
        icon={<KeyRound className="h-4 w-4" />}
        iconClass="bg-amber-50 text-amber-600"
        action={
          <>
            <DrillDownLink label="التراخيص" href="/platform/licenses" icon={<ExternalLink className="h-3.5 w-3.5" />} />
            <DrillDownLink label="الأجهزة" href="/platform/devices" icon={<Zap className="h-3.5 w-3.5" />} />
          </>
        }
      >
        {licenseMetrics.length === 0 ? renderEmptyMetrics('لا تتوفر بيانات التراخيص') : (
          <>
            {renderMetricGrid(licenseMetrics)}
            {lm && (
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-sm font-bold text-slate-700">محاولات التفعيل الفاشلة (الأخيرة)</h4>
                  {lm.failedActivationsList && lm.failedActivationsList.length > 0 ? (
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
                  {lm.pendingLicensesList && lm.pendingLicensesList.length > 0 ? (
                    <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                      {lm.pendingLicensesList.slice(0, 10).map((lic) => (
                        <li key={lic.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer" onClick={() => go('/platform/licenses')}>
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
            )}
          </>
        )}
      </Panel>

      {/* Operations Section */}
      <Panel
        title="التشغيل"
        subtitle={`أجهزة متصلة/غير متصلة، أخطاء مزامنة، صحة المزامنة — ${periodLabel(period)}`}
        icon={<Server className="h-4 w-4" />}
        iconClass="bg-slate-100 text-slate-600"
        action={
          <>
            <DrillDownLink label="الأجهزة" href="/platform/devices" icon={<ExternalLink className="h-3.5 w-3.5" />} />
            <DrillDownLink label="السجلات" href="/platform/audit" icon={<ScrollText className="h-3.5 w-3.5" />} />
          </>
        }
      >
        {operationsMetrics.length === 0 ? renderEmptyMetrics('لا تتوفر بيانات التشغيل') : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 mb-4">
              {operationsMetrics.map((m) => (
                <MetricCard key={m.label} label={m.label} value={m.value} comparison={m.comparison} icon={m.icon} tone={m.tone} />
              ))}
            </div>
            {om && (
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-sm font-bold text-slate-700">أخطاء المزامنة الأخيرة</h4>
                  {om.recentSyncErrors && om.recentSyncErrors.length > 0 ? (
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
                  {om.apiEndpointsHealth && om.apiEndpointsHealth.length > 0 ? (
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
            )}
          </>
        )}
      </Panel>

      {/* Revenue by Plan Section */}
      <Panel
        title="الإيراد حسب الخطة"
        subtitle="إجمالي الاشتراكات النشطة مجمّعة حسب خطة الاشتراك"
        icon={<Wallet className="h-4 w-4" />}
        iconClass="bg-emerald-50 text-emerald-600"
      >
        {overview.revenueByPlan && overview.revenueByPlan.length > 0 ? (
          <div className="overflow-x-auto">
            <DataTable
            ariaLabel="الإيراد حسب الخطة"
            rows={overview.revenueByPlan.map((r, i) => ({ ...r, __i: i }))}
            rowKey={(r) => `${r.planName}-${r.__i}`}
            tableClassName="text-sm"
            columns={[
              { key: 'plan', header: 'الخطة', render: (r) => <span className="text-[12px] font-semibold text-slate-700">{r.planName}</span> },
              { key: 'tenants', header: 'العملاء', render: (r) => <span className="text-[11px] text-slate-500">{r.tenants}</span> },
              { key: 'revenue', header: 'الإيراد', render: (r) => <span className="text-[12px] font-bold text-emerald-700">{formatMoney(r.revenue)}</span> },
            ]}
          />
          </div>
        ) : (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="لا توجد بيانات إيراد" />
        )}
      </Panel>

      {/* Recent Payments */}
      <Panel
        title="أحدث المدفوعات"
        subtitle="آخر المبالغ المحصلة من العملاء"
        icon={<Banknote className="h-4 w-4" />}
        iconClass="bg-emerald-50 text-emerald-600"
        action={
          <DrillDownLink label="الفوترة" href="/platform/billing" icon={<ExternalLink className="h-3.5 w-3.5" />} />
        }
      >
        {Array.isArray(overview.recentPayments) && overview.recentPayments.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {overview.recentPayments.slice(0, 8).map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3 px-2 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-bold text-slate-800">{payment.tenantName || '—'}</p>
                  <p className="text-[10.5px] text-slate-500">
                    {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                    {payment.invoiceNumber ? ` · فاتورة ${payment.invoiceNumber}` : ''}
                    {payment.reference ? ` · مرجع ${payment.reference}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-left">
                  <p className="text-[13px] font-black text-emerald-700">{formatMoney(payment.amount)}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">{formatDateTime(payment.paidAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<ReceiptText className="h-5 w-5" />} title="لا توجد مدفوعات حديثة" />
        )}
      </Panel>

      {/* Alerts Section */}
      <Panel
        title="التنبيهات"
        subtitle={`${alerts.length} تنبيه يحتاج متابعة — مع إمكانية فتح العنصر مباشرة`}
        icon={<Bell className="h-4 w-4" />}
        iconClass="bg-rose-50 text-rose-600"
        action={
          <DrillDownLink label="مركز الطوارئ" href="/platform/emergency" icon={<ExternalLink className="h-3.5 w-3.5" />} count={alerts.length} />
        }
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
                onAction={alert.suggestedActions?.length
                  ? (_alertId, _action) => {
                      if (alert.link) go(alert.link);
                    }
                  : undefined}
              />
            ))}
          </div>
        )}
      </Panel>

      {/* Reports / Quick Links */}
      <Panel
        title="التقارير والروابط السريعة"
        subtitle="التحليلات، المقارنة بين الفترات، والتصدير"
        icon={<PieChart className="h-4 w-4" />}
        iconClass="bg-violet-50 text-violet-600"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DrillDownLink
            label="التحليلات والتقارير"
            href={`/platform/analytics`}
            icon={<BarChart2 className="h-4 w-4" />}
          />
          <DrillDownLink
            label="العملاء"
            href="/platform/tenants"
            icon={<Users className="h-4 w-4" />}
          />
          <DrillDownLink
            label="الاشتراكات"
            href="/platform/subscriptions"
            icon={<CalendarClock className="h-4 w-4" />}
          />
          <DrillDownLink
            label="التراخيص"
            href="/platform/licenses"
            icon={<KeyRound className="h-4 w-4" />}
          />
          <DrillDownLink
            label="الأجهزة والمزامنة"
            href="/platform/devices"
            icon={<Server className="h-4 w-4" />}
          />
          <DrillDownLink
            label="مركز الطوارئ"
            href="/platform/emergency"
            icon={<ShieldAlert className="h-4 w-4" />}
          />
          <DrillDownLink
            label="سجل التدقيق"
            href="/platform/audit"
            icon={<ScrollText className="h-4 w-4" />}
          />
          <DrillDownLink
            label="إعدادات المنصة"
            href="/platform/settings"
            icon={<Bell className="h-4 w-4" />}
          />
        </div>
      </Panel>
    </div>
  );
};

export default PlatformSuperAdminDashboard;
