import React from 'react';
import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import type { DailyPurchaseResult } from '../../services/domains/operations/DailyOperationsService';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { formatProductQuantity } from '../../utils/products/productUnits';
import type {
  PurchaseHourlyBucket, PurchasePaymentMixItem, PurchaseTopItem, PurchaseTopSupplier,
} from '../../types/dashboard/components';
import type { DailyPurchaseRow } from '../../services/domains/operations/DailyOperationsService';

const purchasePaymentLabels: Record<string, string> = {
  CASH: 'نقدي',
  BANK_TRANSFER: 'تحويل بنكي',
  CARD: 'بطاقة',
  CREDIT: 'آجل',
  CHEQUE: 'شيك',
  MIXED: 'مختلط',
};

const purchasePaymentColors: Record<string, string> = {
  CASH: 'bg-success',
  BANK_TRANSFER: 'bg-primary',
  CARD: 'bg-primary',
  CREDIT: 'bg-danger',
  CHEQUE: 'bg-primary',
  MIXED: 'bg-line-strong',
};

interface TodayPurchasesPanelProps {
  canViewPurchases: boolean;
  todayPurchases: DailyPurchaseResult | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  purchaseHourly: PurchaseHourlyBucket[];
  purchasePeakHour: number;
  purchasePaymentMix: PurchasePaymentMixItem[];
  purchaseTopSuppliers: PurchaseTopSupplier[];
  purchaseTopItems: PurchaseTopItem[];
  purchaseQuantitiesByUnit: [string, number][];
}

