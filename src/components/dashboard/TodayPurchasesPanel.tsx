import React from 'react';
import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import type { DailyPurchaseResult } from '../../services/domains/operations/DailyOperationsService';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { formatProductQuantity } from '../../utils/products/productUnits';
import type {
  PurchaseHourlyBucket, PurchasePaymentMixItem, PurchaseTopItem, PurchaseTopSupplier,
} from '../../types/dashboard/components';

const purchasePaymentLabels: Record<string, string> = {
  CASH: 'نقدي',
  BANK_TRANSFER: 'تحويل بنكي',
  CARD: 'بطاقة',
  CREDIT: 'آجل',
  CHEQUE: 'شيك',
  MIXED: 'مختلط',
};

const purchasePaymentColors: Record<string, string> = {
  CASH: 'bg-emerald-500',
  BANK_TRANSFER: 'bg-sky-500',
  CARD: 'bg-violet-500',
  CREDIT: 'bg-rose-500',
  CHEQUE: 'bg-indigo-500',
  MIXED: 'bg-slate-500',
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
      <section className="rounded-[2px] border border-[#d9d9d9] bg-white p-3.5 text-[11px] font-semibold text-[#4d4d4d] dark:border-[#3d3d3d] dark:bg-[#2b2b2b] dark:text-[#c8c8c8]" role="status" aria-live="polite">
        <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-[#0078d4]" aria-hidden="true" /> جارٍ تحميل مشتريات اليوم...</span>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-[2px] border border-rose-200 bg-rose-50 p-3.5 dark:border-rose-900 dark:bg-rose-950/30" role="alert">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[11px] font-extrabold text-rose-800 dark:text-rose-200">تعذر تحميل مشتريات اليوم</h3>
            <p className="mt-1 break-words text-[10px] text-rose-700 dark:text-rose-300">{error}</p>
          </div>
          <button type="button" onClick={onRetry} className="shrink-0 rounded-[2px] border border-rose-300 px-3 py-1.5 text-[10px] font-bold text-rose-800 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-950">
            إعادة المحاولة
          </button>
        </div>
      </section>
    );
  }

  if (!todayPurchases || todayPurchases.rows.length === 0) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-[#d9d9d9] bg-white p-3.5 dark:border-[#3d3d3d] dark:bg-[#2b2b2b]">
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
    <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3.5 text-xs font-bold text-slate-700 dark:text-slate-200">
        <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-amber-700 dark:text-amber-300" /> <span>مشتريات وتوريدات اليوم</span></span>
        <span className="text-[10px] font-semibold text-slate-400">{isLoading ? 'جارٍ التحديث...' : `${todayPurchases.summary.count.toLocaleString('ar-EG')} فاتورة • ${todayPurchases.summary.suppliersCount.toLocaleString('ar-EG')} مورد`}</span>
      </summary>
      <div className="border-t border-slate-100 p-3.5 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 flex items-center justify-center font-bold">
            <Truck className="w-3.5 h-3.5" />
          </span>
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">مشتريات وتوريدات اليوم</h3>
            <p className="text-[10px] text-slate-400">حركة التوريد الفعلي، السداد المالي، والموردين</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {new Date(`${todayPurchases.date}T12:00:00`).toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
          <Link to="/purchases" className="text-[10px] font-bold text-sky-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:text-sky-300">عرض الفواتير</Link>
        </div>
      </div>

      {/* 4 Compact Purchase KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">إجمالي التوريد</span>
          <div className="text-sm font-black tabular-nums text-orange-700 dark:text-orange-400 mt-0.5">
            {CeramicMath.formatCurrency(todayPurchases.summary.total)}
          </div>
          <span className="text-[10px] text-slate-400">{todayPurchases.summary.count} فاتورة توريد</span>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">المسدد اليوم</span>
          <div className="text-sm font-black tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
            {CeramicMath.formatCurrency(todayPurchases.summary.paid)}
          </div>
          <span className="text-[10px] text-slate-400">{todayPurchases.summary.paymentsCount} سند صرف</span>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">المتبقي للموردين</span>
          <div className="text-sm font-black tabular-nums text-rose-600 dark:text-rose-400 mt-0.5">
            {CeramicMath.formatCurrency(todayPurchases.summary.remaining)}
          </div>
          <span className="text-[10px] text-slate-400">{todayPurchases.summary.suppliersCount} مورد مسجل</span>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">الأصناف المستلمة</span>
          <div className="text-sm font-black tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
            {todayPurchases.summary.itemsCount} سطر
          </div>
          <span className="text-[10px] text-slate-400">{purchaseQuantitiesByUnit.map(([unit, quantity]) => `${quantity.toLocaleString('ar-EG')} ${unit}`).join(' · ') || '—'}</span>
        </div>
      </div>

      {/* Sub-grid for Purchases: Left Hourly & Payment, Right Suppliers & Items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {/* Left: Hourly & Payments */}
        <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">نبض المشتريات بالساعة</span>
              <span className="text-[10px] text-slate-400">
                الذروة: {purchasePeakHour > 0 ? CeramicMath.formatCurrency(purchasePeakHour) : '0'}
              </span>
            </div>
            {todayPurchases.rows.length === 0 ? (
              <p className="py-4 text-center text-[11px] text-slate-400">لا توجد فواتير توريد مسجلة اليوم</p>
            ) : (
              <div>
                <div className="flex h-16 items-end gap-0.5 border-b border-slate-200 dark:border-slate-700" dir="ltr">
                  {purchaseHourly.map((bucket, hour) => (
                    <div
                      key={hour}
                      title={`${String(hour).padStart(2, '0')}:00 · ${CeramicMath.formatCurrency(bucket.total)}`}
                      className={`flex-1 rounded-t-xs ${bucket.total > 0 ? 'bg-orange-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                      style={{ height: bucket.total > 0 ? `${Math.max((bucket.total / purchasePeakHour) * 100, 10)}%` : '2px' }}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[9px] text-slate-400" dir="ltr">
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
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1.5">طرق سداد المشتريات</span>
            <div className="flex flex-wrap gap-2">
              {purchasePaymentMix.length === 0 ? (
                <span className="text-[10px] text-slate-400">لا توجد مدفوعات مسجلة</span>
              ) : (
                purchasePaymentMix.map((p) => (
                  <span key={p.method} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                    <span className={`w-2 h-2 rounded-full ${purchasePaymentColors[p.method] || 'bg-slate-400'}`} />
                    <span>{purchasePaymentLabels[p.method] || p.method}:</span>
                    <span className="font-bold">{CeramicMath.formatCurrency(p.total)}</span>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Top Suppliers & Top Items */}
        <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
          <div>
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1.5">أبرز الموردين اليوم</span>
            {purchaseTopSuppliers.length === 0 ? (
              <p className="py-2 text-center text-[10px] text-slate-400">لا توجد بيانات موردين</p>
            ) : (
              <div className="space-y-1">
                {purchaseTopSuppliers.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 px-2 rounded bg-white dark:bg-slate-800 text-[11px]">
                    <span className="truncate font-semibold text-slate-800 dark:text-slate-200">{idx + 1}. {s.name}</span>
                    <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">{CeramicMath.formatCurrency(s.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1.5">أكثر الأصناف توريدًا</span>
            {purchaseTopItems.length === 0 ? (
              <p className="py-2 text-center text-[10px] text-slate-400">لا توجد أصناف واردة</p>
            ) : (
              <div className="space-y-1">
                {purchaseTopItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 px-2 rounded bg-white dark:bg-slate-800 text-[11px]">
                    <span className="truncate font-semibold text-slate-800 dark:text-slate-200">{idx + 1}. {item.name}</span>
                    <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatProductQuantity(item.quantity, item)}</span>
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
