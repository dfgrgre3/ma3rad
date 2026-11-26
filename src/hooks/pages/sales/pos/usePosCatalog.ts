import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import type { CategoryWithCount } from '../../../../services/domains/products/CategoryService';
import type { ProductFacets } from '../../../../services/domains/products/ProductService';
import type { Customer, Product } from '../../../../types';
import type { SortMode } from '../../../../types/pos';

interface UsePosCatalogOptions {
  products: Product[];
  categories: CategoryWithCount[];
  customers: Customer[];
  stockOf: (productId: string) => number;
  facets: ProductFacets | null;
}

export const usePosCatalog = ({ products, categories, customers, stockOf, facets }: UsePosCatalogOptions) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedBrand, setSelectedBrand] = useState('ALL');
  const [selectedGrade, setSelectedGrade] = useState('ALL');
  const [selectedSize, setSelectedSize] = useState('ALL');
  const [selectedColor, setSelectedColor] = useState('ALL');
  const [selectedSupplier, setSelectedSupplier] = useState('ALL');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minStock, setMinStock] = useState('');
  const [maxStock, setMaxStock] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('NAME');
  // المُؤجل (Deferred Value): يمنع تأخر الكتابة عند البحث في كتالوجات آلاف الأصناف —
  // الإدخال يظهر فوراً والتصفية تُشتق في الخلفية.
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filteredProducts = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    const minP = minPrice.trim() === '' ? null : Number(minPrice);
    const maxP = maxPrice.trim() === '' ? null : Number(maxPrice);
    const minS = minStock.trim() === '' ? null : Number(minStock);
    const maxS = maxStock.trim() === '' ? null : Number(maxStock);
    const list = products.filter((p) => {
      const matchesSearch = !q ||
        p.name.toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.id || '').toLowerCase().includes(q) ||
        (p.size || '').toLowerCase().includes(q) ||
        (p.brandName || '').toLowerCase().includes(q) ||
        (p.color || '').toLowerCase().includes(q) ||
        (p.tone || '').toLowerCase().includes(q) ||
        (p.finish || '').toLowerCase().includes(q) ||
        ((p as any).internalCode || '').toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'ALL' || p.categoryId === selectedCategory;
      const matchesBrand = selectedBrand === 'ALL' || p.brandId === selectedBrand;
      const matchesGrade = selectedGrade === 'ALL' || p.grade === selectedGrade;
      const matchesSize = selectedSize === 'ALL' || p.size === selectedSize;
      const matchesColor = selectedColor === 'ALL' || (p.color || '') === selectedColor;
      const matchesPrice = (minP == null || Number.isNaN(minP) || p.sellingPriceM2 >= minP)
        && (maxP == null || Number.isNaN(maxP) || p.sellingPriceM2 <= maxP);
      const tracksStock = p.productType !== 'GENERAL' && p.baseUnit !== 'SERVICE';
      const stock = stockOf(p.id);
      const matchesStockRange = (!tracksStock)
        || ((minS == null || Number.isNaN(minS) || stock >= minS)
          && (maxS == null || Number.isNaN(maxS) || stock <= maxS));
      const matchesStock = !inStockOnly || !tracksStock || stock > 0;
      // supplier filtering is applied server-side (productQueryOptions);
      // loaded Product rows don't carry supplier ids, so no client re-check.
      return matchesSearch && matchesCategory && matchesBrand && matchesGrade && matchesSize
        && matchesColor && matchesPrice && matchesStockRange && matchesStock;
    });

    list.sort((a, b) => {
      switch (sortMode) {
        case 'PRICE_ASC': return a.sellingPriceM2 - b.sellingPriceM2;
        case 'PRICE_DESC': return b.sellingPriceM2 - a.sellingPriceM2;
        case 'STOCK_DESC': return stockOf(b.id) - stockOf(a.id);
        default: return a.name.localeCompare(b.name, 'ar');
      }
    });
    return list;
  }, [products, deferredSearchQuery, selectedCategory, selectedBrand, selectedGrade, selectedSize, selectedColor, minPrice, maxPrice, minStock, maxStock, inStockOnly, sortMode, stockOf]);

  // Filter options come from DB-wide facets (all active products), not from
  // the currently loaded page — categories keep their service-provided counts.
  const visibleCategories = useMemo(() => {
    // CategoryService already computes productCount over the full products
    // table — show every category that actually has products.
    return categories.filter((category) => (category.productCount || 0) > 0);
  }, [categories]);
  const visibleBrands = useMemo(
    () => (facets?.brands || []).map((b) => [b.id, b.name || 'بدون ماركة'] as [string, string]),
    [facets]
  );
  const visibleSuppliers = useMemo(
    () => facets?.suppliers || [],
    [facets]
  );
  const hasCeramicCatalog = useMemo(
    () => facets?.hasCeramicCatalog
      ?? products.some((p) => p.productType !== 'GENERAL' && p.baseUnit !== 'SERVICE'),
    [facets, products]
  );
  const visibleSizes = useMemo(() => facets?.sizes || [], [facets]);
  const visibleColors = useMemo(() => facets?.colors || [], [facets]);
  const visibleGrades = useMemo(() => facets?.grades || [], [facets]);
  const priceBounds = useMemo(
    () => ({ min: facets?.minPrice ?? 0, max: facets?.maxPrice ?? 0 }),
    [facets]
  );
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 40);
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.code || '').toLowerCase().includes(q))
      .slice(0, 40);
  }, [customers, customerSearch]);

  const hasActiveFilters = Boolean(
    searchQuery || selectedCategory !== 'ALL' || selectedBrand !== 'ALL' ||
    selectedGrade !== 'ALL' || selectedSize !== 'ALL' || selectedColor !== 'ALL' ||
    selectedSupplier !== 'ALL' || inStockOnly ||
    minPrice.trim() !== '' || maxPrice.trim() !== '' ||
    minStock.trim() !== '' || maxStock.trim() !== ''
  );
  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory('ALL');
    setSelectedBrand('ALL');
    setSelectedGrade('ALL');
    setSelectedSize('ALL');
    setSelectedColor('ALL');
    setSelectedSupplier('ALL');
    setMinPrice('');
    setMaxPrice('');
    setMinStock('');
    setMaxStock('');
    setInStockOnly(false);
  }, []);

  /** Options forwarded to ProductService.getProductsPage for server-side filtering. */
  const productQueryOptions = useMemo(() => ({
    status: 'active' as const,
    ...(selectedGrade !== 'ALL' ? { grade: selectedGrade } : {}),
    ...(selectedSize !== 'ALL' ? { size: selectedSize } : {}),
    ...(selectedColor !== 'ALL' ? { color: selectedColor } : {}),
    ...(selectedSupplier !== 'ALL' ? { supplierId: selectedSupplier } : {}),
    ...(minPrice.trim() !== '' && !Number.isNaN(Number(minPrice)) ? { minPrice: Number(minPrice) } : {}),
    ...(maxPrice.trim() !== '' && !Number.isNaN(Number(maxPrice)) ? { maxPrice: Number(maxPrice) } : {}),
    ...(minStock.trim() !== '' && !Number.isNaN(Number(minStock)) ? { minStock: Number(minStock) } : {}),
    ...(maxStock.trim() !== '' && !Number.isNaN(Number(maxStock)) ? { maxStock: Number(maxStock) } : {}),
  }), [selectedGrade, selectedSize, selectedColor, selectedSupplier, minPrice, maxPrice, minStock, maxStock]);

  return {
    searchQuery, setSearchQuery,
    selectedCategory, setSelectedCategory,
    selectedBrand, setSelectedBrand,
    selectedGrade, setSelectedGrade,
    selectedSize, setSelectedSize,
    selectedColor, setSelectedColor,
    selectedSupplier, setSelectedSupplier,
    minPrice, setMinPrice,
    maxPrice, setMaxPrice,
    minStock, setMinStock,
    maxStock, setMaxStock,
    customerSearch, setCustomerSearch,
    inStockOnly, setInStockOnly,
    sortMode, setSortMode,
    filteredProducts, visibleCategories, visibleBrands, hasCeramicCatalog,
    visibleSizes, visibleColors, visibleGrades, visibleSuppliers, priceBounds,
    filteredCustomers, hasActiveFilters, clearFilters, productQueryOptions,
  };
};
