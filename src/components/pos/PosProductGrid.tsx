import React, { useState } from 'react';
import { Plus, Search, CheckSquare, Square, ShoppingCart } from 'lucide-react';
import type { Product } from '../../types';
import { CeramicMath } from '../../utils/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';
import type { CartItem } from './types';

export interface PosProductGridProps {
  products: Product[];
  cart: CartItem[];
  stockOf: (productId: string) => number;
  gradeLabel: (grade: Product['grade']) => string;
  onAddToCart: (product: Product) => void;
  onAddMultipleToCart?: (products: Product[]) => void;
  multiSelectEnabled?: boolean;
}

export const PosProductGrid: React.FC<PosProductGridProps> = ({
  products,
  cart,
  stockOf,
  gradeLabel,
  onAddToCart,
  onAddMultipleToCart,
  multiSelectEnabled = false,
}) => {
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddSelected = () => {
    const toAdd = products.filter((p) => selectedProductIds.has(p.id));
    if (toAdd.length === 0) return;
    if (onAddMultipleToCart) {
      onAddMultipleToCart(toAdd);
    } else {
      toAdd.forEach((p) => onAddToCart(p));
    }
    setSelectedProductIds(new Set());
  };

  const selectAll = () => {
    setSelectedProductIds(new Set(products.map((p) => p.id)));
  };

  const clearSelection = () => {
    setSelectedProductIds(new Set());
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {multiSelectEnabled && products.length > 0 && (
        <div className="bg-sky-50 dark:bg-sky-950/40 border-b border-sky-100 dark:border-sky-900/40 px-4 py-2 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-sky-900 dark:text-sky-200">
              تم تحديد {selectedProductIds.size} صنف
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={selectAll}
                className="text-[11px] text-sky-600 hover:text-sky-800 dark:text-sky-400 font-bold px-1.5 py-0.5 rounded hover:bg-sky-100 dark:hover:bg-sky-900/50"
              >
                تحديد الكل
              </button>
              {selectedProductIds.size > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 font-bold px-1.5 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  إلغاء التحديد
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={selectedProductIds.size === 0}
            onClick={handleAddSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-40 disabled:hover:bg-sky-600 text-white text-xs font-bold shadow-sm transition"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            أضف المحدد ({selectedProductIds.size})
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {products.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
            <Search className="w-12 h-12 mb-3 opacity-40" />
            <p className="font-bold">لا توجد أصناف مطابقة</p>
            <p className="text-xs mt-1">جرّب تغيير كلمة البحث أو الفلتر</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {products.map((p) => {
              const available = stockOf(p.id);
              const isLow = p.minStockLevel > 0 && available <= p.minStockLevel;
              const inCart = cart.find((c) => c.product.id === p.id);
              const isSelected = selectedProductIds.has(p.id);

              return (
                <div
                  key={p.id}
                  onClick={() => onAddToCart(p)}
                  className={`relative text-right bg-white dark:bg-slate-900 p-3 rounded-2xl border transition flex flex-col justify-between group overflow-hidden min-h-[154px] cursor-pointer ${
                    isSelected
                      ? 'border-sky-500 ring-2 ring-sky-500/20 shadow-md bg-sky-50/20 dark:bg-sky-950/20'
                      : 'border-slate-200 dark:border-slate-800 hover:border-sky-400 hover:shadow-md'
                  }`}
                >
                  {/* Checkbox button when multiSelectEnabled is true */}
                  {multiSelectEnabled && (
                    <button
                      type="button"
                      aria-label={isSelected ? 'إلغاء تحديد الصنف' : 'تحديد الصنف'}
                      onClick={(e) => toggleSelect(p.id, e)}
                      className="absolute top-2 left-2 z-10 p-1 rounded-lg bg-white/90 dark:bg-slate-800/90 shadow-sm border border-slate-200 dark:border-slate-700 text-sky-600 transition hover:scale-110"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 fill-sky-600 text-white" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 hover:text-sky-600" />
                      )}
                    </button>
                  )}

                  {inCart && !multiSelectEnabled && (
                    <span className="absolute top-0 left-0 bg-sky-600 text-white text-[10px] font-black px-2 py-0.5 rounded-br-xl">
                      في السلة: {formatProductQuantity(inCart.quantityM2, p)}
                    </span>
                  )}

                  {inCart && multiSelectEnabled && (
                    <span className="absolute top-0 left-8 bg-sky-600 text-white text-[10px] font-black px-2 py-0.5 rounded-b-lg shadow-sm">
                      في السلة: {formatProductQuantity(inCart.quantityM2, p)}
                    </span>
                  )}

                  <div>
                    {p.imagePath && (
                      <img
                        src={p.imagePath}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-24 object-cover rounded-xl mb-2 bg-slate-100 dark:bg-slate-800"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600">
                        {p.productType === 'GENERAL' ? getProductUnitLabel(p) : gradeLabel(p.grade)}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">{p.size || p.sku}</span>
                    </div>
                    <h3 className="font-bold text-xs text-slate-900 dark:text-slate-100 line-clamp-2 group-hover:text-sky-600 transition min-h-[2rem]">
                      {p.name}
                    </h3>
                    {p.productType !== 'GENERAL' && (
                      <div className="text-[10px] text-slate-500 mt-1">
                        الكرتونة: {p.metersPerBox} م² ({p.piecesPerBox} قطع)
                      </div>
                    )}
                    {(p.brandName || p.color) && (
                      <div className="text-[10px] text-slate-500 truncate">
                        {[p.brandName, p.color].filter(Boolean).join(' • ')}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="text-xs font-black text-sky-600">
                      {CeramicMath.formatCurrency(p.sellingPriceM2)}
                      <span className="text-[10px] text-slate-500 font-normal"> /{getProductUnitLabel(p)}</span>
                    </div>
                    <div className={`text-[10px] font-bold ${isLow ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {formatProductQuantity(available, p)}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-1 text-[10px] font-bold text-sky-700 dark:text-sky-400">
                    <span className="flex items-center gap-1">
                      <Plus className="w-3 h-3" /> إضافة للسلة
                    </span>
                    {inCart && (
                      <span className="text-slate-500">
                        {formatProductQuantity(inCart.quantityM2, p)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
