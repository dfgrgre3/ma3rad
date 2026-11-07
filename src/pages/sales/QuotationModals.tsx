import React from 'react';
import {
  FileText, Plus, Trash2, Loader2, Eye,
  Pencil, Ban, Copy, RefreshCw, FileSpreadsheet, FileDown, ChevronLeft,
  ChevronRight, Percent, Ban as CancelIcon, Receipt, Clock, CheckCircle2, AlertTriangle,
  MessageCircle, CalendarClock, ShoppingBag, PhoneCall, X, Printer,
} from 'lucide-react';
import { Quotation, QuotationStats, QuotationStatus } from '../../services/QuotationService';
import { Customer, Product, Warehouse, PaymentType } from '../../types';
import { exportToExcel, buildExportHtml } from '../../utils/export';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import { addLocalDays, localDateString } from '../../utils/date';
import { formatProductQuantity } from '../../utils/productUnits';
import {
  basePriceFromUnitPrice, convertQuantity, getSellableUnits, getUomLabel, isWholeUnit, pricePerUnit,
} from '../../utils/uom';
import { buildWhatsAppUrl, openExternalShare } from '../../utils/externalLinks';
import type { OperationalFieldDefinition } from '../../services/OperationalFieldService';
import { OperationalFieldsForm } from '../../components/OperationalFieldsForm';
import { OperationalFieldsSummary } from '../../components/OperationalFieldsSummary';
import { OperationalFieldsRecordEditor } from '../../components/OperationalFieldsRecordEditor';

