import React from 'react';
import { ShoppingCart } from 'lucide-react';
import type { Customer, Product } from '../../types';
import { CartLine } from './CartLine';
import { PosCustomerPicker } from './PosCustomerPicker';
import type { CartItem, PosUnit } from './types';

export interface PosCartPanelProps {
  selectedCustomer: Customer | null;
  customerSearch: string;
  filteredCustomers: Customer[];
  canCreateCustomer: boolean;
  onCustomerSearchChange: (value: string) => void;
  onSelectCustomer: (customer: Customer) => void;
  onCreateNewCustomer: () => void;
  cart: CartItem[];
  cartQuantitySummary: string;
  enableNegativeStock: boolean;
  gradeLabel: (grade: Product['grade']) => string;
  onRemove: (index: number) => void;
  onUpdateUnit: (index: number, unit: PosUnit) => void;
  onStepQuantity: (index: number, direction: 1 | -1) => void;
  onUpdateQuantity: (index: number, value: number) => void;
  onUpdatePrice: (index: number, value: number) => void;
  onUpdateLineDiscount: (index: number, value: number) => void;
}

export const PosCartPanel: React.FC<PosCartPanelProps> = ({
  selectedCustomer,
  customerSearch,
  filteredCustomers,
  canCreateCustomer,
  onCustomerSearchChange,
  onSelectCustomer,
  onCreateNewCustomer,
  cart,
  cartQuantitySummary,
  enableNegativeStock,
  gradeLabel,
  onRemove,
  onUpdateUnit,
  onStepQuantity,
  onUpdateQuantity,
  onUpdatePrice,
  onUpdateLineDiscount,
}) => (
  <>
    <PosCustomerPicker
      selectedCustomer={selectedCustomer}
      customerSearch={customerSearch}
      filteredCustomers={filteredCustomers}
      canCreateCustomer={canCreateCustomer}
      onSearchChange={onCustomerSearchChange}
      onSelectCustomer={onSelectCustomer}
      onCreateNewCustomer={onCreateNewCustomer}
    />

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
          <CartLine
            key={item.product.id}
            item={item}
            index={index}
            enableNegativeStock={enableNegativeStock}
            gradeLabel={gradeLabel}
            onRemove={onRemove}
            onUpdateUnit={onUpdateUnit}
            onStepQuantity={onStepQuantity}
            onUpdateQuantity={onUpdateQuantity}
            onUpdatePrice={onUpdatePrice}
            onUpdateLineDiscount={onUpdateLineDiscount}
          />
        ))
      )}
    </div>
  </>
);
