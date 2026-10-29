import React from 'react';
import { ShoppingCart, UserPlus } from 'lucide-react';
import type { Customer } from '../../../types';
import { CeramicMath } from '../../../utils/ceramicMath';
import { type CartItem, type PosUnit } from '../../../components/pos/types';
import { PosCartLine } from './PosCartLine';
import type { Product } from '../../../types';

const CUST_LABELS: Record<Customer['customerType'], string> = {
  RETAIL: 'قطاعي', CONTRACTOR: 'مقاول', WHOLESALE: 'جملة', ENGINEER: 'مهندس',
};

interface PosCartSectionProps {
  cart: CartItem[];
  cartQuantitySummary: string;
  selectedCustomer: Customer | null;
  customerSearch: string;
  filteredCustomers: Customer[];
  enableNegativeStock: boolean;
  gradeLabel: (grade: Product['grade']) => string;
  canCreateCustomer: boolean;
  onCustomerSearch: (v: string) => void;
  onSelectCustomer: (c: Customer) => void;
  onClearCustomer: () => void;
  onNewCustomerOpen: () => void;
  onRemove: (i: number) => void;
  onUpdateUnit: (i: number, u: PosUnit) => void;
  onStepQuantity: (i: number, d: 1 | -1) => void;
  onUpdateQuantity: (i: number, v: number) => void;
  onUpdatePrice: (i: number, v: number) => void;
  onUpdateLineDiscount: (i: number, v: number) => void;
}

export const PosCartSection: React.FC<PosCartSectionProps> = ({
  cart, cartQuantitySummary, selectedCustomer, customerSearch, filteredCustomers,
  enableNegativeStock, gradeLabel, canCreateCustomer,
  onCustomerSearch, onSelectCustomer, onClearCustomer, onNewCustomerOpen,
  onRemove, onUpdateUnit, onStepQuantity, onUpdateQuantity, onUpdatePrice, onUpdateLineDiscount,
}) => (
  <div className="w-[26rem] max-w-[90vw] bg-white flex flex-col h-full border-r border-slate-200 shadow-2xl shrink-0 max-[900px]:w-full max-[900px]:h-[48%]">
    <div className="p-3 border-b border-slate-200 space-y-2 bg-slate-50/70">
      <div className="flex items-center justify-between text-xs font-bold text-slate-500">
        <span className="flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> العميل</span>
        {canCreateCustomer && (
          <button onClick={onNewCustomerOpen} className="text-[11px] text-sky-600 hover:text-sky-700">
            + عميل جديد
          </button>
        )}
      </div>
      <div className="relative">
        <input
          id="pos-customer-search"
          value={selectedCustomer ? selectedCustomer.name : customerSearch}
          onChange={(e) => { onCustomerSearch(e.target.value); onClearCustomer(); }}
          placeholder="ابحث عن عميل بالاسم أو الهاتف..."
          aria-label="بحث العميل"
          className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500"
        />
        {!selectedCustomer && customerSearch.trim() && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl shadow-2xl">
            {filteredCustomers.length === 0
              ? <div className="p-3 text-[11px] text-slate-500">لا نتائج</div>
              : filteredCustomers.map((c) => (
                <button key={c.id} onClick={() => onSelectCustomer(c)}
                  className="w-full text-right px-3 py-2 hover:bg-slate-100 text-xs text-slate-800 border-b border-slate-200 last:border-0">
                  <div className="font-bold">{c.name}</div>
                  <div className="text-[10px] text-slate-500">{c.phone}{c.currentBalance > 0 ? ` • مديونية ${c.currentBalance}` : ''}</div>
                </button>
              ))
            }
          </div>
        )}
      </div>
      {selectedCustomer && (
        <div className="flex items-center justify-between text-[11px] bg-white rounded-lg px-2.5 py-1.5 border border-slate-200">
          <span className="text-slate-500">{CUST_LABELS[selectedCustomer.customerType]}</span>
          <span className={selectedCustomer.currentBalance > 0 ? 'text-amber-600 font-bold' : 'text-slate-500'}>
            الرصيد: {CeramicMath.formatCurrency(selectedCustomer.currentBalance)}
          </span>
        </div>
      )}
    </div>

    <div className="px-3 pt-3 pb-2 flex items-center justify-between text-[11px]">
      <span className="font-black text-slate-700">سلة البيع <span className="text-slate-400 font-semibold">({cart.length} أصناف)</span></span>
      {cart.length > 0 && <span className="text-slate-500">{cart.length} بنود{cartQuantitySummary ? ` · ${cartQuantitySummary}` : ''}</span>}
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2.5">
      {cart.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center text-slate-600">
          <ShoppingCart className="w-12 h-12 mb-2 opacity-40" />
          <p className="text-xs font-bold">السلة فارغة</p>
          <p className="text-[11px]">انقر على أي صنف لإضافته، أو امسح الباركود</p>
        </div>
      ) : (
        cart.map((item, index) => (
          <PosCartLine key={item.product.id} item={item} index={index}
            enableNegativeStock={enableNegativeStock} gradeLabel={gradeLabel}
            onRemove={onRemove} onUpdateUnit={onUpdateUnit} onStepQuantity={onStepQuantity}
            onUpdateQuantity={onUpdateQuantity} onUpdatePrice={onUpdatePrice} onUpdateLineDiscount={onUpdateLineDiscount}
          />
        ))
      )}
    </div>
  </div>
);
