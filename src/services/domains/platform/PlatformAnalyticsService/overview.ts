import type { PlatformPeriod, PlatformOverview } from '../platformTypes';
import { toNumber } from '../platformUtils';
import type { AnalyticsServiceContext } from './context';

export function getOverviewWithPeriod(ctx: AnalyticsServiceContext, period: PlatformPeriod = '30d', planId?: string): PlatformOverview {
  ctx.requirePlatformAccess('analytics', 'platform.analytics.overview');

  const business = ctx.getBusinessPerformance(period, planId);
  const customers = ctx.getCustomerMetrics(planId);
  const subscriptions = ctx.getSubscriptionMetrics();
  const licenses = ctx.getLicenseMetrics();
  const operations = ctx.getOperationsMetrics();

  // Get overview data
  const tenantStats = ctx.db.query<any>(
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

  const licenseStats = ctx.db.query<any>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status IN ('ACTIVE','ISSUED') THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended,
       SUM(CASE WHEN status = 'REVOKED' THEN 1 ELSE 0 END) AS revoked,
       SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired,
       SUM(CASE WHEN status IN ('ACTIVE','ISSUED') AND expires_at IS NOT NULL AND date(expires_at) <= date('now', '+30 day') THEN 1 ELSE 0 END) AS expiringSoon
     FROM platform_licenses`
  )[0] ?? {};

  const subscriptionStats = ctx.db.query<any>(
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

  const invoiceStats = ctx.db.query<any>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid,
       SUM(CASE WHEN status IN ('SENT','PARTIAL','OVERDUE') THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status = 'DRAFT' THEN 1 ELSE 0 END) AS draft,
       SUM(CASE WHEN status = 'VOID' THEN 1 ELSE 0 END) AS voided,
       COALESCE(SUM(CASE WHEN status = 'PAID' THEN total ELSE 0 END) / 100.0, 0) AS revenue,
       COALESCE(SUM(CASE WHEN status <> 'VOID' THEN total ELSE 0 END) / 100.0, 0) AS invoicedTotal,
       COALESCE(SUM(CASE WHEN status IN ('SENT','PARTIAL','OVERDUE') THEN total - paid_amount ELSE 0 END) / 100.0, 0) AS outstanding,
       SUM(CASE WHEN status IN ('SENT','PARTIAL','OVERDUE') AND due_date IS NOT NULL AND date(due_date) < date('now') THEN 1 ELSE 0 END) AS overdue
     FROM platform_invoices`
  )[0] ?? {};

  const revenueThisMonth = ctx.db.query<any>(
    `SELECT COALESCE(SUM(amount) / 100.0, 0) AS total
     FROM platform_payments
     WHERE paid_at >= strftime('%Y-%m-01', 'now')`
  )[0]?.total ?? 0;

  const mrr = ctx.db.query<any>(
    `SELECT COALESCE(SUM(CASE s.billing_cycle
       WHEN 'MONTHLY' THEN s.price
       WHEN 'QUARTERLY' THEN s.price / 3.0
       WHEN 'YEARLY' THEN s.price / 12.0
       ELSE 0 END) / 100.0, 0) AS total
     FROM platform_subscriptions s
     WHERE s.status = 'ACTIVE'`
  )[0]?.total ?? 0;

  const revenueByPlan = ctx.db.query<any>(
    `SELECT p.name AS planName,
            COALESCE(SUM(s.price) / 100.0, 0) AS revenue,
            COUNT(*) AS tenants
     FROM platform_subscriptions s
     LEFT JOIN platform_plans p ON p.id = s.plan_id
     WHERE s.status = 'ACTIVE'
     GROUP BY p.name
     ORDER BY revenue DESC`
  );

  const moduleUsage = ctx.db.query<any>(
    `SELECT json_each.value AS module, COUNT(DISTINCT l.tenant_id) AS tenantCount, COUNT(*) AS licenseCount
     FROM platform_licenses l, json_each(l.modules)
     WHERE l.status IN ('ACTIVE','ISSUED')
     GROUP BY json_each.value`
  );

  const releases = ctx.db.query<any>(
    `SELECT * FROM platform_releases WHERE is_active = 1 ORDER BY release_date DESC LIMIT 5`
  );

  const deviceStats = ctx.db.query<any>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN hardware_id IS NOT NULL AND hardware_id <> '' THEN 1 ELSE 0 END) AS boundLicenses,
       SUM(CASE WHEN (hardware_id IS NULL OR hardware_id = '') THEN 1 ELSE 0 END) AS unboundLicenses,
       COALESCE(SUM(device_limit), 0) AS devicesLimit
     FROM platform_licenses`
  )[0] ?? {};

  const branchStats = ctx.db.query<any>(
    `SELECT
       (SELECT COALESCE(SUM(branches_limit), 0) FROM platform_tenants) AS totalLimit,
       (SELECT COUNT(*) FROM platform_branches) AS installationBranches`
  )[0] ?? {};

  const recentTenants = ctx.db.query<any>(
    `SELECT * FROM platform_tenants ORDER BY created_at DESC LIMIT 5`
  );

  const expiringLicenses = ctx.db.query<any>(
    `SELECT * FROM platform_licenses WHERE status IN ('ACTIVE','ISSUED') AND expires_at IS NOT NULL AND date(expires_at) <= date('now', '+30 day') ORDER BY expires_at LIMIT 10`
  );

  const expiringSubscriptions = ctx.db.query<any>(
    `SELECT * FROM platform_subscriptions WHERE status IN ('ACTIVE','TRIAL') AND end_date IS NOT NULL AND date(end_date) <= date('now', '+30 day') ORDER BY end_date LIMIT 10`
  );

  const recentPayments = ctx.db.query<any>(
    `SELECT * FROM platform_payments ORDER BY paid_at DESC LIMIT 5`
  );

  const recentAudit = ctx.db.query<any>(
    `SELECT * FROM platform_audit ORDER BY created_at DESC LIMIT 5`
  );

  const alerts = ctx.getAlertDetails();

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
      revenueThisMonth: toNumber(revenueThisMonth, 0),
      invoicedTotal: toNumber(invoiceStats.invoicedTotal, 0),
      outstanding: toNumber(invoiceStats.outstanding, 0),
      overdueInvoices: toNumber(invoiceStats.overdue, 0),
      mrr: toNumber(mrr, 0),
      invoicesTotal: toNumber(invoiceStats.total, 0),
      paidInvoices: toNumber(invoiceStats.paid, 0),
      draftInvoices: toNumber(invoiceStats.draft, 0),
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
    revenueByPlan: revenueByPlan.map((r: any) => ({
      planName: String(r.planName ?? '—'),
      revenue: toNumber(r.revenue, 0),
      tenants: toNumber(r.tenants, 0),
    })),
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
      price: t.price != null ? Number(t.price) / 100 : null,
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
      price: toNumber(s.price, 0) / 100,
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
      amount: toNumber(p.amount, 0) / 100,
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

    // ─── Extended analytics sections consumed by the super-admin dashboard ────
    businessPerformance: business,
    customerMetrics: customers,
    subscriptionMetrics: subscriptions,
    licenseMetrics: licenses,
    operationsMetrics: operations,
    alertDetails: alerts,
    reportFilters: { period, planId },
  };
}
