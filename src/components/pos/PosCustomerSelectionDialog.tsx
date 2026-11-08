import React, { Profiler, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, LoaderCircle, Search, Users, X } from 'lucide-react';
import type { Customer } from '../../types';
import type { CustomerService } from '../../services/CustomerService';
import { CeramicMath } from '../../utils/ceramicMath';
import { CUSTOMER_TYPE_LABELS } from './customerLabels';
import { reportSlowReactRender } from '../../services/rendererPerformanceMonitor';

type CustomerPage = ReturnType<CustomerService['getCustomersPage']>;
type CustomerTypeFilter = Customer['customerType'] | 'ALL';
type CustomerStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

interface PosCustomerSelectionDialogProps {
  isOpen: boolean;
  customerService: Pick<CustomerService, 'getCustomersPage'>;
  selectedCustomerId?: string;
  onClose: () => void;
  onSelectCustomer: (customer: Customer) => void;
}

const PAGE_SIZE = 25;

export const PosCustomerSelectionDialog: React.FC<PosCustomerSelectionDialogProps> = ({
  isOpen,
  customerService,
  selectedCustomerId,
  onClose,
  onSelectCustomer,
}) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [customerType, setCustomerType] = useState<CustomerTypeFilter>('ALL');
  const [status, setStatus] = useState<CustomerStatusFilter>('ACTIVE');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<CustomerPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [isOpen, search]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setIsLoading(true);
    setError('');
    const timer = window.setTimeout(() => {
      try {
        const nextResult = customerService.getCustomersPage(
          debouncedSearch,
          page,
          PAGE_SIZE,
          {},
          {
            customerType: customerType === 'ALL' ? undefined : customerType,
            status: status === 'ALL' ? undefined : status,
          },
        );
        if (!cancelled) {
          setResult(nextResult);
          setIsLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل قائمة العملاء.');
          setIsLoading(false);
        }
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customerService, customerType, debouncedSearch, isOpen, page, reloadToken, status]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totalItems = result?.totalItems ?? 0;
  const firstItem = totalItems === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(page * PAGE_SIZE, totalItems);

  const dialog = createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        id="pos-customer-list"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-customer-dialog-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="pos-customer-dialog-title" className="text-base font-black">اختيار عميل</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {isLoading && !result ? 'جارٍ تحميل العملاء…' : `${totalItems.toLocaleString('ar-EG')} عميل`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة اختيار العميل"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40 sm:grid-cols-[minmax(0,1fr)_190px_170px]">
          <label className="relative block">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="ابحث بالاسم أو الهاتف أو كود العميل"
              aria-label="البحث عن عميل"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-9 pl-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <label className="sr-only" htmlFor="pos-customer-type-filter">نوع العميل</label>
          <select
            id="pos-customer-type-filter"
            value={customerType}
            onChange={(event) => {
              setCustomerType(event.target.value as CustomerTypeFilter);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="ALL">كل أنواع العملاء</option>
            {Object.entries(CUSTOMER_TYPE_LABELS).map(([type, label]) => (
              <option key={type} value={type}>{label}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="pos-customer-status-filter">حالة العميل</label>
          <select
            id="pos-customer-status-filter"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as CustomerStatusFilter);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="ALL">كل الحالات</option>
            <option value="ACTIVE">نشط</option>
            <option value="INACTIVE">موقوف</option>
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {error ? (
            <div role="alert" className="flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm font-bold text-rose-700 dark:text-rose-300">{error}</p>
              <button
                type="button"
                onClick={() => setReloadToken((token) => token + 1)}
                className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-bold text-white hover:bg-sky-800"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : isLoading ? (
            <div role="status" className="flex min-h-56 items-center justify-center gap-2 text-sm text-slate-500">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              جارٍ تحميل العملاء…
            </div>
          ) : result?.items.length ? (
            <table className="w-full min-w-[680px] text-right text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">العميل</th>
                  <th className="px-4 py-3">الهاتف</th>
                  <th className="px-4 py-3">النوع</th>
                  <th className="px-4 py-3">الرصيد</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {result.items.map((customer) => {
                  const isActive = customer.isActive !== 0;
                  const isSelected = customer.id === selectedCustomerId;
                  return (
                    <tr key={customer.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-3">
                        <div className="font-bold">{customer.name}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">{customer.code}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{customer.phone}</td>
                      <td className="px-4 py-3 text-xs">{CUSTOMER_TYPE_LABELS[customer.customerType]}</td>
                      <td className="px-4 py-3 text-xs font-bold tabular-nums">{CeramicMath.formatCurrency(customer.currentBalance)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                          {isActive ? 'نشط' : 'موقوف'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={!isActive}
                          onClick={() => {
                            onSelectCustomer(customer);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                        >
                          {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                          {isSelected ? 'محدد' : 'اختيار'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center gap-2 p-6 text-center">
              <Users className="h-9 w-9 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">لا توجد عملاء مطابقة</p>
              <p className="text-xs text-slate-400">جرّب تغيير البحث أو الفلاتر.</p>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs dark:border-slate-700">
          <span className="text-slate-500 dark:text-slate-400">
            عرض {firstItem}–{lastItem} من {totalItems.toLocaleString('ar-EG')}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!result || page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40 dark:border-slate-700"
            >
              <ChevronRight className="h-4 w-4" /> السابق
            </button>
            <span aria-live="polite" className="min-w-16 text-center font-bold">{page} / {result?.totalPages ?? 1}</span>
            <button
              type="button"
              disabled={!result || page >= result.totalPages || isLoading}
              onClick={() => setPage((current) => current + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40 dark:border-slate-700"
            >
              التالي <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );

  return import.meta.env.DEV ? (
    <Profiler id="POS customer selection dialog" onRender={reportSlowReactRender}>
      {dialog}
    </Profiler>
  ) : dialog;
};
