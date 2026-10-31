import React from 'react';
import { UserPlus } from 'lucide-react';
import type { Customer } from '../../types';
import { CeramicMath } from '../../utils/ceramicMath';

export const CUSTOMER_TYPE_LABELS: Record<Customer['customerType'], string> = {
  RETAIL: 'قطاعي',
  CONTRACTOR: 'مقاول',
  WHOLESALE: 'جملة',
  ENGINEER: 'مهندس',
};

export interface PosCustomerPickerProps {
  selectedCustomer: Customer | null;
  customerSearch: string;
  filteredCustomers: Customer[];
  canCreateCustomer: boolean;
  onSearchChange: (value: string) => void;
  onSelectCustomer: (customer: Customer) => void;
  onCreateNewCustomer: () => void;
}

export const PosCustomerPicker: React.FC<PosCustomerPickerProps> = ({
  selectedCustomer,
  customerSearch,
  filteredCustomers,
  canCreateCustomer,
  onSearchChange,
  onSelectCustomer,
  onCreateNewCustomer,
}) => (
  <div className="p-3 border-b border-slate-200 space-y-2 bg-slate-50/70">
    <div className="flex items-center justify-between text-xs font-bold text-slate-500">
      <span className="flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> العميل</span>
      {canCreateCustomer && <button
        onClick={onCreateNewCustomer}
        className="text-[11px] text-sky-600 hover:text-sky-700"
      >+ عميل جديد</button>}
    </div>
    <div className="relative">
      <input
        id="pos-customer-search"
        value={selectedCustomer ? selectedCustomer.name : customerSearch}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="ابحث عن عميل بالاسم أو الهاتف..."
        aria-label="بحث العميل"
        className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500"
      />
      {!selectedCustomer && customerSearch.trim() && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl shadow-2xl">
          {filteredCustomers.length === 0 ? (
            <div className="p-3 text-[11px] text-slate-500">لا نتائج</div>
          ) : (
            filteredCustomers.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectCustomer(c)}
                className="w-full text-right px-3 py-2 hover:bg-slate-100 text-xs text-slate-800 border-b border-slate-200 last:border-0"
              >
                <div className="font-bold">{c.name}</div>
                <div className="text-[10px] text-slate-500">{c.phone} {c.currentBalance > 0 ? `• مديونية ${c.currentBalance}` : ''}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
    {selectedCustomer && (
      <div className="flex items-center justify-between text-[11px] bg-white rounded-lg px-2.5 py-1.5 border border-slate-200">
        <span className="text-slate-500">{CUSTOMER_TYPE_LABELS[selectedCustomer.customerType]}</span>
        <span className={selectedCustomer.currentBalance > 0 ? 'text-amber-600 font-bold' : 'text-slate-500'}>
          الرصيد: {CeramicMath.formatCurrency(selectedCustomer.currentBalance)}
        </span>
      </div>
    )}
  </div>
);
