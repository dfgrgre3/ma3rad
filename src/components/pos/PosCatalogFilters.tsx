import React, { useState } from 'react';
import {
  Calculator, ChevronDown, Layers, ListFilter, Package, Search, X,
} from 'lucide-react';
import type { Product, Warehouse } from '../../types';
import type { CategoryWithCount } from '../../services/products/CategoryService';
import type { SortMode } from '../../types/pos';
import type { ProductGradeOption } from '../../services/products/OperationalFieldService';

export interface PosCatalogFiltersProps {
  barcodeInputRef: React.RefObject<HTMLInputElement>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchSubmit: (event: React.FormEvent) => void;
  warehouses: Warehouse[];
  selectedWarehouseId: string;
  onWarehouseChange: (warehouseId: string) => void;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  inStockOnly: boolean;
  onToggleInStockOnly: () => void;
  visibleBrands: [string, string][];
  selectedBrand: string;
  onBrandChange: (brandId: string) => void;
  hasCeramicCatalog: boolean;
  selectedGrade: string;
  gradeOptions: ProductGradeOption[];
  onGradeChange: (grade: string) => void;
  visibleSizes: string[];
  selectedSize: string;
  onSizeChange: (size: string) => void;
  visibleColors: string[];
  selectedColor: string;
  onColorChange: (color: string) => void;
  onOpenCalculator: () => void;
  productsCount: number;
  visibleCategories: CategoryWithCount[];
  selectedCategory: string;
  onCategoryChange: (categoryId: string) => void;
  resultCount: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  searchSuggestions?: Product[];
  onSelectSuggestion?: (product: Product) => void;
}

const controlCls = 'h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition';

