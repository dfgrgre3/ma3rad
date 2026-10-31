import React from 'react';
import { Plus, Search } from 'lucide-react';
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
}

export const PosProductGrid: React.FC<PosProductGridProps> = ({
  products,
  cart,
  stockOf,
  gradeLabel,
  onAddToCart,
}) => (
  <div className="flex-1 overflow-y-auto p-4">
    {products.length === 0 ? (
      <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
        <Search className="w-12 h-12 mb-3 opacity-40" />
        <p className="font-bold">لا توجد أصناف مطابقة</p>
        <p className="text-xs mt-1">جرّب تغيير كلمة البحث أو الفلتر</p>
      </div>
    ) : (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
        {products.map((p) => {
          const available = stockOf(p.id);
          const isLow = p.minStockLevel > 0 && available <= p.minStockLevel;
          const inCart = cart.find((c) => c.product.id === p.id);
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => onAddToCart(p)}
              aria-label={`إضافة ${p.name} إلى السلة`}
              className="relative text-right bg-white p-3 rounded-2xl border border-slate-200 hover:border-sky-500 hover:shadow-md focus-visible:ring-2 focus-visible:ring-sky-500 cursor-pointer transition flex flex-col justify-between group overflow-hidden min-h-[154px]"
            >
              {inCart && (
                <span className="absolute top-0 left-0 bg-sky-600 text-white text-[10px] font-black px-2 py-0.5 rounded-br-xl">
                  في السلة: {formatProductQuantity(inCart.quantityM2, p)}
                </span>
              )}
              <div>
                {p.imagePath && <img src={p.imagePath} alt={p.name} loading="lazy" className="w-full h-24 object-cover rounded-xl mb-2 bg-slate-100" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600">
                    {p.productType === 'GENERAL' ? getProductUnitLabel(p) : gradeLabel(p.grade)}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">{p.size || p.sku}</span>
                </div>
                <h3 className="font-bold text-xs text-slate-900 line-clamp-2 group-hover:text-sky-600 transition min-h-[2rem]">
                  {p.name}
                </h3>
                {p.productType !== 'GENERAL' && <div className="text-[10px] text-slate-500 mt-1">
                  الكرتونة: {p.metersPerBox} م² ({p.piecesPerBox} قطع)
                </div>}
                {(p.brandName || p.color) && (
                  <div className="text-[10px] text-slate-500 truncate">{[p.brandName, p.color].filter(Boolean).join(' • ')}</div>
                )}
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between">
                <div className="text-xs font-black text-sky-600">
                  {CeramicMath.formatCurrency(p.sellingPriceM2)}
                  <span className="text-[10px] text-slate-500 font-normal"> /{getProductUnitLabel(p)}</span>
                </div>
                <div className={`text-[10px] font-bold ${isLow ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {formatProductQuantity(available, p)}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-1 text-[10px] font-bold text-sky-700">
                <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> إضافة للسلة</span>
                {inCart && <span className="text-slate-500">{formatProductQuantity(inCart.quantityM2, p)}</span>}
              </div>
            </button>
          );
        })}
      </div>
    )}
  </div>
);
