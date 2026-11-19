import type { PlatformSubscriptionMetrics, PlatformBillingCycle, PlatformSubscriptionStatus } from '../platformTypes';
import { toNumber } from '../platformUtils';
import type { AnalyticsServiceContext } from './context';
import { createMetricComparison } from './periods';

export function getSubscriptionMetrics(ctx: AnalyticsServiceContext): PlatformSubscriptionMetrics {
  ctx.requirePlatformAccess('analytics', 'platform.analytics.subscriptions');

  // Total subscriptions
  const total = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_subscriptions')[0]?.c ?? 0;

  // By status
  const byStatus = ctx.db.query<any>('SELECT status, COUNT(*) AS c FROM platform_subscriptions GROUP BY status');
  const statusCounts: Record<string, number> = {};
  for (const row of byStatus) {
    statusCounts[row.status] = toNumber(row.c, 0);
  }

  // MRR
  const mrr = ctx.db.query<any>('SELECT COALESCE(SUM(price) / 100.0, 0) AS total FROM platform_subscriptions WHERE status = \'ACTIVE\'')[0]?.total ?? 0;

  // New subscriptions (last 30 days)
  const newInPeriod = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_subscriptions WHERE created_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;

  // Previous period
  const prevNewInPeriod = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_subscriptions WHERE created_at BETWEEN date(\'now\', \'-60 days\') AND date(\'now\', \'-30 days\')')[0]?.c ?? 0;

  // Cancelled subscriptions
  const cancelledInPeriod = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_subscriptions WHERE status = \'CANCELLED\' AND updated_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;

  // Previous period cancelled
  const prevCancelledInPeriod = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_subscriptions WHERE status = \'CANCELLED\' AND updated_at BETWEEN date(\'now\', \'-60 days\') AND date(\'now\', \'-30 days\')')[0]?.c ?? 0;

  // Upgrades/Downgrades
  const changes = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_audit WHERE action = \'PLAN_CHANGE\' AND created_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;

  // Upcoming renewals
  const upcomingRenewals = ctx.db.query<any>(
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
  const struggling = ctx.db.query<any>(
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
      price: toNumber(r.price, 0) / 100,
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
      price: toNumber(s.price, 0) / 100,
      billingCycle: s.billing_cycle as PlatformBillingCycle,
      autoRenew: Boolean(s.auto_renew),
      branchesLimit: toNumber(s.branches_limit, 1),
      createdAt: String(s.created_at),
      updatedAt: String(s.updated_at),
    })),
  };
}
