import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import {
  PlatformPeriod,
  PlatformBusinessPerformance,
  PlatformCustomerMetrics,
  PlatformSubscriptionMetrics,
  PlatformLicenseMetrics,
  PlatformOperationsMetrics,
  PlatformOverview,
  PlatformAlertDetail,
  PlatformAlert,
  PlatformMetricComparison,
  PlatformTimeSeriesPoint,
  PlatformTenant,
  PlatformSubscription,
  PlatformLicense,
  PlatformLicenseActivation,
  PlatformTenantStatus,
  PlatformSubscriptionStatus,
  PlatformBillingCycle,
} from './platformTypes';
import { nowIso, toNumber, formatDate, addDays, formatMoneyText } from './platformUtils';

function createMetricComparison(current: number, previous: number): PlatformMetricComparison {
  const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  return {
    current,
    previous,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(change * 100) / 100,
    trend: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
  };
}

function createTimeSeriesPoint(period: string, value: number, label?: string): PlatformTimeSeriesPoint {
  return { period, value, label: label ?? period };
}

export class PlatformAnalyticsService {
  private db = DatabaseManager.getInstance();

  private static requirePlatformAccess(modules: string | string[], action?: string) {
    const user = AuthService.getCurrentUser();
    if (!user || !user.isActive) {
      throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    }

    if (user.role === 'SUPER_ADMIN') {
      return user;
    }

    const allowedRoles = new Set(['PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER']);
    if (!allowedRoles.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لمستخدمي المنصة المصرح لهم فقط.');
    }

    const permissionsOverride = PlatformStaffAuthService.getCurrentPermissionsOverride();
    const required = Array.isArray(modules) ? modules : [modules];
    const permitted = required.some((moduleKey) => {
      if (action && action.startsWith('platform.')) {
        return PlatformAuthorizationService.canAccessPermission(user.role, action, permissionsOverride);
      }
      return PlatformAuthorizationService.canAccessModule(user.role, moduleKey, permissionsOverride)
        && (!action || PlatformAuthorizationService.canAccessModule(user.role, action, permissionsOverride));
    });

    if (!permitted) {
      throw new Error('لا تملك صلاحية تنفيذ هذه العملية.');
    }

    return user;
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string | null,
    details?: unknown,
    options?: {
      severity?: import('./platformTypes').AuditSeverity;
      status?: import('./platformTypes').AuditStatus;
      actorType?: import('./platformTypes').AuditActorType;
      tenantId?: string | null;
      deviceId?: string | null;
      deviceName?: string | null;
      ipAddress?: string | null;
      oldValues?: unknown;
      newValues?: unknown;
      errorMessage?: string | null;
    }
  ): void {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    centralAuditService.log(actor, {
      action,
      entityType,
      entityId,
      details,
      severity: options?.severity,
      status: options?.status,
      actorType: options?.actorType,
      tenantId: options?.tenantId,
      deviceId: options?.deviceId,
      deviceName: options?.deviceName,
      ipAddress: options?.ipAddress,
      oldValues: options?.oldValues,
      newValues: options?.newValues,
      errorMessage: options?.errorMessage,
    });
  }

  private getPeriodRange(period: PlatformPeriod): { from: string; to: string } {
    const now = new Date();
    let from: Date;

    switch (period) {
      case '7d':
        from = addDays(now, -7);
        break;
      case '30d':
        from = addDays(now, -30);
        break;
      case '90d':
        from = addDays(now, -90);
        break;
      case '180d':
        from = addDays(now, -180);
        break;
      case '365d':
        from = addDays(now, -365);
        break;
      case 'ytd':
        from = new Date(now.getFullYear(), 0, 1);
        break;
      case 'all':
        from = new Date(0);
        break;
      default:
        from = addDays(now, -30);
    }

    return {
      from: from.toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
    };
  }

  private getPreviousPeriodRange(period: PlatformPeriod): { from: string; to: string } {
    const { from, to } = this.getPeriodRange(period);
    const days = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
    const prevTo = addDays(new Date(from), -1);
    const prevFrom = addDays(prevTo, -days);
    return {
      from: prevFrom.toISOString().split('T')[0],
      to: prevTo.toISOString().split('T')[0],
    };
  }

  // ─── Business Performance ─────────────────────────────────────────────────────

