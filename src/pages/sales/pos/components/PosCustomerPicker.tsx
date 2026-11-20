import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, Wallet, CreditCard, Star, Receipt, X, ListFilter } from 'lucide-react';
import type { Customer } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import type { CustomerService } from '../../../../services/domains/customers/CustomerService';
import { CUSTOMER_TYPE_LABELS } from './customerLabels';
import { PosCustomerSelectionDialog } from './PosCustomerSelectionDialog';
import { usePosActivityCopy } from '../../../../hooks/pages/sales/pos/usePosActivityCopy';
import { useBusinessTerm } from '../../../../hooks/domains/config/useBusinessTerm';

export { CUSTOMER_TYPE_LABELS } from './customerLabels';

export interface RecentCustomerInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  totalAmount: number;
  paymentStatus: string;
  remainingAmount: number;
}

export interface CustomerPosSummary {
  loyaltyPoints: number | null;
  recentInvoices: RecentCustomerInvoice[];
}

export interface PosCustomerPickerProps {
  selectedCustomer: Customer | null;
  customerService: Pick<CustomerService, 'getCustomersPageAsync'>;
  customerSearch: string;
  filteredCustomers: Customer[];
  hasMoreCustomers?: boolean;
  onLoadMoreCustomers?: () => void;
  canCreateCustomer: boolean;
  canSearchTaxNumber?: boolean;
  canViewCustomerFinancials?: boolean;
  onSearchChange: (value: string) => void;
  onSelectCustomer: (customer: Customer) => void;
  onCreateNewCustomer: () => void;
  onClearCustomer?: () => void;
  customerSummary?: CustomerPosSummary | null;
}

const paymentStatusLabel = (status: string) => (
  { PAID: 'مدفوعة', PARTIAL: 'جزئي', UNPAID: 'آجلة' }[status] ?? status
);

