import React from 'react';
import { Search, Filter, List, LayoutGrid, RefreshCw } from 'lucide-react';
import type { CategoryWithCount } from '../../../services/domains/products/CategoryService';
import type { BrandWithCount } from '../../../services/domains/products/BrandService';
import type { AttributeCategory } from '../../../services/domains/products/AttributeService';
import type { OperationalFieldDefinition, ProductGradeOption } from '../../../services/domains/products/OperationalFieldService';
import type { BusinessConfiguration } from '../../../config/businessProfiles';
import { FilterToolbar } from '../../ui/FilterToolbar';
import { FormField } from '../../ui/FormField';

type ViewMode = 'table' | 'cards';
type StockStatus = 'all' | 'in' | 'low' | 'out';
type SortBy = 'name' | 'newest' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc';
type ProductStatus = 'active' | 'inactive' | 'all';

export interface ProductsViewFiltersProps {
  search: string;
  setSearch: (value: string) => void;
  showFilters: boolean;
  setShowFilters: React.Dispatch<React.SetStateAction<boolean>>;
  viewMode: ViewMode;
  setViewMode: (value: ViewMode) => void;
  onRefresh: () => void;
  onCategoryFilterChange: (value: string) => void;
  onClearFilters: () => void;
  categories: CategoryWithCount[];
  brands: BrandWithCount[];
  businessConfig: BusinessConfiguration;
  gradeOptions: ProductGradeOption[];
  operationalFields: OperationalFieldDefinition[];
  attributes: AttributeCategory[];
  selectedCategory: string;
  selectedBrand: string;
  setSelectedBrand: (value: string) => void;
  selectedGrade: string;
  setSelectedGrade: (value: string) => void;
  selectedCustomField: string;
  setSelectedCustomField: (value: string) => void;
  selectedCustomFieldValue: string;
  setSelectedCustomFieldValue: (value: string) => void;
  selectedAttribute: string;
  setSelectedAttribute: (value: string) => void;
  selectedAttributeValue: string;
  setSelectedAttributeValue: (value: string) => void;
  stockStatus: StockStatus;
  setStockStatus: (value: StockStatus) => void;
  sortBy: SortBy;
  setSortBy: (value: SortBy) => void;
  productStatus: ProductStatus;
  setProductStatus: (value: ProductStatus) => void;
}

