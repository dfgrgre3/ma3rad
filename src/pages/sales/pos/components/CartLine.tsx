import React, { useState } from 'react';
import { AlertCircle, ArrowLeftRight, CheckSquare, Hash, Minus, Plus, Square, Trash2, Tag, ChevronDown, Package } from 'lucide-react';
import type { Product } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../../../../utils/products/productUnits';
import { getSellableUnits, getUomLabel, pricePerUnit } from '../../../../utils/products/uom';
import { round2, type CartItem, type PosUnit } from '../../../../types/pos';
import { getEffectiveBusinessType } from '../../../../services/domains/config/BusinessTypeService';
import { getPricingTierFactor } from '../../../../config/businessProfiles';
import { getCartPriceUnitLabel, getCartQuantityStep } from './cartUtils';

export interface CartLineProps {
  item: CartItem;
  index: number;
  enableNegativeStock: boolean;
  gradeLabel: (grade: Product['grade']) => string;
  onRemove: (index: number) => void;
  onUpdateUnit: (index: number, unit: PosUnit) => void;
  onStepQuantity: (index: number, direction: 1 | -1) => void;
  onUpdateQuantity: (index: number, value: number) => void;
  onUpdatePrice: (index: number, value: number) => void;
  onUpdateLineDiscount: (index: number, value: number) => void;
  sellingPriceTiersCount?: number;
  sellingPriceTierNames?: string[];
  isActive?: boolean;
  onSelect?: (index: number) => void;
  /** false hides/disables the line-discount input (no sales.discount permission). */
  canDiscount?: boolean;
  /** cost data for the margin hint; absent when the user can't view costs. */
  costInfo?: { unitCost: number; lastPurchaseCost: number | null } | null;
  /** bulk-selection mode */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (index: number) => void;
  onRequestSubstitute?: (index: number) => void;
  /** Opens the serial/IMEI picker for this line (serial-tracked products). */
  onEditSerials?: (index: number) => void;
}

