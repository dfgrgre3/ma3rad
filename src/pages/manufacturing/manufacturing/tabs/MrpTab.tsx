import React from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import type { TabProps } from './OverviewTab';

/**
 * MRP tab: uncovered sales demand + MPS entries exploded through BOMs,
 * netted against available-to-promise stock → planned production + material
 * purchase needs, plus the weekly time-phased MRP buckets.
 */
export const MrpTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const [mpsForm, setMpsForm] = React.useState({ productId: '', quantity: '', needDate: '', warehouseId: '', notes: '' });
  const run = (action: () => void, success: string) => {
    try { action(); toast.success(success); reload(); }
    catch (error: any) { toast.error(error?.message || 'تعذر تنفيذ الإجراء.'); }
  };

  const planned = data.mrp?.plannedProduction || [];
  const needs = data.mrp?.materialNeeds || [];
  const mpsEntries = data.mpsEntries || [];
  const buckets = data.timePhasedMrp?.buckets || [];

  const productName = (id: string) => data.products?.find((p: any) => p.id === id)?.name || id;
  const warehouseName = (id: string | null) => id ? (data.warehouses?.find((w: any) => w.id === id)?.name || id) : '—';

  const createMps = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => service.createMpsEntry({
      productId: mpsForm.productId,
      quantity: Number(mpsForm.quantity),
      needDate: mpsForm.needDate,
      warehouseId: mpsForm.warehouseId || undefined,
      notes: mpsForm.notes || undefined,
    }), 'تمت إضافة طلب MPS.');
    setMpsForm({ productId: '', quantity: '', needDate: '', warehouseId: '', notes: '' });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
        <div className="text-xs text-ink-secondary">
          <b>{planned.length}</b> عنصر بيع غير مغطى بإنتاج — <b>{needs.length}</b> حاجة مواد متوقعة للشراء.
        </div>
        {canManage && planned.length > 0 && (
          <button
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white"
            onClick={() => run(() => service.createProductionOrdersFromMrp({ priority: 'HIGH' }), 'تم إنشاء أوامر الإنتاج المخططة.')}
          >
            تحويل إلى أوامر إنتاج مخططة
          </button>
        )}
        {canManage && needs.length > 0 && (
          <button
            className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white"
            onClick={() => run(() => service.createPurchaseRequestsFromMrp({ priority: 'HIGH' }), 'تم إنشاء طلبات الشراء من خطة MRP.')}
          >
            إنشاء طلبات شراء من الاحتياجات
          </button>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <h3 className="mb-2 text-sm font-black text-ink">الإنتاج المخطط (طلب بيع → إنتاج)</h3>
        <DataTable
          ariaLabel="الإنتاج المخطط"
          rows={planned}
          rowKey={(row) => row.orderItemId}
          columns={[
            { key: 'so', header: 'أمر البيع', render: (row) => <span className="font-mono text-xs">{row.salesOrderNumber}</span> },
            { key: 'customer', header: 'العميل', render: (row) => row.customerName || '—' },
            { key: 'product', header: 'المنتج', render: (row) => row.productName },
            { key: 'qty', header: 'الكمية', render: (row) => `${row.quantity} ${row.unit || ''}` },
            { key: 'needed', header: 'مطلوب بحلول', render: (row) => row.neededBy || '—' },
            { key: 'latest', header: 'أحدث بدء', render: (row) => row.latestStartDate || '—' },
            { key: 'bom', header: 'قائمة المواد', render: (row) => <span className="text-xs text-muted">{row.bomName}</span> },
          ]}
          emptyTitle="لا توجد طلبات بيع غير مغطاة."
        />
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <h3 className="mb-2 text-sm font-black text-ink">احتياجات المواد الصافية (بعد خصم المتاح المحجوز)</h3>
        <DataTable
          ariaLabel="احتياجات المواد"
          rows={needs}
          rowKey={(row) => `${row.componentProductId}|${row.warehouseId}`}
          columns={[
            { key: 'component', header: 'المادة', render: (row) => row.componentName },
            { key: 'required', header: 'المطلوب', render: (row) => row.totalRequiredQty },
            { key: 'available', header: 'المتاح للالتزام', render: (row) => row.availableQty },
            { key: 'suggested', header: 'المقترح شراؤه', render: (row) => <b className="text-danger">{row.suggestedQty}</b> },
            { key: 'lead', header: 'مهلة التوريد', render: (row) => `${row.leadTimeDays ?? '—'} يوم` },
            { key: 'neededBy', header: 'مطلوب بحلول', render: (row) => row.neededBy || '—' },
            { key: 'orderBy', header: 'يُطلب قبل', render: (row) => row.orderByDate ? <b className="text-warning">{row.orderByDate}</b> : '—' },
            { key: 'value', header: 'القيمة التقديرية', render: (row) => row.estimatedValue.toLocaleString() },
            { key: 'orders', header: 'أوامر البيع', render: (row) => <span className="text-xs text-muted">{row.orderNumbers.join('، ')}</span> },
          ]}
          emptyTitle="لا توجد احتياجات مواد — المخزون يغطي الطلب."
        />
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <h3 className="mb-2 text-sm font-black text-ink">خطة الإنتاج الرئيسية MPS (طلب مستقل)</h3>
        <DataTable
          ariaLabel="إدخالات MPS"
          rows={mpsEntries}
          rowKey={(row) => row.id}
          columns={[
            { key: 'product', header: 'المنتج', render: (row) => productName(row.productId) },
            { key: 'qty', header: 'الكمية', render: (row) => row.quantity },
            { key: 'need', header: 'مطلوب بحلول', render: (row) => row.needDate },
            { key: 'wh', header: 'المستودع', render: (row) => warehouseName(row.warehouseId) },
            { key: 'status', header: 'الحالة', render: (row) => row.status === 'OPEN' ? 'مفتوح' : 'ملغى' },
            {
              key: 'action', header: '',
              render: (row) => canManage && row.status === 'OPEN' && (
                <button className="rounded bg-danger-soft px-2 py-0.5 text-xs text-danger" onClick={() => run(() => service.cancelMpsEntry(row.id), 'تم إلغاء طلب MPS.')}>إلغاء</button>
              ),
            },
          ]}
          emptyTitle="لا توجد إدخالات MPS."
        />
        {canManage && (
          <form onSubmit={createMps} className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs md:grid-cols-6">
            <select required value={mpsForm.productId} onChange={(e) => setMpsForm({ ...mpsForm, productId: e.target.value })} className="rounded-lg border border-line px-2 py-1.5">
              <option value="">المنتج</option>
              {(data.products || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input required type="number" min="0.001" step="any" placeholder="الكمية" value={mpsForm.quantity} onChange={(e) => setMpsForm({ ...mpsForm, quantity: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <input required type="date" value={mpsForm.needDate} onChange={(e) => setMpsForm({ ...mpsForm, needDate: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <select value={mpsForm.warehouseId} onChange={(e) => setMpsForm({ ...mpsForm, warehouseId: e.target.value })} className="rounded-lg border border-line px-2 py-1.5">
              <option value="">المستودع</option>
              {(data.warehouses || []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <input placeholder="ملاحظات" value={mpsForm.notes} onChange={(e) => setMpsForm({ ...mpsForm, notes: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 font-bold text-white">إضافة</button>
          </form>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <h3 className="mb-1 text-sm font-black text-ink">MRP مُدرَّج زمنياً ({data.timePhasedMrp?.weeks || 0} أسابيع)</h3>
        <p className="mb-2 text-[11px] text-muted">طلبات البيع + MPS تُفجَّر عبر قوائم المواد وتُسوّى مخزونياً أسبوعاً بأسبوع (صافي متطلبات لكل دلو).</p>
        <DataTable
          ariaLabel="MRP أسبوعي"
          rows={buckets}
          rowKey={(row) => row.weekStart}
          columns={[
            { key: 'week', header: 'الأسبوع', render: (row) => <span className="font-mono text-xs">{row.weekStart} ← {row.weekEnd}</span> },
            { key: 'planned', header: 'إنتاج (مبيعات)', render: (row) => row.plannedProduction.length },
            { key: 'mps', header: 'إنتاج (MPS)', render: (row) => row.mpsPlanned.length },
            { key: 'needs', header: 'احتياجات مواد', render: (row) => row.materialNeeds.length },
            { key: 'suggested', header: 'كمية شراء مقترحة', render: (row) => row.materialNeeds.reduce((s: number, n: any) => s + (Number(n.suggestedQty) || 0), 0).toLocaleString() },
          ]}
          emptyTitle="لا توجد بيانات MRP زمنية."
        />
      </div>
    </div>
  );
};
