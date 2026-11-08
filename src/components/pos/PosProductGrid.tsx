import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, CheckSquare, Square, ShoppingCart, LayoutGrid, List, Package,
} from 'lucide-react';
import type { Product } from '../../types';
import { CeramicMath } from '../../utils/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import type { CartItem } from './types';

export type PosProductViewMode = 'grid' | 'list';

export interface PosProductGridProps {
  products: Product[];
  cart: CartItem[];
  stockOf: (productId: string) => number;
  gradeLabel: (grade: Product['grade']) => string;
  onAddToCart: (product: Product) => void;
  onAddMultipleToCart?: (products: Product[]) => void;
  multiSelectEnabled?: boolean;
  viewMode?: PosProductViewMode;
  onViewModeChange?: (mode: PosProductViewMode) => void;
}

const stockStatusOf = (available: number, minLevel: number) => {
  if (available <= 0) return { label: 'غير متوفر', className: 'text-rose-700 bg-rose-50 border-rose-200', dot: 'bg-rose-500' };
  if (minLevel > 0 && available <= minLevel) return { label: 'منخفض', className: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' };
  return { label: 'متوفر', className: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' };
};

const PAGE_SIZE = 48;

export const PosProductGrid: React.FC<PosProductGridProps> = ({
  products,
  cart,
  stockOf,
  gradeLabel,
  onAddToCart,
  onAddMultipleToCart,
  multiSelectEnabled = false,
  viewMode = 'grid',
  onViewModeChange,
}) => {
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);

  // العرض التدريجي: لا نرسم آلاف البطاقات دفعة واحدة (أداء الرسم يتدهور تربيعياً)
  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [products, viewMode]);

  useEffect(() => {
    const visibleIds = new Set(products.map((product) => product.id));
    setSelectedProductIds((previous) => {
      const next = new Set([...previous].filter((id) => visibleIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [products]);

  const toggleSelect = (id: string, e?: Pick<React.SyntheticEvent, 'stopPropagation'>) => {
    e?.stopPropagation();
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

  const cartQuantityByProduct = new Map<string, number>();
  cart.forEach((item) => {
    cartQuantityByProduct.set(
      item.product.id,
      (cartQuantityByProduct.get(item.product.id) || 0) + item.quantityM2
    );
  });

  const tableColumns: DataTableColumn<Product>[] = [];
  if (multiSelectEnabled) {
    tableColumns.push({
      key: 'select',
      header: 'تحديد',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (product) => (
        <input
          type="checkbox"
          aria-label={`تحديد ${product.name}`}
          checked={selectedProductIds.has(product.id)}
          onChange={(event) => toggleSelect(product.id, event)}
          className="rounded border-slate-300 text-sky-600"
        />
      ),
    });
  }
  tableColumns.push(
    {
      key: 'product',
      header: 'الصنف',
      render: (product) => (
        <div className="flex min-w-[180px] items-center gap-2">
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
            {product.imagePath
              ? <img src={product.imagePath} alt="" loading="lazy" className="h-full w-full object-cover" />
              : <div className="flex h-full w-full items-center justify-center text-slate-300"><Package className="h-4 w-4" /></div>}
          </div>
          <span className="font-bold text-slate-900">{product.name}</span>
        </div>
      ),
    },
    {
      key: 'codes',
      header: 'الكود',
      className: 'font-mono',
      render: (product) => (
        <>
          <div>{product.sku || '—'}</div>
          <div className="text-[10px] text-slate-500">{product.barcode || '—'}</div>
        </>
      ),
    },
    {
      key: 'details',
      header: 'التفاصيل',
      render: (product) => (
        <>
          <div className="font-bold text-slate-700">{product.categoryName || product.brandName || '—'}</div>
          <div className="text-[10px] text-slate-500">
            {[
              product.brandName,
              product.productType === 'GENERAL' ? null : product.size,
              product.productType === 'GENERAL' ? null : gradeLabel(product.grade),
              product.color,
              product.finish,
            ].filter(Boolean).join(' • ') || '—'}
          </div>
        </>
      ),
    },
    {
      key: 'unit',
      header: 'الوحدة',
      render: (product) => (
        <>
          <div className="font-bold">{getProductUnitLabel(product)}</div>
          {product.productType !== 'GENERAL' && (
            <div className="text-[10px] text-slate-500">
              {product.metersPerBox} م² / كرتونة · {product.piecesPerBox} قطعة
            </div>
          )}
        </>
      ),
    },
    {
      key: 'price',
      header: 'السعر',
      className: 'font-mono font-bold text-sky-700',
      render: (product) => (
        <>
          <div>{CeramicMath.formatCurrency(product.sellingPriceM2)}</div>
          <div className="text-[10px] font-normal text-slate-500">لكل {getProductUnitLabel(product)}</div>
          {product.productType !== 'GENERAL' && product.sellingPriceBox > 0 && (
            <div className="text-[10px] font-normal text-slate-500">
              الكرتونة: {CeramicMath.formatCurrency(product.sellingPriceBox)}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'stock',
      header: 'المخزون',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (product) => {
        const available = stockOf(product.id);
        const status = stockStatusOf(available, product.minStockLevel);
        return (
          <div className="flex min-w-[92px] flex-col items-center gap-1">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${status.className}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
            <span className="text-[11px] font-black tabular-nums text-slate-700">
              {formatProductQuantity(available, product)}
            </span>
          </div>
        );
      },
    },
    {
      key: 'in-cart',
      header: 'في السلة',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (product) => {
        const quantity = cartQuantityByProduct.get(product.id) || 0;
        return quantity > 0
          ? <span className="whitespace-nowrap rounded-lg bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700">{formatProductQuantity(quantity, product)}</span>
          : <span className="text-slate-400">—</span>;
      },
    },
    {
      key: 'action',
      header: 'الإجراء',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (product) => (
        <button
          type="button"
          aria-label={`إضافة ${product.name} إلى السلة`}
          onClick={() => onAddToCart(product)}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-sky-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-3.5 w-3.5" />
          أضف للسلة
        </button>
      ),
    },
  );

  const renderedProducts = useMemo(() => products.slice(0, visibleLimit), [products, visibleLimit]);

  const renderCard = (p: Product) => {
    const available = stockOf(p.id);
    const isLow = p.minStockLevel > 0 && available <= p.minStockLevel;
    const inCartQuantityM2 = cartQuantityByProduct.get(p.id) || 0;
    const inCart = inCartQuantityM2 > 0;
    const isSelected = selectedProductIds.has(p.id);
    const status = stockStatusOf(available, p.minStockLevel);
    const unitLabel = getProductUnitLabel(p);
    const isCeramic = p.productType !== 'GENERAL';

    return (
      <article
        key={p.id}
        className={`relative text-right bg-white rounded-2xl border transition flex flex-col group overflow-hidden ${
          isSelected
            ? 'border-sky-500 ring-2 ring-sky-500/25 shadow-md bg-sky-50/30'
            : 'border-slate-200 hover:border-sky-400 hover:shadow-lg hover:-translate-y-0.5'
        } min-h-[184px]`}
      >
        {multiSelectEnabled && (
          <button
            type="button"
            aria-label={isSelected ? 'إلغاء تحديد الصنف' : 'تحديد الصنف'}
            aria-pressed={isSelected}
            onClick={(e) => toggleSelect(p.id, e)}
            className="absolute top-2 left-2 z-10 rounded-lg border border-slate-200 bg-white/95 p-1.5 text-sky-600 shadow-sm transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            {isSelected
              ? <CheckSquare className="w-5 h-5 fill-sky-600 text-white" />
              : <Square className="w-5 h-5 text-slate-400 hover:text-sky-600" />}
          </button>
        )}

        {inCart && (
          <span className="absolute top-0 right-4 bg-sky-600 text-white text-[11px] font-black px-2.5 py-1 rounded-b-xl shadow">
            في السلة: {formatProductQuantity(inCartQuantityM2, p)}
          </span>
        )}

        <button
          type="button"
          aria-label={`إضافة ${p.name} إلى السلة`}
          onClick={() => onAddToCart(p)}
          className="w-full flex flex-1 flex-col text-right rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
        >
          {/* صورة المنتج — أو مكان مخصص لها لو لم تُضف بعد */}
          {p.imagePath ? (
            <img
              src={p.imagePath}
              alt={p.name}
              loading="lazy"
              className="h-[72px] w-full shrink-0 object-cover bg-slate-100"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-[72px] w-full shrink-0 items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 text-slate-300"
            >
              <Package className="h-8 w-8" strokeWidth={1.5} />
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col p-2 pb-1.5">
            <div className="mb-1 flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-700 truncate">
                {isCeramic ? gradeLabel(p.grade) : unitLabel}
              </span>
              <span className="text-[10px] font-bold text-slate-400 font-mono truncate" title={p.sku ? `SKU: ${p.sku}` : ''}>
                SKU: {p.sku || '—'}
              </span>
            </div>

            <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-slate-900 transition group-hover:text-sky-700">
              {p.name}
            </h3>

            {(p.brandName || p.color || p.size) && (
              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                {[p.size, p.brandName, p.color].filter(Boolean).join(' • ')}
              </p>
            )}

            <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
              <div className="min-w-0">
                <div className="whitespace-nowrap text-lg font-black leading-none tabular-nums text-sky-700">
                  {CeramicMath.formatCurrency(p.sellingPriceM2)}
                </div>
                <div className="mt-0.5 text-[9px] font-bold text-slate-500">لكل {unitLabel}</div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.className}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </span>
                <span className={`text-[11px] font-black tabular-nums ${isLow || available <= 0 ? 'text-amber-700' : 'text-slate-600'}`}>
                  {formatProductQuantity(available, p)}
                </span>
              </div>
            </div>
          </div>

          <span className="flex items-center justify-center gap-1.5 border-t border-slate-100 bg-slate-50/60 py-1.5 text-[11px] font-black text-sky-800 transition group-hover:bg-sky-50 group-hover:text-sky-900">
            <Plus className="h-3.5 w-3.5" /> أضف إلى السلة
          </span>
        </button>
      </article>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* شريط الوضع: Grid / List + عدد النتائج */}
      <div className="px-4 pt-2.5 pb-1 flex items-center justify-between gap-2 shrink-0">
        <span className="text-[11px] text-slate-500 font-bold" aria-live="polite">
          {products.length > 0 && `يعرض ${Math.min(renderedProducts.length, products.length)} من ${products.length} صنف`}
        </span>
        {onViewModeChange && (
          <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              aria-pressed={viewMode === 'grid'}
              title="عرض شبكي Grid"
              aria-label="عرض شبكي"
              className={`h-9 px-3 flex items-center gap-1.5 text-[11px] font-bold transition ${viewMode === 'grid' ? 'bg-sky-600 text-white' : 'bg-white text-slate-500 hover:text-slate-800'}`}
            >
              <LayoutGrid className="w-4 h-4" /> شبكة
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              aria-pressed={viewMode === 'list'}
              title="عرض جدول كامل"
              aria-label="عرض جدول كامل"
              className={`h-9 px-3 flex items-center gap-1.5 text-[11px] font-bold transition ${viewMode === 'list' ? 'bg-sky-600 text-white' : 'bg-white text-slate-500 hover:text-slate-800'}`}
            >
              <List className="w-4 h-4" /> جدول
            </button>
          </div>
        )}
      </div>

      {multiSelectEnabled && products.length > 0 && (
        <div className="bg-sky-50 border-b border-sky-100 px-4 py-2 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-sky-900">
              تم تحديد {selectedProductIds.size} صنف
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={selectAll}
                className="text-[11px] text-sky-700 hover:text-sky-900 font-bold px-1.5 py-0.5 rounded hover:bg-sky-100"
              >
                تحديد الكل
              </button>
              {selectedProductIds.size > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[11px] text-slate-500 hover:text-slate-700 font-bold px-1.5 py-0.5 rounded hover:bg-slate-200"
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

      <div className={`min-h-0 flex-1 p-4 pt-2 ${viewMode === 'list' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        {products.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
            <Search className="w-14 h-14 mb-3 opacity-30" strokeWidth={1.5} />
            <p className="font-black text-lg">لا توجد أصناف مطابقة</p>
            <p className="text-xs mt-1.5">جرّب تغيير كلمة البحث أو مسح الفلاتر</p>
          </div>
        ) : (
          viewMode === 'list' ? (
            <>
              <DataTable
                ariaLabel="جدول أصناف نقطة البيع"
                columns={tableColumns}
                rows={renderedProducts}
                rowKey={(product) => product.id}
                minWidth={1120}
                className="pos-products-table-scroll"
                tableClassName="text-right text-xs pos-products-table"
                rowClassName={(product) => selectedProductIds.has(product.id) ? 'bg-sky-50/60' : ''}
              />
              {visibleLimit < products.length && (
                <div className="flex shrink-0 justify-center pt-3">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((value) => value + PAGE_SIZE)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:border-sky-400 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                  >
                    عرض المزيد ({products.length - renderedProducts.length} صنف متبقي)
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] content-start items-start gap-3">
                {renderedProducts.map(renderCard)}
              </div>
              {visibleLimit < products.length && (
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((value) => value + PAGE_SIZE)}
                    className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:border-sky-400 hover:text-sky-700 transition shadow-sm"
                  >
                    عرض المزيد ({products.length - renderedProducts.length} صنف متبقي)
                  </button>
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
};
