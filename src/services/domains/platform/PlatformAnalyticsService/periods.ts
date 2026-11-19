import type { PlatformPeriod, PlatformMetricComparison, PlatformTimeSeriesPoint } from '../platformTypes';
import { addDays } from '../platformUtils';

export function createMetricComparison(current: number, previous: number): PlatformMetricComparison {
  const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  return {
    current,
    previous,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(change * 100) / 100,
    trend: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
  };
}

export function createTimeSeriesPoint(period: string, value: number, label?: string): PlatformTimeSeriesPoint {
  return { period, value, label: label ?? period };
}

export function getPeriodRange(period: PlatformPeriod): { from: string; to: string } {
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

export function getPreviousPeriodRange(period: PlatformPeriod): { from: string; to: string } {
  const { from, to } = getPeriodRange(period);
  const days = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
  const prevTo = addDays(new Date(from), -1);
  const prevFrom = addDays(prevTo, -days);
  return {
    from: prevFrom.toISOString().split('T')[0],
    to: prevTo.toISOString().split('T')[0],
  };
}
