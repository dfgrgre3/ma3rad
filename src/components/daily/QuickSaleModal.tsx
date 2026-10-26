import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Loader2, Save } from 'lucide-react';
import { SalesService } from '../../services/SalesService';
import { useToast } from '../ui/Toast';
import { getProductUnitLabel } from '../../utils/productUnits';
import type { PaymentType } from '../../types';
import { round2 } from '../../services/financials';
import { fmt, input, label, LoadErrorNotice, ModalShell, useLists } from './DailyModalShared';

interface SaleLine {
  productId: string;
  quantityM2: string;
  unitPrice: string;
}

export const QuickSaleModal: React.FC<{ onClose: () => void; onSaved: () => void }> = ({ onClose, onSaved }) => {
  const toast = useToast();
  const { customers, products, warehouses, error: listsError } = useLists();
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [paidAmount, setPaidAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<SaleLine[]>([{ productId: '', quantityM2: '', unitPrice: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!warehouseId && warehouses.length) {
      setWarehouseId(warehouses.find((w) => w.isDefault)?.id || warehouses[0].id);
    }
  }, [warehouses, warehouseId]);

  const productOf = (id: string) => products.find((p) => p.id === id);
  const total = useMemo(() => round2(lines.reduce((sum, line) => {
    return sum + round2((Number(line.quantityM2) || 0) * (Number(line.unitPrice) || 0));
  }, 0)), [lines]);

  const setLine = (index: number, patch: Partial<SaleLine>) => {
    setLines((prev) => prev.map((line, i) => i === index ? { ...line, ...patch } : line));
  };

  const chooseProduct = (index: number, productId: string) => {
    const product = productOf(productId);
    setLine(index, { productId, unitPrice: product ? String(product.sellingPriceM2) : '' });
  };

  const save = () => {
    if (saving) return;
    if (!customerId || !warehouseId) { toast.error('اختر العميل والمخزن'); return; }
    const entered = lines.filter((line) => line.productId || line.quantityM2.trim() || line.unitPrice.trim());
    if (!entered.length) { toast.error('أضف صنفًا واحدًا على الأقل'); return; }
    if (entered.some((line) => {
      const quantity = Number(line.quantityM2);
      const price = Number(line.unitPrice);
      return !line.productId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0;
    })) {
      toast.error('أكمل الصنف والكمية والسعر لكل سطر، وتأكد أنها قيم أكبر من صفر');
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
      new SalesService().createSale({
        customerId,
        warehouseId,
        items: valid.map((line) => {
          const product = productOf(line.productId);
          const qty = Number(line.quantityM2);
          const isGeneral = product?.productType === 'GENERAL';
          const boxes = isGeneral
            ? product?.baseUnit === 'BOX' ? qty : 0
            : product?.metersPerBox ? Math.ceil(qty / product.metersPerBox) : 0;
          return {
            productId: line.productId,
            soldBy: isGeneral ? product?.baseUnit || 'CUSTOM' : 'M2',
            quantityM2: qty,
            boxesCount: boxes,
            piecesCount: isGeneral ? product?.baseUnit === 'PIECE' ? qty : 0 : boxes * (product?.piecesPerBox || 0),
            unitPrice: Number(line.unitPrice),
          };
        }),
        paidAmount: effectivePaid,
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
    <ModalShell title="بيع سريع" subtitle="تسجيل فاتورة بيع مباشرة من صفحة مبيعات اليوم" onClose={onClose} wide busy={saving}>
      <div className="space-y-4">
        {listsError && <LoadErrorNotice message={listsError} />}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="sale-customer" className={label}>العميل *</label>
            <select id="sale-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={input} disabled={Boolean(listsError)}>
              <option value="">اختر العميل</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sale-warehouse" className={label}>المخزن *</label>
            <select id="sale-warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={input} disabled={Boolean(listsError)}>
              <option value="">اختر المخزن</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sale-payment-type" className={label}>طريقة الدفع</label>
            <select id="sale-payment-type" value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} className={input}>
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
            <button type="button" onClick={() => setLines((prev) => [...prev, { productId: '', quantityM2: '', unitPrice: '' }])} className="flex items-center gap-1 text-[11px] font-bold text-sky-600">
              <Plus className="w-3.5 h-3.5" /> إضافة صنف
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {lines.map((line, index) => {
              const product = productOf(line.productId);
              const unit = product ? getProductUnitLabel(product) : 'م²';
              const productId = `sale-product-${index}`;
              const quantityId = `sale-qty-${index}`;
              const priceId = `sale-price-${index}`;
              return (
              <div key={index} className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                <div className="sm:col-span-6">
                  <label htmlFor={productId} className={label}>الصنف</label>
                  <select id={productId} value={line.productId} onChange={(e) => chooseProduct(index, e.target.value)} className={input} disabled={Boolean(listsError)}>
                    <option value="">اختر الصنف</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.sku}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={quantityId} className={label}>الكمية {unit}</label>
                  <input id={quantityId} type="number" min="0" step="0.01" value={line.quantityM2} onChange={(e) => setLine(index, { quantityM2: e.target.value })} className={input} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={priceId} className={label}>سعر {unit}</label>
                  <input id={priceId} type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => setLine(index, { unitPrice: e.target.value })} className={input} />
                </div>
                <div className="sm:col-span-1 pb-2 text-xs font-bold text-slate-600">{fmt(round2((Number(line.quantityM2) || 0) * (Number(line.unitPrice) || 0)))}</div>
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
            <label htmlFor="sale-paid-amount" className={label}>المبلغ المدفوع</label>
            <input id="sale-paid-amount" type="number" min="0" max={total} step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className={input} />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="sale-notes" className={label}>ملاحظات</label>
            <input id="sale-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <span className="text-xs text-slate-500">الإجمالي</span>
          <span className="text-lg font-black text-slate-900">{fmt(total)}</span>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-100 disabled:opacity-50">إلغاء</button>
          <button type="button" onClick={save} disabled={saving || Boolean(listsError)} className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ الفاتورة
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
