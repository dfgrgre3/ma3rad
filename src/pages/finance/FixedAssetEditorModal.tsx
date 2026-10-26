import React from 'react';
import { Loader2, X } from 'lucide-react';
import { CATEGORY_LABELS, fmt } from './fixedAssetsHelpers';

export interface FixedAssetForm {
  name: string; category: string; purchaseDate: string; purchaseCost: string; paymentType: string;
  salvageValue: string; usefulLifeYears: string; location: string; notes: string;
}
interface FixedAssetEditorModalProps {
  form: FixedAssetForm; setForm: React.Dispatch<React.SetStateAction<FixedAssetForm>>;
  editing: { code: string } | null; saving: boolean; onClose: () => void; onSubmit: (event: React.FormEvent) => void;
}
export const FixedAssetEditorModal: React.FC<FixedAssetEditorModalProps> = ({ form, setForm, editing, saving, onClose, onSubmit }) => (
<div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold">{editing ? 'تعديل أصل' : 'إضافة أصل ثابت'}</h3>
              <button onClick={() => onClose()} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={onSubmit} className="space-y-3 text-xs">
              <div><label className="font-bold text-slate-700 block mb-1">اسم الأصل *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">الفئة</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="font-bold text-slate-700 block mb-1">تاريخ الشراء *</label><input required type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-bold text-slate-700 block mb-1">تكلفة الشراء *</label><input required type="number" min={0.01} step="0.01" value={form.purchaseCost} onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
                {!editing && <div><label className="font-bold text-slate-700 block mb-1">طريقة تمويل الاقتناء *</label><select value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200"><option value="CASH">الخزينة نقدًا</option><option value="BANK_TRANSFER">البنك</option><option value="CREDIT">التزام اقتناء أصل</option></select></div>}
                <div><label className="font-bold text-slate-700 block mb-1">قيمة الإنقاذ</label><input type="number" min={0} step="0.01" value={form.salvageValue} onChange={(e) => setForm({ ...form, salvageValue: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-bold text-slate-700 block mb-1">العمر الإنتاجي (سنوات) *</label><input required type="number" min={0.5} step="0.5" value={form.usefulLifeYears} onChange={(e) => setForm({ ...form, usefulLifeYears: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">الموقع</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              </div>
              <div><label className="font-bold text-slate-700 block mb-1">ملاحظات</label><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => onClose()} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} حفظ</button>
              </div>
            </form>
          </div>
        </div>
);
