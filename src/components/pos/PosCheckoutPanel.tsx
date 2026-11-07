import React from 'react';
import {
  Banknote, Calculator, CheckCircle2, CreditCard, PauseCircle, Percent, RefreshCw, Truck,
} from 'lucide-react';
import type { Customer, PaymentType } from '../../types';
import { CeramicMath } from '../../utils/ceramicMath';
import type { AppliedPromotion } from '../../services/PricingService';
import { CentralLimitGuard } from '../ui/CentralLimitGuard';
import type { OperationalFieldDefinition } from '../../services/OperationalFieldService';
import { OperationalFieldsForm } from '../OperationalFieldsForm';

const paymentLabel = (type: PaymentType) => ({ CASH: 'نقدي', CARD: 'بطاقة', BANK_TRANSFER: 'تحويل بنكي', CHEQUE: 'شيك', CREDIT: 'آجل', MIXED: 'دفع مختلط' }[type]);

const numberInputCls = 'w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 mt-0.5';

export interface PosCheckoutPanelProps {
  cartLength: number;
  cartQuantitySummary: string;
  lineSubtotal: number;
  lineDiscountTotal: number;
  discountAmount: number;
  setDiscountAmount: (value: number) => void;
  taxPercentage: number;
  setTaxPercentage: (value: number) => void;
  taxAmount: number;
  shippingCost: number;
  setShippingCost: (value: number) => void;
  paymentType: PaymentType;
  setPaymentType: (type: PaymentType) => void;
  showCashButton?: boolean;
  splitCash: number;
  setSplitCash: (value: number) => void;
  splitCard: number;
  setSplitCard: (value: number) => void;
  splitBank: number;
  setSplitBank: (value: number) => void;
  splitCheque: number;
  setSplitCheque: (value: number) => void;
  couponCode: string;
  setCouponCode: (value: string) => void;
  appliedPromotion: AppliedPromotion | null;
  selectedCustomer: Customer | null;
  canRedeemPoints: boolean;
  redeemPoints: number;
  setRedeemPoints: (value: number) => void;
  onRedeemPoints: () => void;
  paidAmount: number;
  setPaidAmount: (value: number) => void;
  paidInputRef: React.RefObject<HTMLInputElement>;
  totalAmount: number;
  remainingAmount: number;
  changeDue: number;
  notes: string;
  setNotes: (value: string) => void;
  hasCeramicCatalog: boolean;
  isProcessing: boolean;
  onHoldOrder: () => void;
  onClearOrder: () => void;
  onOpenCalculator: () => void;
  onCheckout: () => void;
  operationalFields: OperationalFieldDefinition[];
  operationalFieldValues: Record<string, string>;
  onOperationalFieldValuesChange: (values: Record<string, string>) => void;
}

