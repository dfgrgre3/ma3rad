import React, { useCallback, useEffect, useState } from 'react';
import { Package, ShieldCheck, Trash2, X } from 'lucide-react';
import { OperationsService, Delivery, DeliveryItem, ShipmentQcCheck } from '../../../services/domains/operations/OperationsService';
import { useToast } from '../../../components/ui/Toast';

const inputCls = 'w-full rounded-lg border border-line px-2 py-1.5 text-xs';
const labelCls = 'mb-1 block text-[10px] font-bold text-muted';

interface Props {
  service: OperationsService;
  delivery: Delivery;
  products: Array<{ id: string; name: string }>;
  onClose: () => void;
  onChanged: () => void;
}

export const DeliveryDetailModal: React.FC<Props> = ({ service, delivery, products, onClose, onChanged }) => {
  const toast = useToast();
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [checks, setChecks] = useState<ShipmentQcCheck[]>([]);
  const [itemForm, setItemForm] = useState({ productId: '', quantityM2: '', boxesCount: '', productBatchId: '', notes: '' });
  const [batches, setBatches] = useState<Array<{ id: string; batchNumber: string; quantityRemainingM2: number }>>([]);
  const [qcForm, setQcForm] = useState({ result: 'PASS', packagingOk: true, quantitiesOk: true, findings: '' });
  const locked = ['DELIVERED', 'CANCELLED', 'FAILED'].includes(delivery.status);

  const reload = useCallback(() => {
    setItems(service.getDeliveryItems(delivery.id));
    setChecks(service.getShipmentQcChecks(delivery.id));
    onChanged();
  }, [service, delivery.id, onChanged]);
  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!itemForm.productId) { setBatches([]); return; }
    try { setBatches(service.getShippableBatches(itemForm.productId, delivery.warehouseId)); }
    catch { setBatches([]); }
  }, [itemForm.productId, delivery.warehouseId, service]);

  const run = (action: () => void, ok: string) => {
    try { action(); toast.success(ok); reload(); }
    catch (e: any) { toast.error(e?.message || 'تعذر تنفيذ الإجراء.'); }
  };

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => {
      service.addDeliveryItem(delivery.id, {
        productId: itemForm.productId,
        quantityM2: Number(itemForm.quantityM2),
        boxesCount: itemForm.boxesCount === '' ? undefined : Number(itemForm.boxesCount),
        productBatchId: itemForm.productBatchId || undefined,
        notes: itemForm.notes || undefined,
      });
      setItemForm({ productId: '', quantityM2: '', boxesCount: '', productBatchId: '', notes: '' });
    }, 'تمت إضافة بند التعبئة.');
  };

  const submitQc = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => {
      service.recordShipmentQc(delivery.id, {
        result: qcForm.result as any,
        packagingOk: qcForm.packagingOk,
        quantitiesOk: qcForm.quantitiesOk,
        findings: qcForm.findings || undefined,
      });
      setQcForm({ result: 'PASS', packagingOk: true, quantitiesOk: true, findings: '' });
    }, 'تم تسجيل فحص ما قبل الشحن.');
  };

  const latestQc = checks[0];
  const qcLabel: Record<string, string> = { PASS: 'ناجح', FAIL: 'راسب', CONDITIONAL: 'مشروط' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-ink">تعبئة وفحص ما قبل الشحن — {delivery.deliveryNumber}</h3>
            <p className="text-[11px] text-muted">{delivery.customerName} — {delivery.address}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-sunken"><X className="h-4 w-4" /></button>
        </div>

        {delivery.requiresShipmentQc && (
          <div className={`mb-3 rounded-lg border p-2 text-xs font-bold ${latestQc?.result === 'PASS' ? 'border-success-border bg-success-soft text-success' : 'border-warning-border bg-warning-soft text-warning'}`}>
            فحص ما قبل الشحن مطلوب قبل مغادرة المستودع — آخر نتيجة: {latestQc ? qcLabel[latestQc.result] : 'لا يوجد'}
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="mb-1 flex items-center gap-1 text-xs font-black text-ink"><Package className="h-3.5 w-3.5" /> بنود التعبئة</div>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-line text-[10px] text-muted">
                <th className="py-1 text-right">المنتج</th><th className="text-right">الكمية</th><th className="text-right">الكراتين</th><th className="text-right">التشغيلة/الدفعة</th>{!locked && <th />}
              </tr></thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted">لا توجد بنود تعبئة.</td></tr>}
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line">
                    <td className="py-1.5">{item.productName}</td>
                    <td>{item.quantityM2}</td>
                    <td>{item.boxesCount || '—'}</td>
                    <td className="font-mono">{item.lotNumber || item.batchNumber || '—'}</td>
                    {!locked && <td><button onClick={() => run(() => service.removeDeliveryItem(delivery.id, item.id), 'تم حذف البند.')} className="text-danger hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>

            {!locked && (
              <form onSubmit={addItem} className="mt-3 space-y-2 rounded-lg border border-line p-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>المنتج *</label>
                    <select required className={inputCls} value={itemForm.productId} onChange={(e) => setItemForm({ ...itemForm, productId: e.target.value, productBatchId: '' })}>
                      <option value="">اختر...</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div><label className={labelCls}>الكمية (م²) *</label><input required type="number" min="0.001" step="0.001" className={inputCls} value={itemForm.quantityM2} onChange={(e) => setItemForm({ ...itemForm, quantityM2: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className={labelCls}>الكراتين</label><input type="number" min="0" className={inputCls} value={itemForm.boxesCount} onChange={(e) => setItemForm({ ...itemForm, boxesCount: e.target.value })} /></div>
                  <div className="col-span-2"><label className={labelCls}>التشغيلة/الدفعة (اختياري)</label>
                    <select className={inputCls} value={itemForm.productBatchId} onChange={(e) => setItemForm({ ...itemForm, productBatchId: e.target.value })}>
                      <option value="">بدون تتبع دفعة</option>
                      {batches.map((b) => <option key={b.id} value={b.id}>{b.batchNumber} — متبقي {b.quantityRemainingM2}</option>)}
                    </select>
                  </div>
                </div>
                <input className={inputCls} placeholder="ملاحظات" value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} />
                <button className="w-full rounded-lg bg-primary py-1.5 text-xs font-bold text-white">إضافة بند</button>
              </form>
            )}
          </div>

          <div className="space-y-3 lg:col-span-2">
            <div className="rounded-lg border border-line p-2">
              <div className="mb-1 flex items-center gap-1 text-xs font-black text-ink"><ShieldCheck className="h-3.5 w-3.5" /> فحص ما قبل الشحن</div>
              {checks.length > 0 && (
                <div className="mb-2 max-h-28 space-y-1 overflow-y-auto text-[10px] text-muted">
                  {checks.map((c) => (
                    <div key={c.id} className="flex justify-between border-b border-line pb-1">
                      <span className={c.result === 'PASS' ? 'font-bold text-success' : 'font-bold text-danger'}>{qcLabel[c.result]}</span>
                      <span>{c.checkedAt?.slice(0, 16).replace('T', ' ')} — {c.checkedByName || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
              {!locked && (
                <label className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-ink-secondary">
                  <input type="checkbox" checked={!!delivery.requiresShipmentQc}
                    onChange={(e) => run(() => service.setDeliveryShipmentQcRequired(delivery.id, e.target.checked), 'تم تحديث متطلب الفحص.')} />
                  يتطلب فحص ما قبل الشحن قبل الإرسال
                </label>
              )}
              {!locked ? (
                <form onSubmit={submitQc} className="space-y-2">
                  <div><label className={labelCls}>النتيجة</label>
                    <select className={inputCls} value={qcForm.result} onChange={(e) => setQcForm({ ...qcForm, result: e.target.value })}>
                      <option value="PASS">ناجح</option><option value="CONDITIONAL">مشروط</option><option value="FAIL">راسب</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={qcForm.packagingOk} onChange={(e) => setQcForm({ ...qcForm, packagingOk: e.target.checked })} /> التغليف سليم</label>
                  <label className="flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={qcForm.quantitiesOk} onChange={(e) => setQcForm({ ...qcForm, quantitiesOk: e.target.checked })} /> الكميات مطابقة</label>
                  <input className={inputCls} placeholder="ملاحظات الفحص" value={qcForm.findings} onChange={(e) => setQcForm({ ...qcForm, findings: e.target.value })} />
                  <button className="w-full rounded-lg bg-success py-1.5 text-xs font-bold text-white">تسجيل الفحص</button>
                </form>
              ) : <p className="text-[10px] text-muted">الأمر منتهي — للعرض فقط.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
