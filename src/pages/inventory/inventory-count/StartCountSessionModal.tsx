import React from 'react';
import { AlertTriangle, ScanLine, Search, X } from 'lucide-react';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import type { CountProductOption, CountType, WarehouseOption } from '../../../types/inventory/countSessions';

interface StartCountSessionModalProps {
  errorMsg: string;
  warehouses: WarehouseOption[];
  selectedWarehouseId: string;
  onWarehouseChange: (warehouseId: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  countType: CountType;
  onCountTypeChange: (value: CountType) => void;
  isBlindCount: boolean;
  onBlindCountChange: (checked: boolean) => void;
  products: CountProductOption[];
  productSearch: string;
  onProductSearchChange: (value: string) => void;
  selectedProductIds: string[];
  onToggleProduct: (productId: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const StartCountSessionModal: React.FC<StartCountSessionModalProps> = ({
  errorMsg,
  warehouses,
  selectedWarehouseId,
  onWarehouseChange,
  notes,
  onNotesChange,
  countType,
  onCountTypeChange,
  isBlindCount,
  onBlindCountChange,
  products,
  productSearch,
  onProductSearchChange,
  selectedProductIds,
  onToggleProduct,
  onSubmit,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface backdrop-blur-sm">
      <form onSubmit={onSubmit} className="bg-surface border border-line rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="bg-surface-muted px-6 py-4 flex items-center justify-between border-b border-line">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-primary" />
            <h3 className="text-base font-black text-ink">بدء جلسة جرد مخازن جديدة</h3>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 text-danger text-xs font-semibold rounded-xl">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs text-muted font-bold block">المخزن المراد جرده</label>
            <select
              value={selectedWarehouseId}
              onChange={(e) => onWarehouseChange(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface-muted border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-primary"
            >
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted font-bold block">ملاحظات الجلسة</label>
            <textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} rows={2} maxLength={500} className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs" placeholder="ملاحظات لفريق الجرد" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-ink font-bold block">نوع الجرد</label>
            <select
              value={countType}
              onChange={(e) => onCountTypeChange(e.target.value as CountType)}
              className="w-full px-3.5 py-2.5 bg-surface-muted border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-primary font-bold"
            >
              <option value="FULL">جرد كلي شامل (لكل المنتجات)</option>
              <option value="PERIODIC">جرد دوري مجدول</option>
              <option value="SURPRISE">جرد مفاجئ</option>
              <option value="BLIND">عدّ أعمى (Blind Count)</option>
              <option value="PARTIAL">جرد جزئي</option>
              <option value="SPOT">جرد عشوائي سريع</option>
            </select>
          </div>

          <div className="p-3 bg-accent-soft/60 rounded-xl border border-accent-border">
            <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={isBlindCount || countType === 'BLIND'}
                onChange={(e) => onBlindCountChange(e.target.checked)}
                className="accent-primary rounded"
              />
              <span>تفعيل العد الأعمى (Blind Count)</span>
            </label>
            <p className="text-[10px] text-muted mt-1 font-medium mr-5">
              إخفاء كميات النظام الدفترية عن فريق الجرد أثناء الإدخال لمنع الانحياز وضمان دقة ونزاهة الحصر الفعلي.
            </p>
          </div>

          {countType !== 'FULL' && (
            <div className="space-y-2">
              <label className="text-xs text-ink font-bold block">الأصناف المطلوب جردها</label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  value={productSearch}
                  onChange={(e) => onProductSearchChange(e.target.value)}
                  placeholder="ابحث باسم الصنف أو الكود..."
                  className="w-full pr-9 pl-3 py-2.5 bg-surface border border-line rounded-xl text-sm"
                />
              </div>
              <div className="max-h-44 overflow-y-auto border border-line rounded-xl divide-y divide-line-strong">
                {products.filter(p => `${p.name} ${p.sku}`.toLowerCase().includes(productSearch.toLowerCase())).map(product => {
                  const selected = selectedProductIds.includes(product.id);
                  return (
                    <label key={product.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent-soft cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleProduct(product.id)}
                        className="accent-primary"
                      />
                      <span className="flex-1 font-semibold text-ink">{product.name}<span className="mr-2 text-muted font-mono">{product.sku}</span></span>
                      <span className="text-muted">رصيد: {formatProductQuantity(Number(product.quantityM2 || 0), product)}</span>
                    </label>
                  );
                })}
                {products.length === 0 && <p className="p-3 text-xs text-muted">لا توجد أصناف نشطة في النظام.</p>}
              </div>
              <p className="text-[11px] text-muted">تم اختيار {selectedProductIds.length} صنف</p>
            </div>
          )}

          <div className="text-xs text-muted bg-primary/5 p-3 rounded-lg border border-primary/10 leading-relaxed">
            * عند الضغط على "بدء الجرد"، سيقوم النظام بتثبيت وحفظ الأرصدة الدفترية الحالية للأصناف لمقارنتها لاحقاً مع الكميات التي ستقوم بعدّها وإدخالها.
          </div>
        </div>

        <div className="bg-surface-muted px-6 py-4 flex justify-end gap-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-surface-muted hover:bg-surface-sunken text-ink-secondary rounded-xl text-xs font-bold transition border border-line"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-primary hover:bg-primary text-white rounded-xl text-xs font-bold transition"
          >
            توليد جلسة وبدء الجرد
          </button>
        </div>
      </form>
    </div>
  );
};