export const PosCheckoutPanel: React.FC<PosCheckoutPanelProps> = ({
  cartLength,
  cartQuantitySummary,
  lineSubtotal,
  lineDiscountTotal,
  discountAmount,
  setDiscountAmount,
  taxPercentage,
  setTaxPercentage,
  taxAmount,
  shippingCost,
  setShippingCost,
  paymentType,
  setPaymentType,
  showCashButton = true,
  splitCash,
  setSplitCash,
  splitCard,
  setSplitCard,
  splitBank,
  setSplitBank,
  splitCheque,
  setSplitCheque,
  couponCode,
  setCouponCode,
  appliedPromotion,
  selectedCustomer,
  canRedeemPoints,
  redeemPoints,
  setRedeemPoints,
  onRedeemPoints,
  paidAmount,
  setPaidAmount,
  paidInputRef,
  totalAmount,
  remainingAmount,
  changeDue,
  notes,
  setNotes,
  hasCeramicCatalog,
  isProcessing,
  onHoldOrder,
  onClearOrder,
  onOpenCalculator,
  onCheckout,
  operationalFields,
  operationalFieldValues,
  onOperationalFieldValuesChange,
}) => (
  <div className="p-3 border-t border-slate-200 bg-white space-y-3 max-h-[58%] overflow-y-auto shadow-[0_-8px_24px_rgba(15,23,42,0.04)] max-[900px]:max-h-[65%]">
    {/* Order extras */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
      <div>
        <label htmlFor="pos-invoice-discount" className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Percent className="w-3 h-3" /> خصم الفاتورة</label>
        <input
          id="pos-invoice-discount"
          type="number"
          value={discountAmount || ''}
          placeholder="0"
          onChange={(e) => setDiscountAmount(e.target.value === '' ? 0 : Math.max(0, Number.parseFloat(e.target.value) || 0))}
          className={numberInputCls}
        />
        <OperationalFieldsForm fields={operationalFields} values={operationalFieldValues} onChange={onOperationalFieldValuesChange} title="بيانات إضافية للفاتورة" />
      </div>
      <div>
        <label htmlFor="pos-tax-percentage" className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Percent className="w-3 h-3" /> ضريبة %</label>
        <input
          id="pos-tax-percentage"
          type="number"
          value={taxPercentage || ''}
          placeholder="0"
          onChange={(e) => setTaxPercentage(e.target.value === '' ? 0 : Math.max(0, Number.parseFloat(e.target.value) || 0))}
          className={numberInputCls}
        />
      </div>
      <div>
        <label htmlFor="pos-shipping-cost" className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Truck className="w-3 h-3" /> مشال / نقل</label>
        <input
          id="pos-shipping-cost"
          type="number"
          value={shippingCost || ''}
          placeholder="0"
          onChange={(e) => setShippingCost(e.target.value === '' ? 0 : Math.max(0, Number.parseFloat(e.target.value) || 0))}
          className={numberInputCls}
        />
      </div>
    </div>

    {/* Payment type */}
    <div>
      <p className="text-[10px] font-bold text-slate-500 block mb-1">طريقة السداد</p>
      <div role="group" aria-label="طريقة السداد" className="grid grid-cols-1 sm:grid-cols-3 gap-1">
        {(['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT', 'MIXED'] as PaymentType[])
          .filter((type) => showCashButton || type !== 'CASH')
          .map((type) => {
          const Icon = type === 'CASH' ? Banknote : CreditCard;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setPaymentType(type)}
              className={`py-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                paymentType === type
                  ? 'bg-sky-600 text-white'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {paymentLabel(type)}
            </button>
          );
        })}
      </div>
    </div>

    {paymentType === 'MIXED' && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div>
          <label className="text-[10px] font-bold text-slate-500">نقداً</label>
          <input type="number" min="0" step="0.01" value={splitCash || ''} onChange={(e) => setSplitCash(Number.parseFloat(e.target.value) || 0)} className={numberInputCls} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500">بطاقة</label>
          <input type="number" min="0" step="0.01" value={splitCard || ''} onChange={(e) => setSplitCard(Number.parseFloat(e.target.value) || 0)} className={numberInputCls} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500">تحويل بنكي</label>
          <input type="number" min="0" step="0.01" value={splitBank || ''} onChange={(e) => setSplitBank(Number.parseFloat(e.target.value) || 0)} className={numberInputCls} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500">شيك</label>
          <input type="number" min="0" step="0.01" value={splitCheque || ''} onChange={(e) => setSplitCheque(Number.parseFloat(e.target.value) || 0)} className={numberInputCls} />
        </div>
        <div className="col-span-2 text-[10px] text-slate-500">
          مجموع الدفع: {CeramicMath.formatCurrency(splitCash + splitCard + splitBank + splitCheque)}
          {Math.abs((splitCash + splitCard + splitBank + splitCheque) - paidAmount) > 0.001 && (
            <span className="text-rose-600 font-bold"> — يجب أن يساوي المبلغ المدفوع {CeramicMath.formatCurrency(paidAmount)}</span>
          )}
        </div>
      </div>
    )}

    {/* Coupon code */}
    <div className="flex items-center gap-2">
      <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="رمز القسيمة" className="flex-1 px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs text-slate-900" />
      {appliedPromotion && <span className="text-[10px] font-bold text-emerald-600">✓ {appliedPromotion.name} (-{appliedPromotion.discountAmount})</span>}
    </div>

    {/* Loyalty redeem */}
    {selectedCustomer && canRedeemPoints && (
      <div className="flex items-center gap-2">
        <input type="number" min={0} step={1} value={redeemPoints || ''} onChange={(e) => setRedeemPoints(Number.parseFloat(e.target.value) || 0)} placeholder="عدد نقاط الولاء" aria-label="عدد نقاط الولاء" className="w-32 px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs text-slate-900" />
        <button type="button" onClick={onRedeemPoints} className="px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold">تطبيق النقاط</button>
        {redeemPoints > 0 && <span className="text-[10px] text-slate-500">تُخصم عند حفظ الفاتورة</span>}
      </div>
    )}

    {/* Paid amount */}
    <div className="flex items-center justify-between">
      <label htmlFor="pos-paid-amount" className="text-xs font-bold text-slate-500">المبلغ المدفوع (F4):</label>
      <input
        id="pos-paid-amount"
        ref={paidInputRef}
        type="number"
        value={paidAmount}
        onChange={(e) => setPaidAmount(e.target.value === '' ? 0 : Number.parseFloat(e.target.value))}
        aria-label="المبلغ المدفوع"
        className="w-32 text-left font-black px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-sky-500"
      />
    </div>

    {/* Totals */}
    <div className="bg-sky-500/10 p-3 rounded-xl border border-sky-500/20 space-y-1.5 text-xs">
      <div className="flex justify-between text-slate-500">
        <span>إجمالي البنود ({cartLength} صنف{cartQuantitySummary ? ` / ${cartQuantitySummary}` : ''})</span>
        <span>{CeramicMath.formatCurrency(lineSubtotal)}</span>
      </div>
      {lineDiscountTotal > 0 && (
        <div className="flex justify-between text-rose-600">
          <span>خصومات البنود</span>
          <span>-{CeramicMath.formatCurrency(lineDiscountTotal)}</span>
        </div>
      )}
      {discountAmount > 0 && (
        <div className="flex justify-between text-rose-600">
          <span>خصم الفاتورة</span>
          <span>-{CeramicMath.formatCurrency(discountAmount)}</span>
        </div>
      )}
      {taxAmount > 0 && (
        <div className="flex justify-between text-slate-500">
          <span>ضريبة ({taxPercentage}%)</span>
          <span>+{CeramicMath.formatCurrency(taxAmount)}</span>
        </div>
      )}
      {shippingCost > 0 && (
        <div className="flex justify-between text-slate-500">
          <span>مشال ونقل</span>
          <span>+{CeramicMath.formatCurrency(shippingCost)}</span>
        </div>
      )}
      <div className="flex justify-between items-center pt-2 border-t border-sky-500/20">
        <span className="font-bold text-slate-700">صافي الفاتورة</span>
        <span className="text-sky-700 font-black text-xl">{CeramicMath.formatCurrency(totalAmount)} <span className="text-[10px] font-bold">ج.م</span></span>
      </div>
      {remainingAmount > 0 && (
        <div className="flex justify-between font-bold text-amber-600">
          <span>المتبقي (على الحساب)</span>
          <span>{CeramicMath.formatCurrency(remainingAmount)}</span>
        </div>
      )}
      {changeDue > 0 && (
        <div className="flex justify-between font-bold text-emerald-600">
          <span>الباقي للعميل</span>
          <span>{CeramicMath.formatCurrency(changeDue)}</span>
        </div>
      )}
    </div>

    {/* Notes */}
    <label htmlFor="pos-notes" className="sr-only">ملاحظات الفاتورة</label>
    <input
      id="pos-notes"
      type="text"
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      placeholder="ملاحظات على الفاتورة (اختياري)..."
      aria-label="ملاحظات الفاتورة"
      className="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
    />

    {/* Actions */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <button
        onClick={onHoldOrder}
        disabled={cartLength === 0}
        className="py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
      >
        <PauseCircle className="w-4 h-4" /> تعليق
      </button>
      <button
        onClick={onClearOrder}
        disabled={cartLength === 0}
        className="py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
      >
        <RefreshCw className="w-4 h-4" /> إفراغ
      </button>
      {hasCeramicCatalog && (
        <button
          onClick={onOpenCalculator}
          className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
        >
          <Calculator className="w-4 h-4" /> مقايسة
        </button>
      )}
    </div>

    <CentralLimitGuard
      metric="maxInvoices"
      fallback={
        <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-[11px] font-bold text-amber-800">
          تم بلوغ الحد الشهري المسموح من الفواتير في الترخيص؛ راجع الإدارة المركزية لرفع الحد.
        </div>
      }
    >
      <button
        onClick={onCheckout}
        disabled={isProcessing || cartLength === 0}
        className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition active:scale-[0.99]"
      >
        <CheckCircle2 className="w-5 h-5" />
        <span>{isProcessing ? 'جاري الحفظ والخصم من المخزن...' : 'اعتماد وحفظ الفاتورة (F9)'}</span>
      </button>
    </CentralLimitGuard>
  </div>
);
