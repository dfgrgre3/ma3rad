import React, { Profiler, useEffect, useState } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, LoaderCircle, Search, Users, X } from 'lucide-react';
import type { Customer } from '../../../../types';
import type { CustomerService } from '../../../../services/domains/customers/CustomerService';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { CUSTOMER_TYPE_LABELS } from './customerLabels';
import { reportSlowReactRender } from '../../../../services/shared/rendererPerformanceMonitor';

type CustomerPage = Awaited<ReturnType<CustomerService['getCustomersPageAsync']>>;
type CustomerTypeFilter = Customer['customerType'] | 'ALL';
type CustomerStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

interface PosCustomerSelectionDialogProps {
  isOpen: boolean;
  customerService: Pick<CustomerService, 'getCustomersPageAsync'>;
  selectedCustomerId?: string;
  canSearchTaxNumber?: boolean;
  onClose: () => void;
  onSelectCustomer: (customer: Customer) => void;
}

const PAGE_SIZE = 25;

export const PosCustomerSelectionDialog: React.FC<PosCustomerSelectionDialogProps> = ({
  isOpen,
  customerService,
  selectedCustomerId,
  canSearchTaxNumber = false,
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
      (async () => {
        try {
          const nextResult = await customerService.getCustomersPageAsync(
            debouncedSearch,
            page,
            PAGE_SIZE,
            {},
            {
              customerType: customerType === 'ALL' ? undefined : customerType,
              status: status === 'ALL' ? undefined : status,
                includeTaxNumber: canSearchTaxNumber,
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
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canSearchTaxNumber, customerService, customerType, debouncedSearch, isOpen, page, reloadToken, status]);

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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-primary/55 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        id="pos-customer-list"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-customer-dialog-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-2xl "
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 ">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-primary dark:bg-primary/40 ">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="pos-customer-dialog-title" className="text-base font-black">اختيار عميل</h2>
              <p className="mt-0.5 text-xs text-muted ">
                {isLoading && !result ? 'جارٍ تحميل العملاء…' : `${totalItems.toLocaleString('ar-EG')} عميل`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة اختيار العميل"
            className="rounded-lg p-2 text-muted transition hover:bg-surface-sunken hover:text-ink dark:hover:bg-primary dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-3 border-b border-line bg-surface-muted/70 p-4 dark:bg-primary/40 sm:grid-cols-[minmax(0,1fr)_190px_170px]">
          <label className="relative block">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="ابحث بالاسم أو الهاتف أو كود العميل"
              aria-label="البحث عن عميل"
              className="w-full rounded-xl border border-line bg-surface py-2.5 pr-9 pl-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 "
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
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary "
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
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary "
          >
            <option value="ALL">كل الحالات</option>
            <option value="ACTIVE">نشط</option>
            <option value="INACTIVE">موقوف</option>
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {error ? (
            <div role="alert" className="flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm font-bold text-danger ">{error}</p>
              <button
                type="button"
                onClick={() => setReloadToken((token) => token + 1)}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : isLoading ? (
            <div role="status" className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              جارٍ تحميل العملاء…
            </div>
          ) : result?.items.length ? (
            <DataTable
              ariaLabel="اختيار العميل"
              rows={result.items}
              rowKey={(customer: any) => String(customer.id)}
              minWidth={680}
              tableClassName="selection-list text-sm"
              rowClassName={(customer: any) => `selection-list__row ${customer.id === selectedCustomerId ? 'is-selected' : ''}`}
              columns={[
                {
                  key: 'customer', header: 'العميل',
                  render: (customer: any) => (
                    <div>
                      <div className="font-bold">{customer.name}</div>
                      <div className="selection-list__meta mt-0.5 font-mono text-[11px]">{customer.code}</div>
                    </div>
                  ),
                },
                { key: 'phone', header: 'الهاتف', render: (customer: any) => <span className="selection-list__meta font-mono text-xs">{customer.phone}</span> },
                { key: 'type', header: 'النوع', render: (customer: any) => <span className="text-xs">{(CUSTOMER_TYPE_LABELS as Record<string, string>)[customer.customerType]}</span> },
                { key: 'balance', header: 'الرصيد', render: (customer: any) => <span className="text-xs font-bold tabular-nums">{CeramicMath.formatCurrency(customer.currentBalance)}</span> },
                {
                  key: 'active', header: 'الحالة',
                  render: (customer: any) => {
                    const isActive = customer.isActive !== 0;
                    return (
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${isActive ? 'bg-success-soft text-success dark:bg-success/40 dark:text-success' : 'bg-surface-sunken text-muted dark:bg-primary dark:text-muted'}`}>
                        {isActive ? 'نشط' : 'موقوف'}
                      </span>
                    );
                  },
                },
                {
                  key: 'action', header: 'الإجراء', align: 'center',
                  render: (customer: any) => {
                    const isActive = customer.isActive !== 0;
                    const isSelected = customer.id === selectedCustomerId;
                    return (
                      <button
                        type="button"
                        disabled={!isActive}
                        onClick={() => {
                          onSelectCustomer(customer);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition hover:bg-primary disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-muted dark:disabled:bg-primary dark:disabled:text-muted"
                      >
                        {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                        {isSelected ? 'محدد' : 'اختيار'}
                      </button>
                    );
                  },
                },
              ]}
            />
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center gap-2 p-6 text-center">
              <Users className="h-9 w-9 text-muted " />
              <p className="text-sm font-bold text-ink-secondary ">لا توجد عملاء مطابقة</p>
              <p className="text-xs text-muted">جرّب تغيير البحث أو الفلاتر.</p>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs ">
          <span className="text-muted ">
            عرض {firstItem}–{lastItem} من {totalItems.toLocaleString('ar-EG')}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!result || page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 font-bold disabled:opacity-40 "
            >
              <ChevronRight className="h-4 w-4" /> السابق
            </button>
            <span aria-live="polite" className="min-w-16 text-center font-bold">{page} / {result?.totalPages ?? 1}</span>
            <button
              type="button"
              disabled={!result || page >= result.totalPages || isLoading}
              onClick={() => setPage((current) => current + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 font-bold disabled:opacity-40 "
            >
              التالي <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );

  return import.meta.env?.DEV ? (
    <Profiler id="POS customer selection dialog" onRender={reportSlowReactRender}>
      {dialog}
    </Profiler>
  ) : dialog;
};
