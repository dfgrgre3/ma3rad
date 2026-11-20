import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Package2, X, Plus, Trash2, Loader2 } from 'lucide-react';
import { Customer, Product, Warehouse } from '../../../types';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import { getSellableUnits, getUomLabel, isWholeUnit } from '../../../utils/products/uom';
import { Modal, Field } from './ui';
import { FormState, Line, fmt } from '../../../types/sales/ordersPage';
import type { OperationalFieldDefinition } from '../../../services/domains/products/OperationalFieldService';
import { OperationalFieldsForm } from '../../../components/products/OperationalFieldsForm';
import { ProductPicker } from '../../../components/products/ProductPicker';

interface OrderFormModalProps {
  editingId: string | null;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  customers: Customer[];
  products: Product[];
  warehouses: Warehouse[];
  salesReps: Array<{ id: string; name: string; isSalesRep?: boolean; branchNames?: string; servesBranch?: boolean }>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  setLine: (idx: number, patch: Partial<Line>) => void;
  pickProduct: (idx: number, productId: string) => void;
  changeLineUnit: (idx: number, unit: string) => void;
  lineBaseQuantity: (line: Line) => number;
  stockOf: (productId: string, warehouseId: string) => number;
  total: number;
  operationalFields: OperationalFieldDefinition[];
  operationalFieldValues: Record<string, string>;
  onOperationalFieldValuesChange: (values: Record<string, string>) => void;
}

