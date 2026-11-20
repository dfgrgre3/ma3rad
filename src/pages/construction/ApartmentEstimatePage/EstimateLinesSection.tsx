import React from 'react';
import { ClipboardList, Package, Plus, Trash2 } from 'lucide-react';
import { getMeasureFormula, getQuantity, getRoomLineTotal, type Measure } from '../estimateCalculations';
import type { Product } from '../../../types';
import {
  fieldClass, fmt, isUnitCompatible, measureLabel, newLine,
  type CostLine, type LineTemplate, type PurchasePriceSnapshot, type Room,
} from './estimateModel';
import { NumberInput } from './EstimateUi';

export const EstimateLinesSection: React.FC<{
  products: Product[];
  rooms: Room[];
  lines: CostLine[];
  setLines: React.Dispatch<React.SetStateAction<CostLine[]>>;
  lineTemplates: LineTemplate[];
  warehouseId: string;
  stockError: string;
  priceHistory: Record<string, PurchasePriceSnapshot[]>;
  materialActionBusy: boolean;
  materialActionsCreated: { purchase: boolean; issue: boolean };
  patchLine: (id: string, patch: Partial<CostLine>) => void;
  saveLineTemplate: (line: CostLine) => void;
  applyLineTemplate: (templateId: string) => void;
  addLineAttachment: (line: CostLine, file?: File) => Promise<void>;
  loadLinkedStock: (productId: string, unit: string) => number;
  loadPurchasePriceHistory: (productId: string) => void;
  setLineMaterialProduct: (line: CostLine, productId: string) => void;
  createPurchaseRequestForShortages: () => void;
  createStockIssueRequests: () => void;
  getLineQuantity: (line: CostLine) => number;
  setDataError: React.Dispatch<React.SetStateAction<string>>;
}> = ({
  products, rooms, lines, setLines, lineTemplates,
  warehouseId, stockError, priceHistory,
  materialActionBusy, materialActionsCreated,
  patchLine, saveLineTemplate, applyLineTemplate, addLineAttachment,
  loadLinkedStock, loadPurchasePriceHistory, setLineMaterialProduct,
  createPurchaseRequestForShortages, createStockIssueRequests,
  getLineQuantity, setDataError,
}) => {
  return (
    <section className="mb-5 rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /><div><h2 className="font-black text-ink">بنود التشطيب والتسعير</h2><p className="text-xs text-muted">الهالك يضاف إلى كمية الخامات، بينما تحسب المصنعية على الكمية الصافية.</p></div></div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={materialActionBusy || materialActionsCreated.purchase} onClick={() => { if (window.confirm('هل اعتمدت المقايسة؟ سيتم إنشاء طلب شراء للعجز فقط.')) createPurchaseRequestForShortages(); }} className="rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-xs font-bold text-warning disabled:opacity-50">{materialActionsCreated.purchase ? 'تم إنشاء طلب الشراء' : 'طلب شراء للعجز'}</button>
            <button type="button" disabled={materialActionBusy || materialActionsCreated.issue} onClick={() => { if (window.confirm('هل اعتمدت المقايسة؟ سينشأ طلب صرف للمواد المتاحة، وسيبقى بانتظار اعتماد المخول.')) createStockIssueRequests(); }} className="rounded-lg border border-success-border bg-success-soft px-3 py-2 text-xs font-bold text-success disabled:opacity-50">{materialActionsCreated.issue ? 'تم إنشاء طلب الصرف' : 'طلب صرف المتاح'}</button>
            <select aria-label="إضافة قالب بند محفوظ" defaultValue="" onChange={(event) => { applyLineTemplate(event.target.value); event.target.value = ''; }} className="rounded-lg border border-accent-border bg-surface px-3 py-2 text-xs font-bold text-primary"><option value="">إضافة من القوالب…</option>{lineTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>
            <button type="button" onClick={() => setLines((current) => [...current, newLine('أعمال أخرى', 'بند جديد', 'manual', 'بند')])} className="inline-flex items-center gap-1 rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-xs font-bold text-primary"><Plus className="h-4 w-4" /> إضافة بند</button>
          </div>
        </div>
        <div className="space-y-4">
          {lines.map((line) => {
            const quantity = getLineQuantity(line);
            const materialQuantity = rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).materialQuantity, 0);
            const total = rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).total, 0);
            const linkedProduct = products.find((product) => product.id === line.materialProductId);
            const compatibleProduct = linkedProduct && isUnitCompatible(linkedProduct, line.unit);
            const stockAvailable = compatibleProduct && warehouseId && !stockError
              ? loadLinkedStock(line.materialProductId, line.unit)
              : null;
            const shortage = stockAvailable === null ? 0 : Math.max(0, materialQuantity - stockAvailable);
            return (
              <article key={line.id} className="rounded-xl border border-line p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
                  <label className="text-[11px] font-bold text-muted">البند<input value={line.name} onChange={(event) => patchLine(line.id, { name: event.target.value })} className={`${fieldClass()} mt-1`} /></label>
                  <label className="text-[11px] font-bold text-muted">التصنيف<input value={line.category} onChange={(event) => patchLine(line.id, { category: event.target.value })} className={`${fieldClass()} mt-1`} /></label>
                  <label className="text-[11px] font-bold text-muted">نوع الأعمال<select value={line.workType || 'FINISHING'} onChange={(event) => patchLine(line.id, { workType: event.target.value as CostLine['workType'] })} className={`${fieldClass()} mt-1`}><option value="FOUNDATION">أعمال تأسيس</option><option value="FINISHING">أعمال تشطيب</option></select></label>
                  <label className="text-[11px] font-bold text-muted">مرحلة التنفيذ<select value={line.phase || ''} onChange={(event) => patchLine(line.id, { phase: event.target.value })} className={`${fieldClass()} mt-1`}><option value="">اختر المرحلة</option>{['تجهيز الموقع','الأعمال المدنية','تأسيس الكهرباء','تأسيس السباكة','العزل','المحارة','الأرضيات','الدهانات','التركيبات النهائية','التسليم'].map((phase) => <option key={phase}>{phase}</option>)}</select></label>
                  <label className="text-[11px] font-bold text-muted">طريقة حساب الكمية<select value={line.measure} onChange={(event) => patchLine(line.id, { measure: event.target.value as Measure })} className={`${fieldClass()} mt-1`}>{Object.entries(measureLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                  <label className="text-[11px] font-bold text-muted">الوحدة<input value={line.unit} onChange={(event) => patchLine(line.id, { unit: event.target.value })} className={`${fieldClass()} mt-1`} /></label>
                  {line.measure === 'manual' && <NumberInput label="الكمية اليدوية" value={line.manualQuantity} min={0} step={0.1} onChange={(manualQuantity) => patchLine(line.id, { manualQuantity })} />}
                  <label className="text-[11px] font-bold text-muted">الصنف المرتبط بالمخزون<select value={line.materialProductId} onChange={(event) => setLineMaterialProduct(line, event.target.value)} className={`${fieldClass()} mt-1`}><option value="">— بدون ربط مخزني —</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku}) — {product.baseUnit}</option>)}</select></label>
                </div>
                <div className="mt-2 rounded-lg bg-surface-muted px-3 py-2 text-[11px] text-ink-secondary"><b>طريقة الاحتساب:</b> {rooms.map((room) => `${room.name}: ${getMeasureFormula(line, room, rooms.length)} = ${fmt(getQuantity(line, room, rooms.length))} ${line.unit}`).join(' · ')}</div>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <label className="text-[11px] font-bold text-muted">المواصفات الفنية<textarea value={line.specifications || ''} onChange={(event) => patchLine(line.id, { specifications: event.target.value })} rows={2} className={`${fieldClass()} mt-1`} placeholder="الماركة، المقاس، طريقة التركيب، معيار الجودة…" /></label>
                  <label className="text-[11px] font-bold text-muted">ملاحظات التنفيذ<textarea value={line.notes || ''} onChange={(event) => patchLine(line.id, { notes: event.target.value })} rows={2} className={`${fieldClass()} mt-1`} placeholder="ملاحظات خاصة بهذا البند" /></label>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <label className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 font-bold text-ink">إرفاق ملف<input type="file" className="hidden" onChange={(event) => { void addLineAttachment(line, event.target.files?.[0]).catch((error) => setDataError(error instanceof Error ? error.message : 'تعذر إرفاق الملف.')); event.currentTarget.value = ''; }} /></label>
                  {(line.attachments || []).map((attachment) => <span key={attachment.id} className="inline-flex items-center gap-1 rounded-lg bg-surface-sunken px-2 py-1"><a href={attachment.dataUrl} download={attachment.name} className="underline">{attachment.name}</a><button type="button" aria-label={`حذف المرفق ${attachment.name}`} onClick={() => patchLine(line.id, { attachments: line.attachments?.filter((item) => item.id !== attachment.id) })} className="font-black text-danger">×</button></span>)}
                  <button type="button" onClick={() => saveLineTemplate(line)} className="mr-auto rounded-lg border border-accent-border px-3 py-2 font-bold text-primary">حفظ كقالب</button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  <NumberInput label={`سعر الخامات / ${line.unit}`} value={line.materialRate} min={0} step={0.01} onChange={(materialRate) => patchLine(line.id, { materialRate })} />
                  <NumberInput label={`المصنعية / ${line.unit}`} value={line.laborRate} min={0} step={0.01} onChange={(laborRate) => patchLine(line.id, { laborRate })} />
                  <NumberInput label={`المعدات / ${line.unit}`} value={line.equipmentRate || 0} min={0} step={0.01} onChange={(equipmentRate) => patchLine(line.id, { equipmentRate })} />
                  <NumberInput label={`المصروفات / ${line.unit}`} value={line.expenseRate || 0} min={0} step={0.01} onChange={(expenseRate) => patchLine(line.id, { expenseRate })} />
                  <NumberInput label="الهالك %" value={line.wastePercent} min={0} step={0.1} onChange={(wastePercent) => patchLine(line.id, { wastePercent })} />
                  <NumberInput label="الخصم %" value={line.discountPercent} min={0} max={100} step={0.1} onChange={(discountPercent) => patchLine(line.id, { discountPercent })} />
                  <NumberInput label="الربح %" value={line.profitPercent} min={0} step={0.1} onChange={(profitPercent) => patchLine(line.id, { profitPercent })} />
                  <div className="flex items-end justify-between gap-2 rounded-lg bg-success-soft px-3 py-2 text-xs"><div><div className="text-[10px] text-muted">الكمية / تكلفة / بيع / ربح</div><b className="text-success">{fmt(quantity)} {line.unit} • {fmt(rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).cost, 0))} / {fmt(total)} / {fmt(rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).profitAmount, 0))} ج</b></div><button type="button" aria-label="حذف البند" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} className="rounded-md p-1 text-muted hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-surface-muted px-3 py-2 text-[10px] text-ink-secondary"><span>خامات: {fmt(rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).materialCost, 0))} ج</span><span>عمالة: {fmt(rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).laborCost, 0))} ج</span><span>معدات: {fmt(rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).equipmentCost, 0))} ج</span><span>مصروفات: {fmt(rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).expenseCost, 0))} ج</span><span>الربح بعد الخصم: {fmt(rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).profitAmount, 0))} ج</span></div>
                {linkedProduct && <div className="mb-2 rounded-lg border border-line p-2 text-[10px] text-ink-secondary"><div className="flex flex-wrap items-center gap-3"><span>سجل سعر المادة: {(line.materialPriceHistory || []).length} لقطة</span><button type="button" onClick={() => loadPurchasePriceHistory(line.materialProductId)} className="font-bold text-primary">عرض أسعار الشراء السابقة</button></div>{(line.materialPriceHistory || []).slice(-4).reverse().map((entry) => <div key={entry.id} className="mt-1">{new Date(entry.date).toLocaleDateString('ar-EG')} — {fmt(entry.unitPrice)} ج/{line.unit} — {entry.note || 'تغيير سعر'}</div>)}{(priceHistory[line.materialProductId] || []).slice(0, 5).map((entry, index) => <div key={`${entry.invoiceNumber}-${index}`} className="mt-1">{entry.date} — {entry.supplierName} — {fmt(entry.effectiveUnitCost)} ج/{linkedProduct.baseUnit} — فاتورة {entry.invoiceNumber}</div>)}</div>}
                {linkedProduct && <div className="mb-2 rounded-lg border border-line p-2 text-[10px] text-ink-secondary"><div className="flex flex-wrap items-center gap-3"><span>سجل سعر المادة: {(line.materialPriceHistory || []).length} لقطة</span><button type="button" onClick={() => loadPurchasePriceHistory(line.materialProductId)} className="font-bold text-primary">عرض أسعار الشراء السابقة</button></div>{(line.materialPriceHistory || []).slice(-4).reverse().map((entry) => <div key={entry.id} className="mt-1">{new Date(entry.date).toLocaleDateString('ar-EG')} — {fmt(entry.unitPrice)} ج/{line.unit} — {entry.note || 'تغيير سعر'}</div>)}{(priceHistory[line.materialProductId] || []).slice(0, 5).map((entry, index) => <div key={`${entry.invoiceNumber}-${index}`} className="mt-1">{entry.date} — {entry.supplierName} — {fmt(entry.effectiveUnitCost)} ج/{linkedProduct.baseUnit} — فاتورة {entry.invoiceNumber}</div>)}</div>}
                {linkedProduct && (
                  <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-[11px] ${shortage > 0 ? 'bg-warning-soft text-warning' : 'bg-accent-soft text-primary'}`}>
                    <span className="inline-flex items-center gap-1 font-bold"><Package className="h-3.5 w-3.5" /> {linkedProduct.name}</span>
                    <span>الاحتياج شامل الهالك: {fmt(materialQuantity)} {line.unit}</span>
                    <span>{stockAvailable === null ? 'الرصيد غير متاح' : `المتاح بالمستودع: ${fmt(stockAvailable)} ${line.unit}`}</span>
                    {stockAvailable !== null && shortage > 0 && <span className="font-black">عجز متوقع: {fmt(shortage)} {line.unit}</span>}
                    {!compatibleProduct && <span className="font-bold">وحدة الصنف لا تطابق وحدة الاحتياج؛ لم يتم احتساب الرصيد.</span>}
                    {compatibleProduct && stockAvailable === null && <span>اختر مستودعًا صالحًا لعرض الرصيد.</span>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
    </section>
  );
};
