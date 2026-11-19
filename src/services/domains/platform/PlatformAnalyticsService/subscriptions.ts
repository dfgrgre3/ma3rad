import type { PlatformSubscriptionMetrics, PlatformBillingCycle, PlatformSubscriptionStatus } from '../platformTypes';
import { toNumber } from '../platformUtils';
import type { AnalyticsServiceContext } from './context';
import { createMetricComparison, createTimeSeriesPoint } from './periods';

export function getSubscriptionMetrics(ctx: AnalyticsServiceContext): PlatformSubscriptionMetrics {
  ctx.requirePlatformAccess('analytics', 'platform.analytics.subscriptions');

  // MRR (normalized to a monthly amount per billing cycle)
  const mrr = ctx.db.query<any>(
    `SELECT COALESCE(SUM(CASE s.billing_cycle
       WHEN 'MONTHLY' THEN s.price
       WHEN 'QUARTERLY' THEN s.price / 3.0
       WHEN 'YEARLY' THEN s.price / 12.0
       ELSE 0 END) / 100.0, 0) AS total
     FROM platform_subscriptions s
     WHERE s.status = 'ACTIVE'`
  )[0]?.total ?? 0;

  // Upcoming renewals
  const upcomingRenewals = ctx.db.query<any>(
    `SELECT s.id, s.tenant_id, t.name, t.code, p.name AS planName, s.end_date, s.price, s.billing_cycle, s.auto_renew, s.status
     FROM platform_subscriptions s
     JOIN platform_tenants t ON t.id = s.tenant_id
     LEFT JOIN platform_plans p ON p.id = s.plan_id
     WHERE s.status = 'ACTIVE' AND s.end_date IS NOT NULL
       AND date(s.end_date) BETWEEN date('now') AND date('now', '+30 day')
     ORDER BY s.end_date
     LIMIT 20`
  );

  // Expired trials: TRIAL subscriptions whose trial/end date has passed
  const expiredTrials = ctx.db.query<any>(
    `SELECT COUNT(*) AS c FROM platform_subscriptions
     WHERE status = 'TRIAL' AND is_trial = 1
       AND COALESCE(trial_ends_at, end_date) IS NOT NULL
       AND date(COALESCE(trial_ends_at, end_date)) < date('now')`
  )[0]?.c ?? 0;

  // Trial → paid conversion: share of trial subscriptions that became ACTIVE
  const trialSubs = ctx.db.query<any>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS converted
     FROM platform_subscriptions WHERE is_trial = 1`
  )[0] ?? {};
  const trialTotal = toNumber(trialSubs.total, 0);
  const trialConverted = toNumber(trialSubs.converted, 0);
  const trialConversionRate = trialTotal > 0 ? (trialConverted / trialTotal) * 100 : 0;

  // Renewal rate: subscriptions reaching their end date in the last 90 days
  // that are still ACTIVE (i.e. were renewed instead of lapsing).
  const renewal = ctx.db.query<any>(
    `SELECT COUNT(*) AS due,
            SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS renewed
     FROM platform_subscriptions
     WHERE end_date IS NOT NULL
       AND date(end_date) BETWEEN date('now', '-90 days') AND date('now', '+30 days')`
  )[0] ?? {};
  const renewalDue = toNumber(renewal.due, 0);
  const renewalRate = renewalDue > 0 ? (toNumber(renewal.renewed, 0) / renewalDue) * 100 : 0;

  // New subscriptions time series (daily, last 30 days)
  const newSubsSeries = ctx.db.query<any>(
    `SELECT date(created_at) AS period, COUNT(*) AS count
     FROM platform_subscriptions
     WHERE created_at > date('now', '-30 days')
     GROUP BY period ORDER BY period`
  ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

  const cancelledSubsSeries = ctx.db.query<any>(
    `SELECT date(updated_at) AS period, COUNT(*) AS count
     FROM platform_subscriptions
     WHERE status = 'CANCELLED' AND updated_at > date('now', '-30 days')
     GROUP BY period ORDER BY period`
  ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

  const expiredTrialsSeries = ctx.db.query<any>(
    `SELECT date(COALESCE(trial_ends_at, end_date)) AS period, COUNT(*) AS count
     FROM platform_subscriptions
     WHERE status = 'TRIAL' AND is_trial = 1
       AND COALESCE(trial_ends_at, end_date) IS NOT NULL
       AND date(COALESCE(trial_ends_at, end_date)) > date('now', '-30 days')
     GROUP BY period ORDER BY period`
  ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

  const renewedSubsSeries = ctx.db.query<any>(
    `SELECT date(updated_at) AS period, COUNT(*) AS count
     FROM platform_subscriptions
     WHERE last_change_type = 'renewal' AND updated_at > date('now', '-30 days')
     GROUP BY period ORDER BY period`
  ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

  // Struggling subscriptions (PAST_DUE) with tenant/plan names
  const struggling = ctx.db.query<any>(
    `SELECT s.*, t.name AS tenant_name, t.code AS tenant_code, p.name AS plan_name
     FROM platform_subscriptions s
     LEFT JOIN platform_tenants t ON t.id = s.tenant_id
     LEFT JOIN platform_plans p ON p.id = s.plan_id
     WHERE s.status = 'PAST_DUE' LIMIT 20`
  );

  return {
    expiredTrials: createMetricComparison(toNumber(expiredTrials, 0), 0),
    upcomingRenewals: createMetricComparison(toNumber(upcomingRenewals.length, 0), 0),
    strugglingSubscriptions: createMetricComparison(toNumber(struggling.length, 0), 0),
    trialConversionRate: createMetricComparison(Math.round(trialConversionRate * 100) / 100, 0),
    averageSubscriptionValue: createMetricComparison(Math.round(toNumber(mrr, 0) * 100) / 100, 0),
    renewalRate: createMetricComparison(Math.round(renewalRate * 100) / 100, 0),
    timeSeries: {
      newSubscriptions: newSubsSeries,
      renewedSubscriptions: renewedSubsSeries,
      cancelledSubscriptions: cancelledSubsSeries,
      expiredTrials: expiredTrialsSeries,
    },
    upcomingRenewalsList: upcomingRenewals.map((r: any) => ({
      id: String(r.id),
      tenantId: String(r.tenant_id),
      tenantName: String(r.name),
      tenantCode: String(r.code),
      planName: String(r.planName ?? '—'),
      endDate: String(r.end_date),
      price: toNumber(r.price, 0) / 100,
      billingCycle: r.billing_cycle as PlatformBillingCycle,
      autoRenew: Boolean(r.auto_renew),
      status: r.status as PlatformSubscriptionStatus,
    })),
    strugglingList: struggling.map((s: any) => ({
      id: String(s.id),
      tenantId: String(s.tenant_id),
      tenantName: s.tenant_name ?? null,
      planId: String(s.plan_id),
      planName: s.plan_name ?? null,
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