export const OrderFormModal: React.FC<OrderFormModalProps> = ({
  editingId, form, setForm, customers, products, warehouses, salesReps, saving,
  onClose, onSubmit, setLine, pickProduct, changeLineUnit, lineBaseQuantity, stockOf,   total, operationalFields, operationalFieldValues, onOperationalFieldValuesChange,
}) => (
  <Modal onClose={onClose} wide>
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-base font-black text-ink flex items-center gap-2"><Package2 className="w-5 h-5 text-primary" /> {editingId ? 'تعديل طلب حجز' : 'إنشاء طلب حجز بضاعة'}</h3>
      <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
    </div>
    <form onSubmit={onSubmit} className="space-y-3 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div>
          <label className="font-bold text-ink block mb-1">العميل *</label>
          <select required value={form.customerId} onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold">
            <option value="">— اختر العميل —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
          </select>
        </div>
        <div>
          <label className="font-bold text-ink block mb-1">المخزن *</label>
          <select required value={form.warehouseId} onChange={(e) => setForm((p) => ({ ...p, warehouseId: e.target.value }))} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold">
            <option value="">— اختر المخزن —</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="font-bold text-ink block mb-1">تاريخ التسليم المتوقع</label>
          <input type="date" value={form.deliveryDate} onChange={(e) => setForm((p) => ({ ...p, deliveryDate: e.target.value }))} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" />
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
        ariaLabel="بنود طلب البيع"
        rows={form.lines.map((l: any, idx: number) => ({ ...l, __idx: idx }))}
        rowKey={(l: any) => String(l.__idx)}
        dense
        tableClassName="text-[11px]"
        columns={[
          {
            key: 'product', header: 'الصنف',
            render: (l: any) => {
              const idx = l.__idx;
              const selectedProduct = products.find((product: any) => product.id === l.productId);
              return (
                <ProductPicker
                  value={l.productId}
                  selectedLabel={selectedProduct?.name}
                  ariaLabel={`استعراض أصناف طلب البيع للسطر ${idx + 1}`}
                  onChange={(productId: string) => pickProduct(idx, productId)}
                />
              );
            },
          },
          {
            key: 'qty', header: 'الكمية / الوحدة', width: 144,
            render: (l: any) => {
              const idx = l.__idx;
              const available = stockOf(l.productId, form.warehouseId);
              const selectedProduct = products.find((product: any) => product.id === l.productId);
              const units = selectedProduct ? getSellableUnits(selectedProduct) : [];
              const baseQuantity = lineBaseQuantity(l);
              const exceeds = baseQuantity > available;
              const showEquivalent = Boolean(selectedProduct) && l.quantity > 0 && l.uom !== (selectedProduct?.baseUnit || 'M2');
              return (
                <div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min={0}
                      step={isWholeUnit(l.uom, selectedProduct) ? 1 : 0.01}
                      aria-label={`الكمية ${getUomLabel(l.uom, selectedProduct)}`}
                      value={l.quantity || ''}
                      onChange={(e) => setLine(idx, { quantity: Number(e.target.value) || 0 })}
                      className={`w-full rounded-lg border bg-surface-muted px-2 py-1.5 font-mono ${exceeds ? 'border-danger text-danger' : 'border-line'}`}
                    />
                    {units.length > 1 && (
                      <select
                        value={l.uom}
                        onChange={(e) => changeLineUnit(idx, e.target.value)}
                        aria-label={`وحدة البند ${selectedProduct?.name || ''}`}
                        className="rounded-lg border border-line bg-surface px-1 py-1 text-[10px] font-bold"
                      >
                        {units.map((unit: any) => (
                          <option key={unit} value={unit}>{getUomLabel(unit, selectedProduct)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  {showEquivalent && (
                    <div className="mt-1 text-[9px] font-normal text-muted">= {formatProductQuantity(baseQuantity, selectedProduct!)}</div>
                  )}
                </div>
              );
            },
          },
          {
            key: 'price', header: 'سعر الوحدة', width: 112,
            render: (l: any) => {
              const selectedProduct = products.find((product: any) => product.id === l.productId);
              return (
                <div>
                  <input type="number" min={0} step="0.01" value={l.unitPrice || ''} onChange={(e) => setLine(l.__idx, { unitPrice: Number(e.target.value) || 0 })} className="w-full rounded-lg border border-line bg-surface-muted px-2 py-1.5 font-mono" />
                  {selectedProduct && <div className="mt-1 text-[9px] font-normal text-muted">/{getUomLabel(l.uom, selectedProduct)}</div>}
                </div>
              );
            },
          },
          { key: 'disc', header: 'خصم البند', width: 112, render: (l: any) => <input type="number" min={0} step="0.01" value={l.discountAmount || ''} onChange={(e) => setLine(l.__idx, { discountAmount: Number(e.target.value) || 0 })} className="w-full rounded-lg border border-line bg-surface-muted px-2 py-1.5 font-mono" /> },
          {
            key: 'available', header: 'المتاح', width: 80,
            render: (l: any) => {
              const available = stockOf(l.productId, form.warehouseId);
              const selectedProduct = products.find((product: any) => product.id === l.productId);
              const exceeds = lineBaseQuantity(l) > available;
              return <span className={`font-mono font-bold ${exceeds ? 'text-danger' : 'text-muted'}`}>{l.productId ? formatProductQuantity(available, selectedProduct!) : '—'}</span>;
            },
          },
          { key: 'total', header: 'الإجمالي', render: (l: any) => <span className="font-bold text-ink">{fmt(l.quantity * l.unitPrice - (l.discountAmount || 0))}</span> },
          {
            key: 'del', header: '', width: 32,
            render: (l: any) => (
              <button type="button" onClick={() => setForm((p) => ({ ...p, lines: p.lines.length > 1 ? p.lines.filter((_, i) => i !== l.__idx) : p.lines }))} className="p-1 text-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
            ),
          },
        ]}
      />
        <div className="p-2 border-t border-line">
          <button type="button" onClick={() => setForm((p) => ({ ...p, lines: [...p.lines, { productId: '', uom: '', quantity: 0, unitPrice: 0, discountAmount: 0 }] }))} className="text-[11px] font-bold text-primary hover:text-primary flex items-center gap-1"><Plus className="w-3 h-3" /> إضافة صنف</button>
        </div>
      </div>

      <div className="grid grid-cols-1  sm:grid-cols-4 gap-3">
        <Field label="خصم الطلب (ج)" value={form.discount} onChange={(v) => setForm((p) => ({ ...p, discount: v }))} />
        <Field label="ضريبة (ج)" value={form.tax} onChange={(v) => setForm((p) => ({ ...p, tax: v }))} />
        <Field label="مصاريف الشحن (ج)" value={form.shipping} onChange={(v) => setForm((p) => ({ ...p, shipping: v }))} />
        <div>
          <label className="font-bold text-ink block mb-1">ملاحظات</label>
          <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" placeholder="اختياري" />
        </div>
      </div>

      <div className="flex items-center justify-between bg-accent-soft border border-accent-border rounded-xl px-4 py-3">
        <span className="text-xs font-bold text-primary">إجمالي الطلب</span>
        <span className="text-lg font-black text-primary">{fmt(total)}</span>
      </div>
      <OperationalFieldsForm fields={operationalFields} values={operationalFieldValues} onChange={onOperationalFieldValuesChange} title="بيانات إضافية للطلب" />

      <div className="flex justify-end gap-2 pt-3 border-t border-line">
        <button type="button" onClick={onClose} className="px-4 py-2 bg-surface-sunken text-ink font-bold rounded-xl">إلغاء</button>
        <button type="submit" disabled={saving} className="px-5 py-2 bg-primary hover:bg-primary text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {editingId ? 'حفظ التعديلات' : 'إنشاء الطلب'}</button>
      </div>
    </form>
  </Modal>
);
