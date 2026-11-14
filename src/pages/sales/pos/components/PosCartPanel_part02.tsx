import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { CartLine } from './CartLine';
import { PosCustomerPicker } from './PosCustomerPicker';
import type { PosCartPanelProps } from './PosCartPanel_part01';

export const PosCartPanel: React.FC<PosCartPanelProps> = ({
  selectedCustomer,
  customerService,
  customerSearch,
  filteredCustomers,
  hasMoreCustomers,
  onLoadMoreCustomers,
  canCreateCustomer,
  canSearchTaxNumber,
  canViewCustomerFinancials,
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
  recentlyRemoved,
  onUndoRemove,
  sellingPriceTiersCount = 1,
  sellingPriceTierNames = [],
  activeCartIndex,
  onSelectCartLine,
  customerSummary,
  onClearCustomer,
}) => (
  <>
    <PosCustomerPicker
      selectedCustomer={selectedCustomer}
      customerService={customerService}
      customerSearch={customerSearch}
      filteredCustomers={filteredCustomers}
      hasMoreCustomers={hasMoreCustomers}
      onLoadMoreCustomers={onLoadMoreCustomers}
      canCreateCustomer={canCreateCustomer}
      canSearchTaxNumber={canSearchTaxNumber}
      canViewCustomerFinancials={canViewCustomerFinancials}
      onSearchChange={onCustomerSearchChange}
      onSelectCustomer={onSelectCustomer}
      onCreateNewCustomer={onCreateNewCustomer}
      onClearCustomer={onClearCustomer}
      customerSummary={customerSummary}
    />

    {recentlyRemoved && onUndoRemove && (
      <div className="px-3 pt-2" role="status" aria-live="polite">
        <button
          type="button"
          onClick={onUndoRemove}
          className="w-full px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold transition"
        >
          تم حذف {recentlyRemoved.product?.name || 'المنتج'} من السلة — تراجع
        </button>
      </div>
    )}
    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
      <span className="font-black text-slate-800 dark:text-slate-100">سلة البيع <span className="font-semibold text-slate-500 dark:text-slate-400">({cart.length} أصناف)</span></span>
      {cart.length > 0 && <span className="text-slate-600 dark:text-slate-300">{cart.length} بنود{cartQuantitySummary ? ` · ${cartQuantitySummary}` : ''}</span>}
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 space-y-2">
      {cart.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center text-slate-600">
          <ShoppingCart className="w-12 h-12 mb-2 opacity-40" />
          <p className="text-xs font-bold">السلة فارغة</p>
          <p className="text-[11px]">انقر على أي صنف لإضافته، أو امسح الباركود</p>
        </div>
      ) : (
        cart.map((item, index) => (
          <CartLine
            key={`${item.product.id}-${index}`}
            item={item}
            index={index}
            enableNegativeStock={enableNegativeStock}
            gradeLabel={gradeLabel}
            onRemove={(removedIndex) => {
              onRemove(removedIndex);
              if (activeCartIndex === removedIndex) {
                const nextIndex = Math.min(removedIndex, cart.length - 2);
                if (nextIndex >= 0) onSelectCartLine?.(nextIndex);
              }
              else if (activeCartIndex !== undefined && activeCartIndex !== null && activeCartIndex > removedIndex) onSelectCartLine?.(activeCartIndex - 1);
            }}
            onUpdateUnit={onUpdateUnit}
            onStepQuantity={onStepQuantity}
            onUpdateQuantity={onUpdateQuantity}
            onUpdatePrice={onUpdatePrice}
            onUpdateLineDiscount={onUpdateLineDiscount}
            sellingPriceTiersCount={sellingPriceTiersCount}
            sellingPriceTierNames={sellingPriceTierNames}
            isActive={activeCartIndex === index}
            onSelect={onSelectCartLine}
          />
        ))
      )}
    </div>
  </>
);
