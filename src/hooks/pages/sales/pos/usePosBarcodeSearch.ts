import { useCallback, type FormEvent, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { Product } from '../../../../types';
import type { Toast } from '../../../../types/pos';

interface UsePosBarcodeSearchOptions {
  products: Product[];
  filteredProducts: Product[];
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  barcodeInputRef: RefObject<HTMLInputElement>;
  addToCart: (product: Product) => void;
  notify: (message: string, type?: Toast['type']) => void;
  /** DB-wide exact lookup (barcode / SKU / serial / IMEI / variant). */
  lookupProduct?: (term: string) => Product | null;
  /** Exact serial/IMEI lookup — takes precedence over generic product lookup. */
  lookupSerial?: (term: string) => { product: Product; serial: { id: string; serialNumber: string } } | null;
  /** Invoked when the term is a registered serial number (opens the serial picker). */
  onSerialMatch?: (product: Product, serial: { id: string; serialNumber: string }) => void;
}

export const usePosBarcodeSearch = ({
  products,
  filteredProducts,
  searchQuery,
  setSearchQuery,
  barcodeInputRef,
  addToCart,
  notify,
  lookupProduct,
  lookupSerial,
  onSerialMatch,
}: UsePosBarcodeSearchOptions) => useCallback((event: FormEvent) => {
  event.preventDefault();
  const term = searchQuery.trim();
  if (!term) return;
  const addExact = (product: Product) => {
    addToCart(product);
    setSearchQuery('');
    barcodeInputRef.current?.focus();
    notify(`تمت إضافة ${product.name}`, 'success');
  };
  const serialMatch = lookupSerial?.(term);
  if (serialMatch && onSerialMatch) {
    onSerialMatch(serialMatch.product, serialMatch.serial);
    setSearchQuery('');
    barcodeInputRef.current?.focus();
    notify(`تم مسح الرقم التسلسلي ${serialMatch.serial.serialNumber} — اختر الوحدات من القائمة`, 'success');
    return;
  }
  const dbMatch = lookupProduct?.(term);
  if (dbMatch) {
    addExact(dbMatch);
    return;
  }
  const normalizedTerm = term.toLocaleLowerCase('ar-EG');
  const exact = products.find(
    (product) => (product.barcode || '').trim().toLocaleLowerCase('ar-EG') === normalizedTerm
      || (product.sku || '').trim().toLocaleLowerCase('ar-EG') === normalizedTerm
  );
  if (exact) {
    addExact(exact);
    return;
  }
  if (filteredProducts.length === 1) {
    addExact(filteredProducts[0]);
    return;
  }
  if (filteredProducts.length > 1) {
    notify('توجد عدة نتائج؛ اختر الصنف المطلوب من القائمة.', 'warning');
    return;
  }
  notify(`لا يوجد صنف مطابق للباركود: ${term}`, 'error');
}, [searchQuery, products, filteredProducts, addToCart, setSearchQuery, barcodeInputRef, notify, lookupProduct, lookupSerial, onSerialMatch]);
