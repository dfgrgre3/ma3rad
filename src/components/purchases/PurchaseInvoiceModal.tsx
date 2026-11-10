import React from 'react';
import { Trash2, Scale } from 'lucide-react';
import { PaymentType, Product, Supplier, Warehouse } from '../../types';
import { getProductUnitLabel } from '../../utils/products/productUnits';
import { PurchaseInvoiceDto } from '../../types/purchasing/components';
import type { OperationalFieldDefinition } from '../../services/domains/products/OperationalFieldService';
import { OperationalFieldsForm } from '../products/OperationalFieldsForm';
import { ProductPicker } from '../products/ProductPicker';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج.م';

interface PurchaseInvoiceModalProps {
  dto: PurchaseInvoiceDto;
  setDto: React.Dispatch<React.SetStateAction<PurchaseInvoiceDto>>;
  suppliers: Supplier[];
  products: Product[];
  warehouses: Warehouse[];
  grns: any[];
  openPos: any[];
  onSelectGrn: (grnId: string) => void;
  duplicateCheck: { isDuplicate: boolean; message?: string };
  subtotal: number;
  totalLandedExpenses: number;
  finalTotal: number;
  canCreate: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  operationalFields: OperationalFieldDefinition[];
  operationalFieldValues: Record<string, string>;
  onOperationalFieldValuesChange: (values: Record<string, string>) => void;
}

