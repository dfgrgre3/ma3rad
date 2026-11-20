import React from 'react';
import {
  FileText, Plus, Trash2, Loader2,
  Pencil, Copy, RefreshCw, ChevronLeft as CancelIcon, Receipt,
  AlertTriangle, MessageCircle, CalendarClock, ShoppingBag, X, Printer,
} from 'lucide-react';
import { Quotation, QuotationStatus } from '../../../services/domains/sales/QuotationService';
import { Customer, Product, Warehouse, PaymentType } from '../../../types';
import { DocumentPreviewModal } from '../../../components/documents/DocumentPreviewModal';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import {
  getSellableUnits, getUomLabel, isWholeUnit,
} from '../../../utils/products/uom';
import type { OperationalFieldDefinition } from '../../../services/domains/products/OperationalFieldService';
import { OperationalFieldsForm } from '../../../components/products/OperationalFieldsForm';
import { OperationalFieldsSummary } from '../../../components/products/OperationalFieldsSummary';
import { OperationalFieldsRecordEditor } from '../../../components/products/OperationalFieldsRecordEditor';
import { ProductPicker } from '../../../components/products/ProductPicker';
import { DataTable } from '../../../components/ui/DataTable';
import { useDocElements } from '../../../hooks/domains/config/useActivityUi';

export const STATUS_LABELS: Record<QuotationStatus, { label: string; color: string }> = {
  PENDING: { label: 'بانتظار الموافقة', color: 'bg-warning/10 text-warning border-warning/20' },
  CONVERTED: { label: 'محوّل إلى فاتورة', color: 'bg-success/10 text-success border-success/20' },
  EXPIRED: { label: 'منتهي الصلاحية', color: 'bg-surface-sunken text-muted border-line-strong' },
  CANCELLED: { label: 'ملغي', color: 'bg-danger/10 text-danger border-danger/20' },
};

export const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';

export type Line = { productId: string; uom: string; quantity: number; unitPrice: number; discountAmount: number };
export type ServiceLine = { productId?: string; description: string; unit: string; quantity: number; unitPrice: number; discountAmount: number };

export interface FormState {
  customerId: string;
  warehouseId: string;
  salesRepId: string;
  validDays: string;
  discount: string;
  tax: string;
  notes: string;
  lines: Line[];
  serviceLines: ServiceLine[];
}

export const emptyForm = (): FormState => ({
  customerId: '', warehouseId: '', salesRepId: '', validDays: '15', discount: '', tax: '', notes: '',
  lines: [{ productId: '', uom: '', quantity: 0, unitPrice: 0, discountAmount: 0 }],
  serviceLines: [],
});

const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; wide?: boolean }> = ({ children, onClose, wide }) => (
  <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`bg-surface rounded-2xl border border-line shadow-2xl w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} p-6 max-h-[92vh] overflow-y-auto`}>{children}</div>
  </div>
);

const NumField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="font-bold text-ink block mb-1">{label}</label>
    <input type="number" min={0} step="0.01" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono" />
  </div>
);

const Info: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-surface-muted border border-line rounded-xl p-3">
    <div className="text-[10px] font-bold text-muted">{label}</div>
    <div className="text-xs font-black text-ink mt-0.5">{value}</div>
    {sub && <div className="text-[10px] text-muted font-mono mt-0.5">{sub}</div>}
  </div>
);

export interface SalesRepOption {
  id: string;
  name: string;
  isSalesRep?: boolean;
  branchNames?: string;
  servesBranch?: boolean;
}