export const PosCatalogFilters: React.FC<PosCatalogFiltersProps> = ({
  barcodeInputRef,
  searchQuery,
  onSearchQueryChange,
  onSearchSubmit,
  warehouses,
  selectedWarehouseId,
  onWarehouseChange,
  sortMode,
  onSortModeChange,
  inStockOnly,
  onToggleInStockOnly,
  visibleBrands,
  selectedBrand,
  onBrandChange,
  hasCeramicCatalog,
  selectedGrade,
  gradeOptions,
  onGradeChange,
  visibleSizes,
  selectedSize,
  onSizeChange,
  visibleColors,
  selectedColor,
  onColorChange,
  onOpenCalculator,
  productsCount,
  visibleCategories,
  selectedCategory,
  onCategoryChange,
  resultCount,
  hasActiveFilters,
  onClearFilters,
  searchSuggestions = [],
  onSelectSuggestion,
}) => {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const advancedActiveCount = [
    inStockOnly,
    selectedBrand !== 'ALL',
    selectedGrade !== 'ALL',
    selectedSize !== 'ALL',
    selectedColor !== 'ALL',
  ].filter(Boolean).length;

  return (
    <div className="shrink-0 space-y-2 border-b border-slate-200 bg-white px-3 pb-2 pt-2">
      {/* ═══ الصف الأول: البحث (مركز العمل) + المخزن + الترتيب ═══ */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 relative">
          <form onSubmit={onSearchSubmit} className="relative">
            <label htmlFor="pos-product-search" className="sr-only">بحث عن منتج</label>
            <Search className="w-5 h-5 absolute right-3.5 top-1/2 -translate-y-1/2 text-sky-600 pointer-events-none" />
            <input
              id="pos-product-search"
              ref={barcodeInputRef}
              type="text"
              aria-label="بحث عن منتج"
              placeholder="امسح الباركود أو ابحث بالاسم / SKU / الكود الداخلي / المقاس… (F2)"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="w-full h-11 pl-10 pr-11 bg-sky-50/60 border-2 border-sky-100 rounded-2xl text-sm font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchQuery.trim().length > 0 && searchSuggestions.length > 0}
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="مسح البحث"
                onClick={() => onSearchQueryChange('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </form>
          {searchQuery.trim() && searchSuggestions.length > 0 && (
            <div className="selection-list absolute z-30 mt-1.5 w-full max-h-80 overflow-y-auto">
              {searchSuggestions.slice(0, 8).map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    if (onSelectSuggestion) onSelectSuggestion(product);
                    else onSearchQueryChange(product.name);
                  }}
                  className="selection-list__row w-full text-right px-4 py-2.5 text-xs flex items-center justify-between gap-3 last:border-0"
                >
                  <span className="font-bold truncate">{product.name}</span>
                  <span className="selection-list__meta text-[11px] font-mono shrink-0">{product.sku || product.barcode}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <label htmlFor="pos-warehouse-filter" className="sr-only">اختيار المخزن</label>
        <select
          id="pos-warehouse-filter"
          aria-label="اختيار المخزن"
          value={selectedWarehouseId}
          onChange={(e) => onWarehouseChange(e.target.value)}
          className={`${controlCls} hidden sm:block max-w-[180px]`}
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>المخزن: {w.name}</option>
          ))}
        </select>

        <label htmlFor="pos-sort-mode" className="sr-only">ترتيب المنتجات</label>
        <select
          id="pos-sort-mode"
          aria-label="ترتيب المنتجات"
          value={sortMode}
          onChange={(e) => onSortModeChange(e.target.value as SortMode)}
          className={`${controlCls} hidden md:block`}
        >
          <option value="NAME">ترتيب: الاسم</option>
          <option value="PRICE_ASC">الأرخص أولاً</option>
          <option value="PRICE_DESC">الأغلى أولاً</option>
          <option value="STOCK_DESC">الأكثر رصيداً</option>
        </select>

        <button
          type="button"
          aria-pressed={filtersOpen}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
          title="فلاتر متقدمة (ماركة / فرز / مقاس / لون / متوفر)"
          className={`h-10 flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold border transition ${
            filtersOpen || advancedActiveCount > 0
              ? 'bg-sky-600 text-white border-sky-600'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
          }`}
        >
          <ListFilter className="w-4 h-4" />
          <span className="hidden sm:inline">فلاتر</span>
          {advancedActiveCount > 0 && (
            <span className={`min-w-5 h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center ${filtersOpen ? 'bg-white text-sky-700' : 'bg-sky-600 text-white'}`}>
              {advancedActiveCount}
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* ═══ صف الفلاتر المتقدمة (قابل للطي) ═══ */}
      {filtersOpen && (
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100">
          <button
            type="button"
            aria-pressed={inStockOnly}
            onClick={onToggleInStockOnly}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold border transition ${
              inStockOnly
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700'
            }`}
          >
            <Package className="w-4 h-4" /> المتوفر فقط
          </button>

          <label htmlFor="pos-brand-filter" className="sr-only">فلتر الماركة</label>
          <select id="pos-brand-filter" aria-label="فلتر الماركة" value={selectedBrand} onChange={(e) => onBrandChange(e.target.value)} className={`${controlCls} h-9`}>
            <option value="ALL">كل الماركات</option>{visibleBrands.map(([id, name]) => <option key={id} value={id}>{name || 'بدون ماركة'}</option>)}
          </select>

          {hasCeramicCatalog && (
            <>
              <label htmlFor="pos-grade-filter" className="sr-only">فلتر الفرز</label>
              <select id="pos-grade-filter" aria-label="فلتر الفرز" value={selectedGrade} onChange={(e) => onGradeChange(e.target.value)} className={`${controlCls} h-9`}>
                <option value="ALL">كل الأنواع والفرز</option>{gradeOptions.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}
              </select>
              {visibleSizes.length > 0 && (
                <>
                  <label htmlFor="pos-size-filter" className="sr-only">فلتر المقاس</label>
                  <select id="pos-size-filter" aria-label="فلتر المقاس" value={selectedSize} onChange={(e) => onSizeChange(e.target.value)} className={`${controlCls} h-9`}>
                    <option value="ALL">كل المقاسات</option>{visibleSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </>
              )}
            </>
          )}
          {visibleColors.length > 0 && (
            <>
              <label htmlFor="pos-color-filter" className="sr-only">فلتر اللون</label>
              <select id="pos-color-filter" aria-label="فلتر اللون" value={selectedColor} onChange={(e) => onColorChange(e.target.value)} className={`${controlCls} h-9`}>
                <option value="ALL">كل الألوان</option>{visibleColors.map((color) => <option key={color} value={color}>{color}</option>)}
              </select>
            </>
          )}

          {hasCeramicCatalog && (
            <button
              type="button"
              onClick={onOpenCalculator}
              className="flex items-center gap-1.5 h-9 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 border border-amber-500/30 rounded-xl text-xs font-bold transition"
            >
              <Calculator className="w-4 h-4" /> حاسبة المقايسة
            </button>
          )}
        </div>
      )}

      {/* ═══ صف التصنيفات + عدد النتائج ═══ */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 min-w-0">
          <button
            type="button"
            aria-pressed={selectedCategory === 'ALL'}
            onClick={() => onCategoryChange('ALL')}
            className={`shrink-0 h-8 px-3 rounded-lg text-[11px] font-bold border transition ${
              selectedCategory === 'ALL'
                ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                : 'bg-slate-50 border-slate-200 hover:border-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5 inline ml-1" />
            الكل ({productsCount})
          </button>
          {visibleCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={selectedCategory === c.id}
              onClick={() => onCategoryChange(c.id)}
              className={`shrink-0 h-8 px-3 rounded-lg text-[11px] font-bold border transition ${
                selectedCategory === c.id
                  ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}
            >
              {c.name} ({c.productCount})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[11px] text-slate-500">
          <span className="hidden xs:inline">النتائج: <strong className="text-slate-700">{resultCount}</strong> صنف</span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="font-bold text-sky-700 hover:text-sky-900 whitespace-nowrap"
            >
              مسح الفلاتر
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