export const TodayPurchasesPanel: React.FC<TodayPurchasesPanelProps> = ({
  canViewPurchases,
  todayPurchases,
  isLoading,
  error,
  onRetry,
  purchaseHourly,
  purchasePeakHour,
  purchasePaymentMix,
  purchaseTopSuppliers,
  purchaseTopItems,
  purchaseQuantitiesByUnit,
}) => {
  if (!canViewPurchases) return null;

  if (isLoading && !todayPurchases) {
    return (
      <section className="rounded-[2px] border border-[#d9d9d9] bg-surface p-3.5 text-[11px] font-semibold text-[#4d4d4d] dark:border-[#3d3d3d] dark:bg-[#2b2b2b] dark:text-[#c8c8c8]" role="status" aria-live="polite">
        <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-[#0078d4]" aria-hidden="true" /> جارٍ تحميل مشتريات اليوم...</span>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-[2px] border border-danger-border bg-danger-soft p-3.5 dark:bg-danger/30" role="alert">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[11px] font-extrabold text-danger ">تعذر تحميل مشتريات اليوم</h3>
            <p className="mt-1 break-words text-[10px] text-danger ">{error}</p>
          </div>
          <button type="button" onClick={onRetry} className="shrink-0 rounded-[2px] border border-danger px-3 py-1.5 text-[10px] font-bold text-danger hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger dark:hover:bg-danger">
            إعادة المحاولة
          </button>
        </div>
      </section>
    );
  }

  if (!todayPurchases || todayPurchases.rows.length === 0) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-[#d9d9d9] bg-surface p-3.5 dark:border-[#3d3d3d] dark:bg-[#2b2b2b]">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-[#767676]" aria-hidden="true" />
          <div>
            <h3 className="text-[11px] font-bold text-[#1b1b1b] dark:text-[#f0f0f0]">مشتريات اليوم</h3>
            <p className="text-[10px] text-[#767676] dark:text-[#a6a6a6]">لا توجد فواتير توريد مسجلة اليوم</p>
          </div>
        </div>
        <Link to="/purchases" className="text-[10px] font-bold text-[#0067b8] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0078d4] dark:text-[#76c7ff]">فتح المشتريات</Link>
      </section>
    );
  }

  return (
    <details className="group rounded-xl border border-line bg-surface ">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3.5 text-xs font-bold text-ink ">
        <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-warning " /> <span>مشتريات وتوريدات اليوم</span></span>
        <span className="text-[10px] font-semibold text-muted">{isLoading ? 'جارٍ التحديث...' : `${todayPurchases.summary.count.toLocaleString('ar-EG')} فاتورة • ${todayPurchases.summary.suppliersCount.toLocaleString('ar-EG')} مورد`}</span>
      </summary>
      <div className="border-t border-line p-3.5 ">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-warning-soft text-warning flex items-center justify-center font-bold">
            <Truck className="w-3.5 h-3.5" />
          </span>
          <div>
            <h3 className="text-xs font-bold text-ink dark:text-white">مشتريات وتوريدات اليوم</h3>
            <p className="text-[10px] text-muted">حركة التوريد الفعلي، السداد المالي، والموردين</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-muted ">
            {new Date(`${todayPurchases.date}T12:00:00`).toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
          <Link to="/purchases" className="text-[10px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ">عرض الفواتير</Link>
        </div>
      </div>

      {/* 4 Compact Purchase KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
        <div className="p-2.5 rounded-lg bg-surface-muted dark:bg-primary/60 border border-line ">
          <span className="text-[10px] font-semibold text-muted ">إجمالي التوريد</span>
          <div className="text-sm font-black tabular-nums text-warning mt-0.5">
            {CeramicMath.formatCurrency(todayPurchases.summary.total)}
          </div>
          <span className="text-[10px] text-muted">{todayPurchases.summary.count} فاتورة توريد</span>
        </div>
        <div className="p-2.5 rounded-lg bg-surface-muted dark:bg-primary/60 border border-line ">
          <span className="text-[10px] font-semibold text-muted ">المسدد اليوم</span>
          <div className="text-sm font-black tabular-nums text-success mt-0.5">
            {CeramicMath.formatCurrency(todayPurchases.summary.paid)}
          </div>
          <span className="text-[10px] text-muted">{todayPurchases.summary.paymentsCount} سند صرف</span>
        </div>
        <div className="p-2.5 rounded-lg bg-surface-muted dark:bg-primary/60 border border-line ">
          <span className="text-[10px] font-semibold text-muted ">المتبقي للموردين</span>
          <div className="text-sm font-black tabular-nums text-danger mt-0.5">
            {CeramicMath.formatCurrency(todayPurchases.summary.remaining)}
          </div>
          <span className="text-[10px] text-muted">{todayPurchases.summary.suppliersCount} مورد مسجل</span>
        </div>
        <div className="p-2.5 rounded-lg bg-surface-muted dark:bg-primary/60 border border-line ">
          <span className="text-[10px] font-semibold text-muted ">الأصناف المستلمة</span>
          <div className="text-sm font-black tabular-nums text-ink mt-0.5">
            {todayPurchases.summary.itemsCount} سطر
          </div>
          <span className="text-[10px] text-muted">{purchaseQuantitiesByUnit.map(([unit, quantity]) => `${quantity.toLocaleString('ar-EG')} ${unit}`).join(' · ') || '—'}</span>
        </div>
      </div>

      {/* Sub-grid for Purchases: Left Hourly & Payment, Right Suppliers & Items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {/* Left: Hourly & Payments */}
        <div className="p-3 rounded-lg border border-line bg-surface-muted/50 dark:bg-primary/30 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-ink ">نبض المشتريات بالساعة</span>
              <span className="text-[10px] text-muted">
                الذروة: {purchasePeakHour > 0 ? CeramicMath.formatCurrency(purchasePeakHour) : '0'}
              </span>
            </div>
            {todayPurchases.rows.length === 0 ? (
              <p className="py-4 text-center text-[11px] text-muted">لا توجد فواتير توريد مسجلة اليوم</p>
            ) : (
              <div>
                <div className="flex h-16 items-end gap-0.5 border-b border-line " dir="ltr">
                  {purchaseHourly.map((bucket, hour) => (
                    <div
                      key={hour}
                      title={`${String(hour).padStart(2, '0')}:00 · ${CeramicMath.formatCurrency(bucket.total)}`}
                      className={`flex-1 rounded-t-xs ${bucket.total > 0 ? 'bg-warning' : 'bg-surface-sunken dark:bg-primary'}`}
                      style={{ height: bucket.total > 0 ? `${Math.max((bucket.total / purchasePeakHour) * 100, 10)}%` : '2px' }}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[9px] text-muted" dir="ltr">
                  <span>00:00</span>
                  <span>08:00</span>
                  <span>14:00</span>
                  <span>20:00</span>
                  <span>23:00</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <span className="text-[11px] font-bold text-ink block mb-1.5">طرق سداد المشتريات</span>
            <div className="flex flex-wrap gap-2">
              {purchasePaymentMix.length === 0 ? (
                <span className="text-[10px] text-muted">لا توجد مدفوعات مسجلة</span>
              ) : (
                purchasePaymentMix.map((p) => (
                  <span key={p.method} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-surface border border-line text-[10px] font-semibold text-ink ">
                    <span className={`w-2 h-2 rounded-full ${purchasePaymentColors[p.method] || 'bg-line-strong'}`} />
                    <span>{purchasePaymentLabels[p.method] || p.method}:</span>
                    <span className="font-bold">{CeramicMath.formatCurrency(p.total)}</span>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Top Suppliers & Top Items */}
        <div className="p-3 rounded-lg border border-line bg-surface-muted/50 dark:bg-primary/30 space-y-3">
          <div>
            <span className="text-[11px] font-bold text-ink block mb-1.5">أبرز الموردين اليوم</span>
            {purchaseTopSuppliers.length === 0 ? (
              <p className="py-2 text-center text-[10px] text-muted">لا توجد بيانات موردين</p>
            ) : (
              <div className="space-y-1">
                {purchaseTopSuppliers.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 px-2 rounded bg-surface text-[11px]">
                    <span className="truncate font-semibold text-ink ">{idx + 1}. {s.name}</span>
                    <span className="font-bold tabular-nums text-ink ">{CeramicMath.formatCurrency(s.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className="text-[11px] font-bold text-ink block mb-1.5">أكثر الأصناف توريدًا</span>
            {purchaseTopItems.length === 0 ? (
              <p className="py-2 text-center text-[10px] text-muted">لا توجد أصناف واردة</p>
            ) : (
              <div className="space-y-1">
                {purchaseTopItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 px-2 rounded bg-surface text-[11px]">
                    <span className="truncate font-semibold text-ink ">{idx + 1}. {item.name}</span>
                    <span className="font-bold tabular-nums text-ink ">{formatProductQuantity(item.quantity, item)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </details>
  );
};
