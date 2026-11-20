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
  ScrollText,
  ShieldAlert,
  CheckCircle2,
  Rocket,
  BarChart2,
  PieChart,
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
  CreditCard,
  Layers,
  FileClock,
  MonitorSmartphone,
  GitBranch,
} from 'lucide-react';
import type {
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
import {
  LineChart,
  DonutChart,
  MetricCard,
  Panel,
  PeriodSelector,
  DrillDownLink,
  AlertCard,
} from './components/Charts';
import { usePlatformDashboardData } from './dashboard/usePlatformDashboardData';
import {
  CHANNEL_LABELS,
  PAYMENT_METHOD_LABELS,
  TENANT_STATUS_LABELS,
  TENANT_STATUS_TONES,
} from './platformLabels';

const SUB_STATUS_COLORS: Record<string, string> = {
  نشط: '#10b981',
  تجريبي: '#0ea5e9',
  منتهي: '#94a3b8',
  ملغي: '#f43f5e',
  أخرى: '#a78bfa',
};

const LIC_STATUS_COLORS: Record<string, string> = {
  نشطة: '#10b981',
  معلقة: '#f59e0b',
  موقوفة: '#f43f5e',
  منتهية: '#94a3b8',
  ملغاة: '#a78bfa',
};

const AUDIT_SEVERITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-danger',
  SECURITY: 'bg-danger',
  WARNING: 'bg-warning',
  NOTICE: 'bg-primary',
  INFO: 'bg-line-strong',
};

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'violet';

type DashMetric = {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: Tone;
  comparison?: PlatformMetricComparison;
};

const cmpText = (
  c: PlatformMetricComparison | undefined,
  fmt: (n: number) => string = formatNumber,
): string =>
  c && typeof c.current === 'number' && Number.isFinite(c.current) ? fmt(c.current) : '—';

const pctText = (c: PlatformMetricComparison | undefined, digits = 1): string =>
  cmpText(c, (n) => `${n.toFixed(digits)}%`);

const periodLabel = (period: string): string =>
  period === '7d' ? 'آخر 7 أيام'
    : period === '30d' ? 'آخر 30 يوم'
    : period === '90d' ? 'آخر 90 يوم'
    : period === '180d' ? 'آخر 180 يوم'
    : period === '365d' ? 'آخر 365 يوم'
    : period === 'ytd' ? 'منذ بداية السنة'
    : period === 'all' ? 'كل الفترات'
    : 'الفترة المحددة';

const TENANT_STATUS_COUNT_KEYS: Record<string, 'active' | 'trial' | 'suspended' | 'expired' | 'cancelled'> = {
  ACTIVE: 'active',
  TRIAL: 'trial',
  SUSPENDED: 'suspended',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};

const DonutLegend: React.FC<{ segments: Array<{ label: string; value: number; color: string }> }> = ({ segments }) => (
  <ul className="mt-3 space-y-1.5">
    {segments.filter((s) => s.value > 0).map((s) => (
      <li key={s.label} className="flex items-center justify-between gap-3 text-[11px]">
        <span className="flex items-center gap-1.5 font-semibold text-ink-secondary">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
        <span className="font-black text-ink">{formatNumber(s.value)}</span>
      </li>
    ))}
  </ul>
);

