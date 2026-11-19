import type { PlatformCustomerMetrics, PlatformTenantStatus } from '../platformTypes';
import { toNumber } from '../platformUtils';
import type { AnalyticsServiceContext } from './context';
import { createMetricComparison, createTimeSeriesPoint } from './periods';

export function getCustomerMetrics(ctx: AnalyticsServiceContext, planId?: string): PlatformCustomerMetrics {
  ctx.requirePlatformAccess('analytics', 'platform.analytics.customers');

  const planFilter = planId ? 'AND p.id = ?' : '';
  const planParams = planId ? [planId] : [];

  // By status
  const byStatus = ctx.db.query<any>(
    `SELECT status, COUNT(*) AS c FROM platform_tenants t LEFT JOIN platform_plans p ON p.id = t.plan_id WHERE 1=1 ${planFilter} GROUP BY status`,
    [...planParams]
  );

  const active = byStatus.find((r: any) => r.status === 'ACTIVE')?.c ?? 0;
  const trial = byStatus.find((r: any) => r.status === 'TRIAL')?.c ?? 0;

  // New customers (last 30 days)
  const newCustomers = ctx.db.query<any>(
    `SELECT COUNT(*) AS c FROM platform_tenants t LEFT JOIN platform_plans p ON p.id = t.plan_id WHERE t.created_at > date('now', '-30 days') ${planFilter}`,
    [...planParams]
  )[0]?.c ?? 0;

  // Previous period new customers
  const prevNewCustomers = ctx.db.query<any>(
    `SELECT COUNT(*) AS c FROM platform_tenants t LEFT JOIN platform_plans p ON p.id = t.plan_id WHERE t.created_at BETWEEN date('now', '-60 days') AND date('now', '-30 days') ${planFilter}`,
    [...planParams]
  )[0]?.c ?? 0;

  // Cancelled customers (last 30 days)
  const cancelledInPeriod = ctx.db.query<any>(
    `SELECT COUNT(*) AS c FROM platform_tenants t LEFT JOIN platform_plans p ON p.id = t.plan_id WHERE t.status = 'CANCELLED' AND t.updated_at > date('now', '-30 days') ${planFilter}`,
    [...planParams]
  )[0]?.c ?? 0;

  // Previous period cancelled
  const prevCancelledInPeriod = ctx.db.query<any>(
    `SELECT COUNT(*) AS c FROM platform_tenants t LEFT JOIN platform_plans p ON p.id = t.plan_id WHERE t.status = 'CANCELLED' AND t.updated_at BETWEEN date('now', '-60 days') AND date('now', '-30 days') ${planFilter}`,
    [...planParams]
  )[0]?.c ?? 0;

  // Trial to paid conversion (simplified)
  const trialConversions = ctx.db.query<any>(
    `SELECT COUNT(*) AS c FROM platform_subscriptions s LEFT JOIN platform_plans p ON p.id = s.plan_id WHERE s.status = 'ACTIVE' AND s.created_at > date('now', '-30 days') ${planFilter}`,
    [...planParams]
  )[0]?.c ?? 0;

  const prevTrialConversions = ctx.db.query<any>(
    `SELECT COUNT(*) AS c FROM platform_subscriptions s LEFT JOIN platform_plans p ON p.id = s.plan_id WHERE s.status = 'ACTIVE' AND s.created_at BETWEEN date('now', '-60 days') AND date('now', '-30 days') ${planFilter}`,
    [...planParams]
  )[0]?.c ?? 0;

  // Average revenue per customer
  const avgRevenue = ctx.db.query<any>(
    `SELECT COALESCE(AVG(tenant_revenue), 0) AS avg FROM (
       SELECT t.id, COALESCE(SUM(i.total) / 100.0, 0) AS tenant_revenue
       FROM platform_tenants t
       LEFT JOIN platform_invoices i ON i.tenant_id = t.id AND i.status = 'PAID'
       LEFT JOIN platform_plans p ON p.id = t.plan_id
       WHERE 1=1 ${planFilter}
       GROUP BY t.id
     )`,
    [...planParams]
  )[0]?.avg ?? 0;

  const prevAvgRevenue = ctx.db.query<any>(
    `SELECT COALESCE(AVG(tenant_revenue), 0) AS avg FROM (
       SELECT t.id, COALESCE(SUM(i.total) / 100.0, 0) AS tenant_revenue
       FROM platform_tenants t
       LEFT JOIN platform_invoices i ON i.tenant_id = t.id AND i.status = 'PAID'
       LEFT JOIN platform_plans p ON p.id = t.plan_id
       WHERE 1=1 ${planFilter} AND t.created_at <= date('now', '-30 days')
       GROUP BY t.id
     )`,
    [...planParams]
  )[0]?.avg ?? 0;

  // Time series (simplified)
  const newCustomersSeries = ctx.db.query<any>(
    `SELECT date(created_at) AS period, COUNT(*) AS count
     FROM platform_tenants
     WHERE created_at > date('now', '-30 days')
     GROUP BY period
     ORDER BY period`
  ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

  const activeCustomersSeries = ctx.db.query<any>(
    `SELECT date(created_at) AS period, COUNT(*) AS count
     FROM platform_tenants
     WHERE status IN ('ACTIVE','TRIAL') AND created_at > date('now', '-30 days')
     GROUP BY period
     ORDER BY period`
  ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

  const churnedCustomersSeries = ctx.db.query<any>(
    `SELECT date(updated_at) AS period, COUNT(*) AS count
     FROM platform_tenants
     WHERE status = 'CANCELLED' AND updated_at > date('now', '-30 days')
     GROUP BY period
     ORDER BY period`
  ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

  const trialConversionsSeries = ctx.db.query<any>(
    `SELECT date(created_at) AS period, COUNT(*) AS count
     FROM platform_subscriptions
     WHERE status = 'ACTIVE' AND created_at > date('now', '-30 days')
     GROUP BY period
     ORDER BY period`
  ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

  // Top customers by revenue
  const topCustomers = ctx.db.query<any>(
    `SELECT t.id, t.code, t.name, COALESCE(SUM(i.total) / 100.0, 0) AS revenue, COUNT(i.id) AS invoicesCount, t.status
     FROM platform_tenants t
     LEFT JOIN platform_invoices i ON i.tenant_id = t.id AND i.status = 'PAID'
     LEFT JOIN platform_plans p ON p.id = t.plan_id
     WHERE 1=1 ${planFilter}
     GROUP BY t.id
     ORDER BY revenue DESC
     LIMIT 10`,
    [...planParams]
  );

  // Recently cancelled
  const recentlyCancelled = ctx.db.query<any>(
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
      price: t.price != null ? Number(t.price) / 100 : null,
      createdAt: String(t.created_at),
      updatedAt: String(t.updated_at),
    })),
  };
}