export const PosCustomerPicker: React.FC<PosCustomerPickerProps> = ({
  selectedCustomer,
  customerService,
  customerSearch,
  filteredCustomers,
  hasMoreCustomers = false,
  onLoadMoreCustomers,
  canCreateCustomer,
  canSearchTaxNumber = false,
  canViewCustomerFinancials = false,
  onSearchChange,
  onSelectCustomer,
  onCreateNewCustomer,
  onClearCustomer,
  customerSummary,
}) => {
  const copy = usePosActivityCopy();
  const customerTerm = useBusinessTerm('entities.customers.singular');
  const [isCustomerSelectionOpen, setIsCustomerSelectionOpen] = useState(false);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const closeCustomerSelection = useCallback(() => setIsCustomerSelectionOpen(false), []);
  useEffect(() => {
    if (!selectedCustomer || selectedCustomer.id === 'cust_cash') return;
    setRecentCustomers((current) => [selectedCustomer, ...current.filter((customer) => customer.id !== selectedCustomer.id)].slice(0, 4));
  }, [selectedCustomer]);
  const isWalkIn = selectedCustomer?.id === 'cust_cash';
  const balance = selectedCustomer?.currentBalance ?? 0;
  const availableCredit = selectedCustomer
    ? Math.max(0, selectedCustomer.creditLimit - Math.max(0, balance))
    : 0;
  const creditUsage = selectedCustomer && selectedCustomer.creditLimit > 0
    ? Math.max(0, balance) / selectedCustomer.creditLimit
    : 0;
  const isOverCreditLimit = Boolean(selectedCustomer && selectedCustomer.creditLimit > 0 && balance > selectedCustomer.creditLimit);
  const isNearCreditLimit = Boolean(selectedCustomer && selectedCustomer.creditLimit > 0 && creditUsage >= 0.8 && !isOverCreditLimit);
  return (
    <div className="shrink-0 space-y-1 border-b border-line bg-surface-muted/70 p-2 dark:bg-primary/70">
      <div className="flex items-center justify-between text-xs font-black text-ink ">
        <span className="flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> {customerTerm}</span>
        <div className="flex items-center gap-2">
          {selectedCustomer && !isWalkIn && onClearCustomer && (
            <button
              type="button"
              onClick={onClearCustomer}
              title="إلغاء اختيار العميل والعودة للبيع النقدي"
              className="flex min-h-10 items-center gap-1 text-xs font-bold text-ink-secondary transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:text-white"
            >
              <X className="w-3.5 h-3.5" /> {copy.walkInLabel}
            </button>
          )}
          {canCreateCustomer && (
            <button onClick={onCreateNewCustomer} className="min-h-10 text-xs font-bold text-primary transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:text-primary">
              + {customerTerm} جديد
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <div className="flex gap-1.5">
          <input
            id="pos-customer-search"
            value={selectedCustomer ? selectedCustomer.name : customerSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={`ابحث بالاسم أو الهاتف أو الكود${canSearchTaxNumber ? ' أو الرقم الضريبي' : ''}… (F3)`}
            aria-label="بحث العميل"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm font-bold text-ink transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 "
          />
          <button
            type="button"
            onClick={() => setIsCustomerSelectionOpen(true)}
            aria-label="عرض قائمة العملاء"
            aria-haspopup="dialog"
            aria-expanded={isCustomerSelectionOpen}
            aria-controls="pos-customer-list"
            title="عرض جميع العملاء"
            className="min-h-11 shrink-0 rounded-lg border border-line bg-surface px-3 text-ink-secondary transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-primary"
          >
            <ListFilter className="w-4 h-4" />
          </button>
        </div>
        {!selectedCustomer && !customerSearch.trim() && recentCustomers.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5" aria-label="عملاء تم اختيارهم مؤخرًا خلال هذه الجلسة">
            <span className="text-[10px] font-bold text-muted">الأخيرة:</span>
            {recentCustomers.map((customer) => (
              <button key={customer.id} type="button" onClick={() => onSelectCustomer(customer)} className="max-w-36 truncate rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-ink hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ">
                {customer.name}
              </button>
            ))}
          </div>
        )}
        {!selectedCustomer && customerSearch.trim() && (
          <div className="selection-list absolute z-20 mt-1 max-h-64 w-full overflow-y-auto">
            {filteredCustomers.length === 0 ? (
              <div className="selection-list__meta p-3 text-xs">لا توجد نتائج مطابقة — يمكنك إنشاء عميل جديد</div>
            ) : (
              filteredCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelectCustomer(c)}
                  className="selection-list__row w-full px-3 py-2.5 text-right text-xs focus-visible:outline-none last:border-0"
                >
                  <div className="font-bold flex items-center justify-between gap-2">
                    <span className="truncate">{c.name}</span>
                    <span className="selection-list__meta shrink-0 font-mono text-xs">{c.phone}</span>
                  </div>
                  <div className="selection-list__meta flex items-center justify-between gap-2 text-xs">
                    <span>{CUSTOMER_TYPE_LABELS[c.customerType]}</span>
                    {canViewCustomerFinancials && c.currentBalance > 0 && <span className="font-bold text-warning ">مدين: {CeramicMath.formatCurrency(c.currentBalance)}</span>}
                    {canViewCustomerFinancials && c.currentBalance < 0 && <span className="font-bold text-success ">دائن: {CeramicMath.formatCurrency(-c.currentBalance)}</span>}
                  </div>
                </button>
              ))
            )}
            {hasMoreCustomers && onLoadMoreCustomers && <button type="button" onClick={onLoadMoreCustomers} className="w-full border-t border-line px-3 py-2 text-xs font-bold text-primary hover:bg-accent-soft">تحميل المزيد من العملاء</button>}
          </div>
        )}
      </div>

      <PosCustomerSelectionDialog
        isOpen={isCustomerSelectionOpen}
        customerService={customerService}
        canSearchTaxNumber={canSearchTaxNumber}
        selectedCustomerId={selectedCustomer?.id}
        onClose={closeCustomerSelection}
        onSelectCustomer={onSelectCustomer}
      />

      {selectedCustomer && (
        <div className="min-w-0 space-y-1">
          {/* اسم العميل ونوعه */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2.5 py-1">
            <div className="min-w-0">
              <p className="text-xs font-black text-ink truncate">{selectedCustomer.name}</p>
              <p className="text-xs text-ink-secondary ">{CUSTOMER_TYPE_LABELS[selectedCustomer.customerType]}{selectedCustomer.code ? ` • كود: ${selectedCustomer.code}` : ''}</p>
            </div>
            {isWalkIn && <span className="shrink-0 rounded-md bg-surface-sunken px-2 py-1 text-xs font-bold text-ink-secondary ">{copy.directSaleBadge}</span>}
          </div>

          {!isWalkIn && canViewCustomerFinancials && (
            <>
            <div className="grid grid-cols-3 gap-x-1">
              {/* الرصيد / المديونية */}
              <div className={`min-w-0 rounded-xl border px-1.5 py-2 text-center ${balance > 0 ? 'border-warning bg-warning-soft dark:border-warning dark:bg-warning/30' : 'border-line dark:border-line-strong'}`} title="الرصيد الحالي للعميل">
              <div className={`flex flex-wrap items-center justify-center gap-1 text-xs font-bold ${balance > 0 ? 'text-warning dark:text-warning' : 'text-muted dark:text-muted'}`}><Wallet className="h-3.5 w-3.5 shrink-0" />{balance > 0 ? 'مديونية العميل' : 'الرصيد'}</div>
              <div className={`mt-0.5 break-words text-sm font-black leading-tight tabular-nums ${balance > 0 ? 'text-warning dark:text-warning' : balance < 0 ? 'text-success dark:text-success' : 'text-ink dark:text-muted'}`}>
                  {CeramicMath.formatCurrency(Math.abs(balance))}
                </div>
                <div className="break-words text-xs leading-tight text-muted ">{balance > 0 ? 'عليه مديونية' : balance < 0 ? 'له رصيد' : 'لا يوجد رصيد'}</div>
              </div>
              {/* الحد الائتماني */}
              <div className="min-w-0 px-1.5 py-1 text-center" title="الحد الائتماني والمتاح منه">
                <div className="flex flex-wrap items-center justify-center gap-1 text-xs font-bold text-muted "><CreditCard className="h-3.5 w-3.5 shrink-0" />الائتمان</div>
                <div className="mt-0.5 break-words text-xs font-black leading-tight tabular-nums text-ink ">{CeramicMath.formatCurrency(selectedCustomer.creditLimit)}</div>
                <div className={`break-words text-xs leading-tight ${availableCredit <= 0 ? 'font-bold text-danger dark:text-danger' : 'text-muted dark:text-muted'}`}>المتاح: {CeramicMath.formatCurrency(availableCredit)}</div>
              </div>
              {/* نقاط الولاء */}
              <div className="min-w-0 px-1.5 py-1 text-center" title="نقاط الولاء المتاحة للاستبدال">
                <div className="flex flex-wrap items-center justify-center gap-1 text-xs font-bold text-muted "><Star className="h-3.5 w-3.5 shrink-0" />الولاء</div>
                <div className="mt-0.5 break-words text-xs font-black leading-tight tabular-nums text-warning ">
                  {customerSummary?.loyaltyPoints != null ? `${customerSummary.loyaltyPoints} نقطة` : '—'}
                </div>
                <div className="break-words text-xs leading-tight text-muted ">نقاط متاحة</div>
              </div>
            </div>

            {(isOverCreditLimit || isNearCreditLimit) && (
              <div role="status" className={`rounded-xl border px-3 py-2 text-xs font-bold ${isOverCreditLimit ? 'border-danger bg-danger-soft text-danger dark:border-danger dark:bg-danger/40 dark:text-danger' : 'border-warning bg-warning-soft text-warning dark:border-warning dark:bg-warning/40 dark:text-warning'}`}>
                {isOverCreditLimit
                  ? `تجاوز العميل حد الائتمان بمقدار ${CeramicMath.formatCurrency(balance - selectedCustomer!.creditLimit)} ج.م.`
                  : `اقترب العميل من حد الائتمان: استُخدم ${Math.round(creditUsage * 100)}٪، والمتاح ${CeramicMath.formatCurrency(availableCredit)} ج.م.`}
              </div>
            )}
            </>
          )}

          {/* آخر تعاملات العميل */}
          {!isWalkIn && canViewCustomerFinancials && customerSummary && customerSummary.recentInvoices.length > 0 && (
            <div className="min-w-0 px-2.5 py-1">
              <div className="mb-1 flex items-center gap-1 text-xs font-bold text-ink-secondary "><Receipt className="h-3.5 w-3.5" />آخر التعاملات</div>
              <ul className="space-y-0.5">
                {customerSummary.recentInvoices.slice(0, 3).map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                    <span className="min-w-0 flex-1 truncate font-mono text-ink-secondary ">{inv.invoiceNumber}</span>
                    <span className="whitespace-nowrap text-muted ">{inv.date?.slice(0, 10)}</span>
                    <span className="whitespace-nowrap font-bold tabular-nums text-ink ">{CeramicMath.formatCurrency(inv.totalAmount)}</span>
                    <span className={`whitespace-nowrap text-xs font-bold ${inv.remainingAmount > 0 ? 'text-warning dark:text-warning' : 'text-success dark:text-success'}`}>
                      {paymentStatusLabel(inv.paymentStatus)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
