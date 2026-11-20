import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, CheckSquare, Square, ShoppingCart, LayoutGrid, List, Package,
} from 'lucide-react';
import type { Product } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../../../../utils/products/productUnits';
import { DataTable, type DataTableColumn } from '../../../../components/ui/DataTable';
import type { CartItem } from '../../../../types/pos';

export type PosProductViewMode = 'grid' | 'list';

export interface PosProductGridProps {
  products: Product[];
  productsTotal?: number;
  onLoadMore?: () => void;
  cart: CartItem[];
  stockOf: (productId: string) => number;
  gradeLabel: (grade: Product['grade']) => string;
  onAddToCart: (product: Product) => void;
  onAddMultipleToCart?: (products: Product[]) => void;
  allowNegativeStock?: boolean;
  multiSelectEnabled?: boolean;
  viewMode?: PosProductViewMode;
  onViewModeChange?: (mode: PosProductViewMode) => void;
}

const stockStatusOf = (available: number, minLevel: number) => {
  if (available <= 0) return { label: 'غير متوفر', className: 'text-danger bg-danger-soft border-danger-border', dot: 'bg-danger' };
  if (minLevel > 0 && available <= minLevel) return { label: 'منخفض', className: 'text-warning bg-warning-soft border-warning-border', dot: 'bg-warning' };
  return { label: 'متوفر', className: 'text-success bg-success-soft border-success-border', dot: 'bg-success' };
};

const PAGE_SIZE = 48;

const ProductImage: React.FC<{ src?: string; alt: string; compact?: boolean }> = ({ src, alt, compact = false }) => {
  const [failed, setFailed] = useState(false);
  const sizeClass = compact ? 'h-8 w-8' : 'h-[72px] w-full';

  if (!src || failed) {
    return (
      <div aria-hidden="true" className={`flex ${sizeClass} shrink-0 items-center justify-center bg-gradient-to-br from-line to-line text-muted`}>
        <Package className={compact ? 'h-4 w-4' : 'h-8 w-8'} strokeWidth={1.5} />
      </div>
    );
  }

  return <img src={src} alt={alt} loading="lazy" className={`${sizeClass} shrink-0 object-cover bg-surface-sunken`} onError={() => setFailed(true)} />;
};

