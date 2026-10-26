import React from 'react';
import { Package2, X, Plus, Trash2, Loader2 } from 'lucide-react';
import { Customer, Product, Warehouse } from '../../../types';
import { Modal, Field } from './ui';
import { FormState, Line, fmt } from './types';

interface OrderFormModalProps {
  editingId: string | null;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  customers: Customer[];
  products: Product[];
  warehouses: Warehouse[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  setLine: (idx: number, patch: Partial<Line>) => void;
  pickProduct: (idx: number, productId: string) => void;
  getFormUnit: (productId: string) => string;
  stockOf: (productId: string, warehouseId: string) => number;
  total: number;
}

export const OrderFormModal: React.FC<OrderFormModalProps> = ({
  editingId, form, setForm, customers, products, warehouses, saving,
  onClose, onSubmit, setLine, pickProduct, getFormUnit, stockOf, total,
}) => (
  <Modal onClose={onClose} wide>
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-base font-black text-slate-900 flex items-center gap-2"><Package2 className="w-5 h-5 text-violet-600" /> {editingId ? 'تعديل طلب حجز' : 'إنشاء طلب حجز بضاعة'}</h3>
      <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
    </div>
    <form onSubmit={onSubmit} className="space-y-3 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="font-bold text-slate-700 block mb-1">العميل *</label>
          <select required value={form.customerId} onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
            <option value="">— اختر العميل —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
          </select>
        </div>
        <div>
          <label className="font-bold text-slate-700 block mb-1">المخزن *</label>
          <select required value={form.warehouseId} onChange={(e) => setForm((p) => ({ ...p, warehouseId: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
            <option value="">— اختر المخزن —</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="font-bold text-slate-700 block mb-1">تاريخ التسليم المتوقع</label>
          <input type="date" value={form.deliveryDate} onChange={(e) => setForm((p) => ({ ...p, deliveryDate: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-right text-[11px]">
          <thead className="bg-slate-50 text-slate-500 font-bold">
            <tr>
              <th className="px-3 py-2">الصنف</th>
              <th className="px-3 py-2 w-24">الكمية</th>
              <th className="px-3 py-2 w-28">سعر الوحدة</th>
              <th className="px-3 py-2 w-28">خصم البند</th>
              <th className="px-3 py-2 w-20">المتاح</th>
              <th className="px-3 py-2">الإجمالي</th>
              <th className="px-3 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {form.lines.map((l, idx) => {
              const available = stockOf(l.productId, form.warehouseId);
              const unitLabel = getFormUnit(l.productId);
              const selectedProduct = products.find((product) => product.id === l.productId);
              const exceeds = l.quantityM2 > available;
              return (
                <tr key={idx}>
                  <td className="px-3 py-2">
                    <select value={l.productId} onChange={(e) => pickProduct(idx, e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold">
                      <option value="">— اختر الصنف —</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.size} — {p.grade}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><input type="number" min={0} step={selectedProduct?.productType === 'GENERAL' && ['BOX', 'PIECE', 'SET'].includes(selectedProduct.baseUnit) ? 1 : 0.01} aria-label={`الكمية ${unitLabel}`} value={l.quantityM2 || ''} onChange={(e) => setLine(idx, { quantityM2: Number(e.target.value) || 0 })} className={`w-full px-2 py-1.5 bg-slate-50 border rounded-lg font-mono ${exceeds ? 'border-rose-300 text-rose-600' : 'border-slate-200'}`} /></td>
                  <td className="px-3 py-2"><input type="number" min={0} step="0.01" value={l.unitPrice || ''} onChange={(e) => setLine(idx, { unitPrice: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono" /></td>
                  <td className="px-3 py-2"><input type="number" min={0} step="0.01" value={l.discountAmount || ''} onChange={(e) => setLine(idx, { discountAmount: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono" /></td>
                  <td className={`px-3 py-2 font-mono font-bold ${exceeds ? 'text-rose-600' : 'text-slate-500'}`}>{l.productId ? available.toFixed(2) : '—'}</td>
                  <td className="px-3 py-2 font-bold text-slate-700">{fmt(l.quantityM2 * l.unitPrice - (l.discountAmount || 0))}</td>
                  <td className="px-3 py-2"><button type="button" onClick={() => setForm((p) => ({ ...p, lines: p.lines.length > 1 ? p.lines.filter((_, i) => i !== idx) : p.lines }))} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-2 border-t border-slate-100">
          <button type="button" onClick={() => setForm((p) => ({ ...p, lines: [...p.lines, { productId: '', quantityM2: 0, unitPrice: 0, discountAmount: 0 }] }))} className="text-[11px] font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1"><Plus className="w-3 h-3" /> إضافة صنف</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="خصم الطلب (ج)" value={form.discount} onChange={(v) => setForm((p) => ({ ...p, discount: v }))} />
        <Field label="ضريبة (ج)" value={form.tax} onChange={(v) => setForm((p) => ({ ...p, tax: v }))} />
        <Field label="مصاريف الشحن (ج)" value={form.shipping} onChange={(v) => setForm((p) => ({ ...p, shipping: v }))} />
        <div>
          <label className="font-bold text-slate-700 block mb-1">ملاحظات</label>
          <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" placeholder="اختياري" />
        </div>
      </div>

      <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
        <span className="text-xs font-bold text-violet-700">إجمالي الطلب</span>
        <span className="text-lg font-black text-violet-700">{fmt(total)}</span>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
        <button type="submit" disabled={saving} className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {editingId ? 'حفظ التعديلات' : 'إنشاء الطلب'}</button>
      </div>
    </form>
  </Modal>
);
