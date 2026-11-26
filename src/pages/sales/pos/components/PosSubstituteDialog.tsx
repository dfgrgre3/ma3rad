import React from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import type { Product } from '../../../../types';
import { ProductPicker } from '../../../../components/products/ProductPicker';

/**
 * Organized in-invoice swap: pick a replacement product for a cart line.
 * The cart keeps the line's position and base quantity.
 */
export const PosSubstituteDialog: React.FC<{
  productName: string;
  onSelect: (product: Product) => void;
  onClose: () => void;
}> = ({ productName, onSelect, onClose }) => (
  <div className="fixed inset-0 z-[110] bg-primary/50 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-surface rounded-3xl border border-line shadow-2xl w-full max-w-lg p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black text-ink">
            <ArrowLeftRight className="w-4 h-4 text-primary" /> استبدال الصنف ببديل
          </h3>
          <p className="mt-1 text-[11px] text-muted">
            سيتم استبدال «{productName}» بالمنتج المختار مع الحفاظ على الكمية والخصم الصفري.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق نافذة الاستبدال"
          className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-muted"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <ProductPicker
        value=""
        ariaLabel="اختيار المنتج البديل"
        placeholder="ابحث عن المنتج البديل…"
        onChange={(_id, product) => onSelect(product)}
      />
    </div>
  </div>
);
