import React, { useState } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { ProductPicker } from '../../../../components/products/ProductPicker';
import { Modal } from '../../../../components/ui/Modal';
import { Pencil, Plus } from 'lucide-react';
import type { TabProps } from './OverviewTab';

interface BomItemDraft { componentProductId: string; quantity: string; unit: string }
interface BomOpDraft { workCenterId: string; minutesPerUnit: string }

export const BomsTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const [form, setForm] = useState({ productId: '', name: '', version: '1.0', notes: '', requiresFinalQc: false });
  const [items, setItems] = useState<BomItemDraft[]>([{ componentProductId: '', quantity: '', unit: '' }]);
  const [operations, setOperations] = useState<BomOpDraft[]>([]);
  const [routingBom, setRoutingBom] = useState<any | null>(null);
  const [routingOps, setRoutingOps] = useState<BomOpDraft[]>([]);
  const [editingBom, setEditingBom] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: '', version: '1.0', notes: '', requiresFinalQc: false });
  const [editItems, setEditItems] = useState<BomItemDraft[]>([]);
  const [editBusy, setEditBusy] = useState(false);

  const setItem = (index: number, patch: Partial<BomItemDraft>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };
  const setOp = (index: number, patch: Partial<BomOpDraft>, list: BomOpDraft[], setter: (v: BomOpDraft[]) => void) => {
    setter(list.map((op, i) => (i === index ? { ...op, ...patch } : op)));
  };

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createBom({
        productId: form.productId,
        name: form.name,
        version: form.version,
        notes: form.notes || undefined,
        requiresFinalQc: form.requiresFinalQc,
        items: items
          .filter((item) => item.componentProductId && Number(item.quantity) > 0)
          .map((item) => ({ componentProductId: item.componentProductId, quantity: Number(item.quantity), unit: item.unit || undefined })),
        operations: operations
          .filter((op) => op.workCenterId && Number(op.minutesPerUnit) >= 0)
          .map((op) => ({ workCenterId: op.workCenterId, minutesPerUnit: Number(op.minutesPerUnit) })),
      });
      setForm({ productId: '', name: '', version: '1.0', notes: '', requiresFinalQc: false });
      setItems([{ componentProductId: '', quantity: '', unit: '' }]);
      setOperations([]);
      toast.success('تم إنشاء BOM.');
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إنشاء BOM.');
    }
  };

  const openRouting = (bom: any) => {
    try {
      const ops = service.getBomOperations(bom.id) || [];
      setRoutingBom(bom);
      setRoutingOps(ops.map((op: any) => ({ workCenterId: op.workCenterId, minutesPerUnit: String(op.minutesPerUnit ?? '') })));
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل التوجيه.');
    }
  };

  const saveRouting = () => {
    if (!routingBom) return;
    run(() => {
      service.setBomOperations(routingBom.id, routingOps
        .filter((op) => op.workCenterId)
        .map((op) => ({ workCenterId: op.workCenterId, minutesPerUnit: Number(op.minutesPerUnit) || 0 })));
      setRoutingBom(null);
    }, 'تم حفظ التوجيه.');
  };

  const openEdit = (bom: any) => {
    setEditingBom(bom);
    setEditForm({
      name: bom.name || '',
      version: bom.version || '1.0',
      notes: bom.notes || '',
      requiresFinalQc: !!bom.requiresFinalQc,
    });
    setEditItems((bom.items || []).map((item: any) => ({
      componentProductId: item.componentProductId,
      quantity: String(item.quantity ?? ''),
      unit: item.unit || '',
    })));
  };

  const setEditItem = (index: number, patch: Partial<BomItemDraft>) => {
    setEditItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const saveEdit = () => {
    if (!editingBom || editBusy) return;
    setEditBusy(true);
    try {
      service.updateBom(editingBom.id, {
        name: editForm.name,
        version: editForm.version,
        notes: editForm.notes,
        requiresFinalQc: editForm.requiresFinalQc,
        items: editItems
          .filter((item) => item.componentProductId && Number(item.quantity) > 0)
          .map((item) => ({ componentProductId: item.componentProductId, quantity: Number(item.quantity), unit: item.unit || undefined })),
      });
      toast.success('تم تحديث BOM.');
      setEditingBom(null);
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحديث BOM.');
    } finally {
      setEditBusy(false);
    }
  };

  const run = (action: () => void, success: string) => {
    try { action(); toast.success(success); reload(); }
    catch (error: any) { toast.error(error?.message || 'تعذر تنفيذ الإجراء.'); }
  };

  return (
    <div className="space-y-3">
      {(data.bomStockAlerts || []).length > 0 && (
        <div className="rounded-xl border border-danger-border bg-danger-soft p-3">
          <h3 className="mb-2 text-sm font-black text-danger">
            مكوّنات حرجة في قوائم نشطة ({data.bomStockAlerts.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.bomStockAlerts.map((alert) => (
              <span
                key={alert.componentProductId}
                className={`rounded-full px-3 py-1 text-xs font-bold ${alert.severity === 'OUT' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}
                title={alert.usedBy.map((entry: any) => `${entry.bomName} → ${entry.productName}`).join('، ')}
              >
                {alert.componentName}: متاح {alert.availableQty}{alert.reorderPoint > 0 ? ` / حد ${alert.reorderPoint}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
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
            key: 'qc', header: 'فحص نهائي',
            render: (bom) => bom.requiresFinalQc
              ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-bold text-warning">مطلوب</span>
              : <span className="text-muted">—</span>,
          },
          { key: 'cost', header: 'التكلفة التقديرية', render: (bom) => bom.estimatedCost != null ? <b>{bom.estimatedCost.toLocaleString()}</b> : '—' },
          {
            key: 'items', header: 'المكوّنات',
            render: (bom) => <span className="text-xs text-muted">{(bom.items || []).map((item: any) => `${item.componentName || item.componentProductId} × ${item.quantity}`).join('، ')}</span>,
          },
          {
            key: 'actions', header: 'إجراءات',
            render: (bom) => canManage && (
              <div className="flex gap-1">
                {bom.status === 'DRAFT' && (
                  <button className="flex items-center gap-1 rounded bg-accent-soft px-2 py-1 text-xs text-primary" onClick={() => openEdit(bom)}>
                    <Pencil className="h-3 w-3" /> تعديل
                  </button>
                )}
                {bom.status === 'DRAFT' && (
                  <button className="rounded bg-accent-soft px-2 py-1 text-xs text-primary" onClick={() => openRouting(bom)}>توجيه</button>
                )}
                {bom.status === 'DRAFT' && (
                  <button className="rounded bg-success-soft px-2 py-1 text-xs text-success" onClick={() => run(() => service.activateBom(bom.id), 'تم تفعيل BOM.')}>تفعيل</button>
                )}
                {bom.status !== 'ARCHIVED' && (
                  <button className="rounded bg-surface-sunken px-2 py-1 text-xs text-ink-secondary" onClick={() => run(() => service.archiveBom(bom.id), 'تمت أرشفة BOM.')}>أرشفة</button>
                )}
              </div>
            ),
          },
        ]}
        emptyTitle="لا توجد BOM."
      />

      {canManage && (
        <form onSubmit={create} className="space-y-2 rounded-xl border border-line bg-surface p-3 text-xs lg:col-span-2">
          <h3 className="font-black text-ink">إنشاء BOM</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <ProductPicker
              required
              value={form.productId}
              selectedLabel={data.products.find((product) => product.id === form.productId)?.name}
              placeholder="المنتج المصنّع"
              ariaLabel="استعراض المنتجات المصنّعة"
              onChange={(productId) => setForm({ ...form, productId })}
            />
            <input required placeholder="اسم BOM" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input placeholder="الإصدار" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
          </div>
          <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" />
          <label className="flex items-center gap-2 rounded-lg border border-warning-border bg-warning-soft px-3 py-2 font-bold text-warning">
            <input
              type="checkbox"
              checked={form.requiresFinalQc}
              onChange={(e) => setForm({ ...form, requiresFinalQc: e.target.checked })}
            />
            يتطلب فحصاً نهائياً — الإنتاج يُحجز في الجودة قبل إدخاله المخزون
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink-secondary">المكوّنات <span className="font-normal text-muted">(الكمية بوحدة المخزون الأساسية لكل مكوّن)</span></span>
              <button type="button" className="text-primary" onClick={() => setItems([...items, { componentProductId: '', quantity: '', unit: '' }])}>+ إضافة مكوّن</button>
            </div>
            {items.map((item, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_90px_90px_32px]">
                <ProductPicker
                  required
                  value={item.componentProductId}
                  selectedLabel={data.products.find((product) => product.id === item.componentProductId)?.name}
                  placeholder="مكوّن"
                  ariaLabel={`استعراض مكون ${index + 1}`}
                  onChange={(productId) => {
                    const product = data.products.find((row: any) => row.id === productId);
                    setItem(index, { componentProductId: productId, unit: product?.baseUnit || product?.base_unit || '' });
                  }}
                />
                <input required type="number" min="0.001" step="0.001" placeholder="الكمية" value={item.quantity} onChange={(e) => setItem(index, { quantity: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
                <input placeholder="الوحدة" value={item.unit} readOnly title="الوحدة الأساسية للمكوّن" className="rounded-lg border border-line bg-surface-muted px-2 py-1.5 text-muted" />
                <button type="button" className="rounded-lg border border-line text-danger" onClick={() => setItems(items.filter((_, i) => i !== index))}>×</button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink-secondary">التوجيه <span className="font-normal text-muted">(دقائق لكل وحدة منتج — تُنسخ لعمليات أمر الإنتاج تلقائياً)</span></span>
              <button type="button" className="text-primary" onClick={() => setOperations([...operations, { workCenterId: '', minutesPerUnit: '' }])}>+ إضافة عملية</button>
            </div>
            {operations.map((op, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_110px_32px]">
                <select required value={op.workCenterId} onChange={(e) => setOp(index, { workCenterId: e.target.value }, operations, setOperations)} className="rounded-lg border border-line px-2 py-1.5">
                  <option value="">مركز العمل</option>
                  {data.workCenters.map((wc: any) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
                </select>
                <input required type="number" min="0" step="0.1" placeholder="دقائق/وحدة" value={op.minutesPerUnit} onChange={(e) => setOp(index, { minutesPerUnit: e.target.value }, operations, setOperations)} className="rounded-lg border border-line px-2 py-1.5" />
                <button type="button" className="rounded-lg border border-line text-danger" onClick={() => setOperations(operations.filter((_, i) => i !== index))}>×</button>
              </div>
            ))}
          </div>

          <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-1.5 font-bold text-white">
            <Plus className="h-3.5 w-3.5" /> إنشاء
          </button>
        </form>
      )}

      <Modal
        open={!!editingBom}
        onClose={() => !editBusy && setEditingBom(null)}
        busy={editBusy}
        size="lg"
        title={`تعديل BOM — ${editingBom?.productName || ''}`}
        footer={
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs" onClick={() => setEditingBom(null)} disabled={editBusy}>إلغاء</button>
            <button type="button" className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" onClick={saveEdit} disabled={editBusy}>
              {editBusy ? 'جارٍ…' : 'حفظ التعديلات'}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="grid gap-2 sm:grid-cols-3">
            <input required placeholder="اسم BOM" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input placeholder="الإصدار" value={editForm.version} onChange={(e) => setEditForm({ ...editForm, version: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input placeholder="ملاحظات" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-warning-border bg-warning-soft px-3 py-2 font-bold text-warning">
            <input type="checkbox" checked={editForm.requiresFinalQc} onChange={(e) => setEditForm({ ...editForm, requiresFinalQc: e.target.checked })} />
            يتطلب فحصاً نهائياً — الإنتاج يُحجز في الجودة قبل إدخاله المخزون
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink-secondary">المكوّنات</span>
              <button type="button" className="text-primary" onClick={() => setEditItems([...editItems, { componentProductId: '', quantity: '', unit: '' }])}>+ إضافة مكوّن</button>
            </div>
            {editItems.map((item, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_90px_90px_32px]">
                <ProductPicker
                  required
                  value={item.componentProductId}
                  selectedLabel={data.products.find((product) => product.id === item.componentProductId)?.name}
                  placeholder="مكوّن"
                  ariaLabel={`استعراض مكون ${index + 1}`}
                  onChange={(productId) => {
                    const product = data.products.find((row: any) => row.id === productId);
                    setEditItem(index, { componentProductId: productId, unit: product?.baseUnit || product?.base_unit || '' });
                  }}
                />
                <input required type="number" min="0.001" step="0.001" placeholder="الكمية" value={item.quantity} onChange={(e) => setEditItem(index, { quantity: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
                <input placeholder="الوحدة" value={item.unit} readOnly title="الوحدة الأساسية للمكوّن" className="rounded-lg border border-line bg-surface-muted px-2 py-1.5 text-muted" />
                <button type="button" className="rounded-lg border border-line text-danger" onClick={() => setEditItems(editItems.filter((_, i) => i !== index))}>×</button>
              </div>
            ))}
            {editItems.length === 0 && <p className="text-muted">لا توجد مكوّنات — أضف مكوّناً واحداً على الأقل.</p>}
          </div>
        </div>
      </Modal>

      {routingBom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4">
          <div className="w-full max-w-lg space-y-3 rounded-2xl bg-surface p-4 text-xs shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-ink">توجيه: {routingBom.name}</h3>
              <button className="text-muted" onClick={() => setRoutingBom(null)}>×</button>
            </div>
            <p className="text-muted">العمليات تُنسخ إلى أوامر الإنتاج الجديدة بالترتيب — الدقائق لكل وحدة منتج.</p>
            <div className="space-y-2">
              {routingOps.map((op, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_110px_32px]">
                  <select value={op.workCenterId} onChange={(e) => setOp(index, { workCenterId: e.target.value }, routingOps, setRoutingOps)} className="rounded-lg border border-line px-2 py-1.5">
                    <option value="">مركز العمل</option>
                    {data.workCenters.map((wc: any) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
                  </select>
                  <input type="number" min="0" step="0.1" placeholder="دقائق/وحدة" value={op.minutesPerUnit} onChange={(e) => setOp(index, { minutesPerUnit: e.target.value }, routingOps, setRoutingOps)} className="rounded-lg border border-line px-2 py-1.5" />
                  <button type="button" className="rounded-lg border border-line text-danger" onClick={() => setRoutingOps(routingOps.filter((_, i) => i !== index))}>×</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" className="rounded-lg border border-line px-3 py-1.5" onClick={() => setRoutingOps([...routingOps, { workCenterId: '', minutesPerUnit: '' }])}>+ إضافة عملية</button>
              <button type="button" className="flex-1 rounded-lg bg-primary py-1.5 font-bold text-white" onClick={saveRouting}>حفظ</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
