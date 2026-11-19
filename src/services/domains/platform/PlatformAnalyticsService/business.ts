import type { PlatformPeriod, PlatformBusinessPerformance } from '../platformTypes';
import { toNumber } from '../platformUtils';
import type { AnalyticsServiceContext } from './context';
import { createMetricComparison, createTimeSeriesPoint, getPeriodRange, getPreviousPeriodRange } from './periods';

export function getBusinessPerformance(ctx: AnalyticsServiceContext, period: PlatformPeriod = '30d', planId?: string): PlatformBusinessPerformance {
  ctx.requirePlatformAccess('analytics', 'platform.analytics.business');

  const { from, to } = getPeriodRange(period);
  const { from: prevFrom, to: prevTo } = getPreviousPeriodRange(period);
  const planFilter = planId ? 'AND p.id = ?' : '';
  const planParams = planId ? [planId] : [];

  // Current period revenue
  const revenue = ctx.db.query<any>(
    `SELECT COALESCE(SUM(i.total) / 100.0, 0) AS total
     FROM platform_invoices i
     JOIN platform_tenants t ON t.id = i.tenant_id
     LEFT JOIN platform_plans p ON p.id = t.plan_id
     WHERE i.status = 'PAID' AND i.paid_at BETWEEN ? AND ? ${planFilter}`,
    [from, to, ...planParams]
  )[0]?.total ?? 0;

  // Previous period revenue
  const prevRevenue = ctx.db.query<any>(
    `SELECT COALESCE(SUM(i.total) / 100.0, 0) AS total
     FROM platform_invoices i
     JOIN platform_tenants t ON t.id = i.tenant_id
     LEFT JOIN platform_plans p ON p.id = t.plan_id
     WHERE i.status = 'PAID' AND i.paid_at BETWEEN ? AND ? ${planFilter}`,
    [prevFrom, prevTo, ...planParams]
  )[0]?.total ?? 0;

  // MRR (normalized to a monthly amount per billing cycle)
  const mrr = ctx.db.query<any>(
    `SELECT COALESCE(SUM(CASE s.billing_cycle
       WHEN 'MONTHLY' THEN s.price
       WHEN 'QUARTERLY' THEN s.price / 3.0
       WHEN 'YEARLY' THEN s.price / 12.0
       ELSE 0 END) / 100.0, 0) AS total
     FROM platform_subscriptions s
     LEFT JOIN platform_plans p ON p.id = s.plan_id
     WHERE s.status = 'ACTIVE' ${planFilter}`,
    [...planParams]
  )[0]?.total ?? 0;

  // Previous MRR (approximate)
  const prevMrr = ctx.db.query<any>(
    `SELECT COALESCE(SUM(CASE s.billing_cycle
       WHEN 'MONTHLY' THEN s.price
       WHEN 'QUARTERLY' THEN s.price / 3.0
       WHEN 'YEARLY' THEN s.price / 12.0
       ELSE 0 END) / 100.0, 0) AS total
     FROM platform_subscriptions s
     LEFT JOIN platform_plans p ON p.id = s.plan_id
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
  const revenueSeries = ctx.db.query<any>(
    `SELECT strftime('%Y-%m', paid_at) AS month, COALESCE(SUM(total), 0) AS total
     FROM platform_invoices
     WHERE status = 'PAID' AND paid_at BETWEEN ? AND ?
     GROUP BY month
     ORDER BY month`,
    [from, to]
  ).map(r => createTimeSeriesPoint(r.month, toNumber(r.total, 0)));

  const mrrSeries = ctx.db.query<any>(
    `SELECT strftime('%Y-%m', created_at) AS month,
            COALESCE(SUM(CASE billing_cycle
              WHEN 'MONTHLY' THEN price
              WHEN 'QUARTERLY' THEN price / 3.0
              WHEN 'YEARLY' THEN price / 12.0
              ELSE 0 END) / 100.0, 0) AS total
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
