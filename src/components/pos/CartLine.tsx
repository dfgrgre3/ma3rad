import React, { useState } from 'react';
import { AlertCircle, Minus, Plus, Trash2, Tag, ChevronDown } from 'lucide-react';
import type { Product } from '../../types';
import { CeramicMath } from '../../utils/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';
import { getSellableUnits, getUomLabel, isWholeUnit, pricePerUnit } from '../../utils/uom';
import { round2, type CartItem, type PosUnit } from './types';

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
}

export const getCartQuantityStep = (item: CartItem) =>
  isWholeUnit(item.soldBy, item.product) ? 1 : 0.01;

export const getCartPriceUnitLabel = (item: CartItem) => getUomLabel(item.soldBy, item.product);

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
}) => {
  const [isPriceMenuOpen, setIsPriceMenuOpen] = useState(false);
  const lineTotal = round2(item.quantityM2 * item.unitPrice - item.discountAmount);
  const isGeneral = item.product.productType === 'GENERAL' || item.product.baseUnit === 'SERVICE';
  const tracksStock = !isGeneral;
  const sellableUnits = getSellableUnits(item.product);
  const displayPrice = round2(pricePerUnit(item.unitPrice, item.soldBy, item.product));
  const overStock = tracksStock && item.quantityM2 > item.availableStockM2 && !enableNegativeStock;

  // Build available price tiers according to sellingPriceTiersCount, names, and product attributes
  const priceTiers = React.useMemo(() => {
    const defaultLabels = ['سعر القطاعي (الأساسي)', 'سعر الجملة', 'سعر خاص / موزع', 'سعر مشاريع', 'سعر كبار العملاء'];
    const names = Array.isArray(sellingPriceTierNames) && sellingPriceTierNames.length ? sellingPriceTierNames : defaultLabels;

    const tiers: { id: string; label: string; price: number }[] = [
      { id: 'retail', label: names[0] || defaultLabels[0], price: round2(pricePerUnit(item.product.sellingPriceM2, item.soldBy, item.product)) },
    ];

    if (sellingPriceTiersCount >= 2) {
      const wholesale = item.product.wholesalePriceM2 || round2(item.product.sellingPriceM2 * 0.9);
      tiers.push({ id: 'wholesale', label: names[1] || defaultLabels[1], price: round2(pricePerUnit(wholesale, item.soldBy, item.product)) });
    }
    if (sellingPriceTiersCount >= 3) {
      const minPrice = item.product.minSellingPriceM2 || round2(item.product.sellingPriceM2 * 0.85);
      tiers.push({ id: 'min_price', label: names[2] || defaultLabels[2], price: round2(pricePerUnit(minPrice, item.soldBy, item.product)) });
    }
    if (sellingPriceTiersCount >= 4) {
      const distPrice = round2(item.product.sellingPriceM2 * 0.8);
      tiers.push({ id: 'distributor', label: names[3] || defaultLabels[3], price: round2(pricePerUnit(distPrice, item.soldBy, item.product)) });
    }
    if (sellingPriceTiersCount >= 5) {
      const vipPrice = round2(item.product.sellingPriceM2 * 0.75);
      tiers.push({ id: 'vip', label: names[4] || defaultLabels[4], price: round2(pricePerUnit(vipPrice, item.soldBy, item.product)) });
    }

    return tiers;
  }, [item.product, item.soldBy, sellingPriceTiersCount, sellingPriceTierNames]);

  return (
    <div
      className={`bg-white dark:bg-slate-900 p-2.5 rounded-xl border text-xs space-y-2 ${overStock ? 'border-rose-500/50' : 'border-slate-200/80 dark:border-slate-800'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-slate-900 dark:text-slate-100 line-clamp-1">{item.product.name}</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {isGeneral ? `الوحدة الأساسية: ${getProductUnitLabel(item.product)}` : `${item.product.size} • ${gradeLabel(item.product.grade)}`} • متاح {formatProductQuantity(item.availableStockM2, item.product)}
          </div>
        </div>
        <button
          onClick={() => onRemove(index)}
          className="text-slate-400 hover:text-rose-600 transition shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {overStock && (
        <div className="text-[10px] text-rose-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> الكمية تتجاوز الرصيد المتاح
        </div>
      )}

      {sellableUnits.length > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          {sellableUnits.map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => onUpdateUnit(index, unit)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${item.soldBy === unit ? 'bg-sky-600 text-white border-sky-500' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}
            >
              {getUomLabel(unit, item.product)}
            </button>
          ))}
          <span className="text-[10px] text-slate-500 mr-auto">
            {round2(item.quantityM2)} {getProductUnitLabel(item.product)}
            {item.product?.productType !== 'GENERAL' ? ` • ${item.boxesCount} كرتونة` : ''}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {/* Quantity Controls */}
        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
          <button
            onClick={() => onStepQuantity(index, -1)}
            className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
          >
            <Minus className="w-3 h-3" />
          </button>
          <input
            type="number"
            step={getCartQuantityStep(item)}
            value={item.soldQuantity}
            onChange={(e) => { if (e.target.value !== '') onUpdateQuantity(index, Number.parseFloat(e.target.value)); }}
            aria-label={`تغيير الكمية للمنتج ${item.product.name}`}
            className="w-14 text-center font-bold bg-transparent focus:outline-none text-xs text-slate-900 dark:text-slate-100"
          />
          <button
            onClick={() => onStepQuantity(index, 1)}
            className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
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
            className="w-16 text-center font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 text-xs text-slate-900 dark:text-slate-100"
          />
          <span className="text-[10px] text-slate-500">ج.م</span>
          <span className="text-[10px] text-slate-500">/{getCartPriceUnitLabel(item)}</span>

          {/* زر تثبيت / اختيار السعر إذا كان مفعلاً أكثر من سعر */}
          {sellingPriceTiersCount > 1 && (
            <div className="relative inline-block">
              <button
                type="button"
                onClick={() => setIsPriceMenuOpen(!isPriceMenuOpen)}
                title="تثبيت / اختيار مستوى السعر"
                className="p-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-slate-600 dark:text-slate-300 hover:text-sky-600 border border-slate-200 dark:border-slate-700 transition"
              >
                <Tag className="w-3 h-3 inline" />
                <ChevronDown className="w-2.5 h-2.5 inline mr-0.5" />
              </button>

              {isPriceMenuOpen && (
                <div
                  className="absolute left-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-50 text-right"
                  onMouseLeave={() => setIsPriceMenuOpen(false)}
                >
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 border-b border-slate-100 dark:border-slate-700">
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
                      className="w-full px-2.5 py-1.5 text-right flex items-center justify-between text-xs hover:bg-sky-50 dark:hover:bg-sky-950/40 transition text-slate-700 dark:text-slate-200"
                    >
                      <span className="text-[11px] font-semibold">{tier.label}</span>
                      <span className="font-mono font-bold text-sky-600">{tier.price}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="font-black text-sky-600 w-20 text-left">{CeramicMath.formatCurrency(lineTotal)}</div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500">خصم الصنف</span>
        <input
          type="number"
          value={item.discountAmount || ''}
          placeholder="0"
          onChange={(e) => onUpdateLineDiscount(index, e.target.value === '' ? 0 : Number.parseFloat(e.target.value))}
          aria-label={`خصم الصنف ${item.product.name}`}
          className="w-20 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-bold text-slate-900 dark:text-slate-100"
        />
      </div>
    </div>
  );
};