export const PurchaseInvoiceModal: React.FC<PurchaseInvoiceModalProps> = ({
  dto,
  setDto,
  suppliers,
  products,
  warehouses,
  grns,
  openPos,
  onSelectGrn,
  duplicateCheck,
  subtotal,
  totalLandedExpenses,
  finalTotal,
  canCreate,
  onClose,
  onSubmit,
  operationalFields,
  operationalFieldValues,
  onOperationalFieldValuesChange,
}) => {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900">تسجيل فاتورة توريد / مشتريات جديدة</h3>
            <p className="text-xs text-slate-500">تحميل النقل والمصاريف الإضافية (Landed Cost) والمطابقة مع إذن الاستلام</p>
          </div>
          <button onClick={() => onClose()} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-4 text-xs">
          {/* Linked GRN and PO */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
            <div>
              <label htmlFor="purchase-grn" className="font-bold text-amber-900 block mb-1">ربط بإذن استلام مخزني (GRN)</label>
              <select
                id="purchase-grn"
                value={dto.grnId || ''}
                onChange={(e) => onSelectGrn(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-amber-300 font-bold"
              >
                <option value="">-- إدخال مباشر بدون إذن استلام --</option>
                {grns.map(g => (
                  <option key={g.id} value={g.id}>{g.grnNumber} ({g.supplierName} - {g.date})</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="purchase-po" className="font-bold text-amber-900 block mb-1">أمر الشراء المرتبط (PO)</label>
              <select
                id="purchase-po"
                value={dto.purchaseOrderId || ''}
                onChange={(e) => setDto({ ...dto, purchaseOrderId: e.target.value || undefined })}
                className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-amber-300 font-bold"
              >
                <option value="">-- بدون ربط بأمر شراء --</option>
                {openPos.map(po => (
                  <option key={po.id} value={po.id}>{po.orderNumber} ({po.supplierName})</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="purchase-warehouse" className="font-bold text-amber-900 block mb-1">المخزن المستلم</label>
              <select
                id="purchase-warehouse"
                value={dto.warehouseId}
                onChange={(e) => setDto({ ...dto, warehouseId: e.target.value })}
                required
                className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-amber-300 font-bold"
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Supplier & Invoice Number */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="purchase-supplier" className="font-bold text-slate-700 block mb-1">المورد / الشركة المصنعة *</label>
              <select
                id="purchase-supplier"
                value={dto.supplierId}
                onChange={(e) => setDto({ ...dto, supplierId: e.target.value })}
                required
                className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
              >
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="purchase-supplier-invoice-number" className="font-bold text-slate-700 block mb-1">رقم فاتورة المورد</label>
              <input
                id="purchase-supplier-invoice-number"
                type="text"
                value={dto.supplierInvoiceNumber}
                disabled={dto.isNoNumberSupplier}
                onChange={(e) => setDto({ ...dto, supplierInvoiceNumber: e.target.value })}
                placeholder={dto.isNoNumberSupplier ? 'مورد بدون فواتير رسمية' : 'رقم الفاتورة المطبوعة...'}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-bold ${
                  duplicateCheck.isDuplicate && !dto.isNoNumberSupplier ? 'border-rose-400 bg-rose-50 text-rose-700' : 'bg-slate-50 border-slate-200'
                }`}
              />
              {duplicateCheck.isDuplicate && !dto.isNoNumberSupplier && (
                <span className="text-[10px] text-rose-600 block mt-1 font-bold">{duplicateCheck.message}</span>
              )}
            </div>
            <div className="flex items-center pt-5">
              <label htmlFor="purchase-no-number-supplier" className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                <input
                  id="purchase-no-number-supplier"
                  type="checkbox"
                  checked={dto.isNoNumberSupplier}
                  onChange={(e) => setDto({ ...dto, isNoNumberSupplier: e.target.checked })}
                  className="w-4 h-4 rounded text-orange-600"
                />
                <span>المورد لا يصدر فواتير مرقمة (تجاوز التحقق من التكرار)</span>
              </label>
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100 p-2.5 font-black text-slate-800 flex justify-between items-center">
              <span>أصناف الفاتورة والكميات:</span>
              {canCreate && <button
                type="button"
                onClick={() => {
                  const product = products[0];
                  const quantity = product?.productType === 'GENERAL' ? 1 : 50;
                  const boxes = product?.productType === 'GENERAL'
                    ? product.baseUnit === 'BOX' ? quantity : 0
                    : Number((quantity / (product?.metersPerBox || 1.44)).toFixed(2));
                  setDto({ ...dto, items: [...dto.items, { productId: product?.id || '', quantityM2: quantity, boxesCount: boxes, unitCost: product?.costPrice || 100 }] });
                }}
                className="text-xs text-orange-600 hover:underline font-bold"
              >
                + إضافة صنف آخر
              </button>}
            </div>
            <div className="divide-y divide-slate-100 p-2">
              {dto.items.map((it, idx) => {
                const selectedProduct = products.find((product) => product.id === it.productId);
                return <div key={idx} className="flex gap-2 items-center py-2">
                  <ProductPicker
                    value={it.productId}
                    selectedLabel={selectedProduct?.name}
                    ariaLabel={`استعراض أصناف بند الفاتورة ${idx + 1}`}
                    onChange={(productId, selected) => {
                      const p = products.find(x => x.id === productId) || selected;
                      const items = [...dto.items];
                      items[idx].productId = productId;
                      if (p) {
                        items[idx].unitCost = p.costPrice;
                        items[idx].quantityM2 = p.productType === 'GENERAL' ? 1 : 50;
                        items[idx].boxesCount = p.productType === 'GENERAL'
                          ? p.baseUnit === 'BOX' ? 1 : 0
                          : Number((50 / (p.metersPerBox || 1.44)).toFixed(2));
                      }
                      setDto({ ...dto, items });
                    }}
                    className="flex-1"
                  />
                  <div className="w-24">
                    <input
                      type="number"
                      step="0.01"
                      placeholder={`الكمية ${selectedProduct ? getProductUnitLabel(selectedProduct) : 'م²'}`}
                      value={it.quantityM2}
                      onChange={(e) => {
                        const items = [...dto.items];
                        items[idx].quantityM2 = Number(e.target.value);
                        const product = products.find((candidate) => candidate.id === items[idx].productId);
                        items[idx].boxesCount = product?.productType === 'GENERAL'
                          ? product.baseUnit === 'BOX' ? Number(e.target.value) : 0
                          : Number((Number(e.target.value) / (product?.metersPerBox || 1.44)).toFixed(2));
                        setDto({ ...dto, items });
                      }}
                      className="w-full px-2 py-1.5 border rounded-lg text-center font-bold"
                    />
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      step="0.01"
                      placeholder={`سعر الشراء / ${selectedProduct ? getProductUnitLabel(selectedProduct) : 'وحدة'}`}
                      value={it.unitCost}
                      onChange={(e) => {
                        const items = [...dto.items];
                        items[idx].unitCost = Number(e.target.value);
                        setDto({ ...dto, items });
                      }}
                      className="w-full px-2 py-1.5 border rounded-lg text-center font-bold text-orange-600"
                    />
                  </div>
                  <div className="w-28 text-left font-black text-slate-800">
                    {fmt(it.quantityM2 * it.unitCost)}
                  </div>
                  {canCreate && dto.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDto({ ...dto, items: dto.items.filter((_, i) => i !== idx) })}
                      className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>;
              })}
            </div>
          </div>

          {/* Landed Cost Breakdown Box */}
          <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-indigo-950 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-indigo-600" />
                مصاريف وتكاليف الوصول الإضافية (Landed Cost):
              </h4>
              <div className="flex items-center gap-2">
                <span className="font-bold text-indigo-900">طريقة توزيع التكلفة:</span>
                <select
                  value={dto.landedAllocationMethod}
                  onChange={(e) => setDto({ ...dto, landedAllocationMethod: e.target.value as any })}
                  className="px-2 py-1 bg-white border border-indigo-300 rounded-lg font-bold text-xs"
                >
                  <option value="VALUE">حسب القيمة المالية للبند</option>
                  <option value="QUANTITY">حسب المساحة بالمتر المربع (م²)</option>
                  <option value="WEIGHT">حسب الوزن التقديري للبضاعة</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1  sm:grid-cols-5 gap-2">
              <div>
                <label htmlFor="purchase-landed-freight" className="block text-[11px] text-indigo-900 font-bold mb-0.5">النقل والشحن (ج)</label>
                <input
                  id="purchase-landed-freight"
                  type="number"
                  step="0.01"
                  value={dto.landedFreight || ''}
                  onChange={(e) => setDto({ ...dto, landedFreight: Number(e.target.value) || 0 })}
                  placeholder="0"
                  className="w-full px-2 py-1.5 bg-white border rounded-lg text-center font-bold"
                />
              </div>
              <div>
                <label htmlFor="purchase-landed-loading" className="block text-[11px] text-indigo-900 font-bold mb-0.5">العتالة والتفريغ (ج)</label>
                <input
                  id="purchase-landed-loading"
                  type="number"
                  step="0.01"
                  value={dto.landedLoading || ''}
                  onChange={(e) => setDto({ ...dto, landedLoading: Number(e.target.value) || 0 })}
                  placeholder="0"
                  className="w-full px-2 py-1.5 bg-white border rounded-lg text-center font-bold"
                />
              </div>
              <div>
                <label htmlFor="purchase-landed-customs-taxes" className="block text-[11px] text-indigo-900 font-bold mb-0.5">جمارك ورسوم (ج)</label>
                <input
                  id="purchase-landed-customs-taxes"
                  type="number"
                  step="0.01"
                  value={dto.landedCustomsTaxes || ''}
                  onChange={(e) => setDto({ ...dto, landedCustomsTaxes: Number(e.target.value) || 0 })}
                  placeholder="0"
                  className="w-full px-2 py-1.5 bg-white border rounded-lg text-center font-bold"
                />
              </div>
              <div>
                <label htmlFor="purchase-landed-insurance" className="block text-[11px] text-indigo-900 font-bold mb-0.5">التأمين (ج)</label>
                <input
                  id="purchase-landed-insurance"
                  type="number"
                  step="0.01"
                  value={dto.landedInsurance || ''}
                  onChange={(e) => setDto({ ...dto, landedInsurance: Number(e.target.value) || 0 })}
                  placeholder="0"
                  className="w-full px-2 py-1.5 bg-white border rounded-lg text-center font-bold"
                />
              </div>
              <div>
                <label htmlFor="purchase-landed-other" className="block text-[11px] text-indigo-900 font-bold mb-0.5">أخرى (ج)</label>
                <input
                  id="purchase-landed-other"
                  type="number"
                  step="0.01"
                  value={dto.landedOther || ''}
                  onChange={(e) => setDto({ ...dto, landedOther: Number(e.target.value) || 0 })}
                  placeholder="0"
                  className="w-full px-2 py-1.5 bg-white border rounded-lg text-center font-bold"
                />
              </div>
            </div>

            <div className="flex justify-between items-center text-xs font-bold text-indigo-900 pt-1 border-t border-indigo-200">
              <span>إجمالي مصاريف الوصول المحملة: <strong>{fmt(totalLandedExpenses)}</strong></span>
            </div>
          </div>

          {/* Payment & Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-100 rounded-xl">
            <div>
              <label htmlFor="purchase-discount-amount" className="font-bold text-slate-700 block mb-1">الخصم المكتسب (ج.م)</label>
              <input
                id="purchase-discount-amount"
                type="number"
                value={dto.discountAmount || ''}
                onChange={(e) => setDto({ ...dto, discountAmount: Number(e.target.value) || 0 })}
                placeholder="0"
                className="w-full px-3 py-1.5 bg-white rounded-lg border font-bold"
              />
            </div>
            <div>
              <label htmlFor="purchase-paid-amount" className="font-bold text-slate-700 block mb-1">المبلغ المسدد نقداً فوراً (ج.م)</label>
              <input
                id="purchase-paid-amount"
                type="number"
                value={dto.paidAmount}
                onChange={(e) => setDto({ ...dto, paidAmount: Number(e.target.value) || 0 })}
                className="w-full px-3 py-1.5 bg-white rounded-lg border font-bold text-emerald-700"
              />
            </div>
            <div>
              <label htmlFor="purchase-payment-type" className="font-bold text-slate-700 block mb-1">طريقة السداد</label>
              <select
                id="purchase-payment-type"
                value={dto.paymentType}
                onChange={(e) => setDto({ ...dto, paymentType: e.target.value as PaymentType })}
                className="w-full px-3 py-1.5 bg-white rounded-lg border font-bold"
              >
                <option value="CREDIT">آجل بالكامل (على الحساب)</option>
                <option value="CASH">نقدي كاش (من الخزينة)</option>
                <option value="BANK_TRANSFER">تحويل بنكي / شيك</option>
              </select>
            </div>
          </div>

          {/* Grand Total Summary */}
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between text-xs font-bold">
            <div>
              <span>قيمة البضاعة: {fmt(subtotal)} + تكاليف الوصول: {fmt(totalLandedExpenses)}</span>
              <div className="text-orange-950 text-sm font-black mt-0.5">الإجمالي النهائي للفاتورة: {fmt(finalTotal)}</div>
            </div>
            <OperationalFieldsForm fields={operationalFields} values={operationalFieldValues} onChange={onOperationalFieldValuesChange} title="بيانات إضافية لفاتورة الشراء" />
            <div className="text-left font-black">
              <span className="text-rose-700">المتبقي كدين على المعرض: {fmt(Math.max(0, finalTotal - dto.paidAmount))}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onClose()}
              className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={duplicateCheck.isDuplicate && !dto.isNoNumberSupplier}
              className="px-5 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-black rounded-xl shadow-md shadow-orange-600/20"
            >
              حفظ الفاتورة وتثبيت تكاليف الوصول
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PurchaseInvoiceModal;
