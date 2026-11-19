import type { PlatformTenantStatus } from './tenant';
import type { PlatformTenant } from './tenant';
import type { PlatformBillingCycle, PlatformSubscriptionStatus, PlatformSubscription } from './billing';
import type { PlatformLicenseActivation } from './license';
import type { PlatformLicense } from './license';
import type { PlatformAlert } from './catalog';

// ─── Time Period & Analytics ───────────────────────────────────────────────────

export type PlatformPeriod = '7d' | '30d' | '90d' | '180d' | '365d' | 'ytd' | 'all';

export interface PlatformPeriodOption {
  value: PlatformPeriod;
  label: string;
  days: number | null;
}

export const PLATFORM_PERIODS: PlatformPeriodOption[] = [
  { value: '7d', label: 'آخر 7 أيام', days: 7 },
  { value: '30d', label: 'آخر 30 يوم', days: 30 },
  { value: '90d', label: 'آخر 90 يوم', days: 90 },
  { value: '180d', label: 'آخر 180 يوم', days: 180 },
  { value: '365d', label: 'آخر 365 يوم', days: 365 },
  { value: 'ytd', label: 'منذ بداية السنة', days: null },
  { value: 'all', label: 'الكل', days: null },
];

export interface PlatformTimeSeriesPoint {
  period: string; // ISO date string for the period start (day/month)
  value: number;
  label: string; // Human-readable label
}

export interface PlatformMetricComparison {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'flat';
}

// ─── Business Performance (الأداء التجاري) ──────────────────────────────────────

export interface PlatformBusinessPerformance {
  revenue: {
    total: PlatformMetricComparison;
    mrr: PlatformMetricComparison;
    arr: PlatformMetricComparison;
    netRevenue: PlatformMetricComparison;
    growthRate: PlatformMetricComparison;
  };
  timeSeries: {
    revenue: PlatformTimeSeriesPoint[];
    mrr: PlatformTimeSeriesPoint[];
    arr: PlatformTimeSeriesPoint[];
  };
}

// ─── Customers (العملاء) ────────────────────────────────────────────────────────

export interface PlatformCustomerMetrics {
  newCustomers: PlatformMetricComparison;
  activeCustomers: PlatformMetricComparison;
  cancelledCustomers: PlatformMetricComparison;
  churnRate: PlatformMetricComparison;
  trialToPaidConversion: PlatformMetricComparison;
  averageRevenuePerCustomer: PlatformMetricComparison;
  timeSeries: {
    newCustomers: PlatformTimeSeriesPoint[];
    activeCustomers: PlatformTimeSeriesPoint[];
    churnedCustomers: PlatformTimeSeriesPoint[];
    trialConversions: PlatformTimeSeriesPoint[];
  };
  topCustomersByRevenue: Array<{
    id: string;
    code: string;
    name: string;
    revenue: number;
    invoicesCount: number;
    status: PlatformTenantStatus;
  }>;
  recentlyCancelled: PlatformTenant[];
}

// ─── Subscriptions (الاشتراكات) ─────────────────────────────────────────────────

export interface PlatformSubscriptionMetrics {
  expiredTrials: PlatformMetricComparison;
  upcomingRenewals: PlatformMetricComparison;
  strugglingSubscriptions: PlatformMetricComparison; // PAST_DUE
  trialConversionRate: PlatformMetricComparison;
  averageSubscriptionValue: PlatformMetricComparison;
  renewalRate: PlatformMetricComparison;
  timeSeries: {
    newSubscriptions: PlatformTimeSeriesPoint[];
    renewedSubscriptions: PlatformTimeSeriesPoint[];
    cancelledSubscriptions: PlatformTimeSeriesPoint[];
    expiredTrials: PlatformTimeSeriesPoint[];
  };
  upcomingRenewalsList: Array<{
    id: string;
    tenantId: string;
    tenantName: string;
    tenantCode: string;
    planName: string;
    endDate: string;
    price: number;
    billingCycle: PlatformBillingCycle;
    autoRenew: boolean;
    status: PlatformSubscriptionStatus;
  }>;
  strugglingList: PlatformSubscription[];
}

// ─── Licenses (التراخيص) ────────────────────────────────────────────────────────

export interface PlatformLicenseMetrics {
  activatedDevices: PlatformMetricComparison;
  utilizationRate: PlatformMetricComparison; // activated / limit
  pendingLicenses: PlatformMetricComparison; // ISSUED but not ACTIVE
  failedActivations: PlatformMetricComparison;
  activationSuccessRate: PlatformMetricComparison;
  expiringSoon: PlatformMetricComparison;
  timeSeries: {
    activations: PlatformTimeSeriesPoint[];
    deactivations: PlatformTimeSeriesPoint[];
    failedActivations: PlatformTimeSeriesPoint[];
    utilization: PlatformTimeSeriesPoint[];
  };
  failedActivationsList: PlatformLicenseActivation[];
  pendingLicensesList: PlatformLicense[];
}

// ─── Operations (التشغيل) ───────────────────────────────────────────────────────

export interface PlatformOperationsMetrics {
  connectedDevices: PlatformMetricComparison;
  disconnectedDevices: PlatformMetricComparison;
  syncErrors: PlatformMetricComparison;
  apiHealth: PlatformMetricComparison; // success rate
  averageResponseTime: PlatformMetricComparison;
  timeSeries: {
    onlineDevices: PlatformTimeSeriesPoint[];
    offlineDevices: PlatformTimeSeriesPoint[];
    syncErrors: PlatformTimeSeriesPoint[];
    apiSuccessRate: PlatformTimeSeriesPoint[];
  };
  recentSyncErrors: Array<{
    id: string;
    deviceId: string;
    deviceName: string;
    tenantId: string;
    tenantName: string;
    error: string;
    occurredAt: string;
    resolved: boolean;
  }>;
  apiEndpointsHealth: Array<{
    endpoint: string;
    requests: number;
    errors: number;
    avgResponseMs: number;
    successRate: number;
  }>;
}

// ─── Alerts (التنبيهات) ─────────────────────────────────────────────────────────

export interface PlatformAlertDetail extends PlatformAlert {
  entityType: 'TENANT' | 'LICENSE' | 'SUBSCRIPTION' | 'INVOICE' | 'DEVICE' | 'PAYMENT' | 'API';
  entityId: string;
  entityName: string;
  actionRequired: boolean;
  suggestedActions: string[];
  metadata: Record<string, unknown>;
}

// ─── Reports (التقارير) ──────────────────────────────────────────────────────────

export interface PlatformReportFilters {
  period: PlatformPeriod;
  planId?: string;
  tenantId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PlatformComparisonReport {
  period: PlatformPeriod;
  businessPerformance: PlatformBusinessPerformance;
  customers: PlatformCustomerMetrics;
  subscriptions: PlatformSubscriptionMetrics;
  licenses: PlatformLicenseMetrics;
  operations: PlatformOperationsMetrics;
  generatedAt: string;
}
