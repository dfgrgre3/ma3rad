import React, { useEffect, useState } from 'react';
import { GitBranch, Plus, Trash2 } from 'lucide-react';
import { ProductExtraService, ProductVariant } from '../../../services/ProductExtraService';
import { GRADE_LABELS } from './constants';
import { money } from './format';

interface VariantsTabProps {
  productId: string;
  canEdit: boolean;
}

export const VariantsTab: React.FC<VariantsTabProps> = ({ productId, canEdit }) => {
  const service = new ProductExtraService();
  const [rows, setRows] = useState<ProductVariant[]>([]);
  const [form, setForm] = useState({ variantName: '', sku: '', barcode: '', color: '', size: '', grade: 'GRADE_1', costPrice: '', sellingPriceM2: '' });

  const load = () => { try { setRows(service.getVariants(productId)); } catch (e) { console.error(e); } };
  useEffect(() => { load(); }, [productId]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.variantName.trim() || !form.sku.trim()) return;
    try {
      service.createVariant(productId, {
        variantName: form.variantName.trim(), sku: form.sku.trim(), barcode: form.barcode.trim() || undefined,
        color: form.color || undefined, size: form.size || undefined, grade: form.grade,
        costPrice: Number(form.costPrice) || 0, sellingPriceM2: Number(form.sellingPriceM2) || 0, isActive: true,
      });
      setForm({ variantName: '', sku: '', barcode: '', color: '', size: '', grade: 'GRADE_1', costPrice: '', sellingPriceM2: '' });
      load();
    } catch (err: any) { alert(err?.message || 'تعذر إضافة المتغير'); }
  };

  const remove = (id: string) => {
    if (!confirm('حذف هذا المتغير؟')) return;
    try { service.deleteVariant(id); load(); } catch (err: any) { alert(err?.message); }
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <form onSubmit={add} className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 mb-3"><GitBranch className="w-4 h-4 text-sky-600" /> إضافة نوع / متغير</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <input required placeholder="اسم المتغير *" value={form.variantName} onChange={(e) => setForm({ ...form, variantName: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
            <input required placeholder="كود SKU *" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
            <input placeholder="باركود" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
            <input placeholder="اللون" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
            <input placeholder="المقاس" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
            <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
              {Object.entries(GRADE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="number" min={0} step="0.01" placeholder="التكلفة" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
            <input type="number" min={0} step="0.01" placeholder="سعر البيع (م²)" value={form.sellingPriceM2} onChange={(e) => setForm({ ...form, sellingPriceM2: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
          </div>
          <div className="mt-3 flex justify-end">
            <button type="submit" className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold"><Plus className="w-4 h-4" /> إضافة</button>
          </div>
        </form>
      )}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {rows.length === 0 ? <div className="text-center text-slate-500 py-10 text-sm">لا توجد متغيرات لهذا المنتج</div> : (
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-50"><tr>{['المتغير', 'SKU / باركود', 'المقاس واللون', 'الفرز', 'التكلفة', 'سعر البيع', canEdit ? 'حذف' : ''].filter(Boolean).map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-bold text-slate-900">{v.variantName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{v.sku}<div className="text-slate-400">{v.barcode || '—'}</div></td>
                  <td className="px-4 py-3 text-slate-600">{v.size || '—'} / {v.color || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{GRADE_LABELS[v.grade || ''] || v.grade || '—'}</td>
                  <td className="px-4 py-3 font-mono text-rose-600">{money(v.costPrice)}</td>
                  <td className="px-4 py-3 font-mono text-sky-600 font-bold">{money(v.sellingPriceM2)}</td>
                  {canEdit && <td className="px-4 py-3"><button onClick={() => remove(v.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