  public getBusinessPerformance(period: PlatformPeriod = '30d', planId?: string): PlatformBusinessPerformance {
    PlatformAnalyticsService.requirePlatformAccess('analytics', 'platform.analytics.business');

    const { from, to } = this.getPeriodRange(period);
    const { from: prevFrom, to: prevTo } = this.getPreviousPeriodRange(period);
    const planFilter = planId ? 'AND p.id = ?' : '';
    const planParams = planId ? [planId] : [];

    // Current period revenue
    const revenue = this.db.query<any>(
      `SELECT COALESCE(SUM(i.total), 0) AS total
       FROM platform_invoices i
       JOIN platform_tenants t ON t.id = i.tenant_id
       JOIN platform_plans p ON p.id = t.plan_id
       WHERE i.status = 'PAID' AND i.paid_at BETWEEN ? AND ? ${planFilter}`,
      [from, to, ...planParams]
    )[0]?.total ?? 0;

    // Previous period revenue
    const prevRevenue = this.db.query<any>(
      `SELECT COALESCE(SUM(i.total), 0) AS total
       FROM platform_invoices i
       JOIN platform_tenants t ON t.id = i.tenant_id
       JOIN platform_plans p ON p.id = t.plan_id
       WHERE i.status = 'PAID' AND i.paid_at BETWEEN ? AND ? ${planFilter}`,
      [prevFrom, prevTo, ...planParams]
    )[0]?.total ?? 0;

    // MRR
    const mrr = this.db.query<any>(
      `SELECT COALESCE(SUM(s.price), 0) AS total
       FROM platform_subscriptions s
       JOIN platform_plans p ON p.id = s.plan_id
       WHERE s.status = 'ACTIVE' ${planFilter}`,
      [...planParams]
    )[0]?.total ?? 0;

    // Previous MRR (approximate)
    const prevMrr = this.db.query<any>(
      `SELECT COALESCE(SUM(s.price), 0) AS total
       FROM platform_subscriptions s
       JOIN platform_plans p ON p.id = s.plan_id
       WHERE s.status = 'ACTIVE' AND s.created_at <= ? ${planFilter}`,
      [prevTo, ...planParams]
    )[0]?.total ?? 0;

    // ARR
    const arr = toNumber(mrr, 0) * 12;
    const prevArr = toNumber(prevMrr, 0) * 12;

    // Net revenue (simplified)
    const netRevenue = toNumber(revenue, 0);
    const prevNetRevenue = toNumber(prevRevenue, 0);

    // Growth rate
    const growthRate = toNumber(prevRevenue, 0) > 0
      ? ((toNumber(revenue, 0) - toNumber(prevRevenue, 0)) / toNumber(prevRevenue, 0)) * 100
      : 0;

    // Time series (simplified - monthly buckets)
    const revenueSeries = this.db.query<any>(
      `SELECT strftime('%Y-%m', paid_at) AS month, COALESCE(SUM(total), 0) AS total
       FROM platform_invoices
       WHERE status = 'PAID' AND paid_at BETWEEN ? AND ?
       GROUP BY month
       ORDER BY month`,
      [from, to]
    ).map(r => createTimeSeriesPoint(r.month, toNumber(r.total, 0)));

    const mrrSeries = this.db.query<any>(
      `SELECT strftime('%Y-%m', created_at) AS month, COALESCE(SUM(price), 0) AS total
       FROM platform_subscriptions
       WHERE status = 'ACTIVE' AND created_at BETWEEN ? AND ?
       GROUP BY month
       ORDER BY month`,
      [from, to]
    ).map(r => createTimeSeriesPoint(r.month, toNumber(r.total, 0)));

    const arrSeries = mrrSeries.map(p => createTimeSeriesPoint(p.period, p.value * 12));

    return {
      revenue: {
        total: createMetricComparison(toNumber(revenue, 0), toNumber(prevRevenue, 0)),
        mrr: createMetricComparison(toNumber(mrr, 0), toNumber(prevMrr, 0)),
        arr: createMetricComparison(toNumber(arr, 0), toNumber(prevArr, 0)),
        netRevenue: createMetricComparison(toNumber(netRevenue, 0), toNumber(prevNetRevenue, 0)),
        growthRate: createMetricComparison(Math.round(growthRate * 100) / 100, 0),
      },
      timeSeries: {
        revenue: revenueSeries,
        mrr: mrrSeries,
        arr: arrSeries,
      },
    };
  }

  // ─── Customer Metrics ─────────────────────────────────────────────────────────

