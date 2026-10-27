import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Loader2, Save, Percent, Truck, Barcode } from 'lucide-react';
import { SalesService } from '../../services/SalesService';
import { InventoryService } from '../../services/InventoryService';
import { useToast } from '../ui/Toast';
import { getProductUnitLabel } from '../../utils/productUnits';
import type { PaymentType } from '../../types';
import { round2 } from '../../services/financials';
import { fmt, input, label, LoadErrorNotice, ModalShell, useLists } from './DailyModalShared';

interface SaleLine {
  productId: string;
  productSearch: string;
  quantityM2: string;
  unitPrice: string;
}

interface WarehouseProductStock {
  quantityM2: number;
  reservedM2: number;
}

const emptyLine = (): SaleLine => ({ productId: '', productSearch: '', quantityM2: '', unitPrice: '' });

export const QuickSaleModal: React.FC<{ onClose: () => void; onSaved: () => void }> = ({ onClose, onSaved }) => {
  const toast = useToast();
  const { customers, products, warehouses, error: listsError } = useLists();
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [paidAmount, setPaidAmount] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [taxPercentage, setTaxPercentage] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<SaleLine[]>([emptyLine()]);
  const [warehouseStock, setWarehouseStock] = useState<Record<string, WarehouseProductStock>>({});
  const [stockError, setStockError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customerId && customers.length === 1) {
      setCustomerId(customers[0].id);
    }
  }, [customers, customerId]);

  useEffect(() => {
    if (!warehouseId && warehouses.length) {
      setWarehouseId(warehouses.find((w) => w.isDefault)?.id || warehouses[0].id);
    }
  }, [warehouses, warehouseId]);

  useEffect(() => {
    if (!warehouseId) {
      setWarehouseStock({});
      setStockError('');
      return;
    }

    try {
      const rows = new InventoryService().getWarehouseStock(warehouseId);
      setWarehouseStock(Object.fromEntries(rows.map((row) => [row.productId, {
        quantityM2: Number(row.quantityM2) || 0,
        reservedM2: Number(row.reservedM2) || 0,
      }])));
      setStockError('');
    } catch (e) {
      setWarehouseStock({});
      setStockError(e instanceof Error ? e.message : 'تعذر تحميل أرصدة المخزن');
    }
  }, [warehouseId]);

  const productOf = (id: string) => products.find((p) => p.id === id);
  const subtotal = useMemo(() => round2(lines.reduce((sum, line) => {
    return sum + round2((Number(line.quantityM2) || 0) * (Number(line.unitPrice) || 0));
  }, 0)), [lines]);
  const discount = Math.max(0, Number(discountAmount) || 0);
  const taxRate = Math.max(0, Number(taxPercentage) || 0);
  const tax = round2(Math.max(0, subtotal - discount) * taxRate / 100);
  const shipping = Math.max(0, Number(shippingCost) || 0);
  const total = round2(Math.max(0, subtotal - discount) + tax + shipping);
  const effectivePaid = paidAmount.trim() === '' ? (paymentType === 'CREDIT' ? 0 : total) : Number(paidAmount);
  const isPaidAmountValid = Number.isFinite(effectivePaid) && effectivePaid >= 0 && effectivePaid <= total;
  const remainingAmount = round2(total - (Number.isFinite(effectivePaid) ? effectivePaid : 0));

  const setLine = (index: number, patch: Partial<SaleLine>) => {
    setLines((prev) => prev.map((line, i) => i === index ? { ...line, ...patch } : line));
  };

  const chooseProduct = (index: number, productId: string) => {
    const product = productOf(productId);
    setLine(index, {
      productId,
      productSearch: '',
      unitPrice: product ? String(product.sellingPriceM2) : '',
    });
  };

  const stockAfterSale = (productId: string) => {
    const stock = warehouseStock[productId];
    const available = Math.max(0, (stock?.quantityM2 || 0) - (stock?.reservedM2 || 0));
    const requested = lines
      .filter((line) => line.productId === productId)
      .reduce((sum, line) => sum + (Number(line.quantityM2) || 0), 0);
    return { available, remaining: round2(available - requested) };
  };

  const addBarcodeProduct = (value: string) => {
    const code = value.trim().toLocaleLowerCase();
    if (!code) return;
    const product = products.find((item) => item.barcode?.toLocaleLowerCase() === code || item.sku?.toLocaleLowerCase() === code);
    if (!product) { toast.error('لم يتم العثور على صنف بهذا الباركود أو الكود'); return; }
    const existingIndex = lines.findIndex((line) => line.productId === product.id);
    if (existingIndex >= 0) {
      setLine(existingIndex, { quantityM2: String((Number(lines[existingIndex].quantityM2) || 0) + 1) });
    } else {
      setLines((prev) => [...prev.filter((line, index) => index !== 0 || line.productId || line.quantityM2 || line.unitPrice), {
        productId: product.id, productSearch: '', quantityM2: '1', unitPrice: String(product.sellingPriceM2),
      }]);
    }
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
    if (discount > subtotal) { toast.error('الخصم لا يمكن أن يتجاوز قيمة الأصناف'); return; }
    if (taxRate > 100) { toast.error('نسبة الضريبة يجب ألا تتجاوز 100٪'); return; }
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
        discountAmount: discount,
        taxPercentage: taxRate,
        taxAmount: tax,
        shippingCost: shipping,
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F2') {
        event.preventDefault();
        document.getElementById('sale-barcode')?.focus();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <ModalShell title="بيع سريع" subtitle="تسجيل فاتورة بيع مباشرة من صفحة مبيعات اليوم" onClose={onClose} wide busy={saving}>
      <div className="space-y-4">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem('barcode') as HTMLInputElement; addBarcodeProduct(input.value); input.value = ''; }}>
          <div className="relative flex-1"><Barcode className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" /><input id="sale-barcode" name="barcode" autoComplete="off" placeholder="امسح الباركود أو أدخل كود الصنف (F2)" className={`${input} pr-9`} /></div>
          <button type="submit" className="rounded-lg bg-slate-800 px-4 text-xs font-bold text-white">إضافة</button>
        </form>
        {listsError && <LoadErrorNotice message={listsError} />}
        {!listsError && customers.length === 0 && (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            لا يوجد عملاء نشطون. أضف عميلًا من إدارة العملاء أو تحقق من وجود عميل نقدي.
          </div>
        )}
        {!listsError && products.length === 0 && (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            لا توجد أصناف نشطة للاختيار. أضف صنفًا أو أعد تفعيل صنف من إدارة الأصناف.
          </div>
        )}
        {!listsError && warehouses.length === 0 && (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            لا توجد مخازن متاحة لحسابك. تحقق من صلاحيات الفروع والمخازن.
          </div>
        )}
        {stockError && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            تعذر تحميل رصيد المخزن: {stockError} ستظل صلاحية الكمية تُراجع عند حفظ الفاتورة.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="sale-customer" className={label}>العميل *</label>
            <select id="sale-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={input} disabled={Boolean(listsError)}>
              <option value="">اختر العميل</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ''}</option>)}
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-200 p-3">
          <div><label htmlFor="sale-discount" className={label}><Percent className="inline h-3 w-3" /> خصم الفاتورة</label><input id="sale-discount" type="number" min="0" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} className={input} placeholder="0.00" /></div>
          <div><label htmlFor="sale-tax" className={label}><Percent className="inline h-3 w-3" /> ضريبة %</label><input id="sale-tax" type="number" min="0" max="100" step="0.01" value={taxPercentage} onChange={(e) => setTaxPercentage(e.target.value)} className={input} placeholder="0" /></div>
          <div><label htmlFor="sale-shipping" className={label}><Truck className="inline h-3 w-3" /> مشال / نقل</label><input id="sale-shipping" type="number" min="0" step="0.01" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} className={input} placeholder="0.00" /></div>
        </div>

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">الأصناف</span>
            <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])} className="flex items-center gap-1 text-[11px] font-bold text-sky-600">
              <Plus className="w-3.5 h-3.5" /> إضافة صنف
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {lines.map((line, index) => {
              const product = productOf(line.productId);
              const unit = product ? getProductUnitLabel(product) : 'م²';
              const stock = product ? stockAfterSale(product.id) : null;
              const productId = `sale-product-${index}`;
              const quantityId = `sale-qty-${index}`;
              const priceId = `sale-price-${index}`;
              return (
              <div key={index} className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                <div className="sm:col-span-6">
                  <label htmlFor={productId} className={label}>الصنف</label>
                  {products.length > 0 ? (
                    <>
                      <input
                        type="search"
                        placeholder="ابحث بالاسم أو الكود..."
                        value={line.productSearch}
                        aria-label={`بحث عن صنف للسطر ${index + 1}`}
                        onChange={(e) => setLine(index, { productSearch: e.target.value, productId: '', unitPrice: '' })}
                        className={`${input} mb-1`}
                        disabled={Boolean(listsError)}
                      />
                      <select id={productId} value={line.productId} onChange={(e) => chooseProduct(index, e.target.value)} className={input} disabled={Boolean(listsError)}>
                        <option value="">اختر الصنف</option>
                        {products
                          .filter((p) => {
                            const search = line.productSearch.trim().toLocaleLowerCase();
                            return !search || `${p.name} ${p.sku} ${p.barcode}`.toLocaleLowerCase().includes(search);
                          })
                          .map((p) => <option key={p.id} value={p.id}>{p.name} — {p.sku}</option>)}
                      </select>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
                      لا توجد أصناف نشطة متاحة. أضف صنفًا أو أعد تفعيله قبل تسجيل البيع.
                    </div>
                  )}
                  {line.productSearch && !product && products.length > 0 && !products.some((p) => `${p.name} ${p.sku} ${p.barcode}`.toLocaleLowerCase().includes(line.productSearch.trim().toLocaleLowerCase())) && (
                    <p className="mt-1 text-[11px] text-slate-500">لا توجد أصناف مطابقة للبحث.</p>
                  )}
                  {product && warehouseId && (
                    <p className="mt-1 text-[11px] text-slate-500" aria-live="polite">
                      {stockError ? 'الرصيد غير متاح حاليًا' : (
                        <>المتاح: {fmt(stock?.available || 0)} {unit} · المتبقي بعد البيع: <span className={stock && stock.remaining < 0 ? 'font-bold text-rose-600' : ''}>{fmt(stock?.remaining || 0)} {unit}</span></>
                      )}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={quantityId} className={label}>الكمية {unit}</label>
                  <input id={quantityId} type="number" min="0" step="0.01" value={line.quantityM2} onChange={(e) => setLine(index, { quantityM2: e.target.value })} className={input} disabled={products.length === 0 || Boolean(listsError)} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={priceId} className={label}>سعر {unit}</label>
                  <input id={priceId} type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => setLine(index, { unitPrice: e.target.value })} className={input} disabled={products.length === 0 || Boolean(listsError)} />
                </div>
                <div className="sm:col-span-1 pb-2 text-xs font-bold text-slate-600" aria-label={`إجمالي السطر ${index + 1}`}>
                  <span className="block text-[10px] font-medium text-slate-500">المجموع</span>
                  {fmt(round2((Number(line.quantityM2) || 0) * (Number(line.unitPrice) || 0)))}
                </div>
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
            <input id="sale-paid-amount" type="number" min="0" max={total} step="0.01" value={paidAmount} placeholder={`افتراضي: ${fmt(paymentType === 'CREDIT' ? 0 : total)}`} onChange={(e) => setPaidAmount(e.target.value)} aria-invalid={!isPaidAmountValid} className={`${input} ${isPaidAmountValid ? '' : 'border-rose-500 focus:ring-rose-500'}`} />
            {!isPaidAmountValid && <p role="alert" className="mt-1 text-[11px] text-rose-600">أدخل مبلغًا بين صفر وإجمالي الفاتورة.</p>}
          </div>
          <div className="md:col-span-2">
            <label htmlFor="sale-notes" className={label}>ملاحظات</label>
            <input id="sale-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-center">
          <div>
            <span className="block text-[11px] text-slate-500">قيمة الأصناف</span>
            <span className="text-sm font-black text-slate-900">{fmt(subtotal)}</span>
          </div>
          <div><span className="block text-[11px] text-slate-500">الخصم والضريبة والنقل</span><span className="text-sm font-black text-slate-700">-{fmt(discount)} · +{fmt(tax + shipping)}</span></div>
          <div><span className="block text-[11px] text-slate-500">الإجمالي</span><span className="text-sm font-black text-slate-900">{fmt(total)}</span></div>
          <div>
            <span className="block text-[11px] text-slate-500">المدفوع</span>
            <span className="text-sm font-black text-emerald-700">{fmt(effectivePaid)}</span>
          </div>
          <div>
            <span className="block text-[11px] text-slate-500">المتبقي</span>
            <span className="text-sm font-black text-amber-700">{fmt(remainingAmount)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-100 disabled:opacity-50">إلغاء</button>
          <button type="button" onClick={save} disabled={saving || Boolean(listsError)} className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ الفاتورة <span className="text-[10px] opacity-80">Ctrl+Enter</span>
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