interface QuotationModalsProps {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canApprove: boolean;
  saving: boolean;
  formOpen: boolean;
  setFormOpen: (open: boolean) => void;
  editingId: string | null;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  submitForm: (e: React.FormEvent) => void;
  customers: Customer[];
  products: Product[];
  warehouses: Warehouse[];
  salesReps: SalesRepOption[];
  setLine: (idx: number, patch: Partial<Line>) => void;
  pickProduct: (idx: number, productId: string) => void;
  changeLineUnit: (idx: number, unit: string) => void;
  lineBaseQuantity: (line: Line) => number;
  total: number;
  detail: Quotation | null;
  setDetail: React.Dispatch<React.SetStateAction<Quotation | null>>;
  convertTarget: Quotation | null;
  setConvertTarget: React.Dispatch<React.SetStateAction<Quotation | null>>;
  convertWarehouse: string;
  setConvertWarehouse: (value: string) => void;
  convertPaymentType: PaymentType;
  setConvertPaymentType: (value: PaymentType) => void;
  convertPaid: string;
  setConvertPaid: (value: string) => void;
  convertNotes: string;
  setConvertNotes: (value: string) => void;
  submitConvert: (e: React.FormEvent) => void;
  orderTarget: Quotation | null;
  setOrderTarget: React.Dispatch<React.SetStateAction<Quotation | null>>;
  orderDeliveryDate: string;
  setOrderDeliveryDate: (value: string) => void;
  orderNotes: string;
  setOrderNotes: (value: string) => void;
  submitConvertOrder: (e: React.FormEvent) => void;
  followUpTarget: Quotation | null;
  setFollowUpTarget: React.Dispatch<React.SetStateAction<Quotation | null>>;
  followUpDate: string;
  setFollowUpDate: (value: string) => void;
  followUpNotes: string;
  setFollowUpNotes: (value: string) => void;
  submitFollowUp: (e: React.FormEvent) => void;
  docPreview: { title: string; subtitle?: string; fileName: string; html: string; excel?: () => void } | null;
  setDocPreview: (preview: { title: string; subtitle?: string; fileName: string; html: string; excel?: () => void } | null) => void;
  printService: any;
  shareOnWhatsApp: (quotation: Quotation) => void;
  openFollowUp: (quotation: Quotation) => void;
  duplicate: (quotation: Quotation) => void;
  openEdit: (quotation: Quotation) => void;
  openConvertOrder: (quotation: Quotation) => void;
  openConvert: (quotation: Quotation) => void;
  reopenQuotation: (quotation: Quotation) => void;
  cancelQuotation: (quotation: Quotation) => void;
  deleteQuotation: (quotation: Quotation) => void;
  operationalFields: OperationalFieldDefinition[];
  operationalFieldValues: Record<string, string>;
  onOperationalFieldValuesChange: (values: Record<string, string>) => void;
  canUpdateOperationalFields: boolean;
  onSaveOperationalFields: (quotationId: string, values: Record<string, string>) => void;
};

