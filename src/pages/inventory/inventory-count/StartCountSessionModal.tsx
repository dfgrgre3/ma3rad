import React from 'react';
import { AlertTriangle, ScanLine, Search, X } from 'lucide-react';
import { formatProductQuantity } from '../../../utils/productUnits';
import type { CountProductOption, CountType, WarehouseOption } from './types';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white backdrop-blur-sm">
      <form onSubmit={onSubmit} className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-violet-600" />
            <h3 className="text-base font-black text-slate-900">بدء جلسة جرد مخازن جديدة</h3>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-900 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-semibold rounded-xl">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs text-slate-500 font-bold block">المخزن المراد جرده</label>
            <select
              value={selectedWarehouseId}
              onChange={(e) => onWarehouseChange(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-violet-500"
            >
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-500 font-bold block">ملاحظات الجلسة</label>
            <textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} rows={2} maxLength={500} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" placeholder="ملاحظات لفريق الجرد" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-700 font-bold block">نوع الجرد</label>
            <select
              value={countType}
              onChange={(e) => onCountTypeChange(e.target.value as CountType)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-violet-500 font-bold"
            >
              <option value="FULL">جرد كلي شامل (لكل المنتجات)</option>
              <option value="PERIODIC">جرد دوري مجدول</option>
              <option value="SURPRISE">جرد مفاجئ</option>
              <option value="BLIND">عدّ أعمى (Blind Count)</option>
              <option value="PARTIAL">جرد جزئي</option>
              <option value="SPOT">جرد عشوائي سريع</option>
            </select>
          </div>

          <div className="p-3 bg-violet-50/60 rounded-xl border border-violet-200">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={isBlindCount || countType === 'BLIND'}
                onChange={(e) => onBlindCountChange(e.target.checked)}
                className="accent-violet-600 rounded"
              />
              <span>تفعيل العد الأعمى (Blind Count)</span>
            </label>
            <p className="text-[10px] text-slate-500 mt-1 font-medium mr-5">
              إخفاء كميات النظام الدفترية عن فريق الجرد أثناء الإدخال لمنع الانحياز وضمان دقة ونزاهة الحصر الفعلي.
            </p>
          </div>

          {countType !== 'FULL' && (
            <div className="space-y-2">
              <label className="text-xs text-slate-700 font-bold block">الأصناف المطلوب جردها</label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={productSearch}
                  onChange={(e) => onProductSearchChange(e.target.value)}
                  placeholder="ابحث باسم الصنف أو الكود..."
                  className="w-full pr-9 pl-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {products.filter(p => `${p.name} ${p.sku}`.toLowerCase().includes(productSearch.toLowerCase())).map(product => {
                  const selected = selectedProductIds.includes(product.id);
                  return (
                    <label key={product.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-violet-50 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleProduct(product.id)}
                        className="accent-violet-600"
                      />
                      <span className="flex-1 font-semibold text-slate-800">{product.name}<span className="mr-2 text-slate-400 font-mono">{product.sku}</span></span>
                      <span className="text-slate-500">رصيد: {formatProductQuantity(Number(product.quantityM2 || 0), product)}</span>
                    </label>
                  );
                })}
                {products.length === 0 && <p className="p-3 text-xs text-slate-500">لا توجد أصناف نشطة في النظام.</p>}
              </div>
              <p className="text-[11px] text-slate-500">تم اختيار {selectedProductIds.length} صنف</p>
            </div>
          )}

          <div className="text-xs text-slate-500 bg-violet-500/5 p-3 rounded-lg border border-violet-500/10 leading-relaxed">
            * عند الضغط على "بدء الجرد"، سيقوم النظام بتثبيت وحفظ الأرصدة الدفترية الحالية للأصناف لمقارنتها لاحقاً مع الكميات التي ستقوم بعدّها وإدخالها.
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-4 flex justify-end gap-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition border border-slate-200"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition"
          >
            توليد جلسة وبدء الجرد
          </button>
        </div>
      </form>
    </div>
  );
};
