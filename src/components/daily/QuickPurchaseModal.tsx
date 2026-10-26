import React, { useEffect, useMemo, useState } from 'react';
import { PurchaseService } from '../../services/PurchaseService';
import { useToast } from '../ui/Toast';
import { getProductUnitLabel } from '../../utils/productUnits';
import type { PaymentType } from '../../types';
import { round2 } from '../../services/financials';
import { fmt, input, label, LoadErrorNotice, ModalShell, useLists, useSuppliers } from './DailyModalShared';
import { Plus, Trash2, Loader2, Save } from 'lucide-react';

interface PurchaseLine { productId: string; quantityM2: string; unitCost: string; }

export const QuickPurchaseModal: React.FC<{ onClose: () => void; onSaved: () => void }> = ({ onClose, onSaved }) => {
  const toast = useToast();
  const { products, warehouses, error: listsError } = useLists();
  const { suppliers, error: suppliersError } = useSuppliers();
  const loadError = listsError || suppliersError;
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
      setWarehouseId(warehouses.find((w) => w.isDefault)?.id || warehouses[0].id);
    }
  }, [warehouses, warehouseId]);

  const productOf = (id: string) => products.find((p) => p.id === id);
  const total = useMemo(() => round2(lines.reduce((sum, line) => sum + round2((Number(line.quantityM2) || 0) * (Number(line.unitCost) || 0)), 0)), [lines]);
  const setLine = (index: number, patch: Partial<PurchaseLine>) => setLines((prev) => prev.map((line, i) => i === index ? { ...line, ...patch } : line));
  const chooseProduct = (index: number, productId: string) => {
    const product = productOf(productId);
    setLine(index, { productId, unitCost: product ? String(product.costPrice) : '' });
  };

  const save = () => {
    if (saving) return;
    if (!supplierId || !warehouseId) { toast.error('اختر المورد والمخزن'); return; }
    const entered = lines.filter((line) => line.productId || line.quantityM2.trim() || line.unitCost.trim());
    if (!entered.length) { toast.error('أضف صنفًا واحدًا على الأقل'); return; }
    if (entered.some((line) => {
      const quantity = Number(line.quantityM2);
      const cost = Number(line.unitCost);
      return !line.productId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(cost) || cost <= 0;
    })) {
      toast.error('أكمل الصنف والكمية والتكلفة لكل سطر، وتأكد أنها قيم أكبر من صفر');
      return;
    }
    if (!Number.isFinite(total) || total <= 0) { toast.error('إجمالي الفاتورة غير صحيح'); return; }
    const effectivePaid = paidAmount.trim() === '' ? (paymentType === 'CREDIT' ? 0 : total) : Number(paidAmount);
    if (!Number.isFinite(effectivePaid) || effectivePaid < 0 || effectivePaid > total) {
      toast.error('المبلغ المدفوع يجب أن يكون بين صفر وإجمالي الفاتورة');
      return;
    }
    const valid = entered;
    setSaving(true);
    try {
      new PurchaseService().createPurchase({
        supplierId,
        supplierInvoiceNumber: supplierInvoice || undefined,
        warehouseId,
        items: valid.map((line) => {
          const product = productOf(line.productId);
          const qty = Number(line.quantityM2);
          const boxes = product?.productType === 'GENERAL'
            ? product.baseUnit === 'BOX' ? qty : 0
            : product?.metersPerBox ? Math.ceil(qty / product.metersPerBox) : 0;
          return { productId: line.productId, quantityM2: qty, boxesCount: boxes, unitCost: Number(line.unitCost) };
        }),
        paidAmount: effectivePaid,
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
    <ModalShell title="فاتورة توريد جديدة" subtitle="إضافة مشتريات مباشرة إلى المخزون" onClose={onClose} wide busy={saving}>
      <div className="space-y-4">
        {loadError && <LoadErrorNotice message={loadError} />}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className={label}>المورد *</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={input} disabled={Boolean(suppliersError)}>
              <option value="">اختر المورد</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.phone}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>المخزن *</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={input} disabled={Boolean(listsError)}>
              <option value="">اختر المخزن</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
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
            <button type="button" onClick={() => setLines((prev) => [...prev, { productId: '', quantityM2: '', unitCost: '' }])} className="flex items-center gap-1 text-[11px] font-bold text-orange-600">
              <Plus className="w-3.5 h-3.5" /> إضافة صنف
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {lines.map((line, index) => {
              const product = productOf(line.productId);
              const unit = product ? getProductUnitLabel(product) : 'م²';
              return (
              <div key={index} className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                <div className="sm:col-span-6">
                  <label className={label}>الصنف</label>
                  <select value={line.productId} onChange={(e) => chooseProduct(index, e.target.value)} className={input} disabled={Boolean(listsError)}>
                    <option value="">اختر الصنف</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.sku}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>الكمية {unit}</label>
                  <input type="number" min="0" step="0.01" value={line.quantityM2} onChange={(e) => setLine(index, { quantityM2: e.target.value })} className={input} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>تكلفة {unit}</label>
                  <input type="number" min="0" step="0.01" value={line.unitCost} onChange={(e) => setLine(index, { unitCost: e.target.value })} className={input} />
                </div>
                <div className="sm:col-span-1 pb-2 text-xs font-bold text-slate-600">{fmt(round2((Number(line.quantityM2) || 0) * (Number(line.unitCost) || 0)))}</div>
                <div className="sm:col-span-1 pb-1">
                  <button type="button" aria-label="حذف الصنف" onClick={() => setLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );})}
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
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-100 disabled:opacity-50">إلغاء</button>
          <button type="button" onClick={save} disabled={saving || Boolean(loadError)} className="flex items-center gap-1.5 px-5 py-2 bg-orange-600 text-white rounded-lg text-sm font-bold hover:bg-orange-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ الفاتورة
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