export const PosProductGrid: React.FC<PosProductGridProps> = ({
  products,
  productsTotal = products.length,
  onLoadMore,
  cart,
  stockOf,
  gradeLabel,
  onAddToCart,
  onAddMultipleToCart,
  allowNegativeStock = false,
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
    const selected = products.filter((p) => selectedProductIds.has(p.id));
    const blocked = selected.filter((p) => p.productType !== 'GENERAL' && p.baseUnit !== 'SERVICE' && stockOf(p.id) <= 0 && !allowNegativeStock);
    const toAdd = selected.filter((p) => !blocked.includes(p));
    if (blocked.length > 0) window.alert(`تم استبعاد ${blocked.length} صنف لعدم توفر رصيد في المخزن المحدد.`);
    const outOfStock = toAdd.filter((p) => p.productType !== 'GENERAL' && p.baseUnit !== 'SERVICE' && stockOf(p.id) <= 0);
    if (outOfStock.length > 0 && !window.confirm(`يوجد ${outOfStock.length} صنف بدون رصيد. هل تريد إضافتها مع السماح بالمخزون السالب؟`)) return;
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
          className="rounded border-line-strong text-primary"
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
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md border border-line bg-surface-sunken">
            <ProductImage src={product.imagePath} alt="" compact />
          </div>
          <span className="font-bold text-ink">{product.name}</span>
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
          <div className="text-[10px] text-muted">{product.barcode || '—'}</div>
        </>
      ),
    },
    {
      key: 'details',
      header: 'التفاصيل',
      render: (product) => (
        <>
          <div className="font-bold text-ink">{product.categoryName || product.brandName || '—'}</div>
          <div className="text-[10px] text-muted">
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
            <div className="text-[10px] text-muted">
              {product.metersPerBox} م² / كرتونة · {product.piecesPerBox} قطعة
            </div>
          )}
        </>
      ),
    },
    {
      key: 'price',
      header: 'السعر',
      className: 'font-mono font-bold text-primary',
      render: (product) => (
        <>
          <div>{CeramicMath.formatCurrency(product.sellingPriceM2)}</div>
          <div className="text-[10px] font-normal text-muted">لكل {getProductUnitLabel(product)}</div>
          {product.productType !== 'GENERAL' && product.sellingPriceBox > 0 && (
            <div className="text-[10px] font-normal text-muted">
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
            <span className="text-[11px] font-black tabular-nums text-ink">
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
          ? <span className="whitespace-nowrap rounded-lg bg-accent-soft px-2 py-1 text-[11px] font-bold text-primary">{formatProductQuantity(quantity, product)}</span>
          : <span className="text-muted">—</span>;
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
          onClick={() => {
            const available = stockOf(product.id);
            if (available <= 0 && allowNegativeStock && !window.confirm(`رصيد ${product.name} غير متاح (${formatProductQuantity(available, product)}). هل تريد إضافته مع السماح بالمخزون السالب؟`)) return;
            onAddToCart(product);
          }}
          disabled={stockOf(product.id) <= 0 && !allowNegativeStock && product.productType !== 'GENERAL' && product.baseUnit !== 'SERVICE'}
          title={stockOf(product.id) <= 0 && !allowNegativeStock ? 'لا يمكن الإضافة: لا يوجد رصيد متاح في المخزن المحدد' : undefined}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-primary disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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
    const isTrackedStock = p.productType !== 'GENERAL' && p.baseUnit !== 'SERVICE';
    const cannotAdd = isTrackedStock && available <= 0 && !allowNegativeStock;

    return (
      <article
        key={p.id}
        className={`relative text-right bg-surface rounded-2xl border transition flex flex-col group overflow-hidden ${
 isSelected
 ? 'border-primary ring-2 ring-primary/25 shadow-md bg-accent-soft/30'
 : 'border-line hover:border-primary hover:shadow-lg hover:-translate-y-0.5'
 } min-h-[184px]`}
      >
        {multiSelectEnabled && (
          <button
            type="button"
            aria-label={isSelected ? 'إلغاء تحديد الصنف' : 'تحديد الصنف'}
            aria-pressed={isSelected}
            onClick={(e) => toggleSelect(p.id, e)}
            className="absolute top-2 left-2 z-10 rounded-lg border border-line bg-surface/95 p-1.5 text-primary shadow-sm transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {isSelected
              ? <CheckSquare className="w-5 h-5 fill-primary text-white" />
              : <Square className="w-5 h-5 text-muted hover:text-primary" />}
          </button>
        )}

        {inCart && (
          <span className="absolute top-0 right-4 bg-primary text-white text-[11px] font-black px-2.5 py-1 rounded-b-xl shadow">
            في السلة: {formatProductQuantity(inCartQuantityM2, p)}
          </span>
        )}

        <button
          type="button"
          aria-label={`إضافة ${p.name} إلى السلة`}
          onClick={() => {
            if (cannotAdd) return;
            if (isTrackedStock && available <= 0 && allowNegativeStock && !window.confirm(`رصيد ${p.name} غير متاح (${formatProductQuantity(available, p)}). هل تريد إضافته مع السماح بالمخزون السالب؟`)) return;
            onAddToCart(p);
          }}
          disabled={cannotAdd}
          title={cannotAdd ? 'لا يمكن الإضافة: لا يوجد رصيد متاح في المخزن المحدد' : undefined}
          className={`w-full flex flex-1 flex-col text-right rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${cannotAdd ? 'cursor-not-allowed opacity-70' : ''}`}
        >
          {/* صورة المنتج — أو مكان مخصص لها لو لم تُضف بعد */}
          <ProductImage src={p.imagePath} alt={p.name} />

          <div className="flex min-w-0 flex-1 flex-col p-2 pb-1.5">
            <div className="mb-1 flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-primary/10 text-primary truncate">
                {isCeramic ? gradeLabel(p.grade) : unitLabel}
              </span>
              <span className="text-[10px] font-bold text-muted font-mono truncate" title={p.sku ? `SKU: ${p.sku}` : ''}>
                SKU: {p.sku || '—'}
              </span>
            </div>

            <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-ink transition group-hover:text-primary">
              {p.name}
            </h3>

            {(p.brandName || p.color || p.size) && (
              <p className="mt-0.5 truncate text-[10px] text-muted">
                {[p.size, p.brandName, p.color].filter(Boolean).join(' • ')}
              </p>
            )}

            <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
              <div className="min-w-0">
                <div className="whitespace-nowrap text-lg font-black leading-none tabular-nums text-primary">
                  {CeramicMath.formatCurrency(p.sellingPriceM2)}
                </div>
                <div className="mt-0.5 text-[9px] font-bold text-muted">لكل {unitLabel}</div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.className}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                  {cannotAdd ? 'غير متاح للبيع' : status.label}
                </span>
                <span className={`text-[11px] font-black tabular-nums ${isLow || available <= 0 ? 'text-warning' : 'text-ink-secondary'}`}>
                  {formatProductQuantity(available, p)}
                </span>
              </div>
            </div>
          </div>

          <span className={`flex items-center justify-center gap-1.5 border-t border-line py-1.5 text-[11px] font-black ${cannotAdd ? 'bg-danger-soft text-danger' : isTrackedStock && available <= p.minStockLevel ? 'bg-warning-soft text-warning' : 'bg-surface-muted/60 text-primary transition group-hover:bg-accent-soft group-hover:text-primary'}`}>
            <Plus className="h-3.5 w-3.5" /> {cannotAdd ? 'لا يوجد رصيد متاح' : isTrackedStock && available <= p.minStockLevel ? `رصيد منخفض · ${formatProductQuantity(available, p)}` : 'أضف إلى السلة'}
          </span>
        </button>
      </article>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* شريط الوضع: Grid / List + عدد النتائج */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-2">
        <span className="text-[11px] text-muted font-bold" aria-live="polite">
          {products.length > 0 && `يعرض ${Math.min(renderedProducts.length, products.length)} من ${products.length} محمّل · الإجمالي ${productsTotal} · المتبقي للتحميل ${Math.max(0, productsTotal - products.length)}`}
        </span>
        {onViewModeChange && (
          <div className="flex items-center overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              aria-pressed={viewMode === 'grid'}
              title="عرض شبكي Grid"
              aria-label="عرض شبكي"
              className={`h-9 px-3 flex items-center gap-1.5 text-[11px] font-bold transition ${viewMode === 'grid' ? 'bg-primary text-white' : 'bg-surface text-muted hover:text-ink'}`}
            >
              <LayoutGrid className="w-4 h-4" /> شبكة
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              aria-pressed={viewMode === 'list'}
              title="عرض جدول كامل"
              aria-label="عرض جدول كامل"
              className={`h-9 px-3 flex items-center gap-1.5 text-[11px] font-bold transition ${viewMode === 'list' ? 'bg-primary text-white' : 'bg-surface text-muted hover:text-ink'}`}
            >
              <List className="w-4 h-4" /> جدول
            </button>
          </div>
        )}
      </div>

      {multiSelectEnabled && products.length > 0 && (
        <div className="bg-accent-soft border-b border-accent-border px-4 py-2 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary">
              تم تحديد {selectedProductIds.size} صنف
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={selectAll}
                className="text-[11px] text-primary hover:text-primary font-bold px-1.5 py-0.5 rounded hover:bg-accent-soft"
              >
                تحديد المنتجات المعروضة
              </button>
              {selectedProductIds.size > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[11px] text-muted hover:text-ink font-bold px-1.5 py-0.5 rounded hover:bg-surface-sunken"
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary disabled:opacity-40 disabled:hover:bg-primary text-white text-xs font-bold shadow-sm transition"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            أضف المحدد ({selectedProductIds.size})
          </button>
        </div>
      )}

      <div className={`min-h-0 flex-1 p-3 pt-2 max-[900px]:pb-24 ${viewMode === 'list' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        {products.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted">
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
                rowClassName={(product) => selectedProductIds.has(product.id) ? 'bg-accent-soft/60' : ''}
              />
              {visibleLimit < products.length && (
                <div className="flex shrink-0 justify-center pt-3">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((value) => value + PAGE_SIZE)}
                    className="rounded-lg border border-line bg-surface px-4 py-2 text-xs font-bold text-ink-secondary shadow-sm transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    عرض المزيد ({products.length - renderedProducts.length} صنف متبقي)
                  </button>
                </div>
              )}
              {onLoadMore && products.length < productsTotal && <div className="flex shrink-0 justify-center pt-3"><button type="button" onClick={onLoadMore} className="rounded-lg border border-line bg-surface px-4 py-2 text-xs font-bold text-ink-secondary shadow-sm">تحميل المزيد من المنتجات ({productsTotal - products.length} متبقي)</button></div>}
            </>
          ) : (
            <>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] content-start items-start gap-2">
                {renderedProducts.map(renderCard)}
              </div>
              {visibleLimit < products.length && (
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((value) => value + PAGE_SIZE)}
                    className="px-5 py-2.5 rounded-xl bg-surface border border-line text-xs font-bold text-ink-secondary hover:border-primary hover:text-primary transition shadow-sm"
                  >
                    عرض المزيد ({products.length - renderedProducts.length} صنف متبقي)
                  </button>
                </div>
              )}
              {onLoadMore && products.length < productsTotal && <div className="flex justify-center pt-4"><button type="button" onClick={onLoadMore} className="px-5 py-2.5 rounded-xl bg-surface border border-line text-xs font-bold text-ink-secondary shadow-sm">تحميل المزيد من المنتجات ({productsTotal - products.length} متبقي)</button></div>}
            </>
          )
        )}
      </div>
    </div>
  );
};
