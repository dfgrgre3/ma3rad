import React, { useMemo, useState } from 'react';
import { GitBranch, Search, Truck } from 'lucide-react';
import { DataTable } from '../../../../components/ui/DataTable';
import { BatchService } from '../../../../services/domains/inventory/BatchService';
import type { TabProps } from './OverviewTab';
import { statusBadge } from './OverviewTab';

const inputCls = 'rounded-lg border border-line px-2 py-1.5 text-xs';

/**
 * Lot genealogy tab: forward traceability (production order → raw material
 * suppliers/GRNs → produced batches → customer) and backward traceability
 * (supplier / goods receipt / purchase / raw batch → finished batches).
 */
export const TraceabilityTab: React.FC<TabProps> = ({ service, data, toast }) => {
  // ── Backward traceability filters ──────────────────────────────────────────
  const [supplierId, setSupplierId] = useState('');
  const [grnId, setGrnId] = useState('');
  const [purchaseId, setPurchaseId] = useState('');
  const [batchProductId, setBatchProductId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [rawBatches, setRawBatches] = useState<any[]>([]);
  const [backward, setBackward] = useState<any[] | null>(null);
  const [backwardError, setBackwardError] = useState('');

  // ── Forward traceability ───────────────────────────────────────────────────
  const [orderId, setOrderId] = useState('');
  const [forward, setForward] = useState<any | null>(null);
  const [forwardError, setForwardError] = useState('');

  const activeOrders = useMemo(
    () => (data.orders || []).filter((o) => !['CANCELLED'].includes(o.status)),
    [data.orders]
  );

  const onBatchProductChange = (productId: string) => {
    setBatchProductId(productId);
    setBatchId('');
    setRawBatches([]);
    if (!productId) return;
    try {
      setRawBatches(new BatchService().getBatchesForProduct(productId));
    } catch {
      setRawBatches([]);
    }
  };

  const runBackward = () => {
    const filter: Record<string, string> = {};
    if (supplierId) filter.supplierId = supplierId;
    if (grnId) filter.goodsReceiptId = grnId;
    if (purchaseId) filter.purchaseId = purchaseId;
    if (batchId) filter.productBatchId = batchId;
    if (Object.keys(filter).length === 0) {
      toast.error('اختر مورداً أو سند استلام أو فاتورة شراء أو تشغيلة خامة للتتبع.');
      return;
    }
    try {
      setBackward(service.getMaterialTraceability(filter));
      setBackwardError('');
    } catch (error: any) {
      setBackward(null);
      setBackwardError(error?.message || 'تعذر تنفيذ التتبع.');
    }
  };

  const runForward = () => {
    if (!orderId) {
      toast.error('اختر أمر الإنتاج أولاً.');
      return;
    }
    try {
      setForward(service.getOrderTraceability(orderId));
      setForwardError('');
    } catch (error: any) {
      setForward(null);
      setForwardError(error?.message || 'تعذر تحميل التتبع.');
    }
  };

  const grnLabel = (row: any) => `${row.grnNumber || row.id}${row.supplierName ? ` — ${row.supplierName}` : ''}${row.date ? ` (${row.date})` : ''}`;
  const purchaseLabel = (row: any) => `${row.invoiceNumber || row.id}${row.supplierName ? ` — ${row.supplierName}` : ''}`;

  return (
    <div className="space-y-4">
      {/* ── Forward traceability: order → sources ─────────────────────────── */}
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-black text-ink">تتبع أمامي — من أمر الإنتاج إلى الخامات والعميل</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className={`${inputCls} min-w-64`}>
            <option value="">— اختر أمر الإنتاج —</option>
            {activeOrders.map((order) => (
              <option key={order.id} value={order.id}>{order.orderNumber} — {order.productName} ({order.quantity})</option>
            ))}
          </select>
          <button onClick={runForward} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">
            <Search className="h-3.5 w-3.5" /> تتبع
          </button>
        </div>
        {forwardError && <p className="mt-2 text-xs text-danger">{forwardError}</p>}

        {forward && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-line p-2">
              <h4 className="mb-1 text-xs font-black text-ink">ملخص الأمر</h4>
              <div className="space-y-1 text-xs text-ink-secondary">
                <div>المنتج: <b>{forward.productName}</b> — الكمية: {forward.quantity} / المنتج: {forward.producedQty} — {statusBadge(forward.status)}</div>
                {forward.salesOrderNumber && <div>أمر البيع: <span className="font-mono">{forward.salesOrderNumber}</span> — العميل: {forward.customerName || '—'}</div>}
                {forward.producedBatches.length > 0 && (
                  <div>التشغيلات: {forward.producedBatches.map((b: any) => `${b.batchNumber} (متبقٍ ${b.quantityRemaining}/${b.quantity})`).join('، ')}</div>
                )}
                {forward.operators.length > 0 && (
                  <div>المشغلون: {forward.operators.map((o: any) => `${o.name} (${o.minutes} د)`).join('، ')}</div>
                )}
                {forward.reworkOrders.length > 0 && (
                  <div className="text-primary">أوامر إعادة عمل: {forward.reworkOrders.map((r: any) => `${r.orderNumber} (${r.quantity})`).join('، ')}</div>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-line p-2">
              <h4 className="mb-1 text-xs font-black text-ink">الخامات المصروفة ومصادرها ({forward.materials.length})</h4>
              {forward.materials.length === 0 ? (
                <p className="text-xs text-muted">لا توجد حركات صرف مسجلة بعد.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-start text-muted">
                      <th className="py-1 text-start">المادة</th><th className="text-start">الكمية</th><th className="text-start">المورد</th><th className="text-start">سند الاستلام</th><th className="text-start">فاتورة الشراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forward.materials.map((m: any, i: number) => (
                      <tr key={i} className="border-t border-line">
                        <td className="py-1">{m.componentName}</td>
                        <td>{m.quantity}</td>
                        <td>{m.supplierName || '—'}</td>
                        <td className="font-mono text-[11px]">{m.goodsReceiptId ? m.goodsReceiptId.slice(0, 12) : '—'}</td>
                        <td className="font-mono text-[11px]">{m.purchaseId ? m.purchaseId.slice(0, 12) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {forward.qualityChecks.length > 0 && (
              <div className="rounded-lg border border-line p-2 lg:col-span-2">
                <h4 className="mb-1 text-xs font-black text-ink">فحوصات الجودة ({forward.qualityChecks.length})</h4>
                <div className="flex flex-wrap gap-1">
                  {forward.qualityChecks.map((q: any) => (
                    <span key={q.id} className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-secondary">
                      {q.inspectionType}: {q.result} — مقبول {q.quantityAccepted} / مرفوض {q.quantityRejected}
                      {q.disposition !== 'NONE' && ` — ${q.disposition} (${q.dispositionQty})`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Backward traceability: material source → produced batches ──────── */}
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 flex items-center gap-2">
          <Truck className="h-4 w-4 text-success" />
          <h3 className="text-sm font-black text-ink">تتبع عكسي — من خامة/مورد إلى المنتجات النهائية</h3>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={`${inputCls} w-full`}>
            <option value="">— كل الموردين —</option>
            {(data.suppliers || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={grnId} onChange={(e) => setGrnId(e.target.value)} className={`${inputCls} w-full`}>
            <option value="">— كل سندات الاستلام —</option>
            {(data.goodsReceipts || []).map((g: any) => <option key={g.id} value={g.id}>{grnLabel(g)}</option>)}
          </select>
          <select value={purchaseId} onChange={(e) => setPurchaseId(e.target.value)} className={`${inputCls} w-full`}>
            <option value="">— كل فواتير الشراء —</option>
            {(data.purchases || []).map((p: any) => <option key={p.id} value={p.id}>{purchaseLabel(p)}</option>)}
          </select>
          <div className="flex gap-1">
            <select value={batchProductId} onChange={(e) => onBatchProductChange(e.target.value)} className={`${inputCls} flex-1`}>
              <option value="">— منتج الخامة —</option>
              {(data.products || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={`${inputCls} flex-1`} disabled={!batchProductId}>
              <option value="">— التشغيلة —</option>
              {rawBatches.map((b: any) => (
                <option key={b.id} value={b.id}>{b.batchNumber} (متبقٍ {b.quantityRemainingM2 ?? b.quantityRemaining ?? '—'})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={runBackward} className="flex items-center gap-1 rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white">
            <Search className="h-3.5 w-3.5" /> تتبع عكسي
          </button>
          <span className="text-[11px] text-muted">يمكن دمج أكثر من معيار — تُطبَّق كلها معاً.</span>
        </div>
        {backwardError && <p className="mt-2 text-xs text-danger">{backwardError}</p>}

        {backward !== null && (
          <div className="mt-3 space-y-3">
            {backward.length === 0 ? (
              <p className="rounded-lg bg-surface-muted p-4 text-center text-xs text-muted">لا توجد تشغيلات منتجة مرتبطة بهذا المصدر.</p>
            ) : (
              backward.map((entry: any) => (
                <div key={`${entry.componentProductId}|${entry.goodsReceiptId}|${entry.supplierId}`} className="rounded-lg border border-line p-2">
                  <div className="mb-1 text-xs font-black text-ink">
                    {entry.componentName}
                    {entry.supplierName && <span className="mr-2 font-normal text-muted">المورد: {entry.supplierName}</span>}
                  </div>
                  <DataTable
                    ariaLabel="التشغيلات المنتجة"
                    rows={entry.producedBatches as any[]}
                    rowKey={(row) => row.batchId}
                    dense
                    columns={[
                      { key: 'batch', header: 'التشغيلة', render: (row) => <span className="font-mono text-xs">{row.batchNumber}</span> },
                      { key: 'product', header: 'المنتج', render: (row) => row.productName },
                      { key: 'order', header: 'أمر الإنتاج', render: (row) => <span className="font-mono text-xs">{row.orderNumber}</span> },
                      { key: 'customer', header: 'العميل', render: (row) => row.customerName || '—' },
                      { key: 'qty', header: 'الكمية', render: (row) => row.quantity },
                      { key: 'date', header: 'تاريخ الإنتاج', render: (row) => row.producedDate || '—' },
                    ]}
                  />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
