import React from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { Product } from '../../../types';
import { getProductUnitLabel } from '../../../utils/productUnits';
import { ProductEditForm } from './types';

interface ProductEditModalProps {
  product: Product;
  form: ProductEditForm;
  saving: boolean;
  onChange: React.Dispatch<React.SetStateAction<ProductEditForm | null>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const ProductEditModal: React.FC<ProductEditModalProps> = ({ product, form, saving, onChange, onSubmit, onClose }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-extrabold text-slate-900">تعديل المنتج</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-3 text-xs">
          <div><label className="font-bold text-slate-700 block mb-1">اسم المنتج *</label><input required value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-semibold" /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="font-bold text-slate-700 block mb-1">المقاس</label><input value={form.size} onChange={(e) => onChange({ ...form, size: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
            <div><label className="font-bold text-slate-700 block mb-1">اللون</label><input value={form.color} onChange={(e) => onChange({ ...form, color: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
            <div><label className="font-bold text-slate-700 block mb-1">التشطيب</label><input value={form.finish} onChange={(e) => onChange({ ...form, finish: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {product.productType !== 'GENERAL' && <>
              <div><label className="font-bold text-slate-700 block mb-1">عدد القطع / كرتونة</label><input type="number" min={1} step="1" value={form.piecesPerBox} onChange={(e) => onChange({ ...form, piecesPerBox: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
              <div><label className="font-bold text-slate-700 block mb-1">م² / كرتونة</label><input type="number" min={0} step="0.001" value={form.metersPerBox} onChange={(e) => onChange({ ...form, metersPerBox: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
            </>}
            <div><label className="font-bold text-slate-700 block mb-1">سعر التكلفة</label><input type="number" min={0} step="0.01" value={form.costPrice} onChange={(e) => onChange({ ...form, costPrice: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
            <div><label className="font-bold text-slate-700 block mb-1">سعر البيع ({getProductUnitLabel(product)})</label><input type="number" min={0} step="0.01" value={form.sellingPriceM2} onChange={(e) => onChange({ ...form, sellingPriceM2: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
            {product.productType !== 'GENERAL' && <>
              <div><label className="font-bold text-slate-700 block mb-1">سعر البيع (كرتونة)</label><input type="number" min={0} step="0.01" value={form.sellingPriceBox} onChange={(e) => onChange({ ...form, sellingPriceBox: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
              <div><label className="font-bold text-slate-700 block mb-1">سعر الجملة (م²)</label><input type="number" min={0} step="0.01" value={form.wholesalePriceM2} onChange={(e) => onChange({ ...form, wholesalePriceM2: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
              <div><label className="font-bold text-slate-700 block mb-1">أقل سعر بيع (م²)</label><input type="number" min={0} step="0.01" value={form.minSellingPriceM2} onChange={(e) => onChange({ ...form, minSellingPriceM2: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
            </>}
            <div><label className="font-bold text-slate-700 block mb-1">حد الطلب الأدنى</label><input type="number" min={0} step="0.01" value={form.minStockLevel} onChange={(e) => onChange({ ...form, minStockLevel: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
            <div><label className="font-bold text-slate-700 block mb-1">أقصى مخزون</label><input type="number" min={0} step="0.01" value={form.maxStockLevel} onChange={(e) => onChange({ ...form, maxStockLevel: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
          </div>
          <label className="flex items-center gap-2 text-slate-700 font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={(e) => onChange({ ...form, isActive: e.target.checked })} className="w-4 h-4 accent-sky-600" /> المنتج نشط
          </label>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} حفظ</button>
          </div>
        </form>
      </div>
    </div>
  );
};
