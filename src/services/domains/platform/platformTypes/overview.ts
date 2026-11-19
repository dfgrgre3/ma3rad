import type { PlatformRelease, PlatformModuleUsage, PlatformAlert } from './catalog';
import type { PlatformTenant } from './tenant';
import type { PlatformLicense } from './license';
import type { PlatformSubscription, PlatformPayment } from './billing';
import type { PlatformAuditEntry } from './audit';
import type {
  PlatformBusinessPerformance,
  PlatformCustomerMetrics,
  PlatformSubscriptionMetrics,
  PlatformLicenseMetrics,
  PlatformOperationsMetrics,
  PlatformAlertDetail,
  PlatformReportFilters,
} from './analytics';

export interface PlatformOverview {
  tenants: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    expired: number;
    cancelled: number;
    expiringSoon: number;
  };
  subscriptions: {
    total: number;
    active: number;
    trial: number;
    expired: number;
    cancelled: number;
    expiringSoon: number;
  };
  licenses: {
    total: number;
    active: number;
    suspended: number;
    expiringSoon: number;
    revoked: number;
    expired: number;
  };
  billing: {
    revenueTotal: number;
    revenueThisMonth: number;
    invoicedTotal: number;
    outstanding: number;
    overdueInvoices: number;
    mrr: number;
    invoicesTotal: number;
    paidInvoices: number;
    draftInvoices: number;
  };
  devices: {
    boundLicenses: number;
    unboundLicenses: number;
    devicesLimit: number;
  };
  branches: {
    totalLimit: number;
    installationBranches: number;
  };
  releases: PlatformRelease[];
  moduleUsage: PlatformModuleUsage[];
  revenueByPlan: { planName: string; revenue: number; tenants: number }[];
  alerts: PlatformAlert[];
  recentTenants: PlatformTenant[];
  expiringLicenses: PlatformLicense[];
  expiringSubscriptions: PlatformSubscription[];
  recentPayments: PlatformPayment[];
  recentAudit: PlatformAuditEntry[];
  currentInstallation: {
    companyName: string;
    currency: string;
    users: number;
    products: number;
    invoices: number;
    customers: number;
  } | null;

  // ─── NEW: Extended metrics sections ──────────────────────────────────────────
  businessPerformance?: PlatformBusinessPerformance;
  customerMetrics?: PlatformCustomerMetrics;
  subscriptionMetrics?: PlatformSubscriptionMetrics;
  licenseMetrics?: PlatformLicenseMetrics;
  operationsMetrics?: PlatformOperationsMetrics;
  alertDetails?: PlatformAlertDetail[];
  reportFilters?: PlatformReportFilters;
}
