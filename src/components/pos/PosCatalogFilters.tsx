import React from 'react';
import {
  Calculator, Layers, Package, Search, X,
} from 'lucide-react';
import type { Warehouse } from '../../types';
import type { CategoryWithCount } from '../../services/CategoryService';
import type { SortMode } from './types';
import type { ProductGradeOption } from '../../services/OperationalFieldService';

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
}

const selectCls = 'px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500';

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
}) => (
  <div className="px-4 py-3 bg-white border-b border-slate-200 space-y-3">
    <div className="flex items-center gap-2 flex-wrap">
      <form onSubmit={onSearchSubmit} className="flex-1 min-w-[220px] relative">
        <label htmlFor="pos-product-search" className="sr-only">بحث عن منتج</label>
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          id="pos-product-search"
          ref={barcodeInputRef}
          type="text"
          aria-label="بحث عن منتج"
          placeholder="امسح الباركود أو ابحث بالاسم/الكود/المقاس (F2)..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchQueryChange('')}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </form>

      <label htmlFor="pos-warehouse-filter" className="sr-only">اختيار المخزن</label>
      <select
        id="pos-warehouse-filter"
        aria-label="اختيار المخزن"
        value={selectedWarehouseId}
        onChange={(e) => onWarehouseChange(e.target.value)}
        className={selectCls}
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
        className={selectCls}
      >
        <option value="NAME">ترتيب: الاسم</option>
        <option value="PRICE_ASC">الأرخص أولاً</option>
        <option value="PRICE_DESC">الأغلى أولاً</option>
        <option value="STOCK_DESC">الأكثر رصيداً</option>
      </select>

      <button
        type="button"
        onClick={onToggleInStockOnly}
        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition ${
          inStockOnly
            ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
        }`}
      >
        <Package className="w-4 h-4" /> المتوفر فقط
      </button>

      <label htmlFor="pos-brand-filter" className="sr-only">فلتر الماركة</label>
      <select id="pos-brand-filter" aria-label="فلتر الماركة" value={selectedBrand} onChange={(e) => onBrandChange(e.target.value)} className={selectCls}>
        <option value="ALL">كل الماركات</option>{visibleBrands.map(([id, name]) => <option key={id} value={id}>{name || 'بدون ماركة'}</option>)}
      </select>
      {hasCeramicCatalog && (<>
        <label htmlFor="pos-grade-filter" className="sr-only">فلتر الفرز</label>
        <select id="pos-grade-filter" aria-label="فلتر الفرز" value={selectedGrade} onChange={(e) => onGradeChange(e.target.value)} className={selectCls}>
          <option value="ALL">كل الأنواع والفرز</option>{gradeOptions.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}
        </select>
        {visibleSizes.length > 0 && (<>
          <label htmlFor="pos-size-filter" className="sr-only">فلتر المقاس</label>
          <select id="pos-size-filter" aria-label="فلتر المقاس" value={selectedSize} onChange={(e) => onSizeChange(e.target.value)} className={selectCls}>
            <option value="ALL">كل المقاسات</option>{visibleSizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </>)}
      </>)}
      {visibleColors.length > 0 && (<>
        <label htmlFor="pos-color-filter" className="sr-only">فلتر اللون</label>
        <select id="pos-color-filter" aria-label="فلتر اللون" value={selectedColor} onChange={(e) => onColorChange(e.target.value)} className={selectCls}>
          <option value="ALL">كل الألوان</option>{visibleColors.map((color) => <option key={color} value={color}>{color}</option>)}
        </select>
      </>)}

      {hasCeramicCatalog && (
        <button
          type="button"
          onClick={onOpenCalculator}
          className="flex items-center gap-1.5 px-3 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/30 rounded-xl text-xs font-bold transition"
        >
          <Calculator className="w-4 h-4" /> حاسبة المقايسة (F8)
        </button>
      )}
    </div>

    <div className="flex items-center justify-between text-[11px] text-slate-500">
      <span>النتائج: <strong className="text-slate-700">{resultCount}</strong> صنف</span>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="font-bold text-sky-700 hover:text-sky-900"
        >مسح البحث والفلاتر</button>
      )}
    </div>

    {/* Category chips */}
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      <button
        onClick={() => onCategoryChange('ALL')}
        className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${
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
          onClick={() => onCategoryChange(c.id)}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${
            selectedCategory === c.id
              ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
              : 'bg-slate-50 border-slate-200 hover:border-slate-300'
          }`}
        >
          {c.name} ({c.productCount})
        </button>
      ))}
    </div>
  </div>
);