export const CartLine: React.FC<CartLineProps> = ({
  item,
  index,
  enableNegativeStock,
  gradeLabel,
  onRemove,
  onUpdateUnit,
  onStepQuantity,
  onUpdateQuantity,
  onUpdatePrice,
  onUpdateLineDiscount,
  sellingPriceTiersCount = 1,
  sellingPriceTierNames = [],
  isActive = false,
  onSelect,
  canDiscount = true,
  costInfo = null,
  selectable = false,
  selected = false,
  onToggleSelect,
  onRequestSubstitute,
  onEditSerials,
}) => {
  const businessType = getEffectiveBusinessType();
  const [isPriceMenuOpen, setIsPriceMenuOpen] = useState(false);
  const lineTotal = round2(item.quantityM2 * item.unitPrice - item.discountAmount);
  const isGeneral = item.product.productType === 'GENERAL' || item.product.baseUnit === 'SERVICE';
  const tracksStock = Boolean(item.specialStockId) || !isGeneral;
  const sellableUnits = getSellableUnits(item.product);
  const displayPrice = round2(pricePerUnit(item.unitPrice, item.soldBy, item.product));
  const overStock = tracksStock && item.quantityM2 > item.availableStockM2 && !enableNegativeStock;
  const effectiveUnitCost = costInfo
    ? (costInfo.unitCost > 0 ? costInfo.unitCost : costInfo.lastPurchaseCost)
    : null;
  const marginAmount = effectiveUnitCost != null ? round2(item.unitPrice - effectiveUnitCost) : null;
  const marginPercent = marginAmount != null && item.unitPrice > 0
    ? round2((marginAmount / item.unitPrice) * 100)
    : null;

  // Build available price tiers according to sellingPriceTiersCount, names, and product attributes
  const priceTiers = React.useMemo(() => {
    const defaultLabels = ['سعر القطاعي (الأساسي)', 'سعر الجملة', 'سعر خاص / موزع', 'سعر مشاريع', 'سعر كبار العملاء'];
    const names = Array.isArray(sellingPriceTierNames) && sellingPriceTierNames.length ? sellingPriceTierNames : defaultLabels;

    const tiers: { id: string; label: string; price: number }[] = [
      { id: 'retail', label: names[0] || defaultLabels[0], price: round2(pricePerUnit(item.product.sellingPriceM2, item.soldBy, item.product)) },
    ];

    if (sellingPriceTiersCount >= 2) {
      const wholesale = item.product.wholesalePriceM2 || round2(item.product.sellingPriceM2 * getPricingTierFactor(businessType, 'wholesale', 0.9));
      tiers.push({ id: 'wholesale', label: names[1] || defaultLabels[1], price: round2(pricePerUnit(wholesale, item.soldBy, item.product)) });
    }
    if (sellingPriceTiersCount >= 3) {
      const minPrice = item.product.minSellingPriceM2 || round2(item.product.sellingPriceM2 * getPricingTierFactor(businessType, 'min_price', 0.85));
      tiers.push({ id: 'min_price', label: names[2] || defaultLabels[2], price: round2(pricePerUnit(minPrice, item.soldBy, item.product)) });
    }
    if (sellingPriceTiersCount >= 4) {
      const distPrice = round2(item.product.sellingPriceM2 * getPricingTierFactor(businessType, 'distributor', 0.8));
      tiers.push({ id: 'distributor', label: names[3] || defaultLabels[3], price: round2(pricePerUnit(distPrice, item.soldBy, item.product)) });
    }
    if (sellingPriceTiersCount >= 5) {
      const vipPrice = round2(item.product.sellingPriceM2 * getPricingTierFactor(businessType, 'vip', 0.75));
      tiers.push({ id: 'vip', label: names[4] || defaultLabels[4], price: round2(pricePerUnit(vipPrice, item.soldBy, item.product)) });
    }

    return tiers;
  }, [item.product, item.soldBy, sellingPriceTiersCount, sellingPriceTierNames, businessType]);

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={`سطر السلة: ${item.product.name}`}
      onFocus={() => onSelect?.(index)}
      onClick={() => onSelect?.(index)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.(index);
        }
      }}
      aria-current={isActive || undefined}
      className={`bg-surface p-2 rounded-xl border text-xs space-y-1.5 cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
 overStock ? 'border-danger/50' : isActive ? 'border-primary ring-2 ring-primary/25' : 'border-line/80 dark:border-line-strong'
 }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {selectable && onToggleSelect && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSelect(index); }}
              aria-label={selected ? 'إلغاء تحديد السطر' : 'تحديد السطر'}
              aria-pressed={selected}
              className="mt-0.5 shrink-0 text-primary"
            >
              {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            </button>
          )}
          {item.product.imagePath ? (
            <img src={item.product.imagePath} alt={item.product.name} className="w-10 h-10 object-cover rounded-lg bg-surface-sunken shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <div aria-hidden="true" className="w-10 h-10 rounded-lg bg-surface-sunken text-muted flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" strokeWidth={1.5} />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-ink line-clamp-1">{item.product.name}</div>
          <div className="text-[10px] text-muted ">
            {isGeneral ? `الوحدة الأساسية: ${getProductUnitLabel(item.product)}` : `${item.product.size} • ${gradeLabel(item.product.grade)}`} • متاح {formatProductQuantity(item.availableStockM2, item.product)}
          </div>
          {item.specialStockId && (
            <div className="text-[10px] font-bold text-primary ">
              بيع مخفض • مصدر {item.specialNumber}
            </div>
          )}
        </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onRequestSubstitute && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRequestSubstitute(index); }}
              title="استبدال الصنف ببديل داخل نفس الفاتورة"
              aria-label={`استبدال ${item.product.name}`}
              className="w-8 h-8 flex items-center justify-center text-muted hover:text-primary hover:bg-accent-soft rounded-lg transition"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onRemove(index)}
            aria-label={`حذف ${item.product.name} من السلة`}
            title="حذف من السلة (Delete)"
            className="w-8 h-8 flex items-center justify-center text-muted hover:text-danger hover:bg-danger-soft dark:hover:bg-danger/40 rounded-lg transition shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {overStock && (
        <div className="text-[10px] text-danger flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> الكمية تتجاوز الرصيد المتاح
        </div>
      )}

      {item.serials?.length ? (
        <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
          <span className="inline-flex items-center gap-1 font-bold text-muted"><Hash className="w-3 h-3" />الأرقام التسلسلية ({item.serials.length}):</span>
          {item.serials.slice(0, 3).map((s) => (
            <span key={s.id} className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono font-bold text-ink" dir="ltr">{s.serialNumber}</span>
          ))}
          {item.serials.length > 3 && <span className="text-muted">+{item.serials.length - 3}</span>}
          {onEditSerials && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEditSerials(index); }}
              className="rounded border border-line px-1.5 py-0.5 font-black text-primary hover:bg-accent-soft"
            >
              تعديل
            </button>
          )}
        </div>
      ) : item.product.trackSerials ? (
        <div className="text-[10px] font-bold text-danger flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> الصنف يتتبع الأرقام التسلسلية ولم تُحدد بعد — أضفه من جديد لاختيارها
        </div>
      ) : null}

      {costInfo && (costInfo.unitCost > 0 || costInfo.lastPurchaseCost != null) && (
        <div className="text-[10px] flex items-center gap-2 flex-wrap">
          <span className="text-muted">
            التكلفة: <strong className="text-ink tabular-nums">{CeramicMath.formatCurrency(costInfo.unitCost > 0 ? costInfo.unitCost : costInfo.lastPurchaseCost || 0)}</strong>
            {costInfo.lastPurchaseCost != null && costInfo.unitCost > 0 && (
              <span className="text-muted"> • آخر شراء: {CeramicMath.formatCurrency(costInfo.lastPurchaseCost)}</span>
            )}
          </span>
          {marginAmount != null && marginPercent != null && (
            <span className={`font-bold tabular-nums ${marginAmount < 0 ? 'text-danger' : marginPercent < 10 ? 'text-warning' : 'text-success'}`}>
              هامش الربح: {CeramicMath.formatCurrency(marginAmount)} ({marginPercent}%)
            </span>
          )}
        </div>
      )}

      {sellableUnits.length > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          {sellableUnits.map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => onUpdateUnit(index, unit)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${item.soldBy === unit ? 'bg-primary text-white border-primary' : 'bg-surface dark:bg-primary border-line text-ink dark:text-muted'}`}
            >
              {getUomLabel(unit, item.product)}
            </button>
          ))}
          <span className="text-[10px] text-muted ms-auto">
            {round2(item.quantityM2)} {getProductUnitLabel(item.product)}
            {item.product?.productType !== 'GENERAL' ? ` • ${item.boxesCount} كرتونة` : ''}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {/* Quantity Controls */}
        <div className="flex items-center gap-1 bg-surface border border-line rounded-lg p-0.5">
          <button
            onClick={() => onStepQuantity(index, -1)}
            aria-label="إنقاص الكمية"
            className="w-7 h-7 flex items-center justify-center text-muted hover:bg-surface-sunken dark:hover:bg-primary rounded"
          >
            <Minus className="w-3 h-3" />
          </button>
          <input
            type="number"
            step={getCartQuantityStep(item)}
            value={item.soldQuantity}
            onChange={(e) => { if (e.target.value !== '') onUpdateQuantity(index, Number.parseFloat(e.target.value)); }}
            aria-label={`تغيير الكمية للمنتج ${item.product.name}`}
            className="w-14 text-center font-bold bg-transparent focus:outline-none text-xs text-ink "
          />
          <button
            onClick={() => onStepQuantity(index, 1)}
            aria-label="زيادة الكمية"
            className="w-7 h-7 flex items-center justify-center text-muted hover:bg-surface-sunken dark:hover:bg-primary rounded"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Price input & Multi-tier Price selector */}
        <div className="relative flex items-center gap-1">
          <input
            type="number"
            value={displayPrice}
            onChange={(e) => { if (e.target.value !== '') onUpdatePrice(index, Number.parseFloat(e.target.value)); }}
            aria-label={`تغيير السعر للمنتج ${item.product.name}`}
            readOnly={Boolean(item.specialStockId)}
            className={`w-16 text-center font-bold bg-surface border border-line rounded-lg p-1 text-xs text-ink ${item.specialStockId ? 'opacity-70 cursor-not-allowed' : ''}`}
          />
          <span className="text-[10px] text-muted">{CeramicMath.getCurrencySymbol()}</span>
          <span className="text-[10px] text-muted">/{getCartPriceUnitLabel(item)}</span>

          {/* زر تثبيت / اختيار السعر إذا كان مفعلاً أكثر من سعر */}
          {!item.specialStockId && sellingPriceTiersCount > 1 && (
            <div className="relative inline-block">
              <button
                type="button"
                onClick={() => setIsPriceMenuOpen(!isPriceMenuOpen)}
                title="تثبيت / اختيار مستوى السعر"
                className="p-1 rounded bg-surface-sunken hover:bg-accent-soft dark:hover:bg-primary/40 text-ink-secondary hover:text-primary border border-line transition"
              >
                <Tag className="w-3 h-3 inline" />
                <ChevronDown className="w-2.5 h-2.5 inline mr-0.5" />
              </button>

              {isPriceMenuOpen && (
                <div
                  className="absolute left-0 top-full mt-1 w-44 bg-surface rounded-xl shadow-xl border border-line py-1 z-50 text-right"
                  onMouseLeave={() => setIsPriceMenuOpen(false)}
                >
                  <div className="px-2 py-1 text-[10px] font-bold text-muted border-b border-line ">
                    تثبيت السعر للصنف
                  </div>
                  {priceTiers.map((tier) => (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => {
                        onUpdatePrice(index, tier.price);
                        setIsPriceMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 text-right flex items-center justify-between text-xs hover:bg-accent-soft dark:hover:bg-primary/40 transition text-ink "
                    >
                      <span className="text-[11px] font-semibold">{tier.label}</span>
                      <span className="font-mono font-bold text-primary">{tier.price}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="font-black text-primary w-20 text-left">{CeramicMath.formatCurrency(lineTotal)}</div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted">خصم الصنف</span>
        <input
          type="number"
          value={item.discountAmount || ''}
          placeholder={canDiscount ? '0' : 'بدون صلاحية'}
          disabled={!canDiscount}
          title={canDiscount ? undefined : 'لا تملك صلاحية تطبيق خصم على الصنف'}
          onChange={(e) => onUpdateLineDiscount(index, e.target.value === '' ? 0 : Number.parseFloat(e.target.value))}
          aria-label={`خصم الصنف ${item.product.name}`}
          className={`w-20 px-2 py-1 bg-surface border border-line rounded-lg text-[11px] font-bold text-ink ${canDiscount ? '' : 'opacity-50 cursor-not-allowed'}`}
        />
        {!canDiscount && item.discountAmount > 0 && (
          <span className="text-[10px] font-bold text-warning">خصم مسجل سابقاً — لا تملك صلاحية تعديله</span>
        )}
      </div>
    </div>
  );
};
