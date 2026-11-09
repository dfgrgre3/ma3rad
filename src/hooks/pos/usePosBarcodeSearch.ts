import { useCallback, type FormEvent, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { Product } from '../../types';
import type { Toast } from '../../types/pos';

interface UsePosBarcodeSearchOptions {
  products: Product[];
  filteredProducts: Product[];
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  barcodeInputRef: RefObject<HTMLInputElement>;
  addToCart: (product: Product) => void;
  notify: (message: string, type?: Toast['type']) => void;
}

export const usePosBarcodeSearch = ({
  products,
  filteredProducts,
  searchQuery,
  setSearchQuery,
  barcodeInputRef,
  addToCart,
  notify,
}: UsePosBarcodeSearchOptions) => useCallback((event: FormEvent) => {
  event.preventDefault();
  const term = searchQuery.trim();
  if (!term) return;
  const normalizedTerm = term.toLocaleLowerCase('ar-EG');
  const exact = products.find(
    (product) => (product.barcode || '').trim().toLocaleLowerCase('ar-EG') === normalizedTerm
      || (product.sku || '').trim().toLocaleLowerCase('ar-EG') === normalizedTerm
  );
  if (exact) {
    addToCart(exact);
    setSearchQuery('');
    barcodeInputRef.current?.focus();
    notify(`تمت إضافة ${exact.name}`, 'success');
    return;
  }
  if (filteredProducts.length === 1) {
    addToCart(filteredProducts[0]);
    setSearchQuery('');
    barcodeInputRef.current?.focus();
    notify(`تمت إضافة ${filteredProducts[0].name}`, 'success');
    return;
  }
  if (filteredProducts.length > 1) {
    notify('توجد عدة نتائج؛ اختر الصنف المطلوب من القائمة.', 'warning');
    return;
  }
  notify(`لا يوجد صنف مطابق للباركود: ${term}`, 'error');
}, [searchQuery, products, filteredProducts, addToCart, setSearchQuery, barcodeInputRef, notify]);
