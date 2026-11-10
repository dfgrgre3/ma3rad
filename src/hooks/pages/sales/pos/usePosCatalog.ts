import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import type { CategoryWithCount } from '../../../../services/domains/products/CategoryService';
import type { Customer, Product } from '../../../../types';
import type { SortMode } from '../../../../types/pos';

interface UsePosCatalogOptions {
  products: Product[];
  categories: CategoryWithCount[];
  customers: Customer[];
  stockOf: (productId: string) => number;
}

export const usePosCatalog = ({ products, categories, customers, stockOf }: UsePosCatalogOptions) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedBrand, setSelectedBrand] = useState('ALL');
  const [selectedGrade, setSelectedGrade] = useState('ALL');
  const [selectedSize, setSelectedSize] = useState('ALL');
  const [selectedColor, setSelectedColor] = useState('ALL');
  const [customerSearch, setCustomerSearch] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('NAME');
  // المُؤجل (Deferred Value): يمنع تأخر الكتابة عند البحث في كتالوجات آلاف الأصناف —
  // الإدخال يظهر فوراً والتصفية تُشتق في الخلفية.
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filteredProducts = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      const matchesSearch = !q ||
        p.name.toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.id || '').toLowerCase().includes(q) ||
        (p.size || '').toLowerCase().includes(q) ||
        (p.brandName || '').toLowerCase().includes(q) ||
        (p.color || '').toLowerCase().includes(q) ||
        ((p as any).internalCode || '').toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'ALL' || p.categoryId === selectedCategory;
      const matchesBrand = selectedBrand === 'ALL' || p.brandId === selectedBrand;
      const matchesGrade = selectedGrade === 'ALL' || p.grade === selectedGrade;
      const matchesSize = selectedSize === 'ALL' || p.size === selectedSize;
      const matchesColor = selectedColor === 'ALL' || (p.color || '') === selectedColor;
      const tracksStock = p.productType !== 'GENERAL' && p.baseUnit !== 'SERVICE';
      const matchesStock = !inStockOnly || !tracksStock || stockOf(p.id) > 0;
      return matchesSearch && matchesCategory && matchesBrand && matchesGrade && matchesSize && matchesColor && matchesStock;
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
  }, [products, deferredSearchQuery, selectedCategory, selectedBrand, selectedGrade, selectedSize, selectedColor, inStockOnly, sortMode, stockOf]);

  const visibleCategories = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => {
      if (product.categoryId) counts.set(product.categoryId, (counts.get(product.categoryId) || 0) + 1);
    });
    return categories
      .filter((category) => counts.has(category.id))
      .map((category) => ({ ...category, productCount: counts.get(category.id) || 0 }));
  }, [categories, products]);
  const visibleBrands = useMemo(
    () => [...new Map(products.filter((p) => p.brandId).map((p) => [p.brandId, p.brandName || ''])).entries()],
    [products]
  );
  const hasCeramicCatalog = useMemo(
    () => products.some((p) => p.productType !== 'GENERAL' && p.baseUnit !== 'SERVICE'),
    [products]
  );
  const visibleSizes = useMemo(
    () => [...new Set(products
      .filter((p) => p.productType !== 'GENERAL' && p.baseUnit !== 'SERVICE')
      .map((p) => p.size)
      .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar', { numeric: true })),
    [products]
  );
  const visibleColors = useMemo(
    () => [...new Set(products.map((p) => p.color).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'ar')),
    [products]
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
    selectedGrade !== 'ALL' || selectedSize !== 'ALL' || selectedColor !== 'ALL' || inStockOnly
  );
  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory('ALL');
    setSelectedBrand('ALL');
    setSelectedGrade('ALL');
    setSelectedSize('ALL');
    setSelectedColor('ALL');
    setInStockOnly(false);
  }, []);

  return {
    searchQuery, setSearchQuery,
    selectedCategory, setSelectedCategory,
    selectedBrand, setSelectedBrand,
    selectedGrade, setSelectedGrade,
    selectedSize, setSelectedSize,
    selectedColor, setSelectedColor,
    customerSearch, setCustomerSearch,
    inStockOnly, setInStockOnly,
    sortMode, setSortMode,
    filteredProducts, visibleCategories, visibleBrands, hasCeramicCatalog,
    visibleSizes, visibleColors, filteredCustomers, hasActiveFilters, clearFilters,
  };
};