  public getCustomerMetrics(planId?: string): PlatformCustomerMetrics {
    PlatformAnalyticsService.requirePlatformAccess('analytics', 'platform.analytics.customers');

    const planFilter = planId ? 'AND p.id = ?' : '';
    const planParams = planId ? [planId] : [];

    // Total customers
    const total = this.db.query<any>(
      `SELECT COUNT(*) AS c FROM platform_tenants t JOIN platform_plans p ON p.id = t.plan_id WHERE 1=1 ${planFilter}`,
      [...planParams]
    )[0]?.c ?? 0;

    // By status
    const byStatus = this.db.query<any>(
      `SELECT status, COUNT(*) AS c FROM platform_tenants t JOIN platform_plans p ON p.id = t.plan_id WHERE 1=1 ${planFilter} GROUP BY status`,
      [...planParams]
    );

    const active = byStatus.find((r: any) => r.status === 'ACTIVE')?.c ?? 0;
    const trial = byStatus.find((r: any) => r.status === 'TRIAL')?.c ?? 0;
    const cancelled = byStatus.find((r: any) => r.status === 'CANCELLED')?.c ?? 0;

    // New customers (last 30 days)
    const newCustomers = this.db.query<any>(
      `SELECT COUNT(*) AS c FROM platform_tenants t JOIN platform_plans p ON p.id = t.plan_id WHERE t.created_at > date('now', '-30 days') ${planFilter}`,
      [...planParams]
    )[0]?.c ?? 0;

    // Previous period new customers
    const prevNewCustomers = this.db.query<any>(
      `SELECT COUNT(*) AS c FROM platform_tenants t JOIN platform_plans p ON p.id = t.plan_id WHERE t.created_at BETWEEN date('now', '-60 days') AND date('now', '-30 days') ${planFilter}`,
      [...planParams]
    )[0]?.c ?? 0;

    // Cancelled customers (last 30 days)
    const cancelledInPeriod = this.db.query<any>(
      `SELECT COUNT(*) AS c FROM platform_tenants t JOIN platform_plans p ON p.id = t.plan_id WHERE t.status = 'CANCELLED' AND t.updated_at > date('now', '-30 days') ${planFilter}`,
      [...planParams]
    )[0]?.c ?? 0;

    // Previous period cancelled
    const prevCancelledInPeriod = this.db.query<any>(
      `SELECT COUNT(*) AS c FROM platform_tenants t JOIN platform_plans p ON p.id = t.plan_id WHERE t.status = 'CANCELLED' AND t.updated_at BETWEEN date('now', '-60 days') AND date('now', '-30 days') ${planFilter}`,
      [...planParams]
    )[0]?.c ?? 0;

    // Trial to paid conversion (simplified)
    const trialConversions = this.db.query<any>(
      `SELECT COUNT(*) AS c FROM platform_subscriptions s JOIN platform_plans p ON p.id = s.plan_id WHERE s.status = 'ACTIVE' AND s.created_at > date('now', '-30 days') ${planFilter}`,
      [...planParams]
    )[0]?.c ?? 0;

    const prevTrialConversions = this.db.query<any>(
      `SELECT COUNT(*) AS c FROM platform_subscriptions s JOIN platform_plans p ON p.id = s.plan_id WHERE s.status = 'ACTIVE' AND s.created_at BETWEEN date('now', '-60 days') AND date('now', '-30 days') ${planFilter}`,
      [...planParams]
    )[0]?.c ?? 0;

    // Average revenue per customer
    const avgRevenue = this.db.query<any>(
      `SELECT COALESCE(AVG(tenant_revenue), 0) AS avg FROM (
         SELECT t.id, COALESCE(SUM(i.total), 0) AS tenant_revenue
         FROM platform_tenants t
         LEFT JOIN platform_invoices i ON i.tenant_id = t.id AND i.status = 'PAID'
         JOIN platform_plans p ON p.id = t.plan_id
         WHERE 1=1 ${planFilter}
         GROUP BY t.id
       )`,
      [...planParams]
    )[0]?.avg ?? 0;

    const prevAvgRevenue = this.db.query<any>(
      `SELECT COALESCE(AVG(tenant_revenue), 0) AS avg FROM (
         SELECT t.id, COALESCE(SUM(i.total), 0) AS tenant_revenue
         FROM platform_tenants t
         LEFT JOIN platform_invoices i ON i.tenant_id = t.id AND i.status = 'PAID'
         JOIN platform_plans p ON p.id = t.plan_id
         WHERE 1=1 ${planFilter} AND t.created_at <= date('now', '-30 days')
         GROUP BY t.id
       )`,
      [...planParams]
    )[0]?.avg ?? 0;

    // Time series (simplified)
    const newCustomersSeries = this.db.query<any>(
      `SELECT date(created_at) AS period, COUNT(*) AS count
       FROM platform_tenants
       WHERE created_at > date('now', '-30 days')
       GROUP BY period
       ORDER BY period`
    ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

    const activeCustomersSeries = this.db.query<any>(
      `SELECT date(created_at) AS period, COUNT(*) AS count
       FROM platform_tenants
       WHERE status IN ('ACTIVE','TRIAL') AND created_at > date('now', '-30 days')
       GROUP BY period
       ORDER BY period`
    ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

    const churnedCustomersSeries = this.db.query<any>(
      `SELECT date(updated_at) AS period, COUNT(*) AS count
       FROM platform_tenants
       WHERE status = 'CANCELLED' AND updated_at > date('now', '-30 days')
       GROUP BY period
       ORDER BY period`
    ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

    const trialConversionsSeries = this.db.query<any>(
      `SELECT date(created_at) AS period, COUNT(*) AS count
       FROM platform_subscriptions
       WHERE status = 'ACTIVE' AND created_at > date('now', '-30 days')
       GROUP BY period
       ORDER BY period`
    ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

    // Top customers by revenue
    const topCustomers = this.db.query<any>(
      `SELECT t.id, t.code, t.name, COALESCE(SUM(i.total), 0) AS revenue, COUNT(i.id) AS invoicesCount, t.status
       FROM platform_tenants t
       LEFT JOIN platform_invoices i ON i.tenant_id = t.id AND i.status = 'PAID'
       JOIN platform_plans p ON p.id = t.plan_id
       WHERE 1=1 ${planFilter}
       GROUP BY t.id
       ORDER BY revenue DESC
       LIMIT 10`,
      [...planParams]
    );

    // Recently cancelled
    const recentlyCancelled = this.db.query<any>(
      `SELECT * FROM platform_tenants
       WHERE status = 'CANCELLED'
       ORDER BY updated_at DESC
       LIMIT 10`
    );

    return {
      newCustomers: createMetricComparison(toNumber(newCustomers, 0), toNumber(prevNewCustomers, 0)),
      activeCustomers: createMetricComparison(toNumber(active + trial, 0), 0),
      cancelledCustomers: createMetricComparison(toNumber(cancelledInPeriod, 0), toNumber(prevCancelledInPeriod, 0)),
      churnRate: createMetricComparison(
        toNumber(active + trial, 0) > 0 ? (toNumber(cancelledInPeriod, 0) / toNumber(active + trial, 0)) * 100 : 0,
        0
      ),
      trialToPaidConversion: createMetricComparison(toNumber(trialConversions, 0), toNumber(prevTrialConversions, 0)),
      averageRevenuePerCustomer: createMetricComparison(Math.round(toNumber(avgRevenue, 0) * 100) / 100, Math.round(toNumber(prevAvgRevenue, 0) * 100) / 100),
      timeSeries: {
        newCustomers: newCustomersSeries,
        activeCustomers: activeCustomersSeries,
        churnedCustomers: churnedCustomersSeries,
        trialConversions: trialConversionsSeries,
      },
      topCustomersByRevenue: topCustomers.map((c: any) => ({
        id: String(c.id),
        code: String(c.code),
        name: String(c.name),
        revenue: toNumber(c.revenue, 0),
        invoicesCount: toNumber(c.invoicesCount, 0),
        status: c.status as PlatformTenantStatus,
      })),
      recentlyCancelled: recentlyCancelled.map((t: any) => ({
        id: String(t.id),
        code: String(t.code),
        name: String(t.name),
        contactName: t.contact_name ?? null,
        email: t.email ?? null,
        phone: t.phone ?? null,
        country: t.country ?? null,
        city: t.city ?? null,
        address: t.address ?? null,
        businessType: t.business_type ?? null,
        status: t.status as PlatformTenantStatus,
        planId: t.plan_id ?? null,
        planName: null,
        planPrice: null,
        subscriptionStartedAt: t.subscription_started_at ?? null,
        subscriptionExpiresAt: t.subscription_expires_at ?? null,
        seatsLimit: toNumber(t.seats_limit, 1),
        branchesLimit: toNumber(t.branches_limit, 1),
        devicesLimit: toNumber(t.devices_limit, 1),
        notes: t.notes ?? null,
        activeLicenses: 0,
        licensesTotal: 0,
        devicesUsed: 0,
        outstanding: 0,
        subscriptionId: t.subscription_id ?? null,
        price: t.price ?? null,
        createdAt: String(t.created_at),
        updatedAt: String(t.updated_at),
      })),
    };
  }

  // ─── Subscription Metrics ─────────────────────────────────────────────────────

  public getSubscriptionMetrics(): PlatformSubscriptionMetrics {
    PlatformAnalyticsService.requirePlatformAccess('analytics', 'platform.analytics.subscriptions');

    // Total subscriptions
    const total = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_subscriptions')[0]?.c ?? 0;

    // By status
    const byStatus = this.db.query<any>('SELECT status, COUNT(*) AS c FROM platform_subscriptions GROUP BY status');
    const statusCounts: Record<string, number> = {};
    for (const row of byStatus) {
      statusCounts[row.status] = toNumber(row.c, 0);
    }

    // MRR
    const mrr = this.db.query<any>('SELECT COALESCE(SUM(price), 0) AS total FROM platform_subscriptions WHERE status = \'ACTIVE\'')[0]?.total ?? 0;

    // New subscriptions (last 30 days)
    const newInPeriod = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_subscriptions WHERE created_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;

    // Previous period
    const prevNewInPeriod = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_subscriptions WHERE created_at BETWEEN date(\'now\', \'-60 days\') AND date(\'now\', \'-30 days\')')[0]?.c ?? 0;

    // Cancelled subscriptions
    const cancelledInPeriod = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_subscriptions WHERE status = \'CANCELLED\' AND updated_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;

    // Previous period cancelled
    const prevCancelledInPeriod = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_subscriptions WHERE status = \'CANCELLED\' AND updated_at BETWEEN date(\'now\', \'-60 days\') AND date(\'now\', \'-30 days\')')[0]?.c ?? 0;

    // Upgrades/Downgrades
    const changes = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_audit WHERE action = \'PLAN_CHANGE\' AND created_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;

    // Upcoming renewals
    const upcomingRenewals = this.db.query<any>(
      `SELECT s.id, s.tenant_id, t.name, t.code, p.name AS planName, s.end_date, s.price, s.billing_cycle, s.auto_renew, s.status
       FROM platform_subscriptions s
       JOIN platform_tenants t ON t.id = s.tenant_id
       JOIN platform_plans p ON p.id = s.plan_id
       WHERE s.status = 'ACTIVE' AND s.end_date IS NOT NULL
         AND date(s.end_date) BETWEEN date('now') AND date('now', '+30 day')
       ORDER BY s.end_date
       LIMIT 20`
    );

    // Struggling subscriptions (PAST_DUE)
    const struggling = this.db.query<any>(
      `SELECT * FROM platform_subscriptions WHERE status = 'PAST_DUE' LIMIT 20`
    );

    return {
      expiredTrials: createMetricComparison(0, 0),
      upcomingRenewals: createMetricComparison(toNumber(upcomingRenewals.length, 0), 0),
      strugglingSubscriptions: createMetricComparison(toNumber(struggling.length, 0), 0),
      trialConversionRate: createMetricComparison(0, 0),
      averageSubscriptionValue: createMetricComparison(Math.round(toNumber(mrr, 0) * 100) / 100, 0),
      renewalRate: createMetricComparison(0, 0),
      timeSeries: {
        newSubscriptions: [],
        renewedSubscriptions: [],
        cancelledSubscriptions: [],
        expiredTrials: [],
      },
      upcomingRenewalsList: upcomingRenewals.map((r: any) => ({
        id: String(r.id),
        tenantId: String(r.tenant_id),
        tenantName: String(r.name),
        tenantCode: String(r.code),
        planName: String(r.planName),
        endDate: String(r.end_date),
        price: toNumber(r.price, 0),
        billingCycle: r.billing_cycle as PlatformBillingCycle,
        autoRenew: Boolean(r.auto_renew),
        status: r.status as PlatformSubscriptionStatus,
      })),
      strugglingList: struggling.map((s: any) => ({
        id: String(s.id),
        tenantId: String(s.tenant_id),
        planId: String(s.plan_id),
        status: s.status as PlatformSubscriptionStatus,
        startDate: String(s.start_date),
        endDate: s.end_date ?? null,
        seats: toNumber(s.seats, 1),
        price: toNumber(s.price, 0),
        billingCycle: s.billing_cycle as PlatformBillingCycle,
        autoRenew: Boolean(s.auto_renew),
        branchesLimit: toNumber(s.branches_limit, 1),
        createdAt: String(s.created_at),
        updatedAt: String(s.updated_at),
      })),
    };
  }

  // ─── License Metrics ──────────────────────────────────────────────────────────

  public getLicenseMetrics(): PlatformLicenseMetrics {
    PlatformAnalyticsService.requirePlatformAccess('analytics', 'platform.analytics.licenses');

    // Total licenses
    const total = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_licenses')[0]?.c ?? 0;

    // By status
    const byStatus = this.db.query<any>('SELECT status, COUNT(*) AS c FROM platform_licenses GROUP BY status');
    const statusCounts: Record<string, number> = {};
    for (const row of byStatus) {
      statusCounts[row.status] = toNumber(row.c, 0);
    }

    // Devices
    const devices = this.db.query<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended,
         SUM(CASE WHEN clone_suspected = 1 THEN 1 ELSE 0 END) AS cloneSuspected
       FROM platform_devices`
    )[0] ?? {};

    // Pending licenses (ISSUED but not ACTIVE)
    const pendingLicenses = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_licenses WHERE status = \'ISSUED\'')[0]?.c ?? 0;

    // Failed activations
    const failedActivations = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_license_activations WHERE is_online = 0 AND created_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;

    // Expiring soon
    const expiringSoon = this.db.query<any>(
      `SELECT COUNT(*) AS c FROM platform_licenses
       WHERE status IN ('ACTIVE','ISSUED') AND expires_at IS NOT NULL
         AND date(expires_at) BETWEEN date('now') AND date('now', '+30 day')`
    )[0]?.c ?? 0;

    // Activations in period
    const activations = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_license_activations WHERE activated_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;

    // Deactivations in period
    const deactivations = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_devices WHERE status IN (\'SUSPENDED\',\'RELEASED\',\'REVOKED\') AND updated_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;

    // Activation success rate
    const totalActivations = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_license_activations WHERE activated_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;
    const successRate = totalActivations > 0 ? ((totalActivations - failedActivations) / totalActivations) * 100 : 100;

    // Pending licenses list
    const pendingLicensesList = this.db.query<any>('SELECT * FROM platform_licenses WHERE status = \'ISSUED\' LIMIT 20');

    // Failed activations list
    const failedActivationsList = this.db.query<any>('SELECT * FROM platform_license_activations WHERE is_online = 0 AND created_at > date(\'now\', \'-30 days\') LIMIT 20');

    return {
      activatedDevices: createMetricComparison(toNumber(devices.active, 0), 0),
      utilizationRate: createMetricComparison(
        toNumber(devices.total, 0) > 0 ? (toNumber(devices.active, 0) / toNumber(devices.total, 0)) * 100 : 0,
        0
      ),
      pendingLicenses: createMetricComparison(toNumber(pendingLicenses, 0), 0),
      failedActivations: createMetricComparison(toNumber(failedActivations, 0), 0),
      activationSuccessRate: createMetricComparison(Math.round(successRate * 100) / 100, 0),
      expiringSoon: createMetricComparison(toNumber(expiringSoon, 0), 0),
      timeSeries: {
        activations: [],
        deactivations: [],
        failedActivations: [],
        utilization: [],
      },
      failedActivationsList: failedActivationsList.map((a: any) => ({
        id: String(a.id),
        licenseId: String(a.license_id),
        tenantId: String(a.tenant_id ?? ''),
        tenantName: a.tenantName ?? '',
        licenseKey: a.license_key ?? '',
        deviceId: a.device_id ?? null,
        activationCode: a.activation_code ?? null,
        mode: a.is_online ? 'ONLINE' : 'OFFLINE',
        action: 'ACTIVATE',
        status: a.is_online ? 'SUCCESS' : 'FAILED',
        ipAddress: a.ip_address ?? null,
        notes: a.error_detail ?? null,
        createdAt: String(a.created_at),
      })),
      pendingLicensesList: pendingLicensesList.map((l: any) => ({
        id: String(l.id),
        tenantId: String(l.tenant_id),
        subscriptionId: String(l.subscription_id),
        planId: String(l.plan_id),
        licenseKey: String(l.license_key),
        status: l.status as any,
        issuedAt: String(l.issued_at),
        startsAt: String(l.starts_at),
        expiresAt: l.expires_at ?? null,
        seats: toNumber(l.seats, 1),
        deviceLimit: toNumber(l.device_limit, 1),
        branchesLimit: toNumber(l.branches_limit, 1),
        modules: JSON.parse(l.modules || '[]'),
        features: JSON.parse(l.features || '[]'),
        activationCode: l.activation_code ?? null,
        certificate: l.certificate ?? null,
        offlineGracePeriodDays: toNumber(l.offline_grace_period_days, 14),
        couplingMode: l.coupling_mode,
        hardwareId: l.hardware_id ?? null,
        notes: l.notes ?? null,
        createdAt: String(l.created_at),
        updatedAt: String(l.updated_at),
      })),
    };
  }

  // ─── Operations Metrics ───────────────────────────────────────────────────────

  public getOperationsMetrics(): PlatformOperationsMetrics {
    PlatformAnalyticsService.requirePlatformAccess('analytics', 'platform.analytics.operations');

    // Connected/disconnected devices
    const devices = this.db.query<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended
       FROM platform_devices`
    )[0] ?? {};

    // Sync errors
    const sync = this.db.query<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success,
         SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed
       FROM platform_sync_log
       WHERE created_at > date('now', '-30 days')`
    )[0] ?? {};

    // API health (simplified)
    const apiSuccessRate = toNumber(sync.total, 0) > 0 ? (toNumber(sync.success, 0) / toNumber(sync.total, 0)) * 100 : 100;

    // Recent sync errors
    const recentSyncErrors = this.db.query<any>(
      `SELECT sl.*, d.hardware_id, t.name AS tenantName
       FROM platform_sync_log sl
       JOIN platform_devices d ON d.id = sl.device_id
       JOIN platform_tenants t ON t.id = d.license_id
       WHERE sl.status = 'FAILED' AND sl.created_at > date('now', '-30 days')
       ORDER BY sl.created_at DESC
       LIMIT 20`
    );

    return {
      connectedDevices: createMetricComparison(toNumber(devices.active, 0), 0),
      disconnectedDevices: createMetricComparison(toNumber(devices.suspended, 0), 0),
      syncErrors: createMetricComparison(toNumber(sync.failed, 0), 0),
      apiHealth: createMetricComparison(Math.round(apiSuccessRate * 100) / 100, 0),
      averageResponseTime: createMetricComparison(0, 0),
      timeSeries: {
        onlineDevices: [],
        offlineDevices: [],
        syncErrors: [],
        apiSuccessRate: [],
      },
      recentSyncErrors: recentSyncErrors.map((e: any) => ({
        id: String(e.id),
        deviceId: String(e.device_id),
        deviceName: e.hardware_id,
        tenantId: String(e.tenant_id),
        tenantName: String(e.tenantName),
        error: String(e.error_detail ?? 'Unknown error'),
        occurredAt: String(e.created_at),
        resolved: false,
      })),
      apiEndpointsHealth: [],
    };
  }

  // ─── Overview ─────────────────────────────────────────────────────────────────

  public getOverviewWithPeriod(period: PlatformPeriod = '30d', planId?: string): PlatformOverview {
    PlatformAnalyticsService.requirePlatformAccess('analytics', 'platform.analytics.overview');

    const business = this.getBusinessPerformance(period, planId);
    const customers = this.getCustomerMetrics(planId);
    const subscriptions = this.getSubscriptionMetrics();
    const licenses = this.getLicenseMetrics();
    const operations = this.getOperationsMetrics();

    // Get overview data
    const tenantStats = this.db.query<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'TRIAL' THEN 1 ELSE 0 END) AS trial,
         SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended,
         SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
         SUM(CASE WHEN status IN ('ACTIVE','TRIAL') AND subscription_expires_at IS NOT NULL AND date(subscription_expires_at) <= date('now', '+30 day') THEN 1 ELSE 0 END) AS expiringSoon
       FROM platform_tenants`
    )[0] ?? {};

    const licenseStats = this.db.query<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status IN ('ACTIVE','ISSUED') THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended,
         SUM(CASE WHEN status = 'REVOKED' THEN 1 ELSE 0 END) AS revoked,
         SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN status IN ('ACTIVE','ISSUED') AND expires_at IS NOT NULL AND date(expires_at) <= date('now', '+30 day') THEN 1 ELSE 0 END) AS expiringSoon
       FROM platform_licenses`
    )[0] ?? {};

    const subscriptionStats = this.db.query<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'TRIAL' THEN 1 ELSE 0 END) AS trial,
         SUM(CASE WHEN status = 'PAST_DUE' THEN 1 ELSE 0 END) AS pastDue,
         SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended,
         SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
         SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN status IN ('ACTIVE','TRIAL') AND end_date IS NOT NULL AND date(end_date) <= date('now', '+30 day') THEN 1 ELSE 0 END) AS expiringSoon
       FROM platform_subscriptions`
    )[0] ?? {};

