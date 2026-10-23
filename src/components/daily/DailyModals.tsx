import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Loader2, Save, AlertTriangle } from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { CustomerService } from '../../services/CustomerService';
import { ProductService } from '../../services/ProductService';
import { OperationsService } from '../../services/OperationsService';
import { SalesService } from '../../services/SalesService';
import { PurchaseService } from '../../services/PurchaseService';
import { CashierService } from '../../services/CashierService';
import { useToast } from '../ui/Toast';

import type { PaymentType } from '../../types';

const input = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500';
const label = 'block text-[11px] font-semibold text-slate-600 mb-1';
const fmt = (value: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value) || 0);

export const ModalShell: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}> = ({ title, subtitle, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-2xl w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[92vh] flex flex-col`}>
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200">
        <div>
          <h3 className="text-sm font-black text-slate-900">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
    </div>
  </div>
);

const useLists = () => {
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  useEffect(() => {
    try {
      setCustomers(new CustomerService().getAllCustomers());
      setProducts(new ProductService().getAllProducts());
      setWarehouses(new OperationsService().getWarehouses());
    } catch (e) { console.error(e); }
  }, []);
  return { customers, products, warehouses };
};

interface SaleLine {
  productId: string;
  quantityM2: string;
  unitPrice: string;
}

export const QuickSaleModal: React.FC<{ onClose: () => void; onSaved: () => void }> = ({ onClose, onSaved }) => {
  const toast = useToast();
  const { customers, products, warehouses } = useLists();
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [paidAmount, setPaidAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<SaleLine[]>([{ productId: '', quantityM2: '', unitPrice: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!warehouseId && warehouses.length) {
      setWarehouseId(warehouses.find((w: any) => w.is_default)?.id || warehouses[0].id);
    }
  }, [warehouses, warehouseId]);

  const productOf = (id: string) => products.find((p) => p.id === id);
  const total = useMemo(() => lines.reduce((sum, line) => {
    return sum + (Number(line.quantityM2) || 0) * (Number(line.unitPrice) || 0);
  }, 0), [lines]);

  const setLine = (index: number, patch: Partial<SaleLine>) => {
    setLines((prev) => prev.map((line, i) => i === index ? { ...line, ...patch } : line));
  };

  const chooseProduct = (index: number, productId: string) => {
    const product = productOf(productId);
    setLine(index, { productId, unitPrice: product ? String(product.sellingPriceM2) : '' });
  };

  const save = () => {
    if (!customerId || !warehouseId) { toast.error('اختر العميل والمخزن'); return; }
    const valid = lines.filter((line) => line.productId && Number(line.quantityM2) > 0 && Number(line.unitPrice) > 0);
    if (!valid.length) { toast.error('أضف صنفًا واحدًا على الأقل بكمية وسعر صحيحين'); return; }
    const effectivePaid = paidAmount.trim() === '' ? (paymentType === 'CREDIT' ? 0 : total) : Number(paidAmount);
    setSaving(true);
    try {
      new SalesService().createSale({
        customerId,
        warehouseId,
        items: valid.map((line) => {
          const product = productOf(line.productId);
          const qty = Number(line.quantityM2);
          const boxes = product?.metersPerBox ? Math.ceil(qty / product.metersPerBox) : 0;
          return {
            productId: line.productId,
            soldBy: 'M2' as const,
            quantityM2: qty,
            boxesCount: boxes,
            piecesCount: boxes * (product?.piecesPerBox || 0),
            unitPrice: Number(line.unitPrice),
          };
        }),
        paidAmount: Math.min(Math.max(0, effectivePaid || 0), total),
        paymentType,
        notes: notes || undefined,
      });
      toast.success('تم تسجيل فاتورة البيع');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تسجيل فاتورة البيع');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="بيع سريع" subtitle="تسجيل فاتورة بيع مباشرة من صفحة مبيعات اليوم" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={label}>العميل *</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={input}>
              <option value="">اختر العميل</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>المخزن *</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={input}>
              {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>طريقة الدفع</label>
            <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} className={input}>
              <option value="CASH">نقدي</option>
              <option value="CREDIT">آجل</option>
              <option value="BANK_TRANSFER">تحويل بنكي</option>
              <option value="CARD">بطاقة</option>
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">الأصناف</span>
            <button onClick={() => setLines((prev) => [...prev, { productId: '', quantityM2: '', unitPrice: '' }])} className="flex items-center gap-1 text-[11px] font-bold text-sky-600">
              <Plus className="w-3.5 h-3.5" /> إضافة صنف
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {lines.map((line, index) => (
              <div key={index} className="p-3 grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6">
                  <label className={label}>الصنف</label>
                  <select value={line.productId} onChange={(e) => chooseProduct(index, e.target.value)} className={input}>
                    <option value="">اختر الصنف</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.sku}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={label}>الكمية م²</label>
                  <input type="number" min="0" step="0.01" value={line.quantityM2} onChange={(e) => setLine(index, { quantityM2: e.target.value })} className={input} />
                </div>
                <div className="col-span-2">
                  <label className={label}>سعر م²</label>
                  <input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => setLine(index, { unitPrice: e.target.value })} className={input} />
                </div>
                <div className="col-span-1 pb-2 text-xs font-bold text-slate-600">{fmt((Number(line.quantityM2) || 0) * (Number(line.unitPrice) || 0))}</div>
                <div className="col-span-1 pb-1">
                  <button onClick={() => setLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={label}>المبلغ المدفوع</label>
            <input type="number" min="0" max={total} step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className={input} />
          </div>
          <div className="md:col-span-2">
            <label className={label}>ملاحظات</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <span className="text-xs text-slate-500">الإجمالي</span>
          <span className="text-lg font-black text-slate-900">{fmt(total)}</span>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-100">إلغاء</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ الفاتورة
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

interface PurchaseLine { productId: string; quantityM2: string; unitCost: string; }

export const QuickPurchaseModal: React.FC<{ onClose: () => void; onSaved: () => void }> = ({ onClose, onSaved }) => {
  const toast = useToast();
  const { products, warehouses } = useLists();
  const suppliers = useMemo(() => {
    try { return DatabaseManager.getInstance().query<any>('SELECT id, name, phone FROM suppliers WHERE is_active = 1 ORDER BY name'); }
    catch { return []; }
  }, []);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [supplierInvoice, setSupplierInvoice] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [paidAmount, setPaidAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PurchaseLine[]>([{ productId: '', quantityM2: '', unitCost: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!warehouseId && warehouses.length) {
      setWarehouseId(warehouses.find((w: any) => w.is_default)?.id || warehouses[0].id);
    }
  }, [warehouses, warehouseId]);

  const productOf = (id: string) => products.find((p) => p.id === id);
  const total = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.quantityM2) || 0) * (Number(line.unitCost) || 0), 0), [lines]);
  const setLine = (index: number, patch: Partial<PurchaseLine>) => setLines((prev) => prev.map((line, i) => i === index ? { ...line, ...patch } : line));
  const chooseProduct = (index: number, productId: string) => {
    const product = productOf(productId);
    setLine(index, { productId, unitCost: product ? String(product.costPrice) : '' });
  };

  const save = () => {
    if (!supplierId || !warehouseId) { toast.error('اختر المورد والمخزن'); return; }
    const valid = lines.filter((line) => line.productId && Number(line.quantityM2) > 0 && Number(line.unitCost) > 0);
    if (!valid.length) { toast.error('أضف صنفًا واحدًا على الأقل'); return; }
    const effectivePaid = paidAmount.trim() === '' ? (paymentType === 'CREDIT' ? 0 : total) : Number(paidAmount);
    setSaving(true);
    try {
      new PurchaseService().createPurchase({
        supplierId,
        supplierInvoiceNumber: supplierInvoice || undefined,
        warehouseId,
        items: valid.map((line) => {
          const product = productOf(line.productId);
          const qty = Number(line.quantityM2);
          const boxes = product?.metersPerBox ? Math.ceil(qty / product.metersPerBox) : 0;
          return { productId: line.productId, quantityM2: qty, boxesCount: boxes, unitCost: Number(line.unitCost) };
        }),
        paidAmount: Math.min(Math.max(0, effectivePaid || 0), total),
        paymentType,
        notes: notes || undefined,
      });
      toast.success('تم تسجيل فاتورة التوريد');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تسجيل فاتورة التوريد');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="فاتورة توريد جديدة" subtitle="إضافة مشتريات مباشرة إلى المخزون" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className={label}>المورد *</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={input}>
              <option value="">اختر المورد</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.phone}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>المخزن *</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={input}>
              {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>فاتورة المورد</label>
            <input value={supplierInvoice} onChange={(e) => setSupplierInvoice(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>طريقة السداد</label>
            <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} className={input}>
              <option value="CASH">نقدي</option>
              <option value="CREDIT">آجل</option>
              <option value="BANK_TRANSFER">تحويل بنكي</option>
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">الأصناف</span>
            <button onClick={() => setLines((prev) => [...prev, { productId: '', quantityM2: '', unitCost: '' }])} className="flex items-center gap-1 text-[11px] font-bold text-orange-600">
              <Plus className="w-3.5 h-3.5" /> إضافة صنف
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {lines.map((line, index) => (
              <div key={index} className="p-3 grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6">
                  <label className={label}>الصنف</label>
                  <select value={line.productId} onChange={(e) => chooseProduct(index, e.target.value)} className={input}>
                    <option value="">اختر الصنف</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.sku}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={label}>الكمية م²</label>
                  <input type="number" min="0" step="0.01" value={line.quantityM2} onChange={(e) => setLine(index, { quantityM2: e.target.value })} className={input} />
                </div>
                <div className="col-span-2">
                  <label className={label}>تكلفة م²</label>
                  <input type="number" min="0" step="0.01" value={line.unitCost} onChange={(e) => setLine(index, { unitCost: e.target.value })} className={input} />
                </div>
                <div className="col-span-1 pb-2 text-xs font-bold text-slate-600">{fmt((Number(line.quantityM2) || 0) * (Number(line.unitCost) || 0))}</div>
                <div className="col-span-1 pb-1">
                  <button onClick={() => setLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={label}>المبلغ المدفوع</label>
            <input type="number" min="0" max={total} step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className={input} />
          </div>
          <div className="md:col-span-2">
            <label className={label}>ملاحظات</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <span className="text-xs text-slate-500">إجمالي التوريد</span>
          <span className="text-lg font-black text-slate-900">{fmt(total)}</span>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-100">إلغاء</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 bg-orange-600 text-white rounded-lg text-sm font-bold hover:bg-orange-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ الفاتورة
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

export const ExpenseModal: React.FC<{ initial?: any; onClose: () => void; onSaved: () => void }> = ({ initial, onClose, onSaved }) => {
  const toast = useToast();
  const categories = useMemo(() => {
    try { return new CashierService().getExpenseCategories(); } catch { return []; }
  }, []);
  const registers = useMemo(() => {
    try { return new CashierService().getAllRegisters(); } catch { return []; }
  }, []);
  const [form, setForm] = useState({
    category: initial?.category || categories[0]?.name || '',
    amount: initial ? String(initial.amount) : '',
    description: initial?.description || '',
    recipient: initial?.recipient || '',
    paymentType: (initial?.paymentType || 'CASH') as PaymentType,
    registerId: initial?.registerId || registers[0]?.id || 'cr_main',
  });
  const [saving, setSaving] = useState(false);

  const save = () => {
    if (!form.category || !form.description.trim()) { toast.error('اختر البند واكتب البيان'); return; }
    if (!Number(form.amount) || Number(form.amount) <= 0) { toast.error('أدخل مبلغًا صحيحًا'); return; }
    setSaving(true);
    try {
      const service = new CashierService();
      if (initial?.id) {
        service.updateExpense(initial.id, {
          category: form.category, amount: Number(form.amount), description: form.description,
          recipient: form.recipient, paymentType: form.paymentType, registerId: form.registerId,
        });
        toast.success('تم تعديل المصروف');
      } else {
        service.addExpense(form.category, Number(form.amount), form.description, form.registerId, undefined, form.paymentType, form.recipient);
        toast.success('تم تسجيل المصروف');
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حفظ المصروف');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={initial ? 'تعديل مصروف' : 'إضافة مصروف'} subtitle="يُخصم المصروف النقدي من الخزينة المحددة" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={label}>البند *</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={input}>
              {categories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>المبلغ *</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={input} />
          </div>
        </div>
        <div>
          <label className={label}>البيان *</label>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={label}>المستفيد</label>
            <input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} className={input} />
          </div>
          <div>
            <label className={label}>طريقة الدفع</label>
            <select value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value as PaymentType })} className={input}>
              <option value="CASH">نقدي</option>
              <option value="BANK_TRANSFER">بنكي</option>
            </select>
          </div>
          <div>
            <label className={label}>الخزينة</label>
            <select value={form.registerId} onChange={(e) => setForm({ ...form, registerId: e.target.value })} className={input}>
              {registers.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-100">إلغاء</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

export type PaymentTarget =
  | { kind: 'sale'; id: string; name: string; remaining: number }
  | { kind: 'purchase'; id: string; name: string; remaining: number }
  | { kind: 'customer'; id: string; name: string; remaining: number };

export const PaymentModal: React.FC<{ target: PaymentTarget; onClose: () => void; onSaved: () => void }> = ({ target, onClose, onSaved }) => {
  const toast = useToast();
  const registers = useMemo(() => {
    try { return new CashierService().getAllRegisters(); } catch { return []; }
  }, []);
  const [amount, setAmount] = useState(String(target.remaining));
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [registerId, setRegisterId] = useState(registers[0]?.id || 'cr_main');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const save = () => {
    const value = Number(amount);
    if (!value || value <= 0) { toast.error('أدخل مبلغًا صحيحًا'); return; }
    setSaving(true);
    try {
      if (target.kind === 'sale') {
        new SalesService().recordInvoicePayment(target.id, value, paymentType, registerId, undefined, notes);
      } else if (target.kind === 'purchase') {
        new PurchaseService().recordPayment(target.id, value, paymentType, registerId, notes);
      } else {
        new CustomerService().recordPayment(target.id, value, paymentType, registerId, undefined, notes);
      }
      toast.success('تم تسجيل الدفعة');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تسجيل الدفعة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="تسجيل دفعة" subtitle={target.name} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">المتبقي</span>
          <span className="text-base font-black text-rose-600">{fmt(target.remaining)}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={label}>المبلغ *</label>
            <input type="number" min="0" max={target.remaining} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>طريقة الدفع</label>
            <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} className={input}>
              <option value="CASH">نقدي</option>
              <option value="BANK_TRANSFER">بنكي</option>
              <option value="CARD">بطاقة</option>
            </select>
          </div>
        </div>
        <div>
          <label className={label}>الخزينة</label>
          <select value={registerId} onChange={(e) => setRegisterId(e.target.value)} className={input}>
            {registers.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>ملاحظات</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-100">إلغاء</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} تسجيل الدفعة
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

export const DetailsModal: React.FC<{ kind: 'sale' | 'purchase'; id: string; onClose: () => void; onChanged: () => void }> = ({ kind, id, onClose, onChanged }) => {
  const toast = useToast();
  const [invoice, setInvoice] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);

  const load = () => {
    try {
      if (kind === 'sale') {
        setInvoice(new SalesService().getInvoiceById(id));
        setPayments(new SalesService().getInvoicePayments(id));
      } else {
        setInvoice(new PurchaseService().getPurchaseById(id));
        setPayments([]);
      }
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل التفاصيل');
    }
  };
  useEffect(load, [id, kind]);

  const removePayment = (paymentId: string) => {
    if (!window.confirm('حذف سند التحصيل وعكس أثره على الفاتورة والخزينة؟')) return;
    try {
      new SalesService().deleteInvoicePayment(paymentId);
      toast.success('تم حذف سند التحصيل');
      load();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حذف السند');
    }
  };

  return (
    <ModalShell title={`تفاصيل ${kind === 'sale' ? 'فاتورة البيع' : 'فاتورة التوريد'}`} subtitle={invoice?.invoiceNumber} onClose={onClose} wide>
      {!invoice ? <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-sky-600" /></div> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              ['الإجمالي', invoice.totalAmount],
              ['المدفوع', invoice.paidAmount],
              ['المتبقي', invoice.remainingAmount],
            ].map(([labelText, value]) => (
              <div key={String(labelText)} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                <p className="text-[10px] text-slate-500">{labelText}</p>
                <p className="text-sm font-black text-slate-900">{fmt(Number(value))}</p>
              </div>
            ))}
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <p className="text-[10px] text-slate-500">الحالة</p>
              <p className="text-sm font-black text-slate-900">{invoice.paymentStatus}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs text-right min-w-[520px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['الصنف', 'الكمية م²', 'السعر/التكلفة', 'الإجمالي'].map((h) => <th key={h} className="px-3 py-2 font-bold text-slate-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(invoice.items || []).map((item: any) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-semibold">{item.productName}</td>
                    <td className="px-3 py-2">{item.quantityM2}</td>
                    <td className="px-3 py-2">{fmt(item.unitPrice ?? item.unitCost)}</td>
                    <td className="px-3 py-2 font-bold">{fmt(item.totalPrice ?? item.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {kind === 'sale' && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 text-xs font-bold text-slate-700">سندات التحصيل</div>
              {payments.length === 0 ? <p className="p-4 text-xs text-slate-400 text-center">لا توجد دفعات مسجلة</p> : (
                <div className="divide-y divide-slate-100">
                  {payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="font-mono text-emerald-600">{payment.receiptNumber}</span>
                      <span>{fmt(payment.amount)}</span>
                      <span className="text-slate-500">{payment.paymentType}</span>
                      <button onClick={() => removePayment(payment.id)} className="p-1 text-rose-500 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
};

export const VoidModal: React.FC<{ target: { kind: 'sale' | 'purchase'; id: string; name: string }; onClose: () => void; onDeleted: () => void }> = ({ target, onClose, onDeleted }) => {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const save = () => {
    if (!reason.trim()) { toast.error('سبب الإلغاء/الحذف مطلوب'); return; }
    setSaving(true);
    try {
      if (target.kind === 'sale') new SalesService().voidInvoice(target.id, reason);
      else new PurchaseService().deletePurchase(target.id, reason);
      toast.success(target.kind === 'sale' ? 'تم إلغاء الفاتورة' : 'تم حذف فاتورة التوريد');
      onDeleted();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تنفيذ العملية');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={target.kind === 'sale' ? 'إلغاء فاتورة بيع' : 'حذف فاتورة توريد'} subtitle={target.name} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p>
            {target.kind === 'sale'
              ? 'سيتم إرجاع الكميات للمخزون وعكس أثر الفاتورة على حساب العميل. لا يمكن التراجع.'
              : 'سيتم خصم الكميات من المخزون وعكس أثر الفاتورة على حساب المورد. لا يمكن التراجع.'}
          </p>
        </div>
        <div>
          <label className={label}>السبب *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={input} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-100">رجوع</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} تأكيد
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