export const PlatformSuperAdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = React.useState<string>('30d');
  const [planFilter, setPlanFilter] = React.useState<string>('');
  const { data, isCentral, loading, error, lastUpdated, reload } = usePlatformDashboardData(period, planFilter);

  // Auto-refresh every 60 seconds (skip while the tab is hidden)
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) reload();
    }, 60000);
    return () => window.clearInterval(id);
  }, [reload]);

  // Only show the full-page loading state on the INITIAL load — during
  // background refreshes `data` is retained so the page stays rendered.
  if (error && !data?.overview) {
    return (
      <div role="alert" className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
        {error}
        <button onClick={reload} className="ml-3 text-success hover:underline">إعادة المحاولة</button>
      </div>
    );
  }

  if (!data?.overview) {
    return <div className="py-16 text-center text-sm font-semibold text-muted">جارٍ تحميل بيانات المنصة...</div>;
  }

  const { overview, plans, bp, cm, sm, lm, om, ca, alerts: rawAlerts, extras } = data;
  const ex = extras;

  // overview.releases is already normalized to PlatformRelease[] by the hook.
  const latestRelease = overview.releases?.[0] ?? null;
  const latestReleaseDate = latestRelease ? (latestRelease.releasedAt ?? latestRelease.createdAt ?? null) : null;
  const latestReleaseChannel = latestRelease ? (CHANNEL_LABELS[latestRelease.channel] ?? latestRelease.channel) : null;

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
          { label: 'مهام التشغيل', value: formatNumber(ca.operations.jobs?.reduce((a, r) => a + (r.count || 0), 0) ?? 0), icon: <Server className="h-4 w-4" /> },
          { label: 'النسخ الاحتياطية', value: formatNumber(ca.operations.backups?.reduce((a, r) => a + (r.count || 0), 0) ?? 0), icon: <ReceiptText /> },
          { label: 'تقارير الأخطاء', value: formatNumber(ca.operations.errors?.reduce((a, r) => a + (r.count || 0), 0) ?? 0), icon: <AlertTriangle className="h-4 w-4" />, tone: 'danger' },
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

  // ── Unified section lists (same shape for local & central) ───────────────
  const renewalItems = ex.upcomingRenewals;
  const strugglingItems = ex.strugglingSubscriptions;
  const pendingLicenseItems = ex.pendingLicenses;
  const failedActivationItems = ex.failedActivations;
  const expiringLicenseItems = overview.expiringLicenses;
  const expiringSubItems = overview.expiringSubscriptions;
  const syncErrorItems = ex.recentSyncErrors;
  const endpointHealthItems = ex.apiEndpointsHealth;
  const topCustomerItems = ex.topCustomers;
  const cancelledCustomerItems = ex.recentlyCancelled;
  const auditItems = ex.auditEvents;
  const moduleItems = ex.moduleUsage;
  const revenueSeries = ex.revenueSeries;
  const newCustomersSeries = ex.newCustomersSeries;

  // ── Distribution donuts ──────────────────────────────────────────────────
  const subSegs = (() => {
    const s = overview.subscriptions ?? { total: 0, active: 0, trial: 0, expired: 0, cancelled: 0 };
    const other = Math.max(0, (s.total ?? 0) - ((s.active ?? 0) + (s.trial ?? 0) + (s.expired ?? 0) + (s.cancelled ?? 0)));
    return [
      { label: 'نشط', value: s.active ?? 0, color: SUB_STATUS_COLORS['نشط'] },
      { label: 'تجريبي', value: s.trial ?? 0, color: SUB_STATUS_COLORS['تجريبي'] },
      { label: 'منتهي', value: s.expired ?? 0, color: SUB_STATUS_COLORS['منتهي'] },
      { label: 'ملغي', value: s.cancelled ?? 0, color: SUB_STATUS_COLORS['ملغي'] },
      { label: 'أخرى', value: other, color: SUB_STATUS_COLORS['أخرى'] },
    ];
  })();

  const licSegs = (() => {
    const l = overview.licenses ?? { total: 0, active: 0, suspended: 0, revoked: 0, expired: 0 };
    const other = Math.max(0, (l.total ?? 0) - ((l.active ?? 0) + (l.suspended ?? 0) + (l.revoked ?? 0) + (l.expired ?? 0)));
    return [
      { label: 'نشطة', value: l.active ?? 0, color: LIC_STATUS_COLORS['نشطة'] },
      { label: 'معلقة', value: other, color: LIC_STATUS_COLORS['معلقة'] },
      { label: 'موقوفة', value: l.suspended ?? 0, color: LIC_STATUS_COLORS['موقوفة'] },
      { label: 'منتهية', value: l.expired ?? 0, color: LIC_STATUS_COLORS['منتهية'] },
      { label: 'ملغاة', value: l.revoked ?? 0, color: LIC_STATUS_COLORS['ملغاة'] },
    ];
  })();

  const alerts = rawAlerts
    .map((a) => ({
      id: String(a.id ?? ''),
      severity: a.severity,
      title: String(a.title ?? 'تنبيه'),
      description: String(a.description ?? ''),
      link: a.link ?? (isCentral ? '/platform/emergency' : undefined),
      entityType: a.entityType,
      entityId: a.entityId != null ? String(a.entityId) : undefined,
      actionRequired: Boolean(a.actionRequired),
      suggestedActions: Array.isArray(a.suggestedActions) ? a.suggestedActions.map(String) : undefined,
    }))
    .sort((a, b) => {
      const rank: Record<string, number> = { danger: 0, warning: 1, info: 2, success: 3 };
      return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
    });

  return (
    <div className="space-y-5">
      {/* Header with Period Selector */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-l from-ink via-ink to-success p-5 text-white shadow-lg md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-success">
              <ShieldCheck className="h-4 w-4" /> لوحة مالك المنصة — تحليلات متقدمة
            </p>
            <h2 className="mt-2 text-2xl font-black">مرحباً، {overview.currentInstallation?.companyName || 'سيراميسي'}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-6 text-muted">
              تحكم كامل في المنتج، عملاء المنصة، التراخيص، الاشتراكات والمبيعات — مع تحليلات مفصلة وفترات زمنية قابلة للتخصيص.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${isCentral ? 'bg-primary/20 text-primary' : 'bg-success/20 text-success'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isCentral ? 'bg-accent-border' : 'bg-success'}`} />
                {isCentral ? 'الخادم المركزي' : 'البيانات المحلية'}
              </span>
              {latestRelease && (
                <span className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-surface/10 px-2.5 py-1 text-[10.5px] font-semibold text-muted">
                  <Rocket className="h-3.5 w-3.5 text-success" />
                  آخر إصدار: <span dir="ltr" className="font-mono">v{latestRelease.version}</span>
                  {latestReleaseChannel && <span className="rounded-full bg-success/20 px-2 py-0.5 text-success">{latestReleaseChannel}</span>}
                  <span className="text-muted">· {formatDate(latestReleaseDate)}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PeriodSelector value={period} onChange={setPeriod} className="w-auto min-w-[150px]" />
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              disabled={isCentral}
              title={isCentral ? 'تصفية الخطط غير مدعومة في الوضع المركزي' : undefined}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink focus:outline-none focus:ring-2 focus:ring-success/40 w-auto min-w-[180px] disabled:opacity-50"
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
              <span className="inline-flex items-center gap-1 text-[10px] text-muted">
                {loading && <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />}
                آخر تحديث: {lastUpdated.toLocaleTimeString('ar-EG')}
                {loading && ' — جارٍ التحديث'}
              </span>
            )}
            <button
              onClick={reload}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-success disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              تحديث
            </button>
          </div>
        </div>
      </section>

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
            chip: 'bg-success-soft text-success',
          },
          {
            label: 'إنشاء فاتورة',
            hint: 'الفوترة والمدفوعات',
            href: '/platform/billing',
            icon: <ReceiptText className="h-5 w-5" />,
            chip: 'bg-accent-soft text-primary',
          },
          {
            label: 'إدارة الاشتراكات',
            hint: 'تجديدات وتجارب',
            href: '/platform/subscriptions',
            icon: <CalendarClock className="h-5 w-5" />,
            chip: 'bg-accent-soft text-primary',
          },
          {
            label: 'الخطط والاشتراكات',
            hint: 'الباقات والأسعار والحدود',
            href: '/platform/plans',
            icon: <CreditCard className="h-5 w-5" />,
            chip: 'bg-accent-soft text-primary',
          },
          {
            label: 'الأجهزة والمزامنة',
            hint: 'الأجهزة المرتبطة والمزامنة',
            href: '/platform/devices',
            icon: <MonitorSmartphone className="h-5 w-5" />,
            chip: 'bg-success-soft text-success',
          },
          {
            label: 'مراقبة المزامنة',
            hint: 'أحداث المزامنة الفاشلة',
            href: '/platform/sync',
            icon: <Activity className="h-5 w-5" />,
            chip: 'bg-accent-soft text-primary',
          },
          {
            label: 'سجل التدقيق',
            hint: 'سجل الأحداث والأمان',
            href: '/platform/audit',
            icon: <ScrollText className="h-5 w-5" />,
            chip: 'bg-surface-sunken text-ink-secondary',
          },
          {
            label: 'مركز الطوارئ',
            hint: alerts.length > 0 ? `${alerts.length} تنبيه نشط` : 'كل الأنظمة سليمة',
            href: '/platform/emergency',
            icon: <ShieldAlert className="h-5 w-5" />,
            chip: alerts.length > 0 ? 'bg-danger-soft text-danger' : 'bg-surface-sunken text-muted',
          },
        ].map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => go(action.href)}
            className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-right shadow-sm transition hover:border-success hover:shadow"
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${action.chip}`}>{action.icon}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-ink group-hover:text-success">{action.label}</span>
              <span className="block truncate text-[10.5px] text-muted">{action.hint}</span>
            </span>
            <Plus className="mr-auto h-4 w-4 text-muted transition group-hover:text-success" />
          </button>
        ))}
      </section>

      {/* Tenant Status Overview */}
      <Panel
        title="حالة العملاء"
        subtitle="توزيع العملاء حسب الحالة — اضغط على أي حالة لعرضها في صفحة العملاء"
        icon={<Users className="h-4 w-4" />}
        iconClass="bg-accent-soft text-primary"
        action={
          <DrillDownLink label="كل العملاء" href="/platform/tenants" icon={<ExternalLink className="h-3.5 w-3.5" />} />
        }
      >
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {(['ACTIVE', 'TRIAL', 'SUSPENDED', 'EXPIRED', 'CANCELLED'] as const).map((status) => {
            const count = overview.tenants[TENANT_STATUS_COUNT_KEYS[status]];
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
            className="flex items-center justify-between rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-right transition hover:shadow-sm"
          >
            <div>
              <p className="text-[11px] font-semibold text-warning">اشتراك ينتهي قريباً</p>
              <p className="mt-0.5 text-[20px] font-black leading-tight text-warning">{formatNumber(overview.tenants?.expiringSoon ?? 0)}</p>
            </div>
            <span className="rounded-full border border-warning-border bg-surface px-2 py-0.5 text-[10px] font-bold text-warning">30 يوم</span>
          </button>
        </div>
      </Panel>

      {/* Distribution Overview */}
      <Panel
        title="توزيع الحالات"
        subtitle="الاشتراكات والتراخيص مجمّعة حسب الحالة — تمثيل مرئي"
        icon={<PieChart className="h-4 w-4" />}
        iconClass="bg-accent-soft text-primary"
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col items-center">
            <DonutChart
              data={subSegs}
              size={190}
              centerValue={formatNumber(overview.subscriptions?.total ?? 0)}
              centerLabel="اشتراك"
              aria-label="توزيع الاشتراكات حسب الحالة"
            />
            <p className="mt-2 text-[12px] font-bold text-ink">الاشتراكات حسب الحالة</p>
            <DonutLegend segments={subSegs} />
          </div>
          <div className="flex flex-col items-center">
            <DonutChart
              data={licSegs}
              size={190}
              centerValue={formatNumber(overview.licenses?.total ?? 0)}
              centerLabel="ترخيص"
              aria-label="توزيع التراخيص حسب الحالة"
            />
            <p className="mt-2 text-[12px] font-bold text-ink">التراخيص حسب الحالة</p>
            <DonutLegend segments={licSegs} />
          </div>
        </div>
      </Panel>

      {/* Business Performance Section */}
      <Panel
        title="الأداء التجاري"
        subtitle={`مقارنة ${periodLabel(period)} مع الفترة السابقة`}
        icon={<BarChart2 className="h-4 w-4" />}
        iconClass="bg-success-soft text-success"
        action={
          <DrillDownLink label="التحليلات" href="/platform/analytics" icon={<ExternalLink className="h-3.5 w-3.5" />} />
        }
      >
        {businessMetrics.length === 0 ? renderEmptyMetrics('لا تتوفر بيانات الأداء التجاري') : (
          <>
            {renderMetricGrid(businessMetrics)}
            {revenueSeries.length > 0 && (
              <LineChart
                data={revenueSeries}
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
        iconClass="bg-accent-soft text-primary"
        action={
          <>
            <DrillDownLink label="العملاء" href="/platform/tenants" icon={<ExternalLink className="h-3.5 w-3.5" />} />
            <DrillDownLink label="التحليلات" href="/platform/analytics" icon={<BarChart2 className="h-3.5 w-3.5" />} />
          </>
        }
      >
        {customerMetrics.length === 0 && topCustomerItems.length === 0 && cancelledCustomerItems.length === 0 ? renderEmptyMetrics('لا تتوفر بيانات العملاء') : (
          <>
            {customerMetrics.length > 0 && renderMetricGrid(customerMetrics)}
            {newCustomersSeries.length > 0 && (
              <LineChart
                data={newCustomersSeries}
                height={240}
                color="#0ea5e9"
                yAxisFormatter={(v) => formatNumber(v)}
                aria-label="مخطط العملاء الجدد عبر الزمن"
              />
            )}
            {(topCustomerItems.length > 0 || cancelledCustomerItems.length > 0) && (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {topCustomerItems.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-bold text-ink">أعلى العملاء إيراداً</h4>
                    <div className="overflow-x-auto">
                      <DataTable
                        ariaLabel="أعلى العملاء إيراداً"
                        rows={topCustomerItems.slice(0, 10)}
                        rowKey={(cust) => cust.id}
                        onRowClick={() => go('/platform/tenants')}
                        tableClassName="text-sm"
                        columns={[
                          { key: 'name', header: 'العميل', render: (cust) => <span className="text-[12px] font-semibold text-ink">{cust.name}</span> },
                          { key: 'code', header: 'الكود', render: (cust) => <span className="text-[11px] text-muted font-mono">{cust.code}</span> },
                          { key: 'status', header: 'الحالة', render: (cust) => <StatusBadge value={cust.status} /> },
                          { key: 'revenue', header: 'الإيراد', render: (cust) => <span className="text-[12px] font-bold text-success">{formatMoney(cust.revenue)}</span> },
                          { key: 'invoices', header: 'الفواتير', render: (cust) => <span className="text-[11px] text-muted">{cust.invoicesCount}</span> },
                        ]}
                      />
                    </div>
                  </div>
                )}
                {cancelledCustomerItems.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-bold text-ink">عملاء ألغوا حديثاً</h4>
                    <ul className="divide-y divide-line-strong max-h-64 overflow-y-auto rounded-lg border border-line">
                      {cancelledCustomerItems.slice(0, 8).map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted cursor-pointer" onClick={() => go('/platform/tenants')}>
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-bold text-ink">{t.name}</p>
                            <p className="text-[10.5px] text-muted"><span dir="ltr" className="font-mono">{t.code}</span>{t.planName ? ` · ${t.planName}` : ''}</p>
                          </div>
                          <div className="shrink-0 text-left">
                            <StatusBadge value={t.status} />
                            <p className="mt-1 text-[10px] text-muted">{formatDate(t.updatedAt)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
        iconClass="bg-success-soft text-success"
        action={
          <DrillDownLink label="كل العملاء" href="/platform/tenants" icon={<ExternalLink className="h-3.5 w-3.5" />} />
        }
      >
        {Array.isArray(overview.recentTenants) && overview.recentTenants.length > 0 ? (
          <ul className="divide-y divide-line-strong">
            {overview.recentTenants.slice(0, 8).map((tenant) => (
              <li key={tenant.id} className="flex items-center justify-between gap-3 px-2 py-3 hover:bg-surface-muted cursor-pointer" onClick={() => go('/platform/tenants')}>
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-bold text-ink">{tenant.name}</p>
                  <p className="text-[10.5px] text-muted">
                    <span dir="ltr" className="font-mono">{tenant.code}</span>
                    {tenant.planName ? ` · ${tenant.planName}` : ''}
                    {tenant.businessType ? ` · ${tenant.businessType}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-left">
                  <div>
                    <StatusBadge value={tenant.status} />
                    <p className="mt-1 text-[10px] text-muted">{formatDate(tenant.createdAt)}</p>
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
        iconClass="bg-accent-soft text-primary"
        action={
          <>
            <DrillDownLink label="الاشتراكات" href="/platform/subscriptions" icon={<ExternalLink className="h-3.5 w-3.5" />} />
            <DrillDownLink label="التجديدات" href="/platform/subscriptions?filter=renewals" icon={<RotateCcw className="h-3.5 w-3.5" />} />
          </>
        }
      >
        {subscriptionMetrics.length === 0 && renewalItems.length === 0 && strugglingItems.length === 0 ? renderEmptyMetrics('لا تتوفر بيانات الاشتراكات') : (
          <>
            {subscriptionMetrics.length > 0 && renderMetricGrid(subscriptionMetrics)}
            {(renewalItems.length > 0 || strugglingItems.length > 0) && (
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-sm font-bold text-ink">التجديدات القادمة (30 يوم)</h4>
                  {renewalItems.length > 0 ? (
                    <ul className="divide-y divide-line-strong max-h-64 overflow-y-auto rounded-lg border border-line">
                      {renewalItems.slice(0, 10).map((sub) => (
                        <li key={sub.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted cursor-pointer" onClick={() => go('/platform/tenants')}>
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-bold text-ink">{sub.tenantName}</p>
                            <p className="text-[10.5px] text-muted">{sub.tenantCode} · {sub.planName}</p>
                          </div>
                          <div className="shrink-0 text-left">
                            <StatusBadge value={sub.status} />
                            <p className="mt-1 text-[10px] text-muted">{formatDate(sub.endDate)} · {formatMoney(sub.price)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="لا توجد تجديدات قادمة" />
                  )}
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-bold text-ink">الاشتراكات المتعثرة (PAST_DUE)</h4>
                  {strugglingItems.length > 0 ? (
                    <ul className="divide-y divide-line-strong max-h-64 overflow-y-auto rounded-lg border border-line">
                      {strugglingItems.slice(0, 10).map((sub) => (
                        <li key={sub.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted cursor-pointer" onClick={() => go('/platform/tenants')}>
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-bold text-ink">{sub.tenantName || '—'}</p>
                            <p className="text-[10.5px] text-muted">{sub.planName || '—'} · {formatMoney(sub.price)}</p>
                          </div>
                          <div className="shrink-0 text-left">
                            <StatusBadge value={sub.status} />
                            <p className="mt-1 text-[10px] text-muted">ينتهي: {formatDate(sub.endDate)}</p>
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
        iconClass="bg-warning-soft text-warning"
        action={
          <>
            <DrillDownLink label="التراخيص" href="/platform/licenses" icon={<ExternalLink className="h-3.5 w-3.5" />} />
            <DrillDownLink label="الأجهزة" href="/platform/devices" icon={<MonitorSmartphone className="h-3.5 w-3.5" />} />
          </>
        }
      >
        {licenseMetrics.length === 0 && failedActivationItems.length === 0 && pendingLicenseItems.length === 0 ? renderEmptyMetrics('لا تتوفر بيانات التراخيص') : (
          <>
            {licenseMetrics.length > 0 && renderMetricGrid(licenseMetrics)}
            {(failedActivationItems.length > 0 || pendingLicenseItems.length > 0) && (
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-sm font-bold text-ink">محاولات التفعيل الفاشلة (الأخيرة)</h4>
                  {failedActivationItems.length > 0 ? (
                    <ul className="divide-y divide-line-strong max-h-64 overflow-y-auto rounded-lg border border-line">
                      {failedActivationItems.slice(0, 10).map((act) => (
                        <li key={act.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted">
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-bold text-ink">{act.tenantName || '—'}</p>
                            <p className="text-[10px] text-muted font-mono">{act.licenseKey || act.licenseId}</p>
                          </div>
                          <div className="shrink-0 text-left">
                            <StatusBadge value={act.status} />
                            <p className="mt-1 text-[10px] text-muted">{formatDateTime(act.createdAt)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState icon={<CheckCircle className="h-5 w-5" />} title="لا توجد تفعيلات فاشلة" />
                  )}
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-bold text-ink">التراخيص المعلقة (ISSUED)</h4>
                  {pendingLicenseItems.length > 0 ? (
                    <ul className="divide-y divide-line-strong max-h-64 overflow-y-auto rounded-lg border border-line">
                      {pendingLicenseItems.slice(0, 10).map((lic) => (
                        <li key={lic.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted cursor-pointer" onClick={() => go('/platform/licenses')}>
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-bold text-ink">{lic.tenantName || '—'}</p>
                            <p className="text-[10px] text-muted font-mono">{lic.licenseKey}</p>
                          </div>
                          <div className="shrink-0 text-left">
                            <StatusBadge value={lic.status} />
                            <p className="mt-1 text-[10px] text-muted">{lic.planName || '—'}</p>
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
        iconClass="bg-surface-sunken text-ink-secondary"
        action={
          <>
            <DrillDownLink label="الأجهزة" href="/platform/devices" icon={<ExternalLink className="h-3.5 w-3.5" />} />
            <DrillDownLink label="المزامنة" href="/platform/sync" icon={<Activity className="h-3.5 w-3.5" />} />
            <DrillDownLink label="السجلات" href="/platform/audit" icon={<ScrollText className="h-3.5 w-3.5" />} />
          </>
        }
      >
        {/* Infrastructure capacity strip */}
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="أجهزة مربوطة بتراخيص"
            value={formatNumber(overview.devices?.boundLicenses ?? 0)}
            icon={<MonitorSmartphone className="h-4 w-4" />}
            tone="success"
          />
          <MetricCard
            label="أجهزة غير مربوطة"
            value={formatNumber(overview.devices?.unboundLicenses ?? 0)}
            icon={<WifiOff className="h-4 w-4" />}
            tone={ (overview.devices?.unboundLicenses ?? 0) > 0 ? 'warning' : 'default' }
          />
          <MetricCard
            label="سعة الأجهزة"
            value={formatNumber(overview.devices?.devicesLimit ?? 0)}
            icon={<Cpu className="h-4 w-4" />}
            tone="info"
          />
          <MetricCard
            label="سعة الفروع"
            value={formatNumber(overview.branches?.totalLimit ?? 0)}
            icon={<GitBranch className="h-4 w-4" />}
          />
        </div>
        {operationsMetrics.length === 0 && syncErrorItems.length === 0 && endpointHealthItems.length === 0 ? renderEmptyMetrics('لا تتوفر بيانات التشغيل') : (
          <>
            {operationsMetrics.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 mb-4">
                {operationsMetrics.map((m) => (
                  <MetricCard key={m.label} label={m.label} value={m.value} comparison={m.comparison} icon={m.icon} tone={m.tone} />
                ))}
              </div>
            )}
            {(syncErrorItems.length > 0 || endpointHealthItems.length > 0) && (
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-sm font-bold text-ink">أخطاء المزامنة الأخيرة</h4>
                  {syncErrorItems.length > 0 ? (
                    <ul className="divide-y divide-line-strong max-h-64 overflow-y-auto rounded-lg border border-line">
                      {syncErrorItems.slice(0, 10).map((err) => (
                        <li key={err.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted">
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-bold text-ink">{err.deviceName}</p>
                            <p className="text-[10px] text-muted">{err.tenantName} · {err.deviceId}</p>
                          </div>
                          <div className="shrink-0 text-left">
                            <StatusBadge value="FAILED" label="فشل" />
                            <p className="mt-1 text-[10px] text-muted">{formatDateTime(err.occurredAt)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState icon={<CheckCircle className="h-5 w-5" />} title="لا توجد أخطاء مزامنة" />
                  )}
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-bold text-ink">صحة نقاط API</h4>
                  {endpointHealthItems.length > 0 ? (
                    <ul className="divide-y divide-line-strong rounded-lg border border-line">
                      {endpointHealthItems.map((ep) => (
                        <li key={ep.endpoint} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-mono text-ink">{ep.endpoint}</p>
                            <p className="text-[10px] text-muted">{ep.requests.toLocaleString('ar-EG')} طلب · {ep.avgResponseMs}ms متوسط</p>
                          </div>
                          <div className="shrink-0 text-left">
                            <div className="flex items-center gap-1">
                              <span className={`inline-flex h-2 w-2 rounded-full ${ep.successRate >= 99 ? 'bg-success' : ep.successRate >= 95 ? 'bg-warning' : 'bg-danger'}`} />
                              <span className="text-[11px] font-bold text-ink">{ep.successRate.toFixed(1)}%</span>
                            </div>
                            <p className="mt-1 text-[10px] text-muted">{ep.errors} خطأ</p>
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

      {/* Expiring Soon */}
      <Panel
        title="تنتهي صلاحيتها قريباً"
        subtitle="اشتراكات وتراخيص ستنتهي خلال 30 يوماً — رتّب أولويات التجديد"
        icon={<AlertTriangle className="h-4 w-4" />}
        iconClass="bg-warning-soft text-warning"
        action={
          <>
            <DrillDownLink label="الاشتراكات" href="/platform/subscriptions" icon={<ExternalLink className="h-3.5 w-3.5" />} />
            <DrillDownLink label="التراخيص" href="/platform/licenses" icon={<KeyRound className="h-3.5 w-3.5" />} />
          </>
        }
      >
        {expiringSubItems.length === 0 && expiringLicenseItems.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-5 text-[12px] font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" /> لا توجد اشتراكات أو تراخيص على وشك الانتهاء.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <div>
              <h4 className="mb-2 text-sm font-bold text-ink">اشتراكات ({expiringSubItems.length})</h4>
              {expiringSubItems.length > 0 ? (
                <ul className="divide-y divide-line-strong max-h-64 overflow-y-auto rounded-lg border border-line">
                  {expiringSubItems.slice(0, 10).map((sub) => (
                    <li key={sub.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted cursor-pointer" onClick={() => go('/platform/subscriptions')}>
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-bold text-ink">{sub.tenantName || '—'}</p>
                        <p className="text-[10.5px] text-muted">{sub.planName || '—'} · {formatMoney(sub.price)}</p>
                      </div>
                      <div className="shrink-0 text-left">
                        <StatusBadge value={sub.status} />
                        <p className="mt-1 text-[10px] font-semibold text-warning">ينتهي: {formatDate(sub.endDate)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="لا توجد اشتراكات قريبة الانتهاء" />
              )}
            </div>
            <div>
              <h4 className="mb-2 text-sm font-bold text-ink">تراخيص ({expiringLicenseItems.length})</h4>
              {expiringLicenseItems.length > 0 ? (
                <ul className="divide-y divide-line-strong max-h-64 overflow-y-auto rounded-lg border border-line">
                  {expiringLicenseItems.slice(0, 10).map((lic) => (
                    <li key={lic.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted cursor-pointer" onClick={() => go('/platform/licenses')}>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold text-ink">{lic.tenantName || '—'}</p>
                        <p className="text-[10px] text-muted font-mono">{lic.licenseKey}</p>
                      </div>
                      <div className="shrink-0 text-left">
                        <StatusBadge value={lic.status} />
                        <p className="mt-1 text-[10px] font-semibold text-warning">ينتهي: {formatDate(lic.expiresAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<KeyRound className="h-5 w-5" />} title="لا توجد تراخيص قريبة الانتهاء" />
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* Revenue by Plan Section */}
      <Panel
        title="الإيراد حسب الخطة"
        subtitle="إجمالي الاشتراكات النشطة مجمّعة حسب خطة الاشتراك"
        icon={<Wallet className="h-4 w-4" />}
        iconClass="bg-success-soft text-success"
        action={
          <DrillDownLink label="الخطط" href="/platform/plans" icon={<ExternalLink className="h-3.5 w-3.5" />} />
        }
      >
        {overview.revenueByPlan && overview.revenueByPlan.length > 0 ? (
          <div className="overflow-x-auto">
            <DataTable
            ariaLabel="الإيراد حسب الخطة"
            rows={overview.revenueByPlan.map((r, i) => ({ ...r, __i: i }))}
            rowKey={(r) => `${r.planName}-${r.__i}`}
            tableClassName="text-sm"
            columns={[
              { key: 'plan', header: 'الخطة', render: (r) => <span className="text-[12px] font-semibold text-ink">{r.planName}</span> },
              { key: 'tenants', header: 'العملاء', render: (r) => <span className="text-[11px] text-muted">{r.tenants}</span> },
              { key: 'revenue', header: 'الإيراد', render: (r) => <span className="text-[12px] font-bold text-success">{formatMoney(r.revenue)}</span> },
            ]}
          />
          </div>
        ) : (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="لا توجد بيانات إيراد" />
        )}
      </Panel>

      {/* Plans Overview */}
      <Panel
        title="نظرة على الباقات"
        subtitle="خطط الاشتراك المعتمدة — الأسعار والحدود وعدد المشتركين"
        icon={<CreditCard className="h-4 w-4" />}
        iconClass="bg-accent-soft text-primary"
        action={
          <DrillDownLink label="إدارة الباقات" href="/platform/plans" icon={<ExternalLink className="h-3.5 w-3.5" />} />
        }
      >
        {plans.length === 0 ? (
          <EmptyState icon={<CreditCard className="h-5 w-5" />} title="لا توجد باقات معرفة" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan: PlatformPlan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => go('/platform/plans')}
                className="group rounded-xl border border-line bg-surface p-4 text-right shadow-sm transition hover:border-accent-border hover:shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-black text-ink">
                      {plan.name}
                      <span className="font-mono text-[9.5px] font-normal text-muted" dir="ltr">{plan.code}</span>
                    </p>
                    <p className="mt-0.5 text-[15px] font-black text-success">{formatMoney(plan.price, plan.currency)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {plan.isDefault && (
                      <span className="rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-[9.5px] font-bold text-warning">افتراضية</span>
                    )}
                    <StatusBadge value={plan.isActive ? 'ACTIVE' : 'CANCELLED'} label={plan.isActive ? 'نشطة' : 'موقوفة'} />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                  <div className="rounded-lg bg-surface-muted px-1.5 py-1.5">
                    <p className="text-[13px] font-black text-ink">{formatNumber(plan.seatsLimit)}</p>
                    <p className="text-[9px] font-bold text-muted">مستخدم</p>
                  </div>
                  <div className="rounded-lg bg-surface-muted px-1.5 py-1.5">
                    <p className="text-[13px] font-black text-ink">{formatNumber(plan.branchesLimit)}</p>
                    <p className="text-[9px] font-bold text-muted">فرع</p>
                  </div>
                  <div className="rounded-lg bg-surface-muted px-1.5 py-1.5">
                    <p className="text-[13px] font-black text-ink">{formatNumber(plan.devicesLimit)}</p>
                    <p className="text-[9px] font-bold text-muted">جهاز</p>
                  </div>
                </div>
                <p className="mt-2 truncate text-[10px] text-muted">
                  {(plan.features ?? []).length} ميزة · {(plan.includedModules ?? []).length} وحدة
                  {typeof plan.subscriberCount === 'number' ? ` · ${formatNumber(plan.subscriberCount)} مشترك` : ''}
                </p>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {/* Modules & Features */}
      <Panel
        title="الوحدات والميزات"
        subtitle="وحدات المنتج المتاحة وتفعيلها عبر المنصة"
        icon={<Layers className="h-4 w-4" />}
        iconClass="bg-accent-soft text-primary"
        action={
          <DrillDownLink label="إدارة الوحدات" href="/platform/product" icon={<ExternalLink className="h-3.5 w-3.5" />} />
        }
      >
        {moduleItems.length === 0 ? (
          <EmptyState icon={<Layers className="h-5 w-5" />} title="لا توجد وحدات معرفة" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {moduleItems.slice(0, 16).map((m) => (
              <div key={m.code} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-muted/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-bold text-ink">{m.name}</p>
                  <p className="truncate text-[9.5px] text-muted" dir="ltr">{m.code}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {(m.licenseCount ?? 0) > 0 && (
                    <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold text-primary">{formatNumber(m.licenseCount)} ترخيص</span>
                  )}
                  {(m.tenantCount ?? 0) > 0 && (
                    <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold text-primary">{formatNumber(m.tenantCount)} عميل</span>
                  )}
                  <StatusBadge value={m.enabled ? 'ACTIVE' : 'CANCELLED'} label={m.enabled ? 'مفعّلة' : 'معطّلة'} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Recent Audit Activity */}
      <Panel
        title="أحدث أحداث التدقيق"
        subtitle="آخر الإجراءات على مستوى المنصة"
        icon={<FileClock className="h-4 w-4" />}
        iconClass="bg-surface-sunken text-ink-secondary"
        action={
          <DrillDownLink label="سجل التدقيق" href="/platform/audit" icon={<ExternalLink className="h-3.5 w-3.5" />} />
        }
      >
        {auditItems.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-5 w-5" />} title="لا توجد أحداث حديثة" />
        ) : (
          <ul className="divide-y divide-line-strong">
            {auditItems.slice(0, 10).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-2 py-2.5 hover:bg-surface-muted">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${AUDIT_SEVERITY_DOT[String(a.severity ?? 'INFO').toUpperCase()] ?? 'bg-line-strong'}`} />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-bold text-ink">{a.action}</p>
                    <p className="text-[10px] text-muted">
                      {a.actorName || 'النظام'}{a.entityType ? ` · ${a.entityType}` : ''}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-[10px] text-muted">{formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Recent Payments */}
      <Panel
        title="أحدث المدفوعات"
        subtitle="آخر المبالغ المحصلة من العملاء"
        icon={<Banknote className="h-4 w-4" />}
        iconClass="bg-success-soft text-success"
        action={
          <DrillDownLink label="الفوترة" href="/platform/billing" icon={<ExternalLink className="h-3.5 w-3.5" />} />
        }
      >
        {Array.isArray(overview.recentPayments) && overview.recentPayments.length > 0 ? (
          <ul className="divide-y divide-line-strong">
            {overview.recentPayments.slice(0, 8).map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3 px-2 py-3 hover:bg-surface-muted">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-bold text-ink">{payment.tenantName || '—'}</p>
                  <p className="text-[10.5px] text-muted">
                    {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                    {payment.invoiceNumber ? ` · فاتورة ${payment.invoiceNumber}` : ''}
                    {payment.reference ? ` · مرجع ${payment.reference}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-left">
                  <p className="text-[13px] font-black text-success">{formatMoney(payment.amount)}</p>
                  <p className="mt-0.5 text-[10px] text-muted">{formatDateTime(payment.paidAt)}</p>
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
        iconClass="bg-danger-soft text-danger"
        action={
          <DrillDownLink label="مركز الطوارئ" href="/platform/emergency" icon={<ExternalLink className="h-3.5 w-3.5" />} count={alerts.length} />
        }
      >
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-5 text-[12px] font-semibold text-success">
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
        iconClass="bg-accent-soft text-primary"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DrillDownLink
            label="التحليلات والتقارير"
            href="/platform/analytics"
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
