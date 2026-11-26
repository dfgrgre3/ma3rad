import React, { useState } from 'react';
import { ListChecks, ShoppingCart, Trash2 } from 'lucide-react';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { CartLine } from './CartLine';
import { PosCustomerPicker } from './PosCustomerPicker';
import { PosSubstituteDialog } from './PosSubstituteDialog';
import type { PosCartPanelProps } from './PosCartPanel_part01';
import { usePosActivityCopy } from '../../../../hooks/pages/sales/pos/usePosActivityCopy';

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
  canDiscount = true,
  onBulkLineDiscount,
  onRemoveCartLines,
  onReplaceCartItem,
  costInfoByProductId,
  cartProfitSummary,
  recentlyRemoved,
  onUndoRemove,
  sellingPriceTiersCount = 1,
  sellingPriceTierNames = [],
  activeCartIndex,
  onSelectCartLine,
  customerSummary,
  onClearCustomer,
  onOpenCustomerProfile,
  onEditSerials,
}) => {
  const copy = usePosActivityCopy();
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [substituteIndex, setSubstituteIndex] = useState<number | null>(null);
  const [bulkDiscountPercent, setBulkDiscountPercent] = useState('');

  const toggleLineSelection = (index: number) => {
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };
  const exitBulkMode = () => { setBulkMode(false); setSelectedIndexes(new Set()); };
  const effectiveSelected = [...selectedIndexes].filter((i) => i < cart.length);

  return (
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
      onOpenProfile={onOpenCustomerProfile}
    />

    {recentlyRemoved && onUndoRemove && (
      <div className="px-3 pt-2" role="status" aria-live="polite">
        <button
          type="button"
          onClick={onUndoRemove}
          className="w-full px-3 py-1.5 bg-warning-soft hover:bg-warning-soft text-warning border border-warning-border rounded-xl text-xs font-bold transition"
        >
          تم حذف {recentlyRemoved.product?.name || 'المنتج'} من السلة — تراجع
        </button>
      </div>
    )}
    <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs ">
      <span className="font-black text-ink ">{copy.cartTitle} <span className="font-semibold text-muted ">({cart.length} أصناف)</span></span>
      <span className="flex items-center gap-2">
        {cart.length > 0 && <span className="text-ink-secondary ">{cart.length} بنود{cartQuantitySummary ? ` · ${cartQuantitySummary}` : ''}</span>}
        {cart.length > 1 && onBulkLineDiscount && (
          <button
            type="button"
            onClick={() => (bulkMode ? exitBulkMode() : setBulkMode(true))}
            aria-pressed={bulkMode}
            title="تحديد عدة أصناف وتعديلها دفعة واحدة"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black border transition ${
              bulkMode ? 'bg-primary text-white border-primary' : 'bg-surface-muted border-line text-ink hover:border-primary'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" /> {bulkMode ? 'إنهاء التحديد' : 'تعديل جماعي'}
          </button>
        )}
      </span>
    </div>

    {cartProfitSummary && (
      <div className="mx-2.5 mt-2 rounded-xl border border-line bg-surface-muted px-3 py-1.5 text-[10px] flex items-center justify-between gap-2 flex-wrap">
        <span className="text-muted">
          الربح التقديري{cartProfitSummary.coveredLines < cartProfitSummary.totalLines ? ` (بيانات تكلفة لـ ${cartProfitSummary.coveredLines}/${cartProfitSummary.totalLines} صنف)` : ''}:
        </span>
        <span className={`font-black tabular-nums ${cartProfitSummary.profit < 0 ? 'text-danger' : cartProfitSummary.marginPercent < 10 ? 'text-warning' : 'text-success'}`}>
          {CeramicMath.formatCurrency(cartProfitSummary.profit)} ({cartProfitSummary.marginPercent}%)
        </span>
      </div>
    )}

    {bulkMode && (
      <div className="mx-2.5 mt-2 rounded-xl border border-primary/30 bg-accent-soft/60 px-3 py-2 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-bold text-ink">
          <span>التعديل الجماعي — المحدد: {effectiveSelected.length} من {cart.length}</span>
          <button type="button" onClick={() => setSelectedIndexes(new Set(cart.map((_, i) => i)))} className="text-primary hover:underline">تحديد الكل</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="number"
            min={0}
            max={100}
            inputMode="decimal"
            value={bulkDiscountPercent}
            onChange={(e) => setBulkDiscountPercent(e.target.value)}
            placeholder="نسبة الخصم %"
            disabled={!canDiscount}
            aria-label="نسبة الخصم الجماعي"
            className="w-24 px-2 py-1.5 bg-surface border border-line rounded-lg text-[11px] font-bold text-ink disabled:opacity-50"
          />
          <button
            type="button"
            disabled={!canDiscount || effectiveSelected.length === 0}
            onClick={() => {
              onBulkLineDiscount?.(effectiveSelected, Number(bulkDiscountPercent) || 0);
              setBulkDiscountPercent('');
            }}
            title={canDiscount ? 'تطبيق نسبة الخصم على الأصناف المحددة' : 'لا تملك صلاحية الخصم'}
            className="px-3 py-1.5 bg-primary text-white rounded-lg text-[11px] font-black disabled:opacity-50"
          >
            تطبيق خصم %
          </button>
          <button
            type="button"
            disabled={effectiveSelected.length === 0}
            onClick={() => { onRemoveCartLines?.(effectiveSelected); exitBulkMode(); }}
            className="px-3 py-1.5 bg-danger text-white rounded-lg text-[11px] font-black disabled:opacity-50 flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> حذف المحدد
          </button>
          <button type="button" onClick={exitBulkMode} className="px-3 py-1.5 bg-surface-muted border border-line rounded-lg text-[11px] font-bold text-ink">
            إلغاء
          </button>
        </div>
        {!canDiscount && <p className="text-[10px] text-warning font-bold">لا تملك صلاحية تطبيق خصومات — الحذف الجماعي متاح فقط.</p>}
      </div>
    )}
    <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 space-y-2">
      {cart.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center text-ink-secondary">
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
            canDiscount={canDiscount}
            costInfo={costInfoByProductId?.[item.product.id] ?? null}
            selectable={bulkMode}
            selected={selectedIndexes.has(index)}
            onToggleSelect={toggleLineSelection}
            onRequestSubstitute={onReplaceCartItem ? (i) => setSubstituteIndex(i) : undefined}
            onEditSerials={onEditSerials}
          />
        ))
      )}
    </div>
    {substituteIndex !== null && onReplaceCartItem && cart[substituteIndex] && (
      <PosSubstituteDialog
        productName={cart[substituteIndex].product.name}
        onClose={() => setSubstituteIndex(null)}
        onSelect={(product) => {
          onReplaceCartItem(substituteIndex, product);
          setSubstituteIndex(null);
        }}
      />
    )}
  </>
  );
};
