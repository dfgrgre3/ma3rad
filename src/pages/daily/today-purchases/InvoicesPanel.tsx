import React from 'react';
import {
  ArrowUpDown, ChevronDown, ChevronLeft, Eye, HandCoins, Plus, Printer, ShoppingBag, Trash2,
} from 'lucide-react';
import { DataTable } from '../../../components/ui/DataTable';
import type { DailyPurchaseItemRow, DailyPurchaseRow } from '../../../services/domains/operations/DailyOperationsService';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import { PAY_LABEL } from './constants';
import { sortIndicator, timeOf } from './helpers';
import { StatusBadge } from './primitives';
import type { NumberFormatter, SortDir, SortKey } from '../../../types/dashboard/todayPurchases';

export interface InvoicesPanelProps {
  rows: DailyPurchaseRow[];
  pageRows: DailyPurchaseRow[];
  filteredCount: number;
  itemsByPurchase: Map<string, DailyPurchaseItemRow[]>;
  expanded: string | null;
  onToggleExpanded: (id: string) => void;
  hasFilters: boolean;
  canCreate: boolean;
  canPay: boolean;
  canDelete: boolean;
  onClearFilters: () => void;
  onOpenQuickCreate: () => void;
  onPay: (row: DailyPurchaseRow) => void;
  onDetails: (id: string) => void;
  onPrint: (row: DailyPurchaseRow) => void;
  onDelete: (row: DailyPurchaseRow) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  fmt: NumberFormatter;
  plain: NumberFormatter;
}

