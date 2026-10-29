import React from 'react';
import { ShoppingCart, Trash2, Plus, Minus, AlertCircle } from 'lucide-react';
import { getSellableUnits, getUomLabel, isWholeUnit, pricePerUnit } from '../../../utils/uom';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/productUnits';
import { CeramicMath } from '../../../utils/ceramicMath';
import { round2, type CartItem, type PosUnit } from '../../../components/pos/types';
import type { Product } from '../../../types';

interface CartLineProps {
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
}

export const PosCartLine: React.FC<CartLineProps> = ({
  item, index, enableNegativeStock, gradeLabel,
  onRemove, onUpdateUnit, onStepQuantity, onUpdateQuantity, onUpdatePrice, onUpdateLineDiscount,
}) => {
  const lineTotal = round2(item.quantityM2 * item.unitPrice - item.discountAmount);
  const isGeneral = item.product.productType === 'GENERAL' || item.product.baseUnit === 'SERVICE';
  const tracksStock = !isGeneral;
  const sellableUnits = getSellableUnits(item.product);
  const displayPrice = round2(pricePerUnit(item.unitPrice, item.soldBy, item.product));
  const overStock = tracksStock && item.quantityM2 > item.availableStockM2 && !enableNegativeStock;
  const step = isWholeUnit(item.soldBy, item.product) ? 1 : 0.01;

  return (
    <div className="bg-white p-2.5 rounded-xl border text-xs space-y-2 ">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-slate-900 line-clamp-1">{item.product.name}</div>
          <div className="text-[10px] text-slate-500">
            {isGeneral ? getProductUnitLabel(item.product) : item.product.size}
            {' • '}
            متاح {formatProductQuantity(item.availableStockM2, item.product)}
          </div>
        </div>
        <button onClick={() => onRemove(index)} className="text-slate-500 hover:text-rose-600 transition shrink-0">
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
            <button key={unit} type="button" onClick={() => onUpdateUnit(index, unit)}
              className="px-2 py-0.5 rounded text-[10px] font-bold border ">
              {getUomLabel(unit, item.product)}
            </button>
          ))}
          <span className="text-[10px] text-slate-500 mr-auto">
            {round2(item.quantityM2)} {getProductUnitLabel(item.product)}
            {item.product?.productType !== 'GENERAL' ? ' •  كرتونة' : ''}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
          <button onClick={() => onStepQuantity(index, -1)} className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded">
            <Minus className="w-3 h-3" />
          </button>
          <input type="number" step={step} value={item.soldQuantity}
            onChange={(e) => { if (e.target.value !== '') onUpdateQuantity(index, Number.parseFloat(e.target.value)); }}
            aria-label="تغيير الكمية للمنتج"
            className="w-14 text-center font-bold bg-transparent focus:outline-none text-xs text-slate-900" />
          <button onClick={() => onStepQuantity(index, 1)} className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded">
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <input type="number" value={displayPrice}
            onChange={(e) => { if (e.target.value !== '') onUpdatePrice(index, Number.parseFloat(e.target.value)); }}
            aria-label="تغيير السعر للمنتج"
            className="w-16 text-center font-bold bg-white border border-slate-200 rounded-lg p-1 text-xs text-slate-900" />
          <span className="text-[10px] text-slate-500">ج.م/{getUomLabel(item.soldBy, item.product)}</span>
        </div>
        <div className="font-black text-sky-600 w-20 text-left">{CeramicMath.formatCurrency(lineTotal)}</div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500">خصم الصنف</span>
        <input type="number" value={item.discountAmount || ''} placeholder="0"
          onChange={(e) => onUpdateLineDiscount(index, e.target.value === '' ? 0 : Number.parseFloat(e.target.value))}
          aria-label="خصم الصنف"
          className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-900" />
      </div>
    </div>
  );
};
