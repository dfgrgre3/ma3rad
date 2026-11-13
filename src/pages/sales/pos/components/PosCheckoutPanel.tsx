import React from 'react';
import {
  Calculator, CheckCircle2, PauseCircle, Percent, RefreshCw, Truck,
  Coins,
} from 'lucide-react';
import type { Customer, PaymentType } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import type { AppliedPromotion } from '../../../../services/domains/sales/PricingService';
import { CentralLimitGuard } from '../../../../components/ui/CentralLimitGuard';
import type { OperationalFieldDefinition } from '../../../../services/domains/products/OperationalFieldService';
import { OperationalFieldsForm } from '../../../../components/products/OperationalFieldsForm';
import { round2 } from '../../../../types/pos';

const paymentLabel = (type: PaymentType) => ({ CASH: 'نقدي', CARD: 'بطاقة', BANK_TRANSFER: 'تحويل بنكي', CHEQUE: 'شيك', CREDIT: 'آجل', MIXED: 'دفع مختلط' }[type]);

const numberInputCls = 'mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold tabular-nums text-slate-900 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export interface PosCheckoutPanelProps {
  cartLength: number;
  cartQuantitySummary: string;
  lineSubtotal: number;
  lineDiscountTotal: number;
  discountAmount: number;
  setDiscountAmount: (value: number) => void;
  discountMode: 'percent' | 'amount';
  onDiscountModeChange: (mode: 'percent' | 'amount') => void;
  discountPercent: number;
  onDiscountPercentChange: (value: number) => void;
  promotionDiscount: number;
  loyaltyDiscount: number;
  extraFees: number;
  setExtraFees: (value: number) => void;
  taxPercentage: number;
  setTaxPercentage: (value: number) => void;
  taxAmount: number;
  shippingCost: number;
  setShippingCost: (value: number) => void;
  paymentType: PaymentType;
  setPaymentType: (type: PaymentType) => void;
  bankAccounts: Array<{ id: string; accountName: string; bankName: string }>;
  bankAccountId: string;
  setBankAccountId: (id: string) => void;
  visiblePaymentTypes: PaymentType[];
  showCouponCode: boolean;
  showLoyaltyPoints: boolean;
  splitCash: number;
  setSplitCash: (value: number) => void;
  splitCard: number;
  setSplitCard: (value: number) => void;
  splitBank: number;
  setSplitBank: (value: number) => void;
  splitCheque: number;
  setSplitCheque: (value: number) => void;
  /** الجزء الآجل (على الحساب) من الدفع المختلط */
  splitCredit: number;
  setSplitCredit: (value: number) => void;
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
  discountMode,
  onDiscountModeChange,
  discountPercent,
  onDiscountPercentChange,
  promotionDiscount,
  loyaltyDiscount,
  extraFees,
  setExtraFees,
  taxPercentage,
  setTaxPercentage,
  taxAmount,
  shippingCost,
  setShippingCost,
  paymentType,
  setPaymentType,
  bankAccounts,
  bankAccountId,
  setBankAccountId,
  visiblePaymentTypes,
  showCouponCode,
  showLoyaltyPoints,
  splitCash,
  setSplitCash,
  splitCard,
  setSplitCard,
  splitBank,
  setSplitBank,
  splitCheque,
  setSplitCheque,
  splitCredit,
  setSplitCredit,
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
  <div className="flex min-h-0 flex-[1.25_1_0%] max-h-[58%] flex-col overflow-hidden border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 max-[900px]:max-h-[68%]">
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
    {/* Order extras */}
    <section aria-label="تعديلات الفاتورة" className="space-y-1.5 [container-type:inline-size]">
    <div className="text-xs font-black text-slate-700 dark:text-slate-200">تعديلات الفاتورة</div>
    <div className="grid grid-cols-2 gap-2 text-xs [@container(min-width:40rem)]:grid-cols-4">
      <div className="min-w-0">
        <label htmlFor="pos-invoice-discount" className="flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300"><Percent className="w-3 h-3 shrink-0" /> خصم الفاتورة</label>
        <div role="group" aria-label="نوع الخصم" className="mt-1 flex w-full items-center overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => onDiscountModeChange('percent')}
              aria-pressed={discountMode === 'percent'}
              title="خصم بنسبة مئوية"
              className={`min-h-8 min-w-0 flex-1 px-2 py-1 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${discountMode === 'percent' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-300'}`}
            >%</button>
            <button
              type="button"
              onClick={() => onDiscountModeChange('amount')}
              aria-pressed={discountMode === 'amount'}
              title="خصم بمبلغ ثابت"
              className={`min-h-8 min-w-0 flex-1 px-2 py-1 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${discountMode === 'amount' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-300'}`}
            >ج.م</button>
        </div>
        {discountMode === 'percent' ? (
          <div className="relative">
            <input
              id="pos-invoice-discount"
              type="number"
              min={0}
              max={100}
              value={discountPercent || ''}
              placeholder="0"
              onChange={(e) => onDiscountPercentChange(e.target.value === '' ? 0 : Math.min(100, Math.max(0, Number.parseFloat(e.target.value) || 0)))}
              className={`${numberInputCls} pl-6`}
            />
            <span className="absolute left-2 top-1/2 -translate-y-1/2 mt-0.5 text-xs font-bold text-slate-500 dark:text-slate-400">%</span>
          </div>
        ) : (
          <input
            id="pos-invoice-discount"
            type="number"
            min={0}
            value={discountAmount || ''}
            placeholder="0"
            onChange={(e) => setDiscountAmount(e.target.value === '' ? 0 : Math.max(0, Number.parseFloat(e.target.value) || 0))}
            className={numberInputCls}
          />
        )}
        {discountMode === 'percent' && discountPercent > 0 && discountAmount > 0 && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">= {CeramicMath.formatCurrency(discountAmount)}</p>
        )}
      </div>
      <div>
        <label htmlFor="pos-tax-percentage" className="flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300"><Percent className="w-3 h-3" /> ضريبة %</label>
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
        <label htmlFor="pos-shipping-cost" className="flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300"><Truck className="w-3 h-3" /> نقل / شحن</label>
        <input
          id="pos-shipping-cost"
          type="number"
          min={0}
          value={shippingCost || ''}
          placeholder="0"
          onChange={(e) => setShippingCost(e.target.value === '' ? 0 : Math.max(0, Number.parseFloat(e.target.value) || 0))}
          className={numberInputCls}
        />
      </div>
      <div>
        <label htmlFor="pos-extra-fees" className="flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300"><Coins className="w-3 h-3" /> مصاريف إضافية</label>
        <input
          id="pos-extra-fees"
          type="number"
          min={0}
          value={extraFees || ''}
          placeholder="0"
          onChange={(e) => setExtraFees(e.target.value === '' ? 0 : Math.max(0, Number.parseFloat(e.target.value) || 0))}
          className={numberInputCls}
        />
      </div>
    </div>
    </section>
    <OperationalFieldsForm fields={operationalFields} values={operationalFieldValues} onChange={onOperationalFieldValuesChange} title="بيانات إضافية للفاتورة" />

    {/* Payment type */}
    <section className="space-y-1.5 rounded-xl border-r-4 border-r-sky-600 border-y border-l border-slate-200 bg-sky-50/70 p-2 dark:border-slate-800 dark:border-r-sky-500 dark:bg-sky-950/30">
      <p className="text-xs font-black text-slate-800 dark:text-slate-100">طريقة السداد</p>
      <div role="group" aria-label="طريقة السداد" className="grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-3 xl:grid-cols-6">
        {visiblePaymentTypes
          .map((type) => {
          const active = paymentType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setPaymentType(type)}
              aria-pressed={active}
              title={paymentLabel(type)}
              className={`min-h-10 rounded-lg border px-2 py-2 text-xs font-bold transition flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 ${
                active
                  ? 'border-sky-700 bg-sky-700 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-sky-400 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'
              }`}
            >
              {paymentLabel(type)}
            </button>
          );
        })}
      </div>
      {(paymentType === 'BANK_TRANSFER' || (paymentType === 'MIXED' && splitBank > 0)) && (
        <div>
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">الحساب البنكي المستلم *</label>
          <select required value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)} className={numberInputCls}>
            <option value="">اختر الحساب البنكي</option>
            {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountName} — {account.bankName}</option>)}
          </select>
          {bankAccounts.length === 0 && <p className="mt-1 text-xs text-rose-600">لا توجد حسابات بنكية متاحة؛ اختر وسيلة دفع أخرى.</p>}
        </div>
      )}
    </section>

    {paymentType === 'MIXED' && (
      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-white p-2 text-xs dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-3">
        <div>
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">نقداً</label>
          <input type="number" min="0" step="0.01" value={splitCash || ''} onChange={(e) => setSplitCash(Number.parseFloat(e.target.value) || 0)} className={numberInputCls} />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">بطاقة</label>
          <input type="number" min="0" step="0.01" value={splitCard || ''} onChange={(e) => setSplitCard(Number.parseFloat(e.target.value) || 0)} className={numberInputCls} />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">تحويل بنكي</label>
          <input type="number" min="0" step="0.01" value={splitBank || ''} onChange={(e) => setSplitBank(Number.parseFloat(e.target.value) || 0)} className={numberInputCls} />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">شيك</label>
          <input type="number" min="0" step="0.01" value={splitCheque || ''} onChange={(e) => setSplitCheque(Number.parseFloat(e.target.value) || 0)} className={numberInputCls} />
        </div>
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between gap-1">
            <label htmlFor="pos-split-credit" className="text-xs font-bold text-slate-600 dark:text-slate-300">آجل (على الحساب)</label>
            <button
              type="button"
              onClick={() => setSplitCredit(round2(Math.max(0, totalAmount - (splitCash + splitCard + splitBank + splitCheque))))}
              title="تعبئة المتبقي على حساب العميل"
              className="text-xs font-bold text-sky-700 transition hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
            >
              تعبئة المتبقي
            </button>
          </div>
          <input id="pos-split-credit" type="number" min="0" step="0.01" value={splitCredit || ''} onChange={(e) => setSplitCredit(Number.parseFloat(e.target.value) || 0)} className={numberInputCls} />
        </div>
        <div className="col-span-2 sm:col-span-3 space-y-0.5">
          <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2 flex-wrap">
            <span>مجموع الدفع: <strong className="tabular-nums">{CeramicMath.formatCurrency(round2(splitCash + splitCard + splitBank + splitCheque + splitCredit))}</strong> / الإجمالي: <strong className="tabular-nums">{CeramicMath.formatCurrency(totalAmount)}</strong></span>
            {Math.abs(round2(splitCash + splitCard + splitBank + splitCheque + splitCredit) - totalAmount) > 0.01 ? (
              <span className="text-rose-600 font-bold">يجب أن يساوي إجمالي الفاتورة — لا يمكن اعتماد الفاتورة</span>
            ) : (
              <span className="text-emerald-600 font-bold">✓ مطابق للإجمالي</span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">يُسجَّل الجزء المسدد فوراً، ويُضاف الجزء الآجل إلى رصيد العميل.</p>
        </div>
      </div>
    )}

    {/* Coupon code */}
    {showCouponCode && (
      <div className="flex items-center gap-2 border-b border-slate-100 pb-1.5 dark:border-slate-800">
        <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="رمز القسيمة" aria-label="رمز القسيمة" className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
        {appliedPromotion && <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">✓ {appliedPromotion.name} (-{appliedPromotion.discountAmount})</span>}
      </div>
    )}

    {/* Loyalty redeem */}
    {showLoyaltyPoints && selectedCustomer && canRedeemPoints && (
      <div className="flex items-center gap-2 border-b border-slate-100 pb-1.5 dark:border-slate-800">
        <input type="number" min={0} step={1} value={redeemPoints || ''} onChange={(e) => setRedeemPoints(Number.parseFloat(e.target.value) || 0)} placeholder="عدد نقاط الولاء" aria-label="عدد نقاط الولاء" className="min-h-10 w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
        <button type="button" onClick={onRedeemPoints} className="min-h-10 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">تطبيق النقاط</button>
        {redeemPoints > 0 && <span className="text-xs text-slate-600 dark:text-slate-400">تُخصم عند حفظ الفاتورة</span>}
      </div>
    )}

    {/* Paid amount */}
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900">
      <label htmlFor="pos-paid-amount" className="text-xs font-bold text-slate-700 dark:text-slate-200">
        {paymentType === 'MIXED' ? 'المبلغ المدفوع (يُحتسب من أطر الدفع):' : 'المبلغ المدفوع (F4):'}
      </label>
      <input
        id="pos-paid-amount"
        ref={paidInputRef}
        type="number"
        value={paidAmount}
        disabled={paymentType === 'MIXED'}
        onChange={(e) => setPaidAmount(e.target.value === '' ? 0 : Number.parseFloat(e.target.value))}
        aria-label="المبلغ المدفوع"
        className="min-h-10 w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-black tabular-nums text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800"
      />
    </div>

    {/* Totals — مرتبة حسب الأهمية: من الإجمالي الفرعي إلى الإجمالي النهائي */}
    <section aria-label="ملخص الفاتورة" className="space-y-1.5 rounded-lg border-r-2 border-r-slate-300 bg-slate-50 p-2 text-xs dark:border-r-slate-600 dark:bg-slate-900/70">
      <div className="flex justify-between text-slate-500">
        <span>إجمالي المنتجات ({cartLength} صنف{cartQuantitySummary ? ` / ${cartQuantitySummary}` : ''})</span>
        <span>{CeramicMath.formatCurrency(lineSubtotal)}</span>
      </div>
      {lineDiscountTotal > 0 && (
        <div className="flex justify-between text-rose-600">
          <span>خصم المنتجات</span>
          <span>-{CeramicMath.formatCurrency(lineDiscountTotal)}</span>
        </div>
      )}
      <div className="flex justify-between text-slate-600 font-bold">
        <span>المجموع قبل الخصم</span>
        <span>{CeramicMath.formatCurrency(round2(lineSubtotal - lineDiscountTotal))}</span>
      </div>
      {promotionDiscount > 0 && (
        <div className="flex justify-between text-rose-600">
          <span>خصم العروض والكوبون</span>
          <span>-{CeramicMath.formatCurrency(promotionDiscount)}</span>
        </div>
      )}
      {discountAmount > 0 && (
        <div className="flex justify-between text-rose-600">
          <span>خصم الفاتورة{discountMode === 'percent' && discountPercent > 0 ? ` (${discountPercent}%)` : ''}</span>
          <span>-{CeramicMath.formatCurrency(discountAmount)}</span>
        </div>
      )}
      {loyaltyDiscount > 0 && (
        <div className="flex justify-between text-amber-600">
          <span>خصم نقاط الولاء</span>
          <span>-{CeramicMath.formatCurrency(loyaltyDiscount)}</span>
        </div>
      )}
      {taxAmount > 0 && (
        <div className="flex justify-between text-slate-500">
          <span>الضرائب ({taxPercentage}%)</span>
          <span>+{CeramicMath.formatCurrency(taxAmount)}</span>
        </div>
      )}
      {shippingCost > 0 && (
        <div className="flex justify-between text-slate-500">
          <span>النقل والشحن</span>
          <span>+{CeramicMath.formatCurrency(shippingCost)}</span>
        </div>
      )}
      {extraFees > 0 && (
        <div className="flex justify-between text-slate-500">
          <span>مصاريف إضافية</span>
          <span>+{CeramicMath.formatCurrency(extraFees)}</span>
        </div>
      )}
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
    </section>

    {/* Notes */}
    <label htmlFor="pos-notes" className="sr-only">ملاحظات الفاتورة</label>
    <input
      id="pos-notes"
      type="text"
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      placeholder="ملاحظات على الفاتورة (اختياري)..."
      aria-label="ملاحظات الفاتورة"
      className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    />

    {/* Actions */}
    <div className="grid grid-cols-2 gap-1.5">
      <button
        onClick={onHoldOrder}
        disabled={cartLength === 0}
        className="flex min-h-8 items-center justify-center gap-1 rounded-lg bg-slate-100 px-1.5 py-1 text-[11px] font-bold text-slate-800 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
      >
        <PauseCircle className="h-3.5 w-3.5" /> تعليق
      </button>
      <button
        onClick={onClearOrder}
        disabled={cartLength === 0}
        className="flex min-h-8 items-center justify-center gap-1 rounded-lg bg-slate-100 px-1.5 py-1 text-[11px] font-bold text-slate-800 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
      >
        <RefreshCw className="h-3.5 w-3.5" /> إفراغ
      </button>
      {hasCeramicCatalog && (
        <button
          onClick={onOpenCalculator}
          className="min-h-10 rounded-lg bg-slate-100 px-2 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          <Calculator className="w-4 h-4" /> مقايسة
        </button>
      )}
    </div>

    </div>

    <div className="sticky bottom-0 z-10 shrink-0 space-y-1 border-t border-slate-200 bg-white px-2 pb-2 pt-1.5 shadow-[0_-8px_18px_rgba(15,23,42,0.10)] dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-black text-slate-700 dark:text-slate-200">الإجمالي النهائي</span>
        <span className="text-left text-xl font-black tabular-nums text-sky-800 dark:text-sky-300">{CeramicMath.formatCurrency(totalAmount)} <span className="text-xs font-bold">ج.م</span></span>
      </div>
      {remainingAmount > 0 && <div className="text-xs font-bold text-amber-700 dark:text-amber-400">المتبقي (على الحساب): {CeramicMath.formatCurrency(remainingAmount)}</div>}
      {changeDue > 0 && <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">الباقي للعميل: {CeramicMath.formatCurrency(changeDue)}</div>}
      <CentralLimitGuard
      metric="maxInvoices"
      fallback={
        <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-[11px] font-bold text-amber-800">
          <span className="text-xs">تم بلوغ الحد الشهري المسموح من الفواتير في الترخيص؛ راجع الإدارة المركزية لرفع الحد.</span>
        </div>
      }
    >
      <button
        onClick={onCheckout}
        disabled={isProcessing || cartLength === 0}
        className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-black text-white transition hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
      >
        <CheckCircle2 className="h-4 w-4" />
        <span>{isProcessing ? 'جاري الحفظ والخصم من المخزن...' : 'اعتماد وحفظ الفاتورة (F9)'}</span>
      </button>
      </CentralLimitGuard>
    </div>
  </div>
);
