import React, { useCallback, useState } from 'react';
import { UserPlus, Wallet, CreditCard, Star, Receipt, X, ListFilter } from 'lucide-react';
import type { Customer } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import type { CustomerService } from '../../../../services/domains/customers/CustomerService';
import { CUSTOMER_TYPE_LABELS } from './customerLabels';
import { PosCustomerSelectionDialog } from './PosCustomerSelectionDialog';

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
  customerService: Pick<CustomerService, 'getCustomersPage'>;
  customerSearch: string;
  filteredCustomers: Customer[];
  hasMoreCustomers?: boolean;
  onLoadMoreCustomers?: () => void;
  canCreateCustomer: boolean;
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
  onSearchChange,
  onSelectCustomer,
  onCreateNewCustomer,
  onClearCustomer,
  customerSummary,
}) => {
  const [isCustomerSelectionOpen, setIsCustomerSelectionOpen] = useState(false);
  const closeCustomerSelection = useCallback(() => setIsCustomerSelectionOpen(false), []);
  const isWalkIn = selectedCustomer?.id === 'cust_cash';
  const balance = selectedCustomer?.currentBalance ?? 0;
  const availableCredit = selectedCustomer
    ? Math.max(0, selectedCustomer.creditLimit - Math.max(0, balance))
    : 0;
  return (
    <div className="shrink-0 space-y-1 border-b border-slate-200 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-200">
        <span className="flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> العميل</span>
        <div className="flex items-center gap-2">
          {selectedCustomer && !isWalkIn && onClearCustomer && (
            <button
              type="button"
              onClick={onClearCustomer}
              title="إلغاء اختيار العميل والعودة للبيع النقدي"
              className="flex min-h-10 items-center gap-1 text-xs font-bold text-slate-600 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-300 dark:hover:text-white"
            >
              <X className="w-3.5 h-3.5" /> عميل نقدي
            </button>
          )}
          {canCreateCustomer && (
            <button onClick={onCreateNewCustomer} className="min-h-10 text-xs font-bold text-sky-700 transition hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-400 dark:hover:text-sky-300">
              + عميل جديد
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
            placeholder="ابحث بالاسم أو الهاتف أو الكود… (F3)"
            aria-label="بحث العميل"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => setIsCustomerSelectionOpen(true)}
            aria-label="عرض قائمة العملاء"
            aria-haspopup="dialog"
            aria-expanded={isCustomerSelectionOpen}
            aria-controls="pos-customer-list"
            title="عرض جميع العملاء"
            className="min-h-11 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ListFilter className="w-4 h-4" />
          </button>
        </div>
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
                    {c.currentBalance > 0 && <span className="font-bold text-amber-700 dark:text-amber-400">مدين: {CeramicMath.formatCurrency(c.currentBalance)}</span>}
                    {c.currentBalance < 0 && <span className="font-bold text-emerald-700 dark:text-emerald-400">دائن: {CeramicMath.formatCurrency(-c.currentBalance)}</span>}
                  </div>
                </button>
              ))
            )}
            {hasMoreCustomers && onLoadMoreCustomers && <button type="button" onClick={onLoadMoreCustomers} className="w-full border-t border-slate-100 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50">تحميل المزيد من العملاء</button>}
          </div>
        )}
      </div>

      <PosCustomerSelectionDialog
        isOpen={isCustomerSelectionOpen}
        customerService={customerService}
        selectedCustomerId={selectedCustomer?.id}
        onClose={closeCustomerSelection}
        onSelectCustomer={onSelectCustomer}
      />

      {selectedCustomer && (
        <div className="min-w-0 space-y-1">
          {/* اسم العميل ونوعه */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2.5 py-1">
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-800 truncate">{selectedCustomer.name}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{CUSTOMER_TYPE_LABELS[selectedCustomer.customerType]}{selectedCustomer.code ? ` • كود: ${selectedCustomer.code}` : ''}</p>
            </div>
            {isWalkIn && <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">بيع نقدي مباشر</span>}
          </div>

          {!isWalkIn && (
            <div className="grid grid-cols-3 gap-x-1">
              {/* الرصيد / المديونية */}
              <div className="min-w-0 px-1.5 py-1 text-center" title="الرصيد الحالي للعميل">
              <div className="flex flex-wrap items-center justify-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400"><Wallet className="h-3.5 w-3.5 shrink-0" />الرصيد</div>
              <div className={`mt-0.5 break-words text-xs font-black leading-tight tabular-nums ${balance > 0 ? 'text-amber-600 dark:text-amber-400' : balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                  {CeramicMath.formatCurrency(Math.abs(balance))}
                </div>
                <div className="break-words text-xs leading-tight text-slate-500 dark:text-slate-400">{balance > 0 ? 'عليه مديونية' : balance < 0 ? 'له رصيد' : 'لا يوجد رصيد'}</div>
              </div>
              {/* الحد الائتماني */}
              <div className="min-w-0 px-1.5 py-1 text-center" title="الحد الائتماني والمتاح منه">
                <div className="flex flex-wrap items-center justify-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400"><CreditCard className="h-3.5 w-3.5 shrink-0" />الائتمان</div>
                <div className="mt-0.5 break-words text-xs font-black leading-tight tabular-nums text-slate-800 dark:text-slate-200">{CeramicMath.formatCurrency(selectedCustomer.creditLimit)}</div>
                <div className={`break-words text-xs leading-tight ${availableCredit <= 0 ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>المتاح: {CeramicMath.formatCurrency(availableCredit)}</div>
              </div>
              {/* نقاط الولاء */}
              <div className="min-w-0 px-1.5 py-1 text-center" title="نقاط الولاء المتاحة للاستبدال">
                <div className="flex flex-wrap items-center justify-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400"><Star className="h-3.5 w-3.5 shrink-0" />الولاء</div>
                <div className="mt-0.5 break-words text-xs font-black leading-tight tabular-nums text-amber-700 dark:text-amber-400">
                  {customerSummary?.loyaltyPoints != null ? `${customerSummary.loyaltyPoints} نقطة` : '—'}
                </div>
                <div className="break-words text-xs leading-tight text-slate-500 dark:text-slate-400">نقاط متاحة</div>
              </div>
            </div>
          )}

          {/* آخر تعاملات العميل */}
          {!isWalkIn && customerSummary && customerSummary.recentInvoices.length > 0 && (
            <div className="min-w-0 px-2.5 py-1">
              <div className="mb-1 flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300"><Receipt className="h-3.5 w-3.5" />آخر التعاملات</div>
              <ul className="space-y-0.5">
                {customerSummary.recentInvoices.slice(0, 3).map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                    <span className="min-w-0 flex-1 truncate font-mono text-slate-600 dark:text-slate-300">{inv.invoiceNumber}</span>
                    <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">{inv.date?.slice(0, 10)}</span>
                    <span className="whitespace-nowrap font-bold tabular-nums text-slate-800 dark:text-slate-200">{CeramicMath.formatCurrency(inv.totalAmount)}</span>
                    <span className={`whitespace-nowrap text-xs font-bold ${inv.remainingAmount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
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