export const ProductsViewFilters: React.FC<ProductsViewFiltersProps> = ({
  search, setSearch, showFilters, setShowFilters, viewMode, setViewMode, onRefresh,
  onCategoryFilterChange, onClearFilters,
  categories, brands, businessConfig, gradeOptions, operationalFields, attributes,
  selectedCategory, selectedBrand, setSelectedBrand,
  selectedGrade, setSelectedGrade,
  selectedCustomField, setSelectedCustomField, selectedCustomFieldValue, setSelectedCustomFieldValue,
  selectedAttribute, setSelectedAttribute, selectedAttributeValue, setSelectedAttributeValue,
  stockStatus, setStockStatus, sortBy, setSortBy, productStatus, setProductStatus,
}) => (
  <FilterToolbar ariaLabel="بحث وتصفية الأصناف" className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex-1 min-w-[240px] relative">
        <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[var(--cerami-muted)]" />
        <input
          type="text"
          aria-label="بحث الأصناف"
          placeholder="بحث بالاسم، الباركود، الكود، المقاس، النوع، الماركة..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ui-input w-full ps-9 pe-3 text-xs font-medium"
        />
      </div>
      <button onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} aria-controls="product-advanced-filters" className={`erp-btn erp-btn--sm ${showFilters ? 'erp-btn--primary' : ''}`}>
        <Filter className="w-4 h-4" /> فلاتر متقدمة
      </button>
    <div className="flex items-center overflow-hidden rounded-[var(--ui-radius-sm)] border border-[var(--win-border)]">
        <button onClick={() => setViewMode('table')} className={`px-2.5 py-2 ${viewMode === 'table' ? 'bg-[var(--win-accent)] text-[var(--win-accent-text,#fff)]' : 'text-[var(--cerami-muted)]'}`} title="عرض جدول"><List className="w-4 h-4" /></button>
        <button onClick={() => setViewMode('cards')} className={`px-2.5 py-2 ${viewMode === 'cards' ? 'bg-[var(--win-accent)] text-[var(--win-accent-text,#fff)]' : 'text-[var(--cerami-muted)]'}`} title="عرض بطاقات"><LayoutGrid className="w-4 h-4" /></button>
      </div>
      <button onClick={onRefresh} className="erp-btn erp-btn--secondary erp-btn--icon erp-btn--sm" title="تحديث"><RefreshCw className="w-4 h-4" /></button>
    </div>

    {showFilters && (
      <div id="product-advanced-filters" className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <FormField label="نوع المنتج" visuallyHidden>
        <select value={selectedCategory} onChange={(e) => onCategoryFilterChange(e.target.value)} className="ui-input w-full text-xs font-bold">
          <option value="">جميع الأنواع</option>
          {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
        </FormField>
        <FormField label="الماركة" visuallyHidden>
        <select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)} className="ui-input w-full text-xs font-bold">
          <option value="">جميع الماركات</option>
          {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
        </FormField>
        {businessConfig.businessType === 'ceramics' && (<FormField label="الفرز" visuallyHidden><select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="ui-input w-full text-xs font-bold">
          <option value="">جميع الفرزات</option>
          {gradeOptions.filter((option) => option.isActive).map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select></FormField>)}
        {operationalFields.filter((field) => field.isFilterable).map((field) => (
          <FormField key={field.id} label={field.name} visuallyHidden>
            {['SELECT', 'BOOLEAN'].includes(field.dataType) ? (
              <select value={selectedCustomField === field.id ? selectedCustomFieldValue : ''} onChange={(event) => {
                setSelectedCustomField(field.id);
                setSelectedCustomFieldValue(event.target.value);
              }} className="ui-input w-full text-xs font-bold">
                <option value="">كل القيم — {field.name}</option>
                {field.dataType === 'BOOLEAN'
                  ? <><option value="true">نعم</option><option value="false">لا</option></>
                  : field.values.map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}
              </select>
            ) : (
              <input value={selectedCustomField === field.id ? selectedCustomFieldValue : ''} onChange={(event) => {
                setSelectedCustomField(field.id);
                setSelectedCustomFieldValue(event.target.value);
              }} placeholder={`تصفية حسب ${field.name}`} className="ui-input w-full text-xs font-bold" />
            )}
          </FormField>
        ))}
        {attributes
          .filter((attribute) => attribute.isFilterable && (
            !attribute.appliesToCategoryId || !selectedCategory || attribute.appliesToCategoryId === selectedCategory
          ))
          .map((attribute) => (
            <FormField key={attribute.id} label={attribute.name} visuallyHidden>
              {['SELECT', 'BOOLEAN'].includes(attribute.dataType) ? (
                <select
                  value={selectedAttribute === attribute.id ? selectedAttributeValue : ''}
                  onChange={(event) => {
                    setSelectedAttribute(attribute.id);
                    setSelectedAttributeValue(event.target.value);
                  }}
                  className="ui-input w-full text-xs font-bold"
                >
                  <option value="">كل القيم — {attribute.name}</option>
                  {attribute.dataType === 'BOOLEAN'
                    ? <><option value="true">نعم</option><option value="false">لا</option></>
                    : attribute.values.map((option) => (
                      <option key={option.id} value={option.value}>{option.label}</option>
                    ))}
                </select>
              ) : (
                <input
                  value={selectedAttribute === attribute.id ? selectedAttributeValue : ''}
                  onChange={(event) => {
                    setSelectedAttribute(attribute.id);
                    setSelectedAttributeValue(event.target.value);
                  }}
                  placeholder={`تصفية حسب ${attribute.name}`}
                  className="ui-input w-full text-xs font-bold"
                />
              )}
            </FormField>
          ))}
        <FormField label="حالة المخزون" visuallyHidden>
        <select value={stockStatus} onChange={(e) => setStockStatus(e.target.value as StockStatus)} className="ui-input w-full text-xs font-bold">
          <option value="all">حالة المخزون: الكل</option>
          <option value="in">متوفر</option>
          <option value="low">قارب على النفاذ</option>
          <option value="out">نافد</option>
        </select>
        </FormField>
        <FormField label="ترتيب الأصناف" visuallyHidden>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="ui-input w-full text-xs font-bold">
          <option value="name">ترتيب: الاسم</option>
          <option value="newest">الأحدث إضافة</option>
          <option value="price_asc">السعر: الأقل</option>
          <option value="price_desc">السعر: الأعلى</option>
          <option value="stock_asc">المخزون: الأقل</option>
          <option value="stock_desc">المخزون: الأكثر</option>
        </select>
        </FormField>
        <FormField label="حالة الصنف" visuallyHidden>
        <select aria-label="حالة الصنف" value={productStatus} onChange={(e) => setProductStatus(e.target.value as ProductStatus)} className="ui-input text-xs font-bold">
          <option value="active">الأصناف النشطة</option>
          <option value="inactive">الأصناف غير النشطة</option>
          <option value="all">كل الأصناف</option>
        </select>
        </FormField>
        <button onClick={onClearFilters} className="erp-btn erp-btn--secondary erp-btn--sm">مسح عوامل التصفية</button>
      </div>
    )}
  </FilterToolbar>
);
