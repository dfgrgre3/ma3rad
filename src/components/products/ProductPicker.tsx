import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  MoreHorizontal,
  PackageSearch,
  RotateCw,
  Search,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { ProductService, type ProductQueryOptions } from '../../services/domains/products/ProductService';
import { CategoryService } from '../../services/domains/products/CategoryService';
import { BrandService } from '../../services/domains/products/BrandService';
import type { Product } from '../../types';
import { getProductUnitLabel } from '../../utils/products/productUnits';
import { Modal } from '../ui/Modal';

const PAGE_SIZE = 25;
const SUGGESTION_PANEL_GAP = 8;
const SUGGESTION_PANEL_MAX_HEIGHT = 420;

interface SuggestionPosition {
  top: number;
  right: number;
  maxWidth: number;
  maxHeight: number;
}

interface ProductPickerProps {
  value: string;
  onChange: (productId: string, product: Product) => void;
  selectedLabel?: string;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  allowedProductIds?: string[];
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export const ProductPicker: React.FC<ProductPickerProps> = ({
  value,
  onChange,
  selectedLabel,
  id,
  ariaLabel = 'استعراض جميع الأصناف',
  placeholder = 'اختر الصنف',
  allowedProductIds,
  required = false,
  disabled = false,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [fieldSearch, setFieldSearch] = useState(value ? selectedLabel || value : '');
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [suggestionPosition, setSuggestionPosition] = useState<SuggestionPosition | null>(null);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [stockStatus, setStockStatus] = useState<ProductQueryOptions['stockStatus']>('all');
  const [sortBy, setSortBy] = useState<ProductQueryOptions['sortBy']>('name');
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [filterOptionsError, setFilterOptionsError] = useState('');
  const [retry, setRetry] = useState(0);
  const [optionsRetry, setOptionsRetry] = useState(0);
  const requestId = useRef(0);
  const suggestionRequestId = useRef(0);
  const optionsLoaded = useRef(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const suggestionPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFieldSearch(value ? selectedLabel || value : '');
  }, [value, selectedLabel]);

  useEffect(() => {
    const query = fieldSearch.trim();
    if (open || !suggestionsOpen || !query) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      setSuggestionsError('');
      return;
    }

    const request = ++suggestionRequestId.current;
    setSuggestionsLoading(true);
    setSuggestionsError('');
    const timer = window.setTimeout(() => {
      try {
        const result = new ProductService().getProductsPage(
          query,
          undefined,
          undefined,
          1,
          7,
          { status: 'active', productIds: allowedProductIds },
        );
        if (request === suggestionRequestId.current) setSuggestions(result.items);
      } catch (error) {
        if (request !== suggestionRequestId.current) return;
        setSuggestions([]);
        setSuggestionsError(error instanceof Error ? error.message : 'تعذر البحث عن الأصناف.');
      } finally {
        if (request === suggestionRequestId.current) setSuggestionsLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      if (request === suggestionRequestId.current) suggestionRequestId.current += 1;
    };
  }, [fieldSearch, open, suggestionsOpen, allowedProductIds]);

  useEffect(() => {
    if (!suggestionsOpen || !fieldSearch.trim() || !fieldRef.current) return;

    const updatePosition = () => {
      const rect = fieldRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = SUGGESTION_PANEL_GAP;
      const right = Math.max(gap, window.innerWidth - rect.right);
      const maxWidth = Math.max(1, window.innerWidth - right - gap);
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap);
      const spaceAbove = Math.max(0, rect.top - gap);
      const openBelow = spaceBelow >= Math.min(SUGGESTION_PANEL_MAX_HEIGHT, 220) || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(120, Math.min(SUGGESTION_PANEL_MAX_HEIGHT, openBelow ? spaceBelow : spaceAbove));
      const top = openBelow ? rect.bottom + 4 : Math.max(gap, rect.top - maxHeight - 4);
      setSuggestionPosition((current) => (
        current?.top === top
        && current.right === right
        && current.maxWidth === maxWidth
        && current.maxHeight === maxHeight
          ? current
          : { top, right, maxWidth, maxHeight }
      ));
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [suggestionsOpen, fieldSearch]);

  const loadProducts = useCallback(() => {
    const request = ++requestId.current;
    setLoading(true);
    setLoadError('');
    const timer = window.setTimeout(() => {
      try {
        const result = new ProductService().getProductsPage(
          search,
          categoryId || undefined,
          brandId || undefined,
          page,
          PAGE_SIZE,
          { stockStatus, sortBy, status: 'active', productIds: allowedProductIds },
        );
        if (request !== requestId.current) return;
        setProducts(result.items);
        setTotalItems(result.totalItems);
        setTotalPages(result.totalPages);
        setPage(result.page);
      } catch (error) {
        if (request !== requestId.current) return;
        setProducts([]);
        setTotalItems(0);
        setTotalPages(1);
        setLoadError(error instanceof Error ? error.message : 'تعذر تحميل الأصناف.');
      } finally {
        if (request === requestId.current) setLoading(false);
      }
    }, 120);
    return () => {
      window.clearTimeout(timer);
      if (request === requestId.current) requestId.current += 1;
    };
  }, [search, categoryId, brandId, stockStatus, sortBy, page, allowedProductIds]);

  useEffect(() => {
    if (!open) return;
    return loadProducts();
  }, [open, loadProducts, retry]);

  useEffect(() => {
    if (!open || optionsLoaded.current) return;
    optionsLoaded.current = true;
    const errors: string[] = [];
    try {
      setCategories(new CategoryService().getAllCategories().map(({ id: categoryId, name }) => ({ id: categoryId, name })));
    } catch {
      errors.push('التصنيفات');
    }
    try {
      setBrands(new BrandService().getAllBrands().map(({ id: brandId, name }) => ({ id: brandId, name })));
    } catch {
      errors.push('الماركات');
    }
    setFilterOptionsError(errors.length ? `تعذر تحميل فلاتر ${errors.join(' و')}.` : '');
  }, [open, optionsRetry]);

  const openPicker = () => {
    if (disabled) return;
    setSearch(fieldSearch.trim());
    setPage(1);
    setSuggestionsOpen(false);
    setLoading(true);
    setOpen(true);
  };

  const closePicker = useCallback(() => setOpen(false), []);

  const retryFilterOptions = () => {
    optionsLoaded.current = false;
    setOptionsRetry((current) => current + 1);
  };

  const chooseProduct = (product: Product) => {
    onChange(product.id, product);
    setFieldSearch(product.name);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
    setOpen(false);
  };

  const handleFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault();
      setActiveSuggestion((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault();
      setActiveSuggestion((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === 'Enter' && activeSuggestion >= 0 && suggestions[activeSuggestion]) {
      event.preventDefault();
      chooseProduct(suggestions[activeSuggestion]);
    } else if (event.key === 'Escape') {
      setSuggestionsOpen(false);
      setActiveSuggestion(-1);
    }
  };

  const changeFilter = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLSelectElement>) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <>
      <div
        className={`relative flex min-w-0 items-stretch gap-2 ${className}`}
        onBlur={(event) => {
          const nextTarget = event.relatedTarget as Node | null;
          if (!event.currentTarget.contains(nextTarget) && !suggestionPanelRef.current?.contains(nextTarget)) {
            setSuggestionsOpen(false);
            setActiveSuggestion(-1);
          }
        }}
      >
        <div ref={fieldRef} className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id={id}
            type="search"
            role="combobox"
            value={fieldSearch}
            onChange={(event) => {
              setFieldSearch(event.target.value);
              setSuggestionsOpen(Boolean(event.target.value.trim()));
              setActiveSuggestion(-1);
            }}
            onFocus={() => {
              if (fieldSearch.trim()) setSuggestionsOpen(true);
            }}
            onKeyDown={handleFieldKeyDown}
            disabled={disabled}
            required={required}
            aria-label={ariaLabel.replace(/^استعراض/, 'بحث عن')}
            aria-autocomplete="list"
            aria-controls={suggestionsOpen ? `${id || 'product-picker'}-suggestions` : undefined}
            aria-expanded={suggestionsOpen}
            aria-required={required || undefined}
            autoComplete="off"
            placeholder={placeholder}
            className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pr-9 pl-12 text-right text-sm text-slate-700 transition placeholder:text-slate-500 hover:border-sky-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            onClick={openPicker}
            disabled={disabled}
            aria-label={ariaLabel}
            title={ariaLabel}
            aria-haspopup="dialog"
            aria-expanded={open}
            className="absolute left-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
          {suggestionsOpen && fieldSearch.trim() && suggestionPosition && createPortal(
            <div
              data-testid="product-suggestions-panel"
              ref={suggestionPanelRef}
              className="selection-list fixed z-[160] flex flex-col overflow-hidden"
              style={{
                top: suggestionPosition.top,
                right: suggestionPosition.right,
                width: 'max-content',
                maxWidth: suggestionPosition.maxWidth,
                maxHeight: suggestionPosition.maxHeight,
              }}
              role="region"
              aria-label="نتائج البحث عن الأصناف"
            >
              <div className="min-h-0 flex-1 overflow-auto">
                {suggestionsLoading ? (
                  <p className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500" role="status">
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> جارٍ البحث عن الأصناف…
                  </p>
                ) : suggestionsError ? (
                  <p className="px-3 py-3 text-sm text-rose-700" role="alert">{suggestionsError}</p>
                ) : suggestions.length ? (
                  <ul id={`${id || 'product-picker'}-suggestions`} className="selection-list__options min-h-0 overflow-auto" role="listbox" aria-label="الأصناف المطابقة">
                    {suggestions.map((product, index) => (
                      <li key={product.id} role="option" aria-selected={index === activeSuggestion}>
                        <button
                          type="button"
                          tabIndex={-1}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => chooseProduct(product)}
                          className={`selection-list__row flex w-full items-center justify-between gap-3 px-3 py-2.5 text-right ${index === activeSuggestion ? 'is-selected' : ''}`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{product.name}</span>
                            <span className="selection-list__meta mt-0.5 block truncate text-xs">
                              {[product.sku && `الكود: ${product.sku}`, product.barcode && `الباركود: ${product.barcode}`, product.size && `المقاس: ${product.size}`].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <span className="selection-list__meta shrink-0 text-xs">{getProductUnitLabel(product)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-3 text-sm text-slate-500" role="status">لا توجد أصناف مطابقة للبحث.</p>
                )}
              </div>
            </div>,
            document.body,
          )}
        </div>
      </div>

      <Modal
        open={open}
        onClose={closePicker}
        title="اختيار الصنف"
        description="ابحث في دليل الأصناف النشطة، ثم استخدم الفلاتر والتنقل لاختيار الصنف المطلوب."
        icon={<PackageSearch className="h-5 w-5" />}
        size="xl"
        className="max-h-[90vh]"
      >
        <div className="space-y-4">
          {filterOptionsError && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
              <span>{filterOptionsError} يمكنك متابعة البحث دون استخدامها.</span>
              <button type="button" onClick={retryFilterOptions} className="rounded-md px-2 py-1 font-bold underline underline-offset-2 hover:bg-amber-100">
                إعادة تحميل الفلاتر
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="relative sm:col-span-2">
              <span className="sr-only">بحث بالاسم أو الكود أو الباركود أو المقاس</span>
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                autoFocus
                type="search"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="بحث بالاسم أو الكود أو الباركود أو المقاس"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pr-9 pl-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </label>
            <label>
              <span className="sr-only">تصفية حسب التصنيف</span>
              <select value={categoryId} onChange={changeFilter((value) => setCategoryId(value))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none">
                <option value="">كل التصنيفات</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">تصفية حسب الماركة</span>
              <select value={brandId} onChange={changeFilter((value) => setBrandId(value))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none">
                <option value="">كل الماركات</option>
                {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">تصفية حسب حالة المخزون</span>
              <select value={stockStatus} onChange={(event) => { setStockStatus(event.target.value as ProductQueryOptions['stockStatus']); setPage(1); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none">
                <option value="all">كل حالات المخزون</option>
                <option value="in">متوفر</option>
                <option value="low">مخزون منخفض</option>
                <option value="out">نفد المخزون</option>
              </select>
            </label>
            <label>
              <span className="sr-only">ترتيب الأصناف</span>
              <select value={sortBy} onChange={(event) => { setSortBy(event.target.value as ProductQueryOptions['sortBy']); setPage(1); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none">
                <option value="name">ترتيب بالاسم</option>
                <option value="newest">الأحدث</option>
                <option value="price_asc">السعر: الأقل أولاً</option>
                <option value="price_desc">السعر: الأعلى أولاً</option>
                <option value="stock_desc">المخزون: الأعلى أولاً</option>
              </select>
            </label>
          </div>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500" role="status" aria-live="polite">
              <LoaderCircle className="h-5 w-5 animate-spin text-sky-600" aria-hidden="true" />
              جارٍ تحميل الأصناف…
            </div>
          ) : loadError ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-5 text-center" role="alert">
              <p className="text-sm font-semibold text-rose-800">{loadError}</p>
              <button type="button" onClick={() => setRetry((current) => current + 1)} className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100">
                <RotateCw className="h-4 w-4" aria-hidden="true" /> إعادة المحاولة
              </button>
            </div>
          ) : products.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center" role="status">
              <PackageSearch className="mb-2 h-7 w-7 text-slate-400" aria-hidden="true" />
              <p className="text-sm font-bold text-slate-700">لا توجد أصناف مطابقة</p>
              <p className="mt-1 text-xs text-slate-500">غيّر عبارة البحث أو الفلاتر لعرض نتائج أخرى.</p>
            </div>
          ) : (
            <div className="selection-list overflow-hidden">
              <div className="max-h-[48vh] overflow-auto">
                <ul className="selection-list__options" aria-label="نتائج الأصناف">
                  {products.map((product) => (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => chooseProduct(product)}
                        className="selection-list__row flex w-full items-center justify-between gap-4 px-4 py-3 text-right focus-visible:outline-none"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{product.name}</span>
                          <span className="selection-list__meta mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            {product.sku && <span>الكود: {product.sku}</span>}
                            {product.barcode && <span>الباركود: {product.barcode}</span>}
                            {product.size && <span>المقاس: {product.size}</span>}
                            {product.categoryName && <span>{product.categoryName}</span>}
                          </span>
                        </span>
                        <span className="shrink-0 text-left">
                          <span className="block text-xs font-bold">{getProductUnitLabel(product)}</span>
                          {typeof product.totalStockM2 === 'number' && <span className="selection-list__meta mt-1 block text-[11px]">المخزون: {product.totalStockM2}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500" aria-live="polite">
                  {totalItems.toLocaleString('ar')} صنف · صفحة {page.toLocaleString('ar')} من {totalPages.toLocaleString('ar')}
                </p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45">
                    <ChevronRight className="h-4 w-4" aria-hidden="true" /> السابق
                  </button>
                  <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45">
                    التالي <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

export default ProductPicker;