export const STATUS_LABELS: Record<QuotationStatus, { label: string; color: string }> = {
  PENDING: { label: 'بانتظار الموافقة', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  CONVERTED: { label: 'محوّل إلى فاتورة', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  EXPIRED: { label: 'منتهي الصلاحية', color: 'bg-slate-200 text-slate-500 border-slate-300' },
  CANCELLED: { label: 'ملغي', color: 'bg-rose-500/10 text-rose-600 border-rose-500/20' },
};

export const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';

export type Line = { productId: string; uom: string; quantity: number; unitPrice: number; discountAmount: number };

export interface FormState {
  customerId: string;
  warehouseId: string;
  validDays: string;
  discount: string;
  tax: string;
  notes: string;
  lines: Line[];
}

export const emptyForm = (): FormState => ({
  customerId: '', warehouseId: '', validDays: '15', discount: '', tax: '', notes: '',
  lines: [{ productId: '', uom: '', quantity: 0, unitPrice: 0, discountAmount: 0 }],
});

const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; wide?: boolean }> = ({ children, onClose, wide }) => (
  <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-2xl w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} p-6 max-h-[92vh] overflow-y-auto`}>{children}</div>
  </div>
);

const NumField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="font-bold text-slate-700 block mb-1">{label}</label>
    <input type="number" min={0} step="0.01" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
  </div>
);

const Info: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
    <div className="text-[10px] font-bold text-slate-400">{label}</div>
    <div className="text-xs font-black text-slate-800 mt-0.5">{value}</div>
    {sub && <div className="text-[10px] text-slate-500 font-mono mt-0.5">{sub}</div>}
  </div>
);

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
  canDelete,
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
}) => (
  <>
{/* Create / edit modal */}
{formOpen && (
  <Modal onClose={() => setFormOpen(false)} wide>
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-base font-black text-slate-900 flex items-center gap-2"><FileText className="w-5 h-5 text-amber-600" /> {editingId ? 'تعديل عرض السعر' : 'إصدار عرض أسعار جديد'}</h3>
      <button onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
    </div>
    <form onSubmit={submitForm} className="space-y-3 text-xs">
      <OperationalFieldsForm fields={operationalFields} values={operationalFieldValues} onChange={onOperationalFieldValuesChange} title="بيانات إضافية لعرض السعر" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="font-bold text-slate-700 block mb-1">العميل *</label>
          <select required value={form.customerId} onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
            <option value="">— اختر العميل —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
          </select>
        </div>
        <div>
          <label className="font-bold text-slate-700 block mb-1">المخزن المرجعي</label>
          <select value={form.warehouseId} onChange={(e) => setForm((p) => ({ ...p, warehouseId: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
            <option value="">— بدون —</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="font-bold text-slate-700 block mb-1">صلاحية العرض (أيام)</label>
          <input type="number" min={1} max={365} value={form.validDays} onChange={(e) => setForm((p) => ({ ...p, validDays: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-right text-[11px]">
          <thead className="bg-slate-50 text-slate-500 font-bold">
            <tr><th className="px-3 py-2">الصنف</th><th className="px-3 py-2 w-36">الكمية / الوحدة</th><th className="px-3 py-2 w-28">سعر الوحدة</th><th className="px-3 py-2 w-28">خصم البند</th><th className="px-3 py-2">الإجمالي</th><th className="px-3 py-2 w-8"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {form.lines.map((l, idx) => {
              const selectedProduct = products.find((p) => p.id === l.productId);
              const units = selectedProduct ? getSellableUnits(selectedProduct) : [];
              const baseQty = lineBaseQuantity(l);
              const showEquivalent = Boolean(selectedProduct) && l.quantity > 0
                && l.uom !== (selectedProduct?.baseUnit || 'M2');
              return (
              <tr key={idx}>
                <td className="px-3 py-2">
                  <select value={l.productId} onChange={(e) => pickProduct(idx, e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold">
                    <option value="">— اختر الصنف —</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.size} — {p.grade}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      step={isWholeUnit(l.uom, selectedProduct) ? 1 : 0.01}
                      aria-label={`الكمية ${getUomLabel(l.uom, selectedProduct)}`}
                      value={l.quantity || ''}
                      onChange={(e) => setLine(idx, { quantity: Number(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                    />
                    {units.length > 1 && (
                      <select
                        value={l.uom}
                        onChange={(e) => changeLineUnit(idx, e.target.value)}
                        aria-label={`وحدة البند ${selectedProduct?.name || ''}`}
                        className="px-1 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold"
                      >
                        {units.map((unit) => (
                          <option key={unit} value={unit}>{getUomLabel(unit, selectedProduct)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  {showEquivalent && (
                    <div className="text-[9px] text-slate-400 mt-1 font-normal">= {formatProductQuantity(baseQty, selectedProduct!)}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={0} step="0.01" value={l.unitPrice || ''} onChange={(e) => setLine(idx, { unitPrice: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono" />
                  {selectedProduct && <div className="text-[9px] text-slate-400 mt-1 font-normal">/{getUomLabel(l.uom, selectedProduct)}</div>}
                </td>
                <td className="px-3 py-2"><input type="number" min={0} step="0.01" value={l.discountAmount || ''} onChange={(e) => setLine(idx, { discountAmount: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono" /></td>
                <td className="px-3 py-2 font-bold text-slate-700">{fmt(l.quantity * l.unitPrice - (l.discountAmount || 0))}</td>
                <td className="px-3 py-2"><button type="button" onClick={() => setForm((p) => ({ ...p, lines: p.lines.length > 1 ? p.lines.filter((_, i) => i !== idx) : p.lines }))} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button></td>
              </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-2 border-t border-slate-100">
          <button type="button" onClick={() => setForm((p) => ({ ...p, lines: [...p.lines, { productId: '', uom: '', quantity: 0, unitPrice: 0, discountAmount: 0 }] }))} className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"><Plus className="w-3 h-3" /> إضافة بند</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <NumField label="خصم إجمالي (ج)" value={form.discount} onChange={(v) => setForm((p) => ({ ...p, discount: v }))} />
        <NumField label="ضريبة (ج)" value={form.tax} onChange={(v) => setForm((p) => ({ ...p, tax: v }))} />
        <div>
          <label className="font-bold text-slate-700 block mb-1">شروط وملاحظات</label>
          <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" placeholder="الأسعار شاملة النقل..." />
        </div>
      </div>

      <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <span className="text-xs font-bold text-amber-700">صافي قيمة المقايسة</span>
        <span className="text-lg font-black text-emerald-600">{fmt(total)}</span>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
        <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
        <button type="submit" disabled={saving} className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {editingId ? 'حفظ التعديلات' : 'حفظ عرض السعر'}</button>
      </div>
    </form>
  </Modal>
)}

{/* Detail modal */}
{detail && (
  <Modal onClose={() => setDetail(null)} wide>
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-base font-black text-slate-900">عرض سعر {detail.quotationNumber}</h3>
        <p className="text-[11px] text-slate-500 mt-1">{detail.date} • صالح لغاية {detail.validUntil} • {STATUS_LABELS[detail.status].label}</p>
      </div>
      <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      <Info label="العميل" value={detail.customerName || '—'} sub={detail.customerPhone || ''} />
      <Info label="المخزن المرجعي" value={warehouses.find((w) => w.id === detail.warehouseId)?.name || '—'} sub={detail.convertedInvoiceNumber ? `الفاتورة: ${detail.convertedInvoiceNumber}` : 'لم تُفوتر بعد'} />
      <Info label="القيمة" value={fmt(detail.totalAmount)} sub={`${detail.items?.length || 0} بند`} />
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
    <div className="border border-slate-200 rounded-xl overflow-x-auto mb-4">
      <table className="w-full text-right text-[11px] min-w-[560px]">
        <thead className="bg-slate-50 text-slate-500 font-bold"><tr><th className="px-3 py-2">الصنف</th><th className="px-3 py-2">الكمية</th><th className="px-3 py-2">الكراتين</th><th className="px-3 py-2">السعر</th><th className="px-3 py-2">الخصم</th><th className="px-3 py-2">الإجمالي</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {(detail.items || []).map((i) => (
            <tr key={i.id}>
              <td className="px-3 py-2 font-bold text-slate-800">{i.productName}<div className="text-[9px] text-slate-400 font-normal">{i.size} • {i.grade}</div></td>
              <td className="px-3 py-2 font-mono">{formatProductQuantity(Number(i.quantityM2), i)}</td>
              <td className="px-3 py-2 font-mono">{i.productType === 'GENERAL' ? '—' : i.boxesCount}</td>
              <td className="px-3 py-2 font-mono">{fmt(i.unitPrice)} <span className="text-[9px] text-slate-400">/{getUomLabel(i.baseUnit, i)}</span></td>
              <td className="px-3 py-2 font-mono text-rose-600">{i.discountAmount ? `-${fmt(i.discountAmount)}` : '—'}</td>
              <td className="px-3 py-2 font-bold">{fmt(i.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {detail.notes && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 mb-4"><b>ملاحظات:</b> {detail.notes}</div>}
    {(detail.followUpDate || detail.followUpNotes || detail.convertedOrderNumber) && (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Info label="المتابعة القادمة" value={detail.followUpDate || '—'} sub={detail.followUpNotes || ''} />
        <Info label="مرات التواصل" value={String(detail.contactCount || 0)} sub={detail.lastContactAt ? `آخر تواصل ${detail.lastContactAt.slice(0, 10)}` : 'لم يتم تسجيل تواصل'} />
        <Info label="الطلب المرتبط" value={detail.convertedOrderNumber || '—'} sub={detail.convertedInvoiceNumber ? `الفاتورة ${detail.convertedInvoiceNumber}` : ''} />
      </div>
    )}
    <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
      <button onClick={() => printService.printQuotation(detail)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> طباعة</button>
      <button onClick={() => shareOnWhatsApp(detail)} className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> واتساب</button>
      {canCreate && detail.status === 'PENDING' && (
        <button onClick={() => { setDetail(null); openFollowUp(detail); }} className="px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> جدولة متابعة</button>
      )}
      {canCreate && <button onClick={() => duplicate(detail)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> نسخ</button>}
      {canUpdate && ['PENDING', 'EXPIRED'].includes(detail.status) && (
        <button onClick={() => { setDetail(null); openEdit(detail); }} className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> تعديل</button>
      )}
      {canCreate && detail.status === 'PENDING' && !detail.convertedOrderNumber && (
        <button onClick={() => { setDetail(null); openConvertOrder(detail); }} className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> تحويل لطلب</button>
      )}
      {canCreate && detail.status === 'PENDING' && (
        <button onClick={() => { setDetail(null); openConvert(detail); }} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" /> تحويل لفاتورة</button>
      )}
      {canUpdate && detail.status === 'EXPIRED' && (
        <button onClick={() => reopenQuotation(detail)} className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> إعادة فتح</button>
      )}
      {canApprove && detail.status === 'PENDING' && (
        <button onClick={() => cancelQuotation(detail)} className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><CancelIcon className="w-3.5 h-3.5" /> إلغاء</button>
      )}
      {canCreate && detail.status !== 'CONVERTED' && (
        <button onClick={() => deleteQuotation(detail)} className="px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> حذف</button>
      )}
    </div>
  </Modal>
)}

{/* Follow-up modal */}
{followUpTarget && (
  <Modal onClose={() => setFollowUpTarget(null)}>
    <form onSubmit={submitFollowUp} className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-black text-slate-900 flex items-center gap-2"><CalendarClock className="w-5 h-5 text-sky-600" /> متابعة عرض السعر {followUpTarget.quotationNumber}</h3>
        <button type="button" onClick={() => setFollowUpTarget(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex items-center justify-between">
        <span className="text-slate-500">العميل</span>
        <span className="font-bold text-slate-800">{followUpTarget.customerName} • {fmt(followUpTarget.totalAmount)}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ المتابعة</label>
          <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono" />
        </div>
        <div className="flex items-end">
          <button type="button" onClick={() => setFollowUpDate('')} className="w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold">إلغاء المتابعة المجدولة</button>
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات المتابعة</label>
        <textarea rows={3} value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" placeholder="مثال: العميل يطلب خصم إضافي / سيحدد موعد الرد..." />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={() => setFollowUpTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">إلغاء</button>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} حفظ المتابعة</button>
      </div>
    </form>
  </Modal>
)}

{/* Convert to order modal */}
{orderTarget && (
  <Modal onClose={() => setOrderTarget(null)}>
    <form onSubmit={submitConvertOrder} className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-black text-slate-900 flex items-center gap-2"><ShoppingBag className="w-5 h-5 text-sky-600" /> تحويل العرض {orderTarget.quotationNumber} إلى طلب</h3>
        <button type="button" onClick={() => setOrderTarget(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex items-center justify-between">
        <span className="text-slate-500">قيمة العرض</span><span className="font-black text-sky-700">{fmt(orderTarget.totalAmount)}</span>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ التسليم المتوقع</label>
        <input type="date" value={orderDeliveryDate} onChange={(e) => setOrderDeliveryDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono" />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الطلب</label>
        <input value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
      </div>
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-[11px] text-sky-800 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> سيتم حجز الكميات من المخزن كطلب مبيعات، ويمكن لاحقاً إصدار الفاتورة أو تسجيل التسليم.</div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={() => setOrderTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">إلغاء</button>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إنشاء الطلب</button>
      </div>
    </form>
  </Modal>
)}

{/* Convert modal */}
{convertTarget && (
  <Modal onClose={() => setConvertTarget(null)}>
    <form onSubmit={submitConvert} className="space-y-4">
      <div className="flex items-center gap-2 text-emerald-600"><Receipt className="w-5 h-5" /><h3 className="text-base font-black">تحويل العرض {convertTarget.quotationNumber} إلى فاتورة</h3></div>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex items-center justify-between">
        <span className="text-slate-500">قيمة العرض</span><span className="font-black text-emerald-700">{fmt(convertTarget.totalAmount)}</span>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">المخزن المنصرف منه *</label>
        <select required value={convertWarehouse} onChange={(e) => setConvertWarehouse(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
          <option value="">— اختر المخزن —</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الدفع</label>
          <select value={convertPaymentType} onChange={(e) => setConvertPaymentType(e.target.value as PaymentType)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
            <option value="CREDIT">آجل بالكامل</option>
            <option value="CASH">نقدي بالكامل</option>
            <option value="CARD">بطاقة</option>
            <option value="BANK_TRANSFER">تحويل بنكي</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المدفوع مقدماً</label>
          <input type="number" min={0} step="0.01" value={convertPaid} onChange={(e) => setConvertPaid(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الفاتورة</label>
        <input value={convertNotes} onChange={(e) => setConvertNotes(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" placeholder="اختياري" />
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> سيتم خصم الكميات من المخزن مباشرة وإصدار فاتورة مبيعات عادية غير معتمدة إلكترونياً.</div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={() => setConvertTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">إلغاء</button>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} تحويل وإصدار</button>
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

export default QuotationModals;
