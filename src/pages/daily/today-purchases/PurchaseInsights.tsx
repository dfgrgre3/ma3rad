import React from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { DailyPurchaseResult } from '../../../services/domains/operations/DailyOperationsService';
import type { NumberFormatter } from '../../../types/dashboard/todayPurchases';
import { weekdayOf } from './helpers';

export interface PurchaseInsightsProps {
  data: DailyPurchaseResult;
  fmt: NumberFormatter;
  plain: NumberFormatter;
  date: string;
  todayDate: string;
}

const InsightCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: string;
  featured?: boolean;
}> = ({ label, value, hint, tone, featured }) => (
  <div className={`min-w-0 rounded-xl border p-4 ${featured
    ? 'border-line-strong bg-primary text-white '
    : 'border-line bg-surface '}`}>
    <p className={`text-[11px] font-bold ${featured ? 'text-muted' : 'text-muted dark:text-muted'}`}>{label}</p>
    <p className={`mt-2 whitespace-normal break-words text-sm font-black leading-snug tabular-nums [overflow-wrap:anywhere] min-[400px]:text-base sm:text-lg xl:text-xl ${featured ? 'text-warning' : tone || 'text-ink dark:text-muted'}`}>{value}</p>
    {hint != null && <p className={`mt-1 whitespace-normal break-words text-[11px] [overflow-wrap:anywhere] ${featured ? 'text-muted' : 'text-muted dark:text-muted'}`}>{hint}</p>}
  </div>
);

const BreakdownRow: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone }) => (
  <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
    <span className="text-[11px] font-semibold text-muted ">{label}</span>
    <span className={`text-xs font-black tabular-nums ${tone || 'text-ink dark:text-muted'}`}>{value}</span>
  </div>
);

export const PurchaseInsights: React.FC<PurchaseInsightsProps> = ({ data, fmt, plain, date, todayDate }) => {
  const { summary, trend } = data;
  const trendPeak = Math.max(...trend.map((point) => point.total), 0);
  const todayPoint = trend[trend.length - 1];
  const previousPoint = trend.length >= 2 ? trend[trend.length - 2] : null;
  const deltaPct = previousPoint && previousPoint.total > 0 && todayPoint
    ? ((todayPoint.total - previousPoint.total) / previousPoint.total) * 100
    : null;
  const DeltaIcon = deltaPct == null ? Minus : deltaPct > 0 ? TrendingUp : TrendingDown;
  const deltaTone = deltaPct == null ? 'text-muted' : deltaPct > 0 ? 'text-danger' : deltaPct < 0 ? 'text-success' : 'text-muted';
  const countDelta = previousPoint && todayPoint ? todayPoint.count - previousPoint.count : null;

  return (
    <section className="space-y-3" aria-labelledby="purchase-insights-title">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <InsightCard
          featured
          label="إجمالي المشتريات"
          value={fmt(summary.total)}
          hint={
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{plain(summary.count)} فاتورة توريد</span>
              {deltaPct != null && (
                <span className={`inline-flex items-center gap-0.5 font-bold ${deltaTone}`}>
                  <DeltaIcon className="h-3 w-3" />
                  {deltaPct > 0 ? '+' : ''}{plain(Math.abs(deltaPct))}% عن اليوم السابق
                  {countDelta != null && countDelta !== 0 && ` (${countDelta > 0 ? '+' : ''}${plain(countDelta)} فاتورة)`}
                </span>
              )}
            </span>
          }
        />
        <InsightCard
          label="المدفوع"
          value={fmt(summary.paid)}
          hint={`نقدي ${fmt(summary.cashPaid)} · بنكي/بطاقة ${fmt(summary.bankPaid)}`}
          tone="text-success dark:text-success"
        />
        <InsightCard
          label="المتبقي للموردين"
          value={fmt(summary.remaining)}
          hint="مستحق على فواتير اليوم"
          tone={summary.remaining > 0 ? 'text-danger dark:text-danger' : 'text-ink dark:text-muted'}
        />
        <InsightCard
          label="متوسط الفاتورة"
          value={fmt(summary.averageInvoice)}
          hint={summary.count > 0 ? `على ${plain(summary.count)} فاتورة` : 'لا توجد فواتير'}
        />
        <InsightCard
          label="الموردون"
          value={plain(summary.suppliersCount)}
          hint={`${plain(summary.itemsCount)} صنف · ${plain(summary.quantityM2)} م²`}
        />
        <InsightCard
          label="سندات سداد الموردين"
          value={fmt(summary.paymentsTotal)}
          hint={`${plain(summary.paymentsCount)} سند دفع اليوم`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <section className="rounded-xl border border-line bg-surface p-4 sm:p-5 xl:col-span-2" aria-labelledby="purchase-trend-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="purchase-trend-title" className="text-sm font-black text-ink ">اتجاه المشتريات</h2>
              <p className="mt-1 text-xs text-muted ">إجمالي قيمة التوريد خلال آخر 7 أيام{date === todayDate ? ' حتى اليوم' : ''}</p>
            </div>
            <div className="text-left">
              <p className="text-xs font-bold tabular-nums text-ink ">{todayPoint ? fmt(todayPoint.total) : '—'}</p>
              <p className="mt-1 text-[11px] text-muted ">{date === todayDate ? 'اليوم' : weekdayOf(date)}</p>
            </div>
          </div>
          {trendPeak > 0 ? (
            <div className="mt-5" role="img" aria-label="توزيع مشتريات آخر 7 أيام">
              <div className="flex h-24 items-end gap-1 border-b border-line sm:gap-1.5" dir="ltr">
                {trend.map((point, index) => (
                  <div
                    key={point.date}
                    title={`${weekdayOf(point.date)} · ${plain(point.count)} فاتورة · ${fmt(point.total)}`}
                    className={`min-w-0 flex-1 rounded-t-sm transition-colors ${point.total > 0 ? 'bg-warning hover:bg-warning' : 'bg-surface-sunken dark:bg-primary'} ${index === trend.length - 1 ? 'ring-1 ring-warning' : ''}`}
                    style={{ height: point.total > 0 ? `${Math.max((point.total / trendPeak) * 100, 8)}%` : '3px' }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] tabular-nums text-muted" dir="ltr">
                {trend.map((point) => <span key={point.date}>{weekdayOf(point.date)}</span>)}
              </div>
            </div>
          ) : (
            <div className="mt-5 flex h-24 items-center justify-center rounded-lg border border-dashed border-line text-xs text-muted ">
              لا توجد مشتريات خلال هذه الفترة.
            </div>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="purchase-breakdown-title">
          <h2 id="purchase-breakdown-title" className="text-sm font-black text-ink ">تفصيل القيمة</h2>
          <p className="mt-1 text-xs text-muted ">بنود إجمالي فواتير اليوم</p>
          <div className="mt-3">
            <BreakdownRow label="الإجمالي الفرعي" value={fmt(summary.subtotal)} />
            <BreakdownRow label="الضريبة" value={fmt(summary.tax)} />
            <BreakdownRow label="الشحن" value={fmt(summary.shipping)} />
            <BreakdownRow label="الخصم" value={fmt(summary.discount)} tone="text-success dark:text-success" />
            <BreakdownRow label="منها آجلة / جزئية" value={fmt(summary.creditTotal)} tone={summary.creditTotal > 0 ? 'text-warning dark:text-warning' : undefined} />
          </div>
        </section>
      </div>
    </section>
  );
};
