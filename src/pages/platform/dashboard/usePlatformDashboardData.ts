import React from 'react';
import { platformAdminService } from '../../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../../hooks/platform/useCentralDataSource';
import type {
  PlatformOverview,
  PlatformPeriod,
  PlatformPlan,
  PlatformBusinessPerformance,
  PlatformCustomerMetrics,
  PlatformSubscriptionMetrics,
  PlatformLicenseMetrics,
  PlatformOperationsMetrics,
  PlatformAlertDetail,
  PlatformTimeSeriesPoint,
  PlatformSubscription,
  PlatformLicense,
  PlatformLicenseActivation,
  PlatformTenant,
  PlatformPayment,
  PlatformInvoice,
  PlatformRelease,
  PlatformModuleUsage,
  PlatformDevice,
} from '../../../services/domains/platform/platformTypes';

// ─── Flat analytics payloads returned by the central server endpoints ────────
export interface CentralAnalytics {
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

// ─── Unified supplementary lists (populated for BOTH data sources) ───────────
export interface DashboardSyncError {
  id: string;
  deviceId: string;
  deviceName: string;
  tenantId?: string;
  tenantName: string;
  error?: string;
  occurredAt: string;
  resolved?: boolean;
}

export interface DashboardEndpointHealth {
  endpoint: string;
  requests: number;
  errors: number;
  avgResponseMs: number;
  successRate: number;
}

export interface DashboardAuditItem {
  id: string;
  action: string;
  actorName?: string | null;
  entityType?: string | null;
  severity?: string | null;
  status?: string | null;
  createdAt: string;
}

export interface DashboardExtras {
  upcomingRenewals: PlatformSubscriptionMetrics['upcomingRenewalsList'];
  strugglingSubscriptions: PlatformSubscription[];
  pendingLicenses: PlatformLicense[];
  failedActivations: PlatformLicenseActivation[];
  expiringLicenses: PlatformLicense[];
  expiringSubscriptions: PlatformSubscription[];
  recentSyncErrors: DashboardSyncError[];
  apiEndpointsHealth: DashboardEndpointHealth[];
  topCustomers: PlatformCustomerMetrics['topCustomersByRevenue'];
  recentlyCancelled: PlatformTenant[];
  revenueSeries: PlatformTimeSeriesPoint[];
  newCustomersSeries: PlatformTimeSeriesPoint[];
  auditEvents: DashboardAuditItem[];
  moduleUsage: PlatformModuleUsage[];
}

export interface PlatformDashboardData {
  isCentral: boolean;
  overview: PlatformOverview | null;
  plans: PlatformPlan[];
  /** Rich local analytics (undefined in central mode). */
  bp?: PlatformBusinessPerformance;
  cm?: PlatformCustomerMetrics;
  sm?: PlatformSubscriptionMetrics;
  lm?: PlatformLicenseMetrics;
  om?: PlatformOperationsMetrics;
  /** Flat central analytics payloads (null in local mode). */
  ca: CentralAnalytics | null;
  alerts: PlatformAlertDetail[];
  extras: DashboardExtras;
}

export interface UsePlatformDashboardResult {
  data: PlatformDashboardData | null;
  isCentral: boolean;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  reload: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_WINDOW_DAYS = 30;

const timeOf = (v: unknown): number => {
  const t = new Date(str(v)).getTime();
  return Number.isFinite(t) ? t : NaN;
};

/** True when `dateStr` falls within the next `days` days (and is not long past). */
const expiresWithin = (dateStr: unknown, days = EXPIRING_WINDOW_DAYS): boolean => {
  const t = timeOf(dateStr);
  if (!Number.isFinite(t)) return false;
  const now = Date.now();
  return t >= now - DAY_MS && t <= now + days * DAY_MS;
};

const byDateAsc = <T>(get: (row: T) => unknown) => (a: T, b: T) => timeOf(get(a)) - timeOf(get(b));
const byDateDesc = <T>(get: (row: T) => unknown) => (a: T, b: T) => timeOf(get(b)) - timeOf(get(a));

function periodStartMs(period: string): number | null {
  const now = Date.now();
  switch (period) {
    case '7d': return now - 7 * DAY_MS;
    case '30d': return now - 30 * DAY_MS;
    case '90d': return now - 90 * DAY_MS;
    case '180d': return now - 180 * DAY_MS;
    case '365d': return now - 365 * DAY_MS;
    case 'ytd': {
      const d = new Date();
      return new Date(d.getFullYear(), 0, 1).getTime();
    }
    default: return null; // 'all'
  }
}

const MONTH_FMT = new Intl.DateTimeFormat('ar-EG', { month: 'short' });

/** Group dated numeric rows into a contiguous monthly series bounded by `period`. */
function monthlySeries(
  rows: Array<{ at: unknown; value: number }>,
  period: string,
): PlatformTimeSeriesPoint[] {
  const start = periodStartMs(period);
  const buckets = new Map<string, number>();
  let minT = Number.POSITIVE_INFINITY;
  let maxT = 0;
  for (const row of rows) {
    const t = timeOf(row.at);
    if (!Number.isFinite(t) || !Number.isFinite(row.value)) continue;
    if (start !== null && t < start) continue;
    const d = new Date(t);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, (buckets.get(key) ?? 0) + row.value);
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  if (buckets.size === 0) return [];

  const points: PlatformTimeSeriesPoint[] = [];
  const cursor = new Date(minT);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(maxT);
  while (cursor.getTime() <= end.getTime()) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const yearSuffix = ` ${String(cursor.getFullYear()).slice(-2)}`;
    points.push({
      period: key,
      value: buckets.get(key) ?? 0,
      label: `${MONTH_FMT.format(cursor)}${yearSuffix}`,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return points;
}

const countBy = <T>(rows: T[], get: (row: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const key = get(row);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
};

// ─── Local (platformAdminService) normalization ──────────────────────────────

function buildLocalExtras(
  overview: PlatformOverview,
  bp: PlatformBusinessPerformance | undefined,
  cm: PlatformCustomerMetrics | undefined,
  sm: PlatformSubscriptionMetrics | undefined,
  lm: PlatformLicenseMetrics | undefined,
  om: PlatformOperationsMetrics | undefined,
): DashboardExtras {
  return {
    upcomingRenewals: sm?.upcomingRenewalsList ?? [],
    strugglingSubscriptions: sm?.strugglingList ?? [],
    pendingLicenses: lm?.pendingLicensesList ?? [],
    failedActivations: lm?.failedActivationsList ?? [],
    expiringLicenses: overview.expiringLicenses ?? [],
    expiringSubscriptions: overview.expiringSubscriptions ?? [],
    recentSyncErrors: (om?.recentSyncErrors ?? []).map((e) => ({
      id: e.id,
      deviceId: e.deviceId,
      deviceName: e.deviceName,
      tenantId: e.tenantId,
      tenantName: e.tenantName,
      error: e.error,
      occurredAt: e.occurredAt,
      resolved: e.resolved,
    })),
    apiEndpointsHealth: om?.apiEndpointsHealth ?? [],
    topCustomers: cm?.topCustomersByRevenue ?? [],
    recentlyCancelled: cm?.recentlyCancelled ?? [],
    revenueSeries: bp?.timeSeries?.revenue ?? [],
    newCustomersSeries: cm?.timeSeries?.newCustomers ?? [],
    auditEvents: (overview.recentAudit ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.actorName,
      entityType: a.entityType,
      severity: a.severity,
      status: a.status,
      createdAt: a.createdAt,
    })),
    moduleUsage: overview.moduleUsage ?? [],
  };
}

function localAlerts(overview: PlatformOverview): PlatformAlertDetail[] {
  const raw = Array.isArray(overview.alertDetails) && overview.alertDetails.length > 0
    ? overview.alertDetails
    : (Array.isArray(overview.alerts) ? overview.alerts : []);
  return raw.map((a: any, index: number) => ({
    ...(a as PlatformAlertDetail),
    id: String(a?.id ?? `alert-${index}`),
    severity: (['danger', 'warning', 'info', 'success'].includes(String(a?.severity))
      ? String(a.severity)
      : 'info') as PlatformAlertDetail['severity'],
    title: String(a?.title ?? a?.message ?? 'تنبيه'),
    description: String(a?.description ?? ''),
    entityType: a?.entityType,
    entityId: a?.entityId != null ? String(a.entityId) : '',
    entityName: String(a?.entityName ?? ''),
    actionRequired: Boolean(a?.actionRequired),
    suggestedActions: Array.isArray(a?.suggestedActions) ? a.suggestedActions.map(String) : [],
    metadata: (a?.metadata ?? {}) as Record<string, unknown>,
  }));
}

// ─── Central normalization ───────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = { danger: 0, warning: 1, info: 2, success: 3 };

function centralAlerts(input: {
  struggling: PlatformSubscription[];
  expiringLicenses: PlatformLicense[];
  expiringSubscriptions: PlatformSubscription[];
  pendingLicenses: PlatformLicense[];
  syncErrors: DashboardSyncError[];
  overdueInvoices: number;
}): PlatformAlertDetail[] {
  const alerts: PlatformAlertDetail[] = [];
  const push = (a: Omit<PlatformAlertDetail, 'metadata'> & { metadata?: Record<string, unknown> }) =>
    alerts.push({ metadata: {}, ...a });

  if (input.struggling.length > 0) {
    push({
      id: 'central-struggling-subscriptions',
      severity: 'danger',
      title: `${input.struggling.length} اشتراك متعثر`,
      description: 'اشتراكات بحالة متأخرة السداد تحتاج إلى متابعة فورية.',
      link: '/platform/subscriptions',
      entityType: 'SUBSCRIPTION',
      entityId: '',
      entityName: '',
      actionRequired: true,
      suggestedActions: ['مراجعة الاشتراكات'],
      metadata: { count: input.struggling.length },
    });
  }
  if (input.overdueInvoices > 0) {
    push({
      id: 'central-overdue-invoices',
      severity: 'danger',
      title: `${input.overdueInvoices} فاتورة متأخرة`,
      description: 'فواتير تجاوزت تاريخ الاستحقاق ولم تُسدد بعد.',
      link: '/platform/billing',
      entityType: 'INVOICE',
      entityId: '',
      entityName: '',
      actionRequired: true,
      suggestedActions: ['متابعة التحصيل'],
      metadata: { count: input.overdueInvoices },
    });
  }
  if (input.syncErrors.length > 0) {
    push({
      id: 'central-sync-errors',
      severity: 'danger',
      title: `${input.syncErrors.length} خطأ مزامنة أخير`,
      description: 'أجهزة فشلت في مزامنة بياناتها مع الخادم المركزي.',
      link: '/platform/sync',
      entityType: 'DEVICE',
      entityId: '',
      entityName: '',
      actionRequired: true,
      suggestedActions: ['فحص المزامنة'],
      metadata: { count: input.syncErrors.length },
    });
  }
  if (input.expiringLicenses.length > 0) {
    push({
      id: 'central-expiring-licenses',
      severity: 'warning',
      title: `${input.expiringLicenses.length} ترخيص ينتهي قريباً`,
      description: 'تراخيص ستنتهي صلاحيتها خلال 30 يوماً القادمة.',
      link: '/platform/licenses',
      entityType: 'LICENSE',
      entityId: '',
      entityName: '',
      actionRequired: false,
      suggestedActions: ['تجديد التراخيص'],
      metadata: { count: input.expiringLicenses.length },
    });
  }
  if (input.expiringSubscriptions.length > 0) {
    push({
      id: 'central-expiring-subscriptions',
      severity: 'warning',
      title: `${input.expiringSubscriptions.length} اشتراك ينتهي قريباً`,
      description: 'اشتراكات ستنتهي خلال 30 يوماً — تأكد من التجديد التلقائي.',
      link: '/platform/subscriptions',
      entityType: 'SUBSCRIPTION',
      entityId: '',
      entityName: '',
      actionRequired: false,
      suggestedActions: ['مراجعة التجديدات'],
      metadata: { count: input.expiringSubscriptions.length },
    });
  }
  if (input.pendingLicenses.length > 0) {
    push({
      id: 'central-pending-licenses',
      severity: 'info',
      title: `${input.pendingLicenses.length} ترخيص معلق`,
      description: 'تراخيص صدرت ولم تُفعّل بعد على أجهزة العملاء.',
      link: '/platform/licenses',
      entityType: 'LICENSE',
      entityId: '',
      entityName: '',
      actionRequired: false,
      suggestedActions: ['متابعة التفعيل'],
      metadata: { count: input.pendingLicenses.length },
    });
  }
  return alerts.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
}

function mapCentralRelease(row: any): PlatformRelease {
  return {
    id: str(row?.id ?? row?.releaseId),
    version: str(row?.version ?? ''),
    channel: str(row?.channel ?? 'STABLE'),
    status: row?.status ?? null,
    isMandatory: row?.isMandatory ?? row?.is_mandatory ?? null,
    minVersion: row?.minVersion ?? row?.min_version ?? null,
    rolloutGroup: row?.rolloutGroup ?? row?.rollout_group ?? null,
    notes: row?.notes ?? row?.changelog ?? null,
    releasedAt: str(row?.releasedAt ?? row?.released_at ?? row?.createdAt ?? row?.created_at),
    fileUrl: row?.fileUrl ?? row?.file_url ?? null,
    fileName: row?.fileName ?? row?.file_name ?? null,
    fileSize: num(row?.fileSize ?? row?.file_size, 0) || null,
    checksumSha256: row?.checksumSha256 ?? row?.checksum_sha256 ?? null,
    packageSignature: row?.packageSignature ?? row?.package_signature ?? null,
    changelog: row?.changelog ?? null,
    rollbackVersion: row?.rollbackVersion ?? row?.rollback_version ?? null,
    stagingGroup: row?.stagingGroup ?? row?.staging_group ?? null,
    targetsSummary: row?.targetsSummary ?? row?.targets_summary ?? null,
    createdAt: str(row?.createdAt ?? row?.created_at ?? ''),
    updatedAt: str(row?.updatedAt ?? row?.updated_at ?? ''),
  };
}

function mapCentralAuditEvent(row: any): DashboardAuditItem {
  return {
    id: str(row?.id ?? ''),
    action: str(row?.action ?? ''),
    actorName: row?.actorName ?? row?.actor_name ?? null,
    entityType: row?.resourceType ?? row?.resource_type ?? row?.entityType ?? null,
    severity: row?.severity ?? null,
    status: row?.status ?? null,
    createdAt: str(row?.createdAt ?? row?.created_at ?? ''),
  };
}

function mapCentralSyncError(row: any, index: number): DashboardSyncError {
  return {
    id: str(row?.id ?? `sync-${index}`),
    deviceId: str(row?.deviceId ?? row?.device_id ?? ''),
    deviceName: str(row?.deviceName ?? row?.device_name ?? row?.deviceId ?? 'جهاز'),
    tenantId: row?.tenantId ?? row?.tenant_id ?? undefined,
    tenantName: str(row?.tenantName ?? row?.tenant_name ?? ''),
    error: str(row?.error ?? row?.message ?? ''),
    occurredAt: str(row?.occurredAt ?? row?.occurred_at ?? row?.createdAt ?? row?.created_at ?? ''),
    resolved: Boolean(row?.resolved ?? false),
  };
}

function mapCentralModule(row: any): PlatformModuleUsage {
  return {
    code: str(row?.code ?? ''),
    name: str(row?.name ?? row?.code ?? ''),
    category: row?.category ?? null,
    enabled: Boolean(row?.isActive ?? row?.is_active ?? row?.enabled),
    licenseCount: num(row?.licenseCount ?? row?.license_count, 0),
    tenantCount: num(row?.tenantCount ?? row?.tenant_count, 0),
  };
}

interface CentralBundle {
  overviewRaw: any;
  plans: PlatformPlan[];
  ca: CentralAnalytics;
  tenants: PlatformTenant[];
  subscriptions: PlatformSubscription[];
  licenses: PlatformLicense[];
  devices: PlatformDevice[];
  payments: PlatformPayment[];
  invoices: PlatformInvoice[];
  releases: PlatformRelease[];
  auditEvents: DashboardAuditItem[];
  syncErrors: DashboardSyncError[];
  modules: PlatformModuleUsage[];
}

function buildCentralDashboard(bundle: CentralBundle, period: string): {
  overview: PlatformOverview;
  alerts: PlatformAlertDetail[];
  extras: DashboardExtras;
} {
  const { ca, tenants, subscriptions, licenses, devices, payments, invoices, releases, auditEvents, syncErrors, modules, overviewRaw } = bundle;
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  // ── Counts ──────────────────────────────────────────────────────────────
  const tenantCounts = countBy(tenants, (t) => str(t.status).toUpperCase());
  const subCounts = countBy(subscriptions, (s) => str(s.status).toUpperCase());
  const licCounts = countBy(licenses, (l) => str(l.status).toUpperCase());

  const activeSubs = subscriptions.filter((s) => ['ACTIVE', 'TRIAL', 'PAST_DUE'].includes(str(s.status).toUpperCase()));
  const upcomingSubs = subscriptions
    .filter((s) => ['ACTIVE', 'TRIAL'].includes(str(s.status).toUpperCase()) && expiresWithin(s.endDate))
    .sort(byDateAsc((s) => s.endDate));
  const expiringLicenses = licenses
    .filter((l) => ['ACTIVE', 'ISSUED'].includes(str(l.status).toUpperCase()) && expiresWithin(l.expiresAt))
    .sort(byDateAsc((l) => l.expiresAt));
  const pendingLicenses = licenses.filter((l) => str(l.status).toUpperCase() === 'ISSUED');
  const strugglingSubs = subscriptions.filter((s) => str(s.status).toUpperCase() === 'PAST_DUE');

  // ── Billing ─────────────────────────────────────────────────────────────
  const paymentsSum = payments.reduce((acc, p) => acc + num(p.amount), 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const revenueThisMonth = payments
    .filter((p) => timeOf(p.paidAt) >= monthStart.getTime())
    .reduce((acc, p) => acc + num(p.amount), 0);
  const outstanding = invoices
    .filter((i) => ['SENT', 'PARTIAL', 'OVERDUE'].includes(str(i.status).toUpperCase()))
    .reduce((acc, i) => acc + Math.max(0, num(i.total) - num(i.paidAmount)), 0);
  const overdueInvoices = invoices.filter((i) => str(i.status).toUpperCase() === 'OVERDUE').length;

  // ── Devices / branches capacity ─────────────────────────────────────────
  const boundDevices = devices.filter((d) => Boolean(d.licenseId)).length;
  const devicesLimit = licenses
    .filter((l) => ['ACTIVE', 'ISSUED'].includes(str(l.status).toUpperCase()))
    .reduce((acc, l) => acc + num(l.deviceLimit, 1), 0);
  const branchesLimit = licenses
    .filter((l) => ['ACTIVE', 'ISSUED'].includes(str(l.status).toUpperCase()))
    .reduce((acc, l) => acc + num(l.branchesLimit, 1), 0);

  // ── Revenue by plan ─────────────────────────────────────────────────────
  const planRevenue = new Map<string, { planName: string; revenue: number; tenants: number }>();
  for (const sub of activeSubs) {
    const name = str(sub.planName) || 'بدون خطة';
    const row = planRevenue.get(name) ?? { planName: name, revenue: 0, tenants: 0 };
    row.revenue += num(sub.price);
    row.tenants += 1;
    planRevenue.set(name, row);
  }

  // ── Normalized overview ─────────────────────────────────────────────────
  const overview: PlatformOverview = {
    tenants: {
      total: tenants.length,
      active: tenantCounts['ACTIVE'] ?? 0,
      trial: tenantCounts['TRIAL'] ?? 0,
      suspended: tenantCounts['SUSPENDED'] ?? 0,
      expired: tenantCounts['EXPIRED'] ?? 0,
      cancelled: tenantCounts['CANCELLED'] ?? 0,
      expiringSoon: upcomingSubs.length,
    },
    subscriptions: {
      total: subscriptions.length,
      active: (subCounts['ACTIVE'] ?? 0) + (subCounts['PAST_DUE'] ?? 0),
      trial: subCounts['TRIAL'] ?? 0,
      expired: subCounts['EXPIRED'] ?? 0,
      cancelled: (subCounts['CANCELLED'] ?? 0) + (subCounts['SUSPENDED'] ?? 0),
      expiringSoon: upcomingSubs.length,
    },
    licenses: {
      total: licenses.length,
      active: licCounts['ACTIVE'] ?? 0,
      suspended: licCounts['SUSPENDED'] ?? 0,
      expiringSoon: expiringLicenses.length,
      revoked: licCounts['REVOKED'] ?? 0,
      expired: licCounts['EXPIRED'] ?? 0,
    },
    billing: {
      revenueTotal: ca.business?.revenue ?? paymentsSum,
      revenueThisMonth,
      invoicedTotal: num(ca.business?.invoiceTotal),
      outstanding,
      overdueInvoices,
      mrr: num(ca.subscriptions?.mrr),
      invoicesTotal: num(ca.business?.invoices, invoices.length),
      paidInvoices: invoices.filter((i) => str(i.status).toUpperCase() === 'PAID').length,
      draftInvoices: invoices.filter((i) => str(i.status).toUpperCase() === 'DRAFT').length,
    },
    devices: {
      boundLicenses: boundDevices,
      unboundLicenses: Math.max(0, devices.length - boundDevices),
      devicesLimit,
    },
    branches: {
      totalLimit: branchesLimit,
      installationBranches: 0,
    },
    releases: releases.length > 0 ? releases : (Array.isArray(overviewRaw?.releases) ? overviewRaw.releases.map(mapCentralRelease) : []),
    moduleUsage: modules.length > 0 ? modules : (Array.isArray(overviewRaw?.moduleUsage) ? overviewRaw.moduleUsage : []),
    revenueByPlan: Array.from(planRevenue.values()).sort((a, b) => b.revenue - a.revenue),
    alerts: [],
    recentTenants: [...tenants].sort(byDateDesc((t) => t.createdAt)).slice(0, 8),
    expiringLicenses,
    expiringSubscriptions: upcomingSubs,
    recentPayments: [...payments].sort(byDateDesc((p) => p.paidAt)).slice(0, 8),
    recentAudit: [],
    currentInstallation: overviewRaw?.currentInstallation ?? {
      companyName: 'المنصة المركزية',
      currency: 'EGP',
      users: 0,
      products: 0,
      invoices: 0,
      customers: 0,
    },
    businessPerformance: undefined,
    customerMetrics: undefined,
    subscriptionMetrics: undefined,
    licenseMetrics: undefined,
    operationsMetrics: undefined,
    alertDetails: [],
    reportFilters: undefined,
  };

  // ── Extras ──────────────────────────────────────────────────────────────
  const extras: DashboardExtras = {
    upcomingRenewals: upcomingSubs.map((s) => ({
      id: s.id,
      tenantId: s.tenantId,
      tenantName: s.tenantName ?? tenantById.get(s.tenantId)?.name ?? '—',
      tenantCode: tenantById.get(s.tenantId)?.code ?? '',
      planName: s.planName ?? '—',
      endDate: s.endDate ?? '',
      price: num(s.price),
      billingCycle: s.billingCycle,
      autoRenew: Boolean(s.autoRenew),
      status: s.status,
    })),
    strugglingSubscriptions: strugglingSubs,
    pendingLicenses,
    failedActivations: [],
    expiringLicenses,
    expiringSubscriptions: upcomingSubs,
    recentSyncErrors: syncErrors.slice(0, 10),
    apiEndpointsHealth: [],
    topCustomers: [],
    recentlyCancelled: tenants
      .filter((t) => str(t.status).toUpperCase() === 'CANCELLED')
      .sort(byDateDesc((t) => t.updatedAt))
      .slice(0, 8),
    revenueSeries: monthlySeries(
      payments.map((p) => ({ at: p.paidAt, value: num(p.amount) })),
      period,
    ),
    newCustomersSeries: monthlySeries(
      tenants.map((t) => ({ at: t.createdAt, value: 1 })),
      period,
    ),
    auditEvents,
    moduleUsage: modules,
  };

  const alerts = centralAlerts({
    struggling: strugglingSubs,
    expiringLicenses,
    expiringSubscriptions: upcomingSubs,
    pendingLicenses,
    syncErrors,
    overdueInvoices,
  });

  return { overview, alerts, extras };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePlatformDashboardData(period: string, planFilter: string): UsePlatformDashboardResult {
  const [data, setData] = React.useState<PlatformDashboardData | null>(null);
  const [isCentral, setIsCentral] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const centralState = getCentralDataSourceState();
    setIsCentral(centralState.active);
    try {
      if (centralState.active) {
        // Single parallel batch — every call is best-effort via allSettled so one
        // failing endpoint never blanks the whole dashboard.
        const results = await Promise.allSettled([
          centralPlatformClient.getOverview(),
          centralPlatformClient.listPlans().catch(() => [] as PlatformPlan[]),
          centralPlatformClient.getBusinessPerformance(period),
          centralPlatformClient.getCustomerMetrics(period),
          centralPlatformClient.getSubscriptionMetrics(),
          centralPlatformClient.getLicenseMetrics(),
          centralPlatformClient.getOperationsMetrics(),
          centralPlatformClient.listTenants('', '', planFilter || undefined),
          centralPlatformClient.listPayments({ limit: 500 }),
          centralPlatformClient.listSubscriptions({ planId: planFilter || undefined }),
          centralPlatformClient.listLicenses(),
          centralPlatformClient.listDevices(),
          centralPlatformClient.listInvoices(),
          centralPlatformClient.listReleases({}),
          centralPlatformClient.listAuditEvents({ limit: 8 }),
          centralPlatformClient.listSyncEvents({ status: 'FAILED', limit: 10 }),
          centralPlatformClient.listModules(),
        ]);
        const val = <T,>(i: number, fallback: T): T =>
          results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<T>).value : fallback;

        const ca: CentralAnalytics = {
          business: val(2, undefined) as CentralAnalytics['business'],
          customers: val(3, undefined) as CentralAnalytics['customers'],
          subscriptions: val(4, undefined) as CentralAnalytics['subscriptions'],
          licenses: val(5, undefined) as CentralAnalytics['licenses'],
          operations: val(6, undefined) as CentralAnalytics['operations'],
        };

        const { overview, alerts, extras } = buildCentralDashboard(
          {
            overviewRaw: val(0, {}),
            plans: val(1, [] as PlatformPlan[]),
            ca,
            tenants: val(7, [] as PlatformTenant[]),
            subscriptions: val(9, [] as PlatformSubscription[]),
            licenses: val(10, [] as PlatformLicense[]),
            devices: val(11, [] as PlatformDevice[]),
            payments: val(8, [] as PlatformPayment[]),
            invoices: val(12, [] as PlatformInvoice[]),
            releases: (val(13, []) as any[]).map(mapCentralRelease),
            auditEvents: ((val(14, { data: [] }) as { data?: any[] }).data ?? []).map(mapCentralAuditEvent),
            syncErrors: ((val(15, []) as any[]) ?? []).map(mapCentralSyncError),
            modules: ((val(16, []) as any[]) ?? []).map(mapCentralModule),
          },
          period,
        );

        setData({
          isCentral: true,
          overview,
          plans: val(1, [] as PlatformPlan[]),
          bp: undefined,
          cm: undefined,
          sm: undefined,
          lm: undefined,
          om: undefined,
          ca,
          alerts,
          extras,
        });
      } else {
        const ov = platformAdminService.getOverviewWithPeriod(period as PlatformPeriod, planFilter || undefined);
        const bp = ov.businessPerformance?.revenue?.total ? ov.businessPerformance : undefined;
        const cm = ov.customerMetrics?.newCustomers ? ov.customerMetrics : undefined;
        const sm = ov.subscriptionMetrics?.upcomingRenewals ? ov.subscriptionMetrics : undefined;
        const lm = ov.licenseMetrics?.activatedDevices ? ov.licenseMetrics : undefined;
        const om = ov.operationsMetrics?.connectedDevices ? ov.operationsMetrics : undefined;
        setData({
          isCentral: false,
          overview: ov,
          plans: platformAdminService.listPlans(),
          bp,
          cm,
          sm,
          lm,
          om,
          ca: null,
          alerts: localAlerts(ov),
          extras: buildLocalExtras(ov, bp, cm, sm, lm, om),
        });
      }
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات المنصة.');
    } finally {
      setLoading(false);
    }
  }, [period, planFilter]);

  React.useEffect(() => {
    load();
  }, [load]);

  const reload = React.useCallback(() => {
    void load();
  }, [load]);

  return { data, isCentral, loading, error, lastUpdated, reload };
}