    const invoiceStats = this.db.query<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid,
         SUM(CASE WHEN status IN ('SENT','PARTIAL','OVERDUE') THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'VOID' THEN 1 ELSE 0 END) AS voided,
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN total ELSE 0 END), 0) AS revenue
       FROM platform_invoices`
    )[0] ?? {};

    const moduleUsage = this.db.query<any>(
      `SELECT json_each.value AS module, COUNT(DISTINCT l.tenant_id) AS tenantCount, COUNT(*) AS licenseCount
       FROM platform_licenses l, json_each(l.modules)
       WHERE l.status IN ('ACTIVE','ISSUED')
       GROUP BY json_each.value`
    );

    const releases = this.db.query<any>(
      `SELECT * FROM platform_releases WHERE is_active = 1 ORDER BY release_date DESC LIMIT 5`
    );

    const deviceStats = this.db.query<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN hardware_id IS NOT NULL AND hardware_id <> '' THEN 1 ELSE 0 END) AS boundLicenses,
         SUM(CASE WHEN (hardware_id IS NULL OR hardware_id = '') THEN 1 ELSE 0 END) AS unboundLicenses,
         COALESCE(SUM(device_limit), 0) AS devicesLimit
       FROM platform_licenses`
    )[0] ?? {};

    const branchStats = this.db.query<any>(
      `SELECT COALESCE(SUM(branches_limit), 0) AS totalLimit, COUNT(*) AS installationBranches FROM platform_branches`
    )[0] ?? {};

    const recentTenants = this.db.query<any>(
      `SELECT * FROM platform_tenants ORDER BY created_at DESC LIMIT 5`
    );

    const expiringLicenses = this.db.query<any>(
      `SELECT * FROM platform_licenses WHERE status IN ('ACTIVE','ISSUED') AND expires_at IS NOT NULL AND date(expires_at) <= date('now', '+30 day') ORDER BY expires_at LIMIT 10`
    );

    const expiringSubscriptions = this.db.query<any>(
      `SELECT * FROM platform_subscriptions WHERE status IN ('ACTIVE','TRIAL') AND end_date IS NOT NULL AND date(end_date) <= date('now', '+30 day') ORDER BY end_date LIMIT 10`
    );

    const recentPayments = this.db.query<any>(
      `SELECT * FROM platform_payments ORDER BY paid_at DESC LIMIT 5`
    );

    const recentAudit = this.db.query<any>(
      `SELECT * FROM platform_audit ORDER BY created_at DESC LIMIT 5`
    );

    const alerts = this.getAlertDetails();

    return {
      tenants: {
        total: toNumber(tenantStats.total, 0),
        active: toNumber(tenantStats.active, 0),
        trial: toNumber(tenantStats.trial, 0),
        suspended: toNumber(tenantStats.suspended, 0),
        expired: toNumber(tenantStats.expired, 0),
        cancelled: toNumber(tenantStats.cancelled, 0),
        expiringSoon: toNumber(tenantStats.expiringSoon, 0),
      },
      licenses: {
        total: toNumber(licenseStats.total, 0),
        active: toNumber(licenseStats.active, 0),
        expiringSoon: toNumber(licenseStats.expiringSoon, 0),
        revoked: toNumber(licenseStats.revoked, 0),
        expired: toNumber(licenseStats.expired, 0),
        suspended: toNumber(licenseStats.suspended, 0),
      },
      subscriptions: {
        total: toNumber(subscriptionStats.total, 0),
        active: toNumber(subscriptionStats.active, 0),
        trial: toNumber(subscriptionStats.trial, 0),
        expired: toNumber(subscriptionStats.expired, 0),
        cancelled: toNumber(subscriptionStats.cancelled, 0),
        expiringSoon: toNumber(subscriptionStats.expiringSoon, 0),
      },
      billing: {
        revenueTotal: toNumber(invoiceStats.revenue, 0),
        revenueThisMonth: 0,
        invoicedTotal: toNumber(invoiceStats.total, 0),
        outstanding: 0,
        overdueInvoices: 0,
        mrr: 0,
        invoicesTotal: toNumber(invoiceStats.total, 0),
        paidInvoices: toNumber(invoiceStats.paid, 0),
        draftInvoices: toNumber(invoiceStats.voided, 0),
      },
      devices: {
        boundLicenses: toNumber(deviceStats.boundLicenses, 0),
        unboundLicenses: toNumber(deviceStats.unboundLicenses, 0),
        devicesLimit: toNumber(deviceStats.devicesLimit, 0),
      },
      branches: {
        totalLimit: toNumber(branchStats.totalLimit, 0),
        installationBranches: toNumber(branchStats.installationBranches, 0),
      },
      releases: releases.map((r: any) => ({
        id: String(r.id),
        version: String(r.version),
        name: r.name ?? null,
        description: r.description ?? null,
        channel: r.channel ?? 'stable',
        releaseDate: r.release_date ?? null,
        isActive: Boolean(r.is_active),
        minClientVersion: r.min_client_version ?? null,
        maxClientVersion: r.max_client_version ?? null,
        artifactUrl: r.artifact_url ?? null,
        artifactHash: r.artifact_hash ?? null,
        changelog: r.changelog ?? null,
        rolledBackTo: r.rolled_back_to ?? null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      })),
      moduleUsage: moduleUsage.map((m: any) => ({
        code: String(m.module),
        name: String(m.module),
        category: null,
        enabled: true,
        licenseCount: toNumber(m.licenseCount, 0),
        tenantCount: toNumber(m.tenantCount, 0),
      })),
      revenueByPlan: [],
      alerts: alerts,
      recentTenants: recentTenants.map((t: any) => ({
        id: String(t.id),
        code: String(t.code),
        name: String(t.name),
        contactName: t.contact_name ?? null,
        email: t.email ?? null,
        phone: t.phone ?? null,
        country: t.country ?? null,
        city: t.city ?? null,
        address: t.address ?? null,
        businessType: t.business_type ?? null,
        status: t.status as any,
        planId: t.plan_id ?? null,
        planName: null,
        planPrice: null,
        subscriptionStartedAt: t.subscription_started_at ?? null,
        subscriptionExpiresAt: t.subscription_expires_at ?? null,
        seatsLimit: toNumber(t.seats_limit, 1),
        branchesLimit: toNumber(t.branches_limit, 1),
        devicesLimit: toNumber(t.devices_limit, 1),
        notes: t.notes ?? null,
        activeLicenses: 0,
        licensesTotal: 0,
        devicesUsed: 0,
        outstanding: 0,
        subscriptionId: t.subscription_id ?? null,
        price: t.price ?? null,
        createdAt: String(t.created_at),
        updatedAt: String(t.updated_at),
      })),
      expiringLicenses: expiringLicenses.map((l: any) => ({
        id: String(l.id),
        tenantId: String(l.tenant_id),
        subscriptionId: String(l.subscription_id),
        planId: String(l.plan_id),
        licenseKey: String(l.license_key),
        status: l.status,
        issuedAt: String(l.issued_at),
        startsAt: String(l.starts_at),
        expiresAt: l.expires_at ?? null,
        seats: toNumber(l.seats, 1),
        deviceLimit: toNumber(l.device_limit, 1),
        branchesLimit: toNumber(l.branches_limit, 1),
        modules: JSON.parse(l.modules || '[]'),
        features: JSON.parse(l.features || '[]'),
        activationCode: l.activation_code ?? null,
        certificate: l.certificate ?? null,
        offlineGracePeriodDays: toNumber(l.offline_grace_period_days, 14),
        couplingMode: l.coupling_mode,
        hardwareId: l.hardware_id ?? null,
        notes: l.notes ?? null,
        createdAt: String(l.created_at),
        updatedAt: String(l.updated_at),
      })),
      expiringSubscriptions: expiringSubscriptions.map((s: any) => ({
        id: String(s.id),
        tenantId: String(s.tenant_id),
        planId: String(s.plan_id),
        status: s.status,
        startDate: String(s.start_date),
        endDate: s.end_date ?? null,
        seats: toNumber(s.seats, 1),
        price: toNumber(s.price, 0),
        billingCycle: s.billing_cycle,
        autoRenew: Boolean(s.auto_renew),
        branchesLimit: toNumber(s.branches_limit, 1),
        createdAt: String(s.created_at),
        updatedAt: String(s.updated_at),
      })),
      recentPayments: recentPayments.map((p: any) => ({
        id: String(p.id),
        tenantId: String(p.tenant_id),
        invoiceId: p.invoice_id ?? null,
        amount: toNumber(p.amount, 0),
        method: p.method,
        reference: p.reference ?? null,
        paidAt: String(p.paid_at),
        notes: p.notes ?? null,
        createdAt: String(p.created_at),
      })),
      recentAudit: recentAudit.map((a: any) => ({
        id: String(a.id),
        actorId: String(a.actor_id),
        actorType: a.actor_type,
        action: String(a.action),
        entityType: a.entity_type,
        entityId: a.entity_id ?? null,
        details: a.details ? JSON.parse(a.details) : null,
        severity: a.severity,
        status: a.status,
        tenantId: a.tenant_id ?? null,
        deviceId: a.device_id ?? null,
        deviceName: a.device_name ?? null,
        ipAddress: a.ip_address ?? null,
        oldValues: a.old_values ? JSON.parse(a.old_values) : null,
        newValues: a.new_values ? JSON.parse(a.new_values) : null,
        errorMessage: a.error_message ?? null,
        createdAt: String(a.created_at),
        hash: a.hash,
        prevHash: a.prev_hash,
      })),
      currentInstallation: {
        companyName: 'Ceramisys',
        currency: 'EGP',
        users: 0,
        products: 0,
        invoices: 0,
        customers: 0,
      },
    };
  }

  // ─── Alerts ───────────────────────────────────────────────────────────────────

  public getAlertDetails(): PlatformAlertDetail[] {
    PlatformAnalyticsService.requirePlatformAccess('analytics', 'platform.analytics.alerts');

    const alerts: PlatformAlertDetail[] = [];

    // Expiring licenses
    const expiringLicenses = this.db.query<any>(`
      SELECT l.*, t.name AS tenantName
      FROM platform_licenses l
      JOIN platform_tenants t ON t.id = l.tenant_id
      WHERE l.status IN ('ACTIVE','ISSUED')
        AND l.expires_at IS NOT NULL
        AND date(l.expires_at) BETWEEN date('now') AND date('now', '+7 day')
      ORDER BY l.expires_at
    `);

    for (const lic of expiringLicenses) {
      alerts.push({
        id: `alert-license-${lic.id}`,
        severity: 'warning',
        title: `ترخيص ينتهي قريباً: ${lic.tenantName}`,
        description: `ترخيص "${lic.license_key}" للعميل ${lic.tenantName} ينتهي في ${formatDate(lic.expires_at)}`,
        link: `/platform/licenses/${lic.id}`,
        entityType: 'LICENSE',
        entityId: lic.id,
        entityName: lic.license_key,
        actionRequired: true,
        suggestedActions: ['تجديد الترخيص', 'مراسلة العميل'],
        metadata: { daysLeft: Math.ceil((new Date(lic.expires_at).getTime() - Date.now()) / 86400000) },
      });
    }

    // Expiring subscriptions
    const expiringSubs = this.db.query<any>(`
      SELECT s.*, t.name AS tenantName
      FROM platform_subscriptions s
      JOIN platform_tenants t ON t.id = s.tenant_id
      WHERE s.status IN ('ACTIVE','TRIAL')
        AND s.end_date IS NOT NULL
        AND date(s.end_date) BETWEEN date('now') AND date('now', '+7 day')
      ORDER BY s.end_date
    `);

    for (const sub of expiringSubs) {
      alerts.push({
        id: `alert-sub-${sub.id}`,
        severity: 'warning',
        title: `اشتراك ينتهي قريباً: ${sub.tenantName}`,
        description: `اشتراك العميل ${sub.tenantName} ينتهي في ${formatDate(sub.end_date)}`,
        link: `/platform/tenants/${sub.tenant_id}`,
        entityType: 'SUBSCRIPTION',
        entityId: sub.id,
        entityName: sub.plan_id,
        actionRequired: true,
        suggestedActions: ['تجديد الاشتراك', 'مراسلة العميل'],
        metadata: { daysLeft: Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000) },
      });
    }

    // Overdue invoices
    const overdueInvoices = this.db.query<any>(`
      SELECT i.*, t.name AS tenantName
      FROM platform_invoices i
      JOIN platform_tenants t ON t.id = i.tenant_id
      WHERE i.status IN ('SENT','PARTIAL','OVERDUE')
        AND i.due_date IS NOT NULL
        AND date(i.due_date) < date('now')
      ORDER BY i.due_date
      LIMIT 20
    `);

    for (const inv of overdueInvoices) {
      alerts.push({
        id: `alert-invoice-${inv.id}`,
        severity: 'danger',
        title: `فاتورة متأخرة: ${inv.tenantName}`,
        description: `فاتورة ${inv.id} للعميل ${inv.tenantName} مستحقة منذ ${formatDate(inv.due_date)}`,
        link: `/platform/invoices/${inv.id}`,
        entityType: 'INVOICE',
        entityId: inv.id,
        entityName: inv.id,
        actionRequired: true,
        suggestedActions: ['متابعة الدفع', 'إرسال تذكير'],
        metadata: { amount: toNumber(inv.total, 0) - toNumber(inv.paid, 0), daysOverdue: Math.ceil((Date.now() - new Date(inv.due_date).getTime()) / 86400000) },
      });
    }

    // Suspended tenants
    const suspendedTenants = this.db.query<any>('SELECT * FROM platform_tenants WHERE status = \'SUSPENDED\'');
    for (const tenant of suspendedTenants) {
      alerts.push({
        id: `alert-tenant-${tenant.id}`,
        severity: 'warning',
        title: `عميل موقوف: ${tenant.name}`,
        description: `العميل ${tenant.name} (${tenant.code}) في حالة موقوف`,
        link: `/platform/tenants/${tenant.id}`,
        entityType: 'TENANT',
        entityId: tenant.id,
        entityName: tenant.name,
        actionRequired: true,
        suggestedActions: ['مراجعة حالة العميل', 'التواصل مع العميل'],
        metadata: {},
      });
    }

    // Clone suspected devices
    const cloneDevices = this.db.query<any>(`
      SELECT d.*, l.license_key, t.name AS tenantName
      FROM platform_devices d
      JOIN platform_licenses l ON l.id = d.license_id
      JOIN platform_tenants t ON t.id = l.tenant_id
      WHERE d.clone_suspected = 1 AND d.status = 'ACTIVE'
    `);

    for (const dev of cloneDevices) {
      alerts.push({
        id: `alert-device-${dev.id}`,
        severity: 'danger',
        title: `جهاز مشبوه: ${dev.tenantName}`,
        description: `جهاز ${dev.hardware_id} للعميل ${dev.tenantName} مشتبه به كاستنساخ`,
        link: `/platform/devices/${dev.id}`,
        entityType: 'DEVICE',
        entityId: dev.id,
        entityName: dev.hardware_id,
        actionRequired: true,
        suggestedActions: ['التحقق من الجهاز', 'إيقاف الجهاز'],
        metadata: { hardwareId: dev.hardware_id },
      });
    }

    return alerts;
  }
}

export const platformAnalyticsService = new PlatformAnalyticsService();