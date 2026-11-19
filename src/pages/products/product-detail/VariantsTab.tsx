import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { GitBranch, Plus, Trash2 } from 'lucide-react';
import { ProductExtraService, ProductVariant } from '../../../services/domains/products/ProductExtraService';
import { OperationalFieldService, type ProductGradeOption } from '../../../services/domains/products/OperationalFieldService';
import { gradeLabel, setConfiguredGradeLabels } from '../../../components/products/productFormModel';
import { money } from './format';

import { useToast } from '../../../components/ui/Toast';
interface VariantsTabProps {
  productId: string;
  canEdit: boolean;
  canViewCosts: boolean;
  canViewPricing: boolean;
  canUpdatePricing: boolean;
}

export const VariantsTab: React.FC<VariantsTabProps> = ({ productId, canEdit, canViewCosts, canViewPricing, canUpdatePricing }) => {
  const toast = useToast();
  const service = useMemo(() => new ProductExtraService(), []);
  const fieldService = useMemo(() => new OperationalFieldService(), []);
  const [rows, setRows] = useState<ProductVariant[]>([]);
  const [gradeOptions, setGradeOptions] = useState<ProductGradeOption[]>([]);
  const [form, setForm] = useState({ variantName: '', sku: '', barcode: '', color: '', size: '', grade: 'GRADE_1', costPrice: '', sellingPriceM2: '' });

  const load = useCallback(() => {
    try {
      setRows(service.getVariants(productId));
      const options = fieldService.getProductGradeOptions(true);
      setGradeOptions(options);
      setConfiguredGradeLabels(options);
      setForm((current) => options.some((option) => option.isActive && option.value === current.grade)
        ? current
        : { ...current, grade: options.find((option) => option.isActive)?.value || '' });
    } catch (e) { console.error(e); }
  }, [productId, service, fieldService]);
  useEffect(() => { load(); }, [load]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.variantName.trim() || !form.sku.trim()) return;
    try {
      service.createVariant(productId, {
        variantName: form.variantName.trim(), sku: form.sku.trim(), barcode: form.barcode.trim() || undefined,
        color: form.color || undefined, size: form.size || undefined, grade: form.grade,
        ...(canUpdatePricing ? {
          costPrice: Number(form.costPrice) || 0,
          sellingPriceM2: Number(form.sellingPriceM2) || 0,
        } : {}),
        isActive: true,
      });
      setForm({ variantName: '', sku: '', barcode: '', color: '', size: '', grade: gradeOptions.find((option) => option.isActive)?.value || '', costPrice: '', sellingPriceM2: '' });
      load();
    } catch (err: any) { toast.error(err?.message || 'تعذر إضافة المتغير'); }
  };

  const remove = (id: string) => {
    if (!confirm('حذف هذا المتغير؟')) return;
    try { service.deleteVariant(id); load(); } catch (err: any) { toast.error(err?.message); }
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <form onSubmit={add} className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 mb-3"><GitBranch className="w-4 h-4 text-sky-600" /> إضافة نوع / متغير</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <input required placeholder="اسم المتغير *" value={form.variantName} onChange={(e) => setForm({ ...form, variantName: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
            <input required placeholder="كود SKU *" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
            <input placeholder="باركود" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
            <input placeholder="اللون" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
            <input placeholder="المقاس" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
            <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
              {gradeOptions.filter((option) => option.isActive || option.value === form.grade).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {canUpdatePricing && <>
              <input type="number" min={0} step="0.01" placeholder="التكلفة" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
              <input type="number" min={0} step="0.01" placeholder="سعر البيع (م²)" value={form.sellingPriceM2} onChange={(e) => setForm({ ...form, sellingPriceM2: e.target.value })} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
            </>}
          </div>
          <div className="mt-3 flex justify-end">
            <button type="submit" className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold"><Plus className="w-4 h-4" /> إضافة</button>
          </div>
        </form>
      )}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {rows.length === 0 ? <div className="text-center text-slate-500 py-10 text-sm">لا توجد متغيرات لهذا المنتج</div> : (
          <DataTable
            ariaLabel="متغيرات المنتج"
            rows={rows}
            rowKey={(v: any) => String(v.id)}
            tableClassName="text-sm"
            rowClassName={() => 'transition hover:bg-slate-50/70'}
            columns={[
              { key: 'name', header: 'المتغير', render: (v: any) => <span className="font-bold text-slate-900">{v.variantName}</span> },
              {
                key: 'sku', header: 'SKU / باركود',
                render: (v: any) => <span className="font-mono text-xs text-slate-600">{v.sku}<span className="block text-slate-400">{v.barcode || '—'}</span></span>,
              },
              { key: 'spec', header: 'المقاس واللون', render: (v: any) => <span className="text-slate-600">{v.size || '—'} / {v.color || '—'}</span> },
              { key: 'grade', header: 'الفرز', render: (v: any) => <span className="text-slate-600">{v.grade ? gradeLabel(v.grade) : '—'}</span> },
              ...(canViewCosts ? [{ key: 'cost', header: 'التكلفة', render: (v: any) => <span className="font-mono text-rose-600">{money(v.costPrice)}</span> }] : []),
              ...(canViewPricing ? [{ key: 'price', header: 'سعر البيع', render: (v: any) => <span className="font-mono font-bold text-sky-600">{money(v.sellingPriceM2)}</span> }] : []),
              ...(canEdit ? [{ key: 'del', header: 'حذف', render: (v: any) => <button onClick={() => remove(v.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button> }] : []),
            ]}
          />
        )}
      </div>
    </div>
  );
};