export const InvoicesPanel: React.FC<InvoicesPanelProps> = ({
  rows, pageRows, filteredCount, itemsByPurchase, expanded, onToggleExpanded,
  hasFilters, canCreate, canPay, canDelete, onClearFilters, onOpenQuickCreate,
  onPay, onDetails, onPrint, onDelete, sortKey, sortDir, onSort,
  page, pageCount, pageSize, onPageChange, onPageSizeChange, fmt, plain,
}) => (
  <div role="tabpanel" aria-label="فواتير التوريد">
    {filteredCount === 0 ? (
      <div className="flex flex-col items-center px-4 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-300">
          <ShoppingBag className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">{rows.length === 0 ? 'لا توجد مشتريات مسجلة في هذا اليوم' : 'لا توجد فواتير تطابق البحث'}</p>
        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">{rows.length === 0 ? 'ستظهر فواتير التوريد هنا فور تسجيلها، مع الأصناف وحالة السداد.' : 'غيّر كلمات البحث أو الفلاتر لعرض نتائج أخرى.'}</p>
        {hasFilters ? (
          <button type="button" onClick={onClearFilters} className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">مسح الفلاتر</button>
        ) : canCreate ? (
          <button type="button" onClick={onOpenQuickCreate} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-orange-700">
            <Plus className="h-4 w-4" /> تسجيل أول فاتورة توريد
          </button>
        ) : null}
      </div>
    ) : (
      <>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 xl:hidden">
          {pageRows.map((row) => {
            const lines = itemsByPurchase.get(row.id) || [];
            const isOpen = expanded === row.id;
            return (
              <article key={row.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button type="button" onClick={() => onToggleExpanded(row.id)} className="flex items-center gap-1 font-mono text-sm font-bold text-orange-700 dark:text-orange-300">
                      {row.invoiceNumber}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{row.supplierName || '—'}</p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{timeOf(row.createdAt)} · {plain(row.itemsCount)} أصناف · {row.warehouseName || '—'}</p>
                  </div>
                  <StatusBadge status={row.paymentStatus} />
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                  <div><p className="text-[10px] text-slate-500 dark:text-slate-400">الإجمالي</p><p className="mt-0.5 font-black tabular-nums text-slate-900 dark:text-slate-100">{fmt(row.total)}</p></div>
                  <div><p className="text-[10px] text-slate-500 dark:text-slate-400">المدفوع</p><p className="mt-0.5 font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(row.paid)}</p></div>
                  <div><p className="text-[10px] text-slate-500 dark:text-slate-400">المتبقي</p><p className={`mt-0.5 font-bold tabular-nums ${row.remaining > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>{fmt(row.remaining)}</p></div>
                  <div><p className="text-[10px] text-slate-500 dark:text-slate-400">الضريبة · الشحن</p><p className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-300">{fmt(row.tax)} · {fmt(row.shippingCost)}</p></div>
                </div>
                {row.supplierInvoiceNumber && <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">فاتورة المورد: <span className="font-mono">{row.supplierInvoiceNumber}</span></p>}
                {isOpen && (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <DataTable
                      ariaLabel="أصناف الفاتورة"
                      rows={lines}
                      rowKey={(line) => line.id}
                      dense
                      tableClassName="text-[11px]"
                      columns={[
                        { key: 'product', header: 'الصنف', render: (line) => <span className="font-semibold text-slate-800 dark:text-slate-200">{line.productName}<span className="block font-mono text-[9px] text-slate-400">{line.sku}</span></span> },
                        { key: 'qty', header: 'الكمية', render: (line) => <span className="tabular-nums">{formatProductQuantity(Number(line.quantityM2), line)}</span> },
                        { key: 'boxes', header: 'الكراتين', render: (line) => <span className="tabular-nums">{plain(line.boxesCount)}</span> },
                        { key: 'cost', header: 'تكلفة الوحدة', render: (line) => <span className="tabular-nums">{fmt(line.unitCost)}</span> },
                        { key: 'total', header: 'الإجمالي', render: (line) => <span className="font-bold tabular-nums">{fmt(line.totalCost)}</span> },
                      ]}
                      emptyTitle="لا توجد أصناف مسجلة"
                    />
                  </div>
                )}
                <div className="mt-2 flex items-center justify-end gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                  {canPay && row.remaining > 0 && (
                    <button type="button" onClick={() => onPay(row)} aria-label={`سداد للمورد عن الفاتورة ${row.invoiceNumber}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950">
                      <HandCoins className="h-4 w-4" />
                    </button>
                  )}
                  <button type="button" onClick={() => onDetails(row.id)} aria-label={`تفاصيل الفاتورة ${row.invoiceNumber}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950">
                    <Eye className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => onPrint(row)} aria-label={`طباعة الفاتورة ${row.invoiceNumber}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                    <Printer className="h-4 w-4" />
                  </button>
                  {canDelete && (
                    <button type="button" onClick={() => onDelete(row)} aria-label={`حذف الفاتورة ${row.invoiceNumber}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="hidden xl:block">
          <DataTable
            ariaLabel="فواتير التوريد"
            rows={pageRows}
            rowKey={(row) => row.id}
            minWidth={1220}
            dense
            rowClassName={(row) => `transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50 ${expanded === row.id ? 'bg-orange-50/40 dark:bg-orange-950/10' : ''}`}
            isRowExpanded={(row) => expanded === row.id}
            expandedRowClassName="bg-slate-50/70 dark:bg-slate-800/30"
            renderExpandedRow={(row) => {
              const lines = itemsByPurchase.get(row.id) || [];
              return (
                <div className="px-4 py-3">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                      <DataTable
                        ariaLabel="أصناف الفاتورة"
                        rows={lines}
                        rowKey={(line) => line.id}
                        dense
                        tableClassName="text-[11px]"
                        columns={[
                          { key: 'product', header: 'الصنف', render: (line) => <span className="font-semibold text-slate-800 dark:text-slate-200">{line.productName}</span> },
                          { key: 'sku', header: 'الكود', render: (line) => <span className="font-mono text-slate-500 dark:text-slate-400">{line.sku || '—'}</span> },
                          { key: 'grade', header: 'الفرز', render: (line) => <span className="text-slate-500 dark:text-slate-400">{line.grade || '—'}</span> },
                          { key: 'qty', header: 'الكمية', render: (line) => <span className="tabular-nums">{plain(line.quantityM2)}</span> },
                          { key: 'boxes', header: 'الكراتين', render: (line) => <span className="tabular-nums">{plain(line.boxesCount)}</span> },
                          { key: 'cost', header: 'تكلفة الوحدة', render: (line) => <span className="tabular-nums">{fmt(line.unitCost)}</span> },
                          { key: 'total', header: 'الإجمالي', render: (line) => <span className="font-bold tabular-nums">{fmt(line.totalCost)}</span> },
                        ]}
                        emptyTitle="لا توجد أصناف مسجلة لهذه الفاتورة"
                      />
                    </div>
                    <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 text-[11px] dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">قبل الخصم</span><span className="font-semibold tabular-nums">{fmt(row.subtotal)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">الخصم</span><span className="font-semibold tabular-nums">{fmt(row.discount)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">الضريبة</span><span className="font-semibold tabular-nums">{fmt(row.tax)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">الشحن</span><span className="font-semibold tabular-nums">{fmt(row.shippingCost)}</span></div>
                      <div className="flex justify-between border-t border-slate-200 pt-1.5 text-xs dark:border-slate-700"><span className="font-bold">الإجمالي</span><span className="font-black tabular-nums">{fmt(row.total)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">طريقة السداد</span><span className="font-semibold">{PAY_LABEL[row.paymentType] || row.paymentType}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">بواسطة</span><span className="font-semibold">{row.createdByName || '—'}</span></div>
                      {row.notes && <p className="border-t border-slate-200 pt-1.5 text-slate-500 dark:border-slate-700 dark:text-slate-400">{row.notes}</p>}
                      <button type="button" onClick={() => onPrint(row)} className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                        <Printer className="h-3 w-3" /> طباعة الفاتورة
                      </button>
                    </div>
                  </div>
                </div>
              );
            }}
            columns={[
              {
                key: 'expand', header: '', width: 32,
                render: (row) => {
                  const isOpen = expanded === row.id;
                  return (
                    <button
                      type="button"
                      onClick={() => onToggleExpanded(row.id)}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'طي' : 'عرض'} أصناف الفاتورة ${row.invoiceNumber}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  );
                },
              },
              {
                key: 'invoice', header: (
                  <button type="button" onClick={() => onSort('invoiceNumber')} className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200">
                    الفاتورة <ArrowUpDown className="h-3 w-3" /> <span aria-hidden="true">{sortIndicator(sortKey, sortDir, 'invoiceNumber')}</span>
                  </button>
                ),
                render: (row) => <span className="whitespace-nowrap font-mono font-bold text-orange-700 dark:text-orange-300">{row.invoiceNumber}</span>,
              },
              {
                key: 'time', header: (
                  <button type="button" onClick={() => onSort('createdAt')} className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200">
                    الوقت <ArrowUpDown className="h-3 w-3" /> <span aria-hidden="true">{sortIndicator(sortKey, sortDir, 'createdAt')}</span>
                  </button>
                ),
                render: (row) => <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">{timeOf(row.createdAt)}</span>,
              },
              {
                key: 'supplier', header: (
                  <button type="button" onClick={() => onSort('supplierName')} className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200">
                    المورد <ArrowUpDown className="h-3 w-3" /> <span aria-hidden="true">{sortIndicator(sortKey, sortDir, 'supplierName')}</span>
                  </button>
                ),
                render: (row) => (
                  <span>
                    <span className="block font-semibold text-slate-900 dark:text-slate-100">{row.supplierName || '—'}</span>
                    {row.supplierPhone && <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400" dir="ltr">{row.supplierPhone}</span>}
                  </span>
                ),
              },
              { key: 'supplierInvoice', header: 'فاتورة المورد', render: (row) => <span className="whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-300">{row.supplierInvoiceNumber || <span className="text-amber-600 dark:text-amber-400">—</span>}</span> },
              { key: 'warehouse', header: 'المخزن', render: (row) => <span className="whitespace-nowrap text-slate-600 dark:text-slate-300">{row.warehouseName || '—'}</span> },
              {
                key: 'items', header: (
                  <button type="button" onClick={() => onSort('itemsCount')} className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200">
                    الأصناف <ArrowUpDown className="h-3 w-3" /> <span aria-hidden="true">{sortIndicator(sortKey, sortDir, 'itemsCount')}</span>
                  </button>
                ),
                render: (row) => <span className="tabular-nums text-slate-600 dark:text-slate-300">{plain(row.itemsCount)}</span>,
              },
              {
                key: 'total', header: (
                  <button type="button" onClick={() => onSort('total')} className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200">
                    الإجمالي <ArrowUpDown className="h-3 w-3" /> <span aria-hidden="true">{sortIndicator(sortKey, sortDir, 'total')}</span>
                  </button>
                ),
                render: (row) => <span className="whitespace-nowrap font-black tabular-nums text-slate-900 dark:text-slate-100">{fmt(row.total)}</span>,
              },
              {
                key: 'paid', header: (
                  <button type="button" onClick={() => onSort('paid')} className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200">
                    المدفوع <ArrowUpDown className="h-3 w-3" /> <span aria-hidden="true">{sortIndicator(sortKey, sortDir, 'paid')}</span>
                  </button>
                ),
                render: (row) => <span className="whitespace-nowrap font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(row.paid)}</span>,
              },
              {
                key: 'remaining', header: (
                  <button type="button" onClick={() => onSort('remaining')} className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200">
                    المتبقي <ArrowUpDown className="h-3 w-3" /> <span aria-hidden="true">{sortIndicator(sortKey, sortDir, 'remaining')}</span>
                  </button>
                ),
                render: (row) => <span className={`whitespace-nowrap font-semibold tabular-nums ${row.remaining > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>{fmt(row.remaining)}</span>,
              },
              { key: 'status', header: 'الحالة', render: (row) => <StatusBadge status={row.paymentStatus} /> },
              {
                key: 'tax', header: 'الضريبة / الشحن',
                render: (row) => (
                  <span className="whitespace-nowrap text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">{fmt(row.tax)}</span>
                    <span className="mx-1 text-slate-400">/</span>
                    <span>{fmt(row.shippingCost)}</span>
                  </span>
                ),
              },
              {
                key: 'actions', header: 'إجراءات',
                render: (row) => (
                  <div className="flex items-center gap-1">
                    {canPay && row.remaining > 0 && (
                      <button type="button" title="سداد للمورد" aria-label={`سداد للمورد عن الفاتورة ${row.invoiceNumber}`} onClick={() => onPay(row)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950">
                        <HandCoins className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button type="button" title="التفاصيل" aria-label={`تفاصيل الفاتورة ${row.invoiceNumber}`} onClick={() => onDetails(row.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="طباعة" aria-label={`طباعة الفاتورة ${row.invoiceNumber}`} onClick={() => onPrint(row)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                    {canDelete && (
                      <button type="button" title="حذف" aria-label={`حذف الفاتورة ${row.invoiceNumber}`} onClick={() => onDelete(row)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200 px-3 py-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            عرض {plain(filteredCount === 0 ? 0 : (page - 1) * pageSize + 1)}–{plain(Math.min(page * pageSize, filteredCount))} من {plain(filteredCount)} فاتورة
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              لكل صفحة
              <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} aria-label="الصفحة السابقة" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <ChevronLeft className="h-4 w-4 rotate-180" />
              </button>
              <span className="min-w-[70px] text-center text-[11px] font-bold tabular-nums text-slate-600 dark:text-slate-300">صفحة {plain(page)} من {plain(pageCount)}</span>
              <button type="button" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount} aria-label="الصفحة التالية" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </>
    )}
  </div>
);
