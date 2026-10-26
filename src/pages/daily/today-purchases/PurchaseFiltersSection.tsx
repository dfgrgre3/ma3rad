import React from 'react';
import { Search, X } from 'lucide-react';
import { PAY_LABEL } from './constants';
import type { NumberFormatter, PurchaseFilters } from './types';

export interface PurchaseFiltersSectionProps {
  filters: PurchaseFilters;
  onChange: (patch: Partial<PurchaseFilters>) => void;
  onClearFilters: () => void;
  hasFilters: boolean;
  statusCounts: Record<string, number>;
  suppliers: Array<[string, string]>;
  warehouses: string[];
  methods: string[];
  loading: boolean;
  rowsCount: number;
  filteredCount: number;
  filteredTotal: number;
  plain: NumberFormatter;
  fmt: NumberFormatter;
}

export const PurchaseFiltersSection: React.FC<PurchaseFiltersSectionProps> = ({
  filters, onChange, onClearFilters, hasFilters, statusCounts,
  suppliers, warehouses, methods, loading, rowsCount, filteredCount, filteredTotal, plain, fmt,
}) => (
  <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:p-4" aria-label="تصفية المشتريات">
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-sm">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="ابحث برقم الفاتورة أو المورد أو الهاتف أو الملاحظات…"
            aria-label="البحث في مشتريات اليوم"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          {filters.search && (
            <button type="button" onClick={() => onChange({ search: '' })} aria-label="مسح البحث" className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800" role="group" aria-label="تصفية حسب حالة السداد">
          {[
            { key: 'ALL', label: 'الكل' },
            { key: 'PAID', label: 'مدفوعة' },
            { key: 'PARTIAL', label: 'جزئيًا' },
            { key: 'UNPAID', label: 'آجلة' },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onChange({ status: option.key })}
              aria-pressed={filters.status === option.key}
              className={`min-h-8 rounded-md px-2.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${filters.status === option.key ? 'bg-white text-orange-700 shadow-sm dark:bg-slate-700 dark:text-orange-300' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'}`}
            >
              {option.label} <span className="tabular-nums text-slate-400">({plain(statusCounts[option.key] || 0)})</span>
            </button>
          ))}
        </div>

        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 lg:mr-auto" aria-live="polite">
          {loading ? 'جارٍ التحديث…' : `${plain(filteredCount)} من ${plain(rowsCount)} فاتورة · ${fmt(filteredTotal)}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">المورد</span>
          <select value={filters.supplierId} onChange={(event) => onChange({ supplierId: event.target.value })} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <option value="ALL">كل الموردين</option>
            {suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">المخزن</span>
          <select value={filters.warehouse} onChange={(event) => onChange({ warehouse: event.target.value })} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <option value="ALL">كل المخازن</option>
            {warehouses.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">طريقة السداد</span>
          <select value={filters.paymentType} onChange={(event) => onChange({ paymentType: event.target.value })} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <option value="ALL">كل الطرق</option>
            {methods.map((method) => <option key={method} value={method}>{PAY_LABEL[method] || method}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">من مبلغ</span>
          <input type="number" min="0" step="0.01" value={filters.minAmount} onChange={(event) => onChange({ minAmount: event.target.value })} placeholder="0" className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold tabular-nums text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">إلى مبلغ</span>
          <input type="number" min="0" step="0.01" value={filters.maxAmount} onChange={(event) => onChange({ maxAmount: event.target.value })} placeholder="بلا حد" className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold tabular-nums text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
        </label>
        <div className="flex items-end">
          <button type="button" onClick={onClearFilters} disabled={!hasFilters} className="min-h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
            مسح الفلاتر
          </button>
        </div>
      </div>
    </div>
  </section>
);
