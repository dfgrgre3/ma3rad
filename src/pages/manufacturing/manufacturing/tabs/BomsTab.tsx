import React, { useState } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { ProductPicker } from '../../../../components/products/ProductPicker';
import { Plus } from 'lucide-react';
import type { TabProps } from './OverviewTab';

interface BomItemDraft { componentProductId: string; quantity: string; unit: string }

export const BomsTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const [form, setForm] = useState({ productId: '', name: '', version: '1.0', notes: '' });
  const [items, setItems] = useState<BomItemDraft[]>([{ componentProductId: '', quantity: '', unit: 'PIECE' }]);

  const setItem = (index: number, patch: Partial<BomItemDraft>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createBom({
        productId: form.productId,
        name: form.name,
        version: form.version,
        notes: form.notes || undefined,
        items: items
          .filter((item) => item.componentProductId && Number(item.quantity) > 0)
          .map((item) => ({ componentProductId: item.componentProductId, quantity: Number(item.quantity), unit: item.unit || undefined })),
      });
      setForm({ productId: '', name: '', version: '1.0', notes: '' });
      setItems([{ componentProductId: '', quantity: '', unit: 'PIECE' }]);
      toast.success('تم إنشاء BOM.');
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إنشاء BOM.');
    }
  };

  const run = (action: () => void, success: string) => {
    try { action(); toast.success(success); reload(); }
    catch (error: any) { toast.error(error?.message || 'تعذر تنفيذ الإجراء.'); }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <DataTable
        ariaLabel="قوائم المواد"
        rows={data.boms}
        rowKey={(bom) => bom.id}
        columns={[
          { key: 'product', header: 'المنتج', render: (bom) => bom.productName },
          { key: 'name', header: 'الاسم', render: (bom) => bom.name },
          { key: 'version', header: 'الإصدار', render: (bom) => bom.version },
          { key: 'status', header: 'الحالة', render: (bom) => bom.status },
          {
            key: 'items', header: 'المكوّنات',
            render: (bom) => <span className="text-xs text-slate-500">{(bom.items || []).map((item: any) => `${item.componentName || item.componentProductId} × ${item.quantity}`).join('، ')}</span>,
          },
          {
            key: 'actions', header: 'إجراءات',
            render: (bom) => canManage && (
              <div className="flex gap-1">
                {bom.status === 'DRAFT' && (
                  <button className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700" onClick={() => run(() => service.activateBom(bom.id), 'تم تفعيل BOM.')}>تفعيل</button>
                )}
                {bom.status !== 'ARCHIVED' && (
                  <button className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600" onClick={() => run(() => service.archiveBom(bom.id), 'تمت أرشفة BOM.')}>أرشفة</button>
                )}
              </div>
            ),
          },
        ]}
        emptyTitle="لا توجد BOM."
      />

      {canManage && (
        <form onSubmit={create} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs lg:col-span-2">
          <h3 className="font-black text-slate-900">إنشاء BOM</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <ProductPicker
              required
              value={form.productId}
              selectedLabel={data.products.find((product) => product.id === form.productId)?.name}
              placeholder="المنتج المصنّع"
              ariaLabel="استعراض المنتجات المصنّعة"
              onChange={(productId) => setForm({ ...form, productId })}
            />
            <input required placeholder="اسم BOM" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" />
            <input placeholder="الإصدار" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" />
          </div>
          <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5" />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-600">المكوّنات</span>
              <button type="button" className="text-sky-600" onClick={() => setItems([...items, { componentProductId: '', quantity: '', unit: 'PIECE' }])}>+ إضافة مكوّن</button>
            </div>
            {items.map((item, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_90px_90px_32px]">
                <ProductPicker
                  required
                  value={item.componentProductId}
                  selectedLabel={data.products.find((product) => product.id === item.componentProductId)?.name}
                  placeholder="مكوّن"
                  ariaLabel={`استعراض مكون ${index + 1}`}
                  onChange={(productId) => setItem(index, { componentProductId: productId })}
                />
                <input required type="number" min="0.001" step="0.001" placeholder="الكمية" value={item.quantity} onChange={(e) => setItem(index, { quantity: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" />
                <input placeholder="الوحدة" value={item.unit} onChange={(e) => setItem(index, { unit: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" />
                <button type="button" className="rounded-lg border border-slate-200 text-rose-500" onClick={() => setItems(items.filter((_, i) => i !== index))}>×</button>
              </div>
            ))}
          </div>

          <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-sky-600 py-1.5 font-bold text-white">
            <Plus className="h-3.5 w-3.5" /> إنشاء
          </button>
        </form>
      )}
    </div>
  );
};
