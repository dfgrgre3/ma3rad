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
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type { PlatformOverview } from '../../services/domains/platform/platformTypes';
import {
  EmptyState,
  StatusBadge,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from './components/PlatformUI';

const StatusLabel: Record<string, string> = {
  TRIAL: 'تجريبي',
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  EXPIRED: 'منتهي',
  CANCELLED: 'ملغي',
  ISSUED: 'صادر',
  REVOKED: 'ملغي',
  PAID: 'مدفوعة',
  PARTIAL: 'جزئية',
  SENT: 'مرسلة',
  OVERDUE: 'متأخرة',
  DRAFT: 'مسودة',
  VOID: 'ملغاة',
  PUBLISHED: 'منشور',
  DEPRECATED: 'متوقف',
  STABLE: 'مستقر',
  BETA: 'تجريبي',
  NIGHTLY: 'ليلي',
};

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

const MetricCard: React.FC<{
  label: string;
  value: string;
  hint?: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: Tone;
  to?: string;
}> = ({ label, value, hint, sub, icon, tone = 'default', to }) => {
  const body = (
    <div className="flex h-full items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow">
      <div className="min-w-0">
        <p className="text-[11.5px] font-semibold text-slate-500">{label}</p>
        <p className="mt-1 truncate text-[22px] font-black leading-tight text-slate-900">{value}</p>
        {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
        {sub && <p className="mt-0.5 text-[10.5px] font-semibold text-slate-400">{sub}</p>}
      </div>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONES[tone].icon}`}>{icon}</span>
    </div>
  );
  return to ? <Link to={to} className="block h-full">{body}</Link> : body;
};

const Panel: React.FC<{
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconClass?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, icon, iconClass = 'bg-slate-100 text-slate-600', action, children, className = '' }) => (
  <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
    <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>{icon}</span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="truncate text-[10.5px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
    {children}
  </section>
);

const ALERT_TONES = {
  danger: { wrap: 'border-rose-200 bg-rose-50', icon: 'bg-rose-100 text-rose-600', title: 'text-rose-800', text: 'text-rose-700' },
  warning: { wrap: 'border-amber-200 bg-amber-50', icon: 'bg-amber-100 text-amber-600', title: 'text-amber-900', text: 'text-amber-800' },
  info: { wrap: 'border-sky-200 bg-sky-50', icon: 'bg-sky-100 text-sky-600', title: 'text-sky-900', text: 'text-sky-800' },
  success: { wrap: 'border-emerald-200 bg-emerald-50', icon: 'bg-emerald-100 text-emerald-600', title: 'text-emerald-900', text: 'text-emerald-800' },
} as const;

export const PlatformDashboardPage: React.FC = () => {
  const [overview, setOverview] = React.useState<PlatformOverview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    try {
      setOverview(platformAdminService.getOverview());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات المنصة.');
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
        {error}
      </div>
    );
  }

  if (!overview) {
    return <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل بيانات المنصة...</div>;
  }

  const latestRelease = overview.releases[0] ?? null;
  const maxModuleAdoption = Math.max(1, ...overview.moduleUsage.map((item) => item.licenseCount));
  const severityOrder = { danger: 0, warning: 1, info: 2, success: 3 } as const;
  const alerts = [...overview.alerts].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-900 p-5 text-white shadow-lg md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              <ShieldCheck className="h-4 w-4" /> لوحة مالك المنصة
            </p>
            <h2 className="mt-2 text-2xl font-black">مرحباً، {overview.currentInstallation?.companyName || 'سيراميسي'}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-6 text-slate-300">
              تحكم كامل في المنتج، عملاء المنصة، التراخيص، الاشتراكات والمبيعات — من حساب مالك واحد داخل نفس المشروع.
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
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-white/10 p-3 text-center backdrop-blur">
            <div>
              <p className="text-[10px] text-slate-300">العملاء النشطون</p>
              <p className="text-lg font-black text-emerald-300">{formatNumber(overview.tenants.active)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-300">تراخيص سارية</p>
              <p className="text-lg font-black text-sky-300">{formatNumber(overview.licenses.active)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-300">الإيراد الكلي</p>
              <p className="text-lg font-black text-amber-300">{formatMoney(overview.billing.revenueTotal)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Customers & revenue */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="إجمالي العملاء"
          value={formatNumber(overview.tenants.total)}
          hint={`${formatNumber(overview.tenants.active)} نشط · ${formatNumber(overview.tenants.trial)} تجريبي`}
          icon={<Building2 className="h-4 w-4" />}
          tone="info"
          to="/platform/tenants"
        />
        <MetricCard
          label="العملاء النشطون"
          value={formatNumber(overview.tenants.active)}
          hint={`${formatNumber(overview.tenants.expiringSoon)} اشتراك ينتهي قريباً`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
        />
        <MetricCard
          label="العملاء المتوقفون"
          value={formatNumber(overview.tenants.suspended)}
          hint={`${formatNumber(overview.tenants.expired)} منتهي · ${formatNumber(overview.tenants.cancelled)} ملغي`}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={overview.tenants.suspended > 0 ? 'warning' : 'success'}
        />
        <MetricCard
          label="إجمالي الإيرادات المحصلة"
          value={formatMoney(overview.billing.revenueTotal)}
          hint={`هذا الشهر ${formatMoney(overview.billing.revenueThisMonth)}`}
          icon={<Wallet className="h-4 w-4" />}
          tone="success"
          to="/platform/billing"
        />
      </section>

      {/* Subscriptions & sales */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="الاشتراكات النشطة"
          value={formatNumber(overview.subscriptions.active)}
          hint={`${formatNumber(overview.subscriptions.total)} اشتراك إجمالي`}
          icon={<CalendarClock className="h-4 w-4" />}
          tone="success"
        />
        <MetricCard
          label="الاشتراكات المنتهية"
          value={formatNumber(overview.subscriptions.expired)}
          hint={`${formatNumber(overview.subscriptions.cancelled)} ملغي · ${formatNumber(overview.subscriptions.trial)} تجريبي`}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={overview.subscriptions.expired > 0 ? 'danger' : 'success'}
        />
        <MetricCard
          label="إجمالي المبيعات (الفواتير)"
          value={formatMoney(overview.billing.invoicedTotal)}
          hint={`${formatNumber(overview.billing.invoicesTotal)} فاتورة · ${formatNumber(overview.billing.paidInvoices)} مدفوعة`}
          icon={<ReceiptText className="h-4 w-4" />}
          tone="violet"
          to="/platform/billing"
        />
        <MetricCard
          label="مستحقات غير محصلة"
          value={formatMoney(overview.billing.outstanding)}
          hint={`${formatNumber(overview.billing.overdueInvoices)} فاتورة متأخرة`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone={overview.billing.outstanding > 0 ? 'danger' : 'success'}
          to="/platform/billing"
        />
      </section>

      {/* Operations strip */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="الأجهزة المتصلة"
          value={formatNumber(overview.devices.boundLicenses)}
          hint={`${formatNumber(overview.devices.unboundLicenses)} ترخيص غير مربوط بجهاز`}
          sub={`الحد الإجمالي ${formatNumber(overview.devices.devicesLimit)} جهاز`}
          icon={<Cpu className="h-4 w-4" />}
          tone="info"
          to="/platform/licenses"
        />
        <MetricCard
          label="الفروع"
          value={formatNumber(overview.branches.totalLimit)}
          hint={`${formatNumber(overview.branches.installationBranches)} فرع في المنشأة الحالية`}
          sub="مجموع حدود فروع العملاء النشطين"
          icon={<GitBranch className="h-4 w-4" />}
          tone="violet"
        />
        <MetricCard
          label="اشتراكات تنتهي قريباً"
          value={formatNumber(overview.subscriptions.expiringSoon)}
          hint={`${formatNumber(overview.licenses.expiringSoon)} ترخيص ينتهي خلال 30 يوماً`}
          icon={<CalendarClock className="h-4 w-4" />}
          tone={overview.subscriptions.expiringSoon > 0 ? 'warning' : 'success'}
          to="/platform/licenses"
        />
        <MetricCard
          label="الإيراد الشهري المتكرر (MRR)"
          value={formatMoney(overview.billing.mrr)}
          hint={`${formatNumber(overview.licenses.active)} ترخيص ساري`}
          icon={<Activity className="h-4 w-4" />}
          tone="success"
        />
      </section>

      {/* Alerts */}
      <Panel
        title="تنبيهات الأمان والتراخيص"
        subtitle={alerts.length === 0 ? 'لا توجد تنبيهات حالياً' : `${alerts.length} تنبيه يحتاج متابعة`}
        icon={<ShieldAlert className="h-4 w-4" />}
        iconClass="bg-rose-50 text-rose-600"
      >
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-5 text-[12px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> كل التراخيص والاشتراكات في وضع سليم.
          </div>
        ) : (
          <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {alerts.map((alert) => {
              const tone = ALERT_TONES[alert.severity];
              const content = (
                <div className={`flex h-full items-start gap-3 rounded-lg border p-3 transition hover:shadow-sm ${tone.wrap}`}>
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.icon}`}>
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className={`text-[12px] font-bold ${tone.title}`}>{alert.title}</p>
                    <p className={`mt-0.5 text-[10.5px] leading-5 ${tone.text}`}>{alert.description}</p>
                  </div>
                </div>
              );
              return alert.link
                ? <Link key={alert.id} to={alert.link} className="block h-full">{content}</Link>
                : <div key={alert.id}>{content}</div>;
            })}
          </div>
        )}
      </Panel>

      {/* Expiring licences & subscriptions */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="تراخيص تقترب من الانتهاء"
          subtitle="خلال 60 يوماً — تحتاج تجديداً"
          icon={<KeyRound className="h-4 w-4" />}
          iconClass="bg-amber-50 text-amber-600"
          action={
            <Link to="/platform/licenses" className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">
              إدارة <ArrowLeft className="h-3 w-3" />
            </Link>
          }
        >
          {overview.expiringLicenses.length === 0 ? (
            <EmptyState icon={<KeyRound className="h-5 w-5" />} title="لا توجد تراخيص قريبة الانتهاء" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {overview.expiringLicenses.map((license) => (
                <li key={license.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-bold text-slate-800">{license.tenantName}</p>
                    <p dir="ltr" className="truncate text-right font-mono text-[10.5px] text-slate-500">{license.licenseKey}</p>
                  </div>
                  <div className="shrink-0 text-left">
                    <StatusBadge value="EXPIRING" label={formatDate(license.expiresAt)} />
                    <p className="mt-1 text-[10px] text-slate-500">{license.planName || '—'}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="اشتراكات تقترب من الانتهاء"
          subtitle={`${formatNumber(overview.subscriptions.expiringSoon)} اشتراك خلال 30 يوماً`}
          icon={<CalendarClock className="h-4 w-4" />}
          iconClass="bg-sky-50 text-sky-600"
          action={
            <Link to="/platform/tenants" className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">
              العملاء <ArrowLeft className="h-3 w-3" />
            </Link>
          }
        >
          {overview.expiringSubscriptions.length === 0 ? (
            <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="لا توجد اشتراكات قريبة الانتهاء" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {overview.expiringSubscriptions.map((subscription) => (
                <li key={subscription.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-bold text-slate-800">{subscription.tenantName || '—'}</p>
                    <p className="text-[10.5px] text-slate-500">
                      {subscription.planName || '—'} · {formatMoney(subscription.price)} · {formatNumber(subscription.seats)} مستخدم
                    </p>
                  </div>
                  <div className="shrink-0 text-left">
                    <StatusBadge value={subscription.status} label={StatusLabel[subscription.status]} />
                    <p className="mt-1 text-[10px] text-slate-500">{formatDate(subscription.endDate)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Module usage & releases */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="إحصائيات استخدام الوحدات"
          subtitle="الوحدات المتضمنة في التراخيص السارية"
          icon={<Boxes className="h-4 w-4" />}
          iconClass="bg-violet-50 text-violet-600"
          className="xl:col-span-2"
        >
          {overview.moduleUsage.length === 0 ? (
            <EmptyState icon={<Boxes className="h-5 w-5" />} title="لا توجد بيانات استخدام" />
          ) : (
            <div className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
              {overview.moduleUsage.map((module) => (
                <div key={module.code}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[11.5px] font-semibold text-slate-700">{module.name}</span>
                    <span className="shrink-0 text-[10px] font-bold text-slate-500">
                      {formatNumber(module.tenantCount)} عميل · {formatNumber(module.licenseCount)} ترخيص
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${module.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      style={{ width: `${Math.round((module.licenseCount / maxModuleAdoption) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="إصدارات البرنامج"
          subtitle="الإصدارات المسجلة على المنصة"
          icon={<Rocket className="h-4 w-4" />}
          iconClass="bg-sky-50 text-sky-600"
          action={
            <Link to="/platform/product" className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">
              الإدارة <ArrowLeft className="h-3 w-3" />
            </Link>
          }
        >
          {overview.releases.length === 0 ? (
            <EmptyState icon={<Rocket className="h-5 w-5" />} title="لا توجد إصدارات مسجلة" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {overview.releases.map((release) => (
                <li key={release.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[12px] font-bold text-slate-800">
                      <span dir="ltr" className="font-mono">v{release.version}</span>
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                        {CHANNEL_LABELS[release.channel]}
                      </span>
                    </p>
                    <p className="text-[10px] text-slate-500">{formatDate(release.releasedAt || release.createdAt)}</p>
                  </div>
                  <StatusBadge value={release.status} label={StatusLabel[release.status] || release.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Recent tenants & payments */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="أحدث العملاء"
          subtitle="آخر المنشآت المسجلة على المنصة"
          icon={<Building2 className="h-4 w-4" />}
          iconClass="bg-sky-50 text-sky-600"
          action={
            <Link to="/platform/tenants" className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">
              عرض الكل <ArrowLeft className="h-3 w-3" />
            </Link>
          }
        >
          {overview.recentTenants.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              title="لا يوجد عملاء بعد"
              description="أضف أول عميل للمنصة وابدأ بإصدار ترخيص له."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {overview.recentTenants.map((tenant) => (
                <li key={tenant.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-bold text-slate-800">{tenant.name}</p>
                    <p className="text-[10.5px] text-slate-500">
                      {tenant.code} · {tenant.planName || 'بدون خطة'} · {formatDate(tenant.createdAt)}
                    </p>
                  </div>
                  <StatusBadge value={tenant.status} label={StatusLabel[tenant.status]} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="أحدث المدفوعات"
          subtitle="حركة التحصيل على مستوى المنصة"
          icon={<ReceiptText className="h-4 w-4" />}
          iconClass="bg-emerald-50 text-emerald-600"
          action={
            <Link to="/platform/billing" className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">
              الفواتير <ArrowLeft className="h-3 w-3" />
            </Link>
          }
        >
          {overview.recentPayments.length === 0 ? (
            <EmptyState icon={<Wallet className="h-5 w-5" />} title="لا توجد مدفوعات مسجلة" description="ابدأ بإصدار فاتورة وتسجيل دفعة." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="text-[10.5px] text-slate-500">
                    <th className="px-4 py-2 font-semibold">العميل</th>
                    <th className="px-4 py-2 font-semibold">الفاتورة</th>
                    <th className="px-4 py-2 font-semibold">المبلغ</th>
                    <th className="px-4 py-2 font-semibold">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recentPayments.map((payment) => (
                    <tr key={payment.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-[12px] font-semibold text-slate-700">{payment.tenantName}</td>
                      <td className="px-4 py-2 text-[11px] text-slate-500" dir="ltr">{payment.invoiceNumber || '—'}</td>
                      <td className="px-4 py-2 text-[12px] font-bold text-emerald-700">{formatMoney(payment.amount)}</td>
                      <td className="px-4 py-2 text-[11px] text-slate-500">{formatDate(payment.paidAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* Recent platform activity */}
      <Panel
        title="آخر العمليات على المنصة"
        subtitle="أحدث الإجراءات الإدارية المسجلة"
        icon={<ScrollText className="h-4 w-4" />}
        iconClass="bg-slate-100 text-slate-600"
        action={
          <Link to="/platform/audit" className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline">
            السجل الكامل <ArrowLeft className="h-3 w-3" />
          </Link>
        }
      >
        {overview.recentAudit.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-5 w-5" />} title="لا توجد عمليات مسجلة بعد" />
        ) : (
          <ol className="divide-y divide-slate-100">
            {overview.recentAudit.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-bold text-slate-600">
                  {ENTITY_LABELS[entry.entityType] || entry.entityType}
                </span>
                <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-800">{entry.action}</p>
                <span className="shrink-0 text-[10px] text-slate-500">{entry.actorName || 'النظام'}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{formatDateTime(entry.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {/* Current installation + quick actions */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="المنشأة الحالية"
          subtitle="بيانات المنشأة المرتبطة بهذا المشروع"
          icon={<TrendingUp className="h-4 w-4" />}
          iconClass="bg-emerald-50 text-emerald-600"
          className="xl:col-span-2"
        >
          <dl className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="flex items-center gap-1 text-[10.5px] text-slate-500"><Users className="h-3 w-3" /> المستخدمون</dt>
              <dd className="mt-0.5 text-lg font-black text-slate-800">{formatNumber(overview.currentInstallation?.users ?? 0)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="flex items-center gap-1 text-[10.5px] text-slate-500"><Package className="h-3 w-3" /> الأصناف</dt>
              <dd className="mt-0.5 text-lg font-black text-slate-800">{formatNumber(overview.currentInstallation?.products ?? 0)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="flex items-center gap-1 text-[10.5px] text-slate-500"><ReceiptText className="h-3 w-3" /> فواتير البيع</dt>
              <dd className="mt-0.5 text-lg font-black text-slate-800">{formatNumber(overview.currentInstallation?.invoices ?? 0)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="flex items-center gap-1 text-[10.5px] text-slate-500"><Building2 className="h-3 w-3" /> العملاء</dt>
              <dd className="mt-0.5 text-lg font-black text-slate-800">{formatNumber(overview.currentInstallation?.customers ?? 0)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="flex items-center gap-1 text-[10.5px] text-slate-500"><GitBranch className="h-3 w-3" /> الفروع</dt>
              <dd className="mt-0.5 text-lg font-black text-slate-800">{formatNumber(overview.branches.installationBranches)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="flex items-center gap-1 text-[10.5px] text-slate-500"><Layers3 className="h-3 w-3" /> الأجهزة</dt>
              <dd className="mt-0.5 text-lg font-black text-slate-800">{formatNumber(overview.devices.devicesLimit)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="flex items-center gap-1 text-[10.5px] text-slate-500"><Sparkles className="h-3 w-3" /> المزايا المفعّلة</dt>
              <dd className="mt-0.5 text-lg font-black text-slate-800">{formatNumber(overview.moduleUsage.filter((item) => item.enabled).length)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="flex items-center gap-1 text-[10.5px] text-slate-500"><Wallet className="h-3 w-3" /> العملة</dt>
              <dd className="mt-0.5 text-lg font-black text-slate-800">{overview.currentInstallation?.currency || 'EGP'}</dd>
            </div>
          </dl>
        </Panel>

        <Panel
          title="إجراءات سريعة"
          icon={<Layers3 className="h-4 w-4" />}
          iconClass="bg-violet-50 text-violet-600"
        >
          <div className="grid gap-2 p-4">
            <Link to="/platform/tenants" className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[11.5px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
              إضافة عميل جديد <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
            <Link to="/platform/licenses" className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[11.5px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
              إصدار ترخيص <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
            <Link to="/platform/billing" className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[11.5px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
              إنشاء فاتورة <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
            <Link to="/platform/product" className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[11.5px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
              إدارة المنتج والمزايا <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default PlatformDashboardPage;