export const QuotationModals: React.FC<QuotationModalsProps> = ({
  canCreate,
  canUpdate,
  canDelete: _canDelete,
  canApprove,
  saving,
  formOpen,
  setFormOpen,
  editingId,
  form,
  setForm,
  submitForm,
  customers,
  products,
  warehouses,
  salesReps,
  setLine,
  pickProduct,
  changeLineUnit,
  lineBaseQuantity,
  total,
  detail,
  setDetail,
  convertTarget,
  setConvertTarget,
  convertWarehouse,
  setConvertWarehouse,
  convertPaymentType,
  setConvertPaymentType,
  convertPaid,
  setConvertPaid,
  convertNotes,
  setConvertNotes,
  submitConvert,
  orderTarget,
  setOrderTarget,
  orderDeliveryDate,
  setOrderDeliveryDate,
  orderNotes,
  setOrderNotes,
  submitConvertOrder,
  followUpTarget,
  setFollowUpTarget,
  followUpDate,
  setFollowUpDate,
  followUpNotes,
  setFollowUpNotes,
  submitFollowUp,
  docPreview,
  setDocPreview,
  printService,
  shareOnWhatsApp,
  openFollowUp,
  duplicate,
  openEdit,
  openConvertOrder,
  openConvert,
  reopenQuotation,
  cancelQuotation,
  deleteQuotation,
  operationalFields,
  operationalFieldValues,
  onOperationalFieldValuesChange,
  canUpdateOperationalFields,
  onSaveOperationalFields,
}) => {
  const doc = useDocElements('/doc/quotation');
  const docVisible = (id: string) => doc[id]?.visible !== false;
  return (
  <>
{/* Create / edit modal */}
{formOpen && (
  <Modal onClose={() => setFormOpen(false)} wide>
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-base font-black text-ink flex items-center gap-2"><FileText className="w-5 h-5 text-warning" /> {editingId ? 'تعديل عرض السعر' : 'إصدار عرض أسعار جديد'}</h3>
      <button onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
    </div>
    <form onSubmit={submitForm} className="space-y-3 text-xs">
      <OperationalFieldsForm fields={operationalFields} values={operationalFieldValues} onChange={onOperationalFieldValuesChange} title="بيانات إضافية لعرض السعر" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div>
          <label className="font-bold text-ink block mb-1">العميل *</label>
          <select required value={form.customerId} onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold">
            <option value="">— اختر العميل —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
          </select>
        </div>
        <div>
          <label className="font-bold text-ink block mb-1">المخزن المرجعي</label>
          <select value={form.warehouseId} onChange={(e) => setForm((p) => ({ ...p, warehouseId: e.target.value }))} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold">
            <option value="">— بدون —</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="font-bold text-ink block mb-1">صلاحية العرض (أيام)</label>
          <input type="number" min={1} max={365} value={form.validDays} onChange={(e) => setForm((p) => ({ ...p, validDays: e.target.value }))} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono" />
        </div>
        <div>
          <label className="font-bold text-ink block mb-1">المندوب</label>
          <select value={form.salesRepId} onChange={(e) => setForm((p) => ({ ...p, salesRepId: e.target.value }))} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold">
            <option value="">— بدون —</option>
            {salesReps.map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.name}{rep.isSalesRep ? ' · مندوب' : ''}{rep.servesBranch === false ? ` — خارج نطاق الفرع: ${rep.branchNames || ''}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border border-line rounded-xl overflow-hidden">
        <DataTable
                  ariaLabel="أصناف عرض السعر"
                  rows={form.lines.map((l, i) => ({ ...l, _i: i }))}
                  rowKey={(l) => String(l._i)}
                  dense
                  columns={[
                    {
                      key: 'product', header: 'الصنف',
                      render: (l) => {
                        const selectedProduct = products.find((p) => p.id === l.productId);
                        return (
                          <ProductPicker
                            value={l.productId}
                            selectedLabel={selectedProduct?.name}
                            ariaLabel={`استعراض أصناف عرض السعر للسطر ${l._i + 1}`}
                            onChange={(productId) => pickProduct(l._i, productId)}
                          />
                        );
                      },
                    },
                    {
                      key: 'qty', header: 'الكمية / الوحدة',
                      render: (l) => {
                        const selectedProduct = products.find((p) => p.id === l.productId);
                        const units = selectedProduct ? getSellableUnits(selectedProduct) : [];
                        const baseQty = lineBaseQuantity(l);
                        const showEquivalent = Boolean(selectedProduct) && l.quantity > 0
                          && l.uom !== (selectedProduct?.baseUnit || 'M2');
                        return (
                          <div>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                step={isWholeUnit(l.uom, selectedProduct) ? 1 : 0.01}
                                aria-label={`الكمية ${getUomLabel(l.uom, selectedProduct)}`}
                                value={l.quantity || ''}
                                onChange={(e) => setLine(l._i, { quantity: Number(e.target.value) || 0 })}
                                className="w-full px-2 py-1.5 bg-surface-muted border border-line rounded-lg font-mono"
                              />
                              {units.length > 1 && (
                                <select
                                  value={l.uom}
                                  onChange={(e) => changeLineUnit(l._i, e.target.value)}
                                  aria-label={`وحدة البند ${selectedProduct?.name || ''}`}
                                  className="px-1 py-1 bg-surface border border-line rounded-lg text-[10px] font-bold"
                                >
                                  {units.map((unit) => (
                                    <option key={unit} value={unit}>{getUomLabel(unit, selectedProduct)}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                            {showEquivalent && (
                              <div className="text-[9px] text-muted mt-1 font-normal">= {formatProductQuantity(baseQty, selectedProduct!)}</div>
                            )}
                          </div>
                        );
                      },
                    },
                    {
                      key: 'price', header: 'سعر الوحدة',
                      render: (l) => {
                        const selectedProduct = products.find((p) => p.id === l.productId);
                        return (
                          <div>
                            <input type="number" min={0} step="0.01" value={l.unitPrice || ''} onChange={(e) => setLine(l._i, { unitPrice: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 bg-surface-muted border border-line rounded-lg font-mono" />
                            {selectedProduct && <div className="text-[9px] text-muted mt-1 font-normal">/{getUomLabel(l.uom, selectedProduct)}</div>}
                          </div>
                        );
                      },
                    },
                    { key: 'discount', header: 'خصم البند', render: (l) => <input type="number" min={0} step="0.01" value={l.discountAmount || ''} onChange={(e) => setLine(l._i, { discountAmount: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 bg-surface-muted border border-line rounded-lg font-mono" /> },
                    { key: 'total', header: 'الإجمالي', render: (l) => <span className="font-bold text-ink">{fmt(l.quantity * l.unitPrice - (l.discountAmount || 0))}</span> },
                    {
                      key: 'actions', header: '',
                      render: (l) => <button type="button" onClick={() => setForm((p) => ({ ...p, lines: p.lines.length > 1 ? p.lines.filter((_, i) => i !== l._i) : p.lines }))} className="p-1 text-muted hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>,
                    },
                  ]}
                />

        <div className="p-2 border-t border-line">
          <button type="button" onClick={() => setForm((p) => ({ ...p, lines: [...p.lines, { productId: '', uom: '', quantity: 0, unitPrice: 0, discountAmount: 0 }] }))} className="text-[11px] font-bold text-warning hover:text-warning flex items-center gap-1"><Plus className="w-3 h-3" /> إضافة بند</button>
        </div>
      </div>

      <div className="border border-accent-border rounded-xl overflow-hidden">
        <div className="px-3 py-2 bg-accent-soft text-[11px] font-black text-primary">الخدمات والعمالة</div>
        <DataTable
                  ariaLabel="الخدمات والعمالة"
                  rows={form.serviceLines.map((line, i) => ({ ...line, _i: i }))}
                  rowKey={(line) => String(line._i)}
                  dense
                  columns={[
                    { key: 'desc', header: 'البيان', render: (line) => <input value={line.description} onChange={(e) => setForm((p) => ({ ...p, serviceLines: p.serviceLines.map((x, i) => i === line._i ? { ...x, description: e.target.value } : x) }))} className="w-full min-w-36 px-2 py-1.5 bg-surface-muted border border-line rounded-lg" placeholder="مثال: أجور تركيب السيراميك" /> },
                    { key: 'product', header: 'الصنف المرتبط', render: (line) => <select value={line.productId || ''} onChange={(e) => setForm((p) => ({ ...p, serviceLines: p.serviceLines.map((x, i) => i === line._i ? { ...x, productId: e.target.value || undefined } : x) }))} className="w-40 px-2 py-1.5 bg-surface-muted border border-line rounded-lg"><option value="">بدون ربط</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select> },
                    { key: 'qty', header: 'الكمية', render: (line) => <input type="number" min={0} step="0.01" value={line.quantity || ''} onChange={(e) => setForm((p) => ({ ...p, serviceLines: p.serviceLines.map((x, i) => i === line._i ? { ...x, quantity: Number(e.target.value) || 0 } : x) }))} className="w-20 px-2 py-1.5 bg-surface-muted border border-line rounded-lg font-mono" /> },
                    { key: 'unit', header: 'الوحدة', render: (line) => <input value={line.unit} onChange={(e) => setForm((p) => ({ ...p, serviceLines: p.serviceLines.map((x, i) => i === line._i ? { ...x, unit: e.target.value } : x) }))} className="w-20 px-2 py-1.5 bg-surface-muted border border-line rounded-lg" /> },
                    { key: 'price', header: 'سعر الوحدة', render: (line) => <input type="number" min={0} step="0.01" value={line.unitPrice || ''} onChange={(e) => setForm((p) => ({ ...p, serviceLines: p.serviceLines.map((x, i) => i === line._i ? { ...x, unitPrice: Number(e.target.value) || 0 } : x) }))} className="w-24 px-2 py-1.5 bg-surface-muted border border-line rounded-lg font-mono" /> },
                    { key: 'discount', header: 'الخصم', render: (line) => <input type="number" min={0} step="0.01" value={line.discountAmount || ''} onChange={(e) => setForm((p) => ({ ...p, serviceLines: p.serviceLines.map((x, i) => i === line._i ? { ...x, discountAmount: Number(e.target.value) || 0 } : x) }))} className="w-20 px-2 py-1.5 bg-surface-muted border border-line rounded-lg font-mono" /> },
                    { key: 'total', header: 'الإجمالي', render: (line) => <span className="font-bold">{fmt(line.quantity * line.unitPrice - line.discountAmount)}</span> },
                    { key: 'actions', header: '', render: (line) => <button type="button" onClick={() => setForm((p) => ({ ...p, serviceLines: p.serviceLines.filter((_, i) => i !== line._i) }))} className="p-1 text-muted hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button> },
                  ]}
                />

        <div className="p-2 border-t border-line">
          <button type="button" onClick={() => setForm((p) => ({ ...p, serviceLines: [...p.serviceLines, { description: '', unit: 'بند', quantity: 1, unitPrice: 0, discountAmount: 0 }] }))} className="text-[11px] font-bold text-primary flex items-center gap-1"><Plus className="w-3 h-3" /> إضافة خدمة أو عمالة</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <NumField label="خصم إجمالي (ج)" value={form.discount} onChange={(v) => setForm((p) => ({ ...p, discount: v }))} />
        <NumField label="ضريبة (ج)" value={form.tax} onChange={(v) => setForm((p) => ({ ...p, tax: v }))} />
        <div>
          <label className="font-bold text-ink block mb-1">شروط وملاحظات</label>
          <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" placeholder="الأسعار شاملة النقل..." />
        </div>
      </div>

      <div className="flex items-center justify-between bg-warning-soft border border-warning-border rounded-xl px-4 py-3">
        <span className="text-xs font-bold text-warning">صافي قيمة المقايسة</span>
        <span className="text-lg font-black text-success">{fmt(total)}</span>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-line">
        <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 bg-surface-sunken text-ink font-bold rounded-xl">إلغاء</button>
        <button type="submit" disabled={saving} className="px-5 py-2 bg-warning hover:bg-warning text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {editingId ? 'حفظ التعديلات' : 'حفظ عرض السعر'}</button>
      </div>
    </form>
  </Modal>
)}

{/* Detail modal */}
{detail && (
  <Modal onClose={() => setDetail(null)} wide>
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-base font-black text-ink">عرض سعر {detail.quotationNumber}</h3>
        <p className="text-[11px] text-muted mt-1">{detail.date} • صالح لغاية {detail.validUntil} • {STATUS_LABELS[detail.status].label}</p>
      </div>
      <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      <Info label="العميل" value={detail.customerName || '—'} sub={detail.customerPhone || ''} />
      <Info label="المخزن المرجعي" value={warehouses.find((w) => w.id === detail.warehouseId)?.name || '—'} sub={detail.convertedInvoiceNumber ? `الفاتورة: ${detail.convertedInvoiceNumber}` : 'لم تُفوتر بعد'} />
      <Info label="القيمة" value={fmt(detail.totalAmount)} sub={`${(detail.items?.length || 0) + (detail.serviceItems?.length || 0)} بند`} />
      <Info label="المندوب" value={detail.salesRepName || '—'} sub={detail.salesRepId ? 'مسؤول المتابعة' : ''} />
    </div>
    <div className="mb-4 space-y-2">
      <OperationalFieldsSummary fields={operationalFields} values={operationalFieldValues} />
      <OperationalFieldsRecordEditor
        recordLabel={detail.quotationNumber}
        fields={operationalFields}
        initialValues={operationalFieldValues}
        canEdit={canUpdateOperationalFields}
        onSave={(values) => onSaveOperationalFields(detail.id, values)}
      />
    </div>
    <div className="border border-line rounded-xl overflow-x-auto mb-4">
      <DataTable
              ariaLabel="أصناف عرض السعر"
              rows={[
                ...(detail.items || []).map((i: any) => ({ ...i, __kind: 'item' })),
                ...(detail.serviceItems || []).map((item: any) => ({ ...item, __kind: 'service' })),
              ]}
              rowKey={(row: any) => `${row.__kind}:${row.id}`}
              minWidth={560}
              dense
              columns={[
                {
                  key: 'product', header: 'الصنف',
                  render: (row: any) => row.__kind === 'item' ? (
                    <span className="font-bold text-ink">{row.productName}<div className="text-[9px] text-muted font-normal">{row.size} • {row.grade}</div></span>
                  ) : (
                    <span className="font-bold text-ink">{row.description}<div className="text-[9px] text-muted font-normal">خدمة / عمالة{row.productId ? ' • مرتبطة بصنف مخزني' : ''}</div></span>
                  ),
                },
                { key: 'qty', header: 'الكمية', render: (row: any) => row.__kind === 'item' ? <span className="font-mono">{formatProductQuantity(Number(row.quantityM2), row)}</span> : <span className="font-mono">{row.quantity} {row.unit}</span> },
                { key: 'boxes', header: 'الكراتين', render: (row: any) => row.__kind === 'item' ? <span className="font-mono">{row.productType === 'GENERAL' ? '—' : row.boxesCount}</span> : <span className="font-mono">—</span> },
                { key: 'price', header: 'السعر', render: (row: any) => row.__kind === 'item' ? <span className="font-mono">{fmt(row.unitPrice)} <span className="text-[9px] text-muted">/{getUomLabel(row.baseUnit, row)}</span></span> : <span className="font-mono">{fmt(row.unitPrice)} / {row.unit}</span> },
                { key: 'discount', header: 'الخصم', render: (row: any) => <span className="font-mono text-danger">{row.discountAmount ? `-${fmt(row.discountAmount)}` : '—'}</span> },
                { key: 'total', header: 'الإجمالي', render: (row: any) => <span className="font-bold">{fmt(row.totalPrice)}</span> },
              ]}
            />

    </div>
    {(detail.serviceItems || []).length > 0 && (
      <div role="status" className="mb-4 rounded-xl border border-accent-border bg-accent-soft p-3 text-[11px] text-primary">
        يحتوي العرض على خدمات أو عمالة؛ يمكن تعديله وطباعته، ولا يمكن تحويله إلى فاتورة أو طلب مخزني.
      </div>
    )}
    {detail.notes && <div className="bg-warning-soft border border-warning-border rounded-xl p-3 text-[11px] text-warning mb-4"><b>ملاحظات:</b> {detail.notes}</div>}
    {(detail.followUpDate || detail.followUpNotes || detail.convertedOrderNumber) && (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Info label="المتابعة القادمة" value={detail.followUpDate || '—'} sub={detail.followUpNotes || ''} />
        <Info label="مرات التواصل" value={String(detail.contactCount || 0)} sub={detail.lastContactAt ? `آخر تواصل ${detail.lastContactAt.slice(0, 10)}` : 'لم يتم تسجيل تواصل'} />
        <Info label="الطلب المرتبط" value={detail.convertedOrderNumber || '—'} sub={detail.convertedInvoiceNumber ? `الفاتورة ${detail.convertedInvoiceNumber}` : ''} />
      </div>
    )}
    <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-line">
      {docVisible('print') && <button onClick={() => printService.printQuotation(detail)} className="px-3 py-2 bg-surface-sunken hover:bg-surface-sunken text-ink rounded-xl text-xs font-bold flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> طباعة</button>}
      {docVisible('send') && <button onClick={() => shareOnWhatsApp(detail)} className="px-3 py-2 bg-success-soft hover:bg-success-soft text-success border border-success-border rounded-xl text-xs font-bold flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> {doc.send?.label ?? 'واتساب'}</button>}
      {canCreate && detail.status === 'PENDING' && docVisible('follow-up') && (
        <button onClick={() => { setDetail(null); openFollowUp(detail); }} className="px-3 py-2 bg-accent-soft hover:bg-accent-soft text-primary border border-accent-border rounded-xl text-xs font-bold flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> جدولة متابعة</button>
      )}
      {canCreate && docVisible('duplicate') && <button onClick={() => duplicate(detail)} className="px-3 py-2 bg-surface-sunken hover:bg-surface-sunken text-ink rounded-xl text-xs font-bold flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> نسخ</button>}
      {canUpdate && ['PENDING', 'EXPIRED'].includes(detail.status) && docVisible('edit') && (
        <button onClick={() => { setDetail(null); openEdit(detail); }} className="px-3 py-2 bg-primary hover:bg-primary text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> تعديل</button>
      )}
      {canCreate && detail.status === 'PENDING' && !detail.convertedOrderNumber && !(detail.serviceItems || []).length && docVisible('convert-to-order') && (
        <button onClick={() => { setDetail(null); openConvertOrder(detail); }} className="px-3 py-2 bg-primary hover:bg-primary text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> تحويل لطلب</button>
      )}
      {canCreate && detail.status === 'PENDING' && !(detail.serviceItems || []).length && docVisible('convert-to-invoice') && (
        <button onClick={() => { setDetail(null); openConvert(detail); }} className="px-3 py-2 bg-success hover:bg-success text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" /> تحويل لفاتورة</button>
      )}
      {canUpdate && detail.status === 'EXPIRED' && docVisible('reopen') && (
        <button onClick={() => reopenQuotation(detail)} className="px-3 py-2 bg-warning hover:bg-warning text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> إعادة فتح</button>
      )}
      {canApprove && detail.status === 'PENDING' && docVisible('cancel') && (
        <button onClick={() => cancelQuotation(detail)} className="px-3 py-2 bg-danger hover:bg-danger text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><CancelIcon className="w-3.5 h-3.5" /> إلغاء</button>
      )}
      {canCreate && detail.status !== 'CONVERTED' && docVisible('delete') && (
        <button onClick={() => deleteQuotation(detail)} className="px-3 py-2 bg-danger-soft text-danger border border-danger-border rounded-xl text-xs font-bold flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> حذف</button>
      )}
    </div>
  </Modal>
)}

{/* Follow-up modal */}
{followUpTarget && (
  <Modal onClose={() => setFollowUpTarget(null)}>
    <form onSubmit={submitFollowUp} className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-black text-ink flex items-center gap-2"><CalendarClock className="w-5 h-5 text-primary" /> متابعة عرض السعر {followUpTarget.quotationNumber}</h3>
        <button type="button" onClick={() => setFollowUpTarget(null)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
      </div>
      <div className="bg-surface-muted border border-line rounded-xl p-3 text-xs flex items-center justify-between">
        <span className="text-muted">العميل</span>
        <span className="font-bold text-ink">{followUpTarget.customerName} • {fmt(followUpTarget.totalAmount)}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-ink mb-1">تاريخ المتابعة</label>
          <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-mono" />
        </div>
        <div className="flex items-end">
          <button type="button" onClick={() => setFollowUpDate('')} className="w-full px-3 py-2 bg-surface-sunken hover:bg-surface-sunken text-ink-secondary rounded-xl text-xs font-bold">إلغاء المتابعة المجدولة</button>
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-ink mb-1">ملاحظات المتابعة</label>
        <textarea rows={3} value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)} className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs" placeholder="مثال: العميل يطلب خصم إضافي / سيحدد موعد الرد..." />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={() => setFollowUpTarget(null)} className="px-4 py-2 bg-surface-sunken text-ink rounded-xl text-xs font-bold">إلغاء</button>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-primary hover:bg-primary text-white rounded-xl text-xs font-bold flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} حفظ المتابعة</button>
      </div>
    </form>
  </Modal>
)}

{/* Convert to order modal */}
{orderTarget && (
  <Modal onClose={() => setOrderTarget(null)}>
    <form onSubmit={submitConvertOrder} className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-black text-ink flex items-center gap-2"><ShoppingBag className="w-5 h-5 text-primary" /> تحويل العرض {orderTarget.quotationNumber} إلى طلب</h3>
        <button type="button" onClick={() => setOrderTarget(null)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
      </div>
      <div className="bg-surface-muted border border-line rounded-xl p-3 text-xs flex items-center justify-between">
        <span className="text-muted">قيمة العرض</span><span className="font-black text-primary">{fmt(orderTarget.totalAmount)}</span>
      </div>
      <div>
        <label className="block text-xs font-bold text-ink mb-1">تاريخ التسليم المتوقع</label>
        <input type="date" value={orderDeliveryDate} onChange={(e) => setOrderDeliveryDate(e.target.value)} className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-mono" />
      </div>
      <div>
        <label className="block text-xs font-bold text-ink mb-1">ملاحظات الطلب</label>
        <input value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs" />
      </div>
      <div className="bg-accent-soft border border-accent-border rounded-xl p-3 text-[11px] text-primary flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> سيتم حجز الكميات من المخزن كطلب مبيعات، ويمكن لاحقاً إصدار الفاتورة أو تسجيل التسليم.</div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={() => setOrderTarget(null)} className="px-4 py-2 bg-surface-sunken text-ink rounded-xl text-xs font-bold">إلغاء</button>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-primary hover:bg-primary text-white rounded-xl text-xs font-bold flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إنشاء الطلب</button>
      </div>
    </form>
  </Modal>
)}

{/* Convert modal */}
{convertTarget && (
  <Modal onClose={() => setConvertTarget(null)}>
    <form onSubmit={submitConvert} className="space-y-4">
      <div className="flex items-center gap-2 text-success"><Receipt className="w-5 h-5" /><h3 className="text-base font-black">تحويل العرض {convertTarget.quotationNumber} إلى فاتورة</h3></div>
      <div className="bg-surface-muted border border-line rounded-xl p-3 text-xs flex items-center justify-between">
        <span className="text-muted">قيمة العرض</span><span className="font-black text-success">{fmt(convertTarget.totalAmount)}</span>
      </div>
      <div>
        <label className="block text-xs font-bold text-ink mb-1">المخزن المنصرف منه *</label>
        <select required value={convertWarehouse} onChange={(e) => setConvertWarehouse(e.target.value)} className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold">
          <option value="">— اختر المخزن —</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-ink mb-1">طريقة الدفع</label>
          <select value={convertPaymentType} onChange={(e) => setConvertPaymentType(e.target.value as PaymentType)} className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold">
            <option value="CREDIT">آجل بالكامل</option>
            <option value="CASH">نقدي بالكامل</option>
            <option value="CARD">بطاقة</option>
            <option value="BANK_TRANSFER">تحويل بنكي</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-ink mb-1">المبلغ المدفوع مقدماً</label>
          <input type="number" min={0} step="0.01" value={convertPaid} onChange={(e) => setConvertPaid(e.target.value)} className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-mono" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-ink mb-1">ملاحظات الفاتورة</label>
        <input value={convertNotes} onChange={(e) => setConvertNotes(e.target.value)} className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs" placeholder="اختياري" />
      </div>
      <div className="bg-warning-soft border border-warning-border rounded-xl p-3 text-[11px] text-warning flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> سيتم خصم الكميات من المخزن مباشرة وإصدار فاتورة مبيعات عادية غير معتمدة إلكترونياً.</div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={() => setConvertTarget(null)} className="px-4 py-2 bg-surface-sunken text-ink rounded-xl text-xs font-bold">إلغاء</button>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-success hover:bg-success text-white rounded-xl text-xs font-bold flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} تحويل وإصدار</button>
      </div>
    </form>
  </Modal>
)}

{docPreview && (
  <DocumentPreviewModal
    title={docPreview.title}
    subtitle={docPreview.subtitle}
    fileName={docPreview.fileName}
    html={docPreview.html}
    onClose={() => setDocPreview(null)}
    onDownloadExcel={docPreview.excel}
  />
)}

  </>
  );
};

export default QuotationModals;
