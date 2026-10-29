import React from 'react';
import { ShoppingCart, RefreshCw, PauseCircle, Percent, Truck, Banknote, CreditCard, CheckCircle2 } from 'lucide-react';
import type { PaymentType } from '../../../types';
import { CeramicMath } from '../../../utils/ceramicMath';

interface PosPaymentSectionProps {
  cartLength: number;
  cartQuantitySummary: string;
  lineSubtotal: number;
  lineDiscountTotal: number;
  discountAmount: number;
  taxPercentage: number;
  taxAmount: number;
  shippingCost: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  changeDue: number;
  paymentType: PaymentType;
  isProcessing: boolean;
  notes: string;
  paidInputRef: React.RefObject<HTMLInputElement>;
  onDiscountChange: (v: number) => void;
  onTaxChange: (v: number) => void;
  onShippingChange: (v: number) => void;
  onPaymentTypeChange: (t: PaymentType) => void;
  onPaidAmountChange: (v: number) => void;
  onNotesChange: (v: string) => void;
  onClearCart: () => void;
  onHoldOrder: () => void;
  onCheckout: () => void;
}

const PAYMENT_LABELS: Record<PaymentType, string> = {
  CASH: 'نقدي',
  CARD: 'شبكة / بطاقة',
  BANK_TRANSFER: 'تحويل بنكي',
  CHEQUE: 'شيك',
  CREDIT: 'آجل',
  MIXED: 'سداد مختلط',
};

export const PosPaymentSection: React.FC<PosPaymentSectionProps> = ({
  cartLength, cartQuantitySummary, lineSubtotal, lineDiscountTotal, discountAmount,
  taxPercentage, taxAmount, shippingCost, totalAmount, paidAmount, remainingAmount,
  changeDue, paymentType, isProcessing, notes, paidInputRef,
  onDiscountChange, onTaxChange, onShippingChange, onPaymentTypeChange,
  onPaidAmountChange, onNotesChange, onClearCart, onHoldOrder, onCheckout,
}) => (
  <div className="p-3 border-t border-slate-200 bg-white space-y-3 max-h-[58%] overflow-y-auto shadow-[0_-8px_24px_rgba(15,23,42,0.04)] max-[900px]:max-h-[65%]">
    <div className="grid grid-cols-3 gap-2 text-xs">
      <div>
        <label htmlFor="pos-invoice-discount" className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
          <Percent className="w-3 h-3" /> خصم الفاتورة
        </label>
        <input
          id="pos-invoice-discount"
          type="number"
          value={discountAmount || ''}
          placeholder="0"
          onChange={(e) => onDiscountChange(e.target.value === '' ? 0 : Math.max(0, Number.parseFloat(e.target.value) || 0))}
          className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 mt-0.5"
        />
      </div>
      <div>
        <label htmlFor="pos-tax-percentage" className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
          <Percent className="w-3 h-3" /> ضريبة %
        </label>
        <input
          id="pos-tax-percentage"
          type="number"
          value={taxPercentage || ''}
          placeholder="0"
          onChange={(e) => onTaxChange(e.target.value === '' ? 0 : Math.max(0, Number.parseFloat(e.target.value) || 0))}
          className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 mt-0.5"
        />
      </div>
      <div>
        <label htmlFor="pos-shipping-cost" className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
          <Truck className="w-3 h-3" /> مشال / نقل
        </label>
        <input
          id="pos-shipping-cost"
          type="number"
          value={shippingCost || ''}
          placeholder="0"
          onChange={(e) => onShippingChange(e.target.value === '' ? 0 : Math.max(0, Number.parseFloat(e.target.value) || 0))}
          className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 mt-0.5"
        />
      </div>
    </div>

    <div>
      <p className="text-[10px] font-bold text-slate-500 block mb-1">طريقة السداد</p>
      <div role="group" aria-label="طريقة السداد" className="grid grid-cols-3 gap-1">
        {(['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT', 'MIXED'] as PaymentType[]).map((type) => {
          const Icon = type === 'CASH' ? Banknote : CreditCard;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onPaymentTypeChange(type)}
              className={`py-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                paymentType === type
                  ? 'bg-sky-600 text-white'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {PAYMENT_LABELS[type]}
            </button>
          );
        })}
      </div>
    </div>

    <div className="flex items-center justify-between">
      <label htmlFor="pos-paid-amount" className="text-xs font-bold text-slate-500">المبلغ المدفوع (F4):</label>
      <input
        id="pos-paid-amount"
        ref={paidInputRef}
        type="number"
        value={paidAmount}
        onChange={(e) => onPaidAmountChange(e.target.value === '' ? 0 : Number.parseFloat(e.target.value))}
        aria-label="المبلغ المدفوع"
        className="w-32 text-left font-black px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-sky-500"
      />
    </div>

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
        <span className="text-base font-black text-sky-600">{CeramicMath.formatCurrency(totalAmount)}</span>
      </div>
      {remainingAmount > 0 && (
        <div className="flex justify-between text-amber-600 font-bold">
          <span>المتبقي (آجل)</span>
          <span>{CeramicMath.formatCurrency(remainingAmount)}</span>
        </div>
      )}
      {changeDue > 0 && (
        <div className="flex justify-between text-emerald-600 font-bold">
          <span>الباقي للعميل</span>
          <span>{CeramicMath.formatCurrency(changeDue)}</span>
        </div>
      )}
    </div>

    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={onClearCart}
        disabled={cartLength === 0}
        className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
      >
        <RefreshCw className="w-3.5 h-3.5" /> مسح السلة
      </button>
      <button
        onClick={onHoldOrder}
        disabled={cartLength === 0}
        className="py-2.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 text-amber-600 border border-amber-500/30 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
      >
        <PauseCircle className="w-3.5 h-3.5" /> تعليق الطلب (F7)
      </button>
    </div>

    <button
      onClick={onCheckout}
      disabled={cartLength === 0 || isProcessing}
      className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-40 text-white rounded-xl font-black text-sm shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2"
    >
      <CheckCircle2 className="w-4 h-4" />
      {isProcessing ? 'جاري الحفظ...' : 'إتمام البيع وطباعة الفاتورة (F9)'}
    </button>
  </div>
);
