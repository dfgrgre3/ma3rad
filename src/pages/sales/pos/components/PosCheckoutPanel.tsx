import React from 'react';
import {
  Calculator, CheckCircle2, PauseCircle, Percent, RefreshCw, Truck,
  Coins,
} from 'lucide-react';
import type { Customer, PaymentType } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import type { AppliedPromotion } from '../../../../services/domains/sales/PricingService';
import { CentralLimitGuard } from '../../../../components/ui/CentralLimitGuard';
import { round2 } from '../../../../types/pos';
import { usePosActivityCopy } from '../../../../hooks/pages/sales/pos/usePosActivityCopy';
import { ActivityGate } from '../../../../components/ui/ActivityGate';

const paymentLabel = (type: PaymentType) => ({ CASH: 'نقدي', CARD: 'بطاقة', BANK_TRANSFER: 'تحويل بنكي', CHEQUE: 'شيك', CREDIT: 'آجل', MIXED: 'دفع مختلط' }[type]);

const numberInputCls = 'mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-bold tabular-nums text-ink transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ';

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
  salesReps?: Array<{ id: string; name: string; isSalesRep?: boolean; branchNames?: string; servesBranch?: boolean }>;
  salesRepId?: string;
  onSalesRepChange?: (id: string) => void;
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
  salesReps,
  salesRepId,
  onSalesRepChange,
}) => {
  const copy = usePosActivityCopy();
  return (
  <div className="flex min-h-0 flex-[1.25_1_0%] max-h-[58%] flex-col overflow-hidden border-t border-line bg-surface max-[900px]:max-h-[68%]">
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
    {/* Order extras */}
    <section aria-label={copy.adjustmentsTitle} className="space-y-1.5 [container-type:inline-size]">
    <div className="text-xs font-black text-ink ">{copy.adjustmentsTitle}</div>
    <div className="grid grid-cols-2 gap-2 text-xs [@container(min-width:40rem)]:grid-cols-4">
      <ActivityGate element="discount">
      <div className="min-w-0">
        <label htmlFor="pos-invoice-discount" className="flex items-center gap-1 text-xs font-bold text-ink-secondary "><Percent className="w-3 h-3 shrink-0" /> {copy.invoiceDiscountLabel}</label>
        <div role="group" aria-label="نوع الخصم" className="mt-1 flex w-full items-center overflow-hidden rounded-lg border border-line ">
            <button
              type="button"
              onClick={() => onDiscountModeChange('percent')}
              aria-pressed={discountMode === 'percent'}
              title="خصم بنسبة مئوية"
              className={`min-h-8 min-w-0 flex-1 px-2 py-1 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${discountMode === 'percent' ? 'bg-primary text-white' : 'bg-surface text-ink-secondary hover:text-ink dark:bg-primary dark:text-muted'}`}
            >%</button>
            <button
              type="button"
              onClick={() => onDiscountModeChange('amount')}
              aria-pressed={discountMode === 'amount'}
              title="خصم بمبلغ ثابت"
              className={`min-h-8 min-w-0 flex-1 px-2 py-1 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${discountMode === 'amount' ? 'bg-primary text-white' : 'bg-surface text-ink-secondary hover:text-ink dark:bg-primary dark:text-muted'}`}
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
            <span className="absolute left-2 top-1/2 -translate-y-1/2 mt-0.5 text-xs font-bold text-muted ">%</span>
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
          <p className="mt-0.5 text-xs text-muted ">= {CeramicMath.formatCurrency(discountAmount)}</p>
        )}
        {discountMode === 'percent' && (
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="نسب خصم سريعة">
            {[5, 10, 15, 25].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onDiscountPercentChange(preset)}
                aria-pressed={discountPercent === preset}
                className={`min-h-7 rounded-md border px-2 text-[11px] font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${discountPercent === preset ? 'border-primary bg-primary text-white' : 'border-line bg-surface text-ink-secondary hover:border-primary hover:text-primary dark:border-line-strong dark:text-muted'}`}
              >
                {preset}%
              </button>
            ))}
          </div>
        )}
      </div>
      </ActivityGate>
      <div>
        <label htmlFor="pos-tax-percentage" className="flex items-center gap-1 text-xs font-bold text-ink-secondary "><Percent className="w-3 h-3" /> ضريبة %</label>
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
        <label htmlFor="pos-shipping-cost" className="flex items-center gap-1 text-xs font-bold text-ink-secondary "><Truck className="w-3 h-3" /> {copy.shippingLabel}</label>
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
        <label htmlFor="pos-extra-fees" className="flex items-center gap-1 text-xs font-bold text-ink-secondary "><Coins className="w-3 h-3" /> {copy.extraFeesLabel}</label>
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

    {/* Payment type */}
    <section className="space-y-1.5 rounded-xl border-r-4 border-primary border-y border-l border-line bg-accent-soft/70 p-2 dark:bg-primary/30">
      <p className="text-xs font-black text-ink ">{copy.paymentTitle}</p>
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
              className={`min-h-10 rounded-lg border px-2 py-2 text-xs font-bold transition flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
 active
 ? 'border-primary bg-primary text-white'
 : 'border-line bg-surface text-ink hover:border-primary hover:text-primary '
 }`}
            >
              {paymentLabel(type)}
            </button>
          );
        })}
      </div>
      {(paymentType === 'BANK_TRANSFER' || (paymentType === 'MIXED' && splitBank > 0)) && (
        <div>
          <label className="text-xs font-bold text-ink-secondary ">الحساب البنكي المستلم *</label>
          <select required value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)} className={numberInputCls}>
            <option value="">اختر الحساب البنكي</option>
            {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountName} — {account.bankName}</option>)}
          </select>
          {bankAccounts.length === 0 && <p className="mt-1 text-xs text-danger">لا توجد حسابات بنكية متاحة؛ اختر وسيلة دفع أخرى.</p>}
        </div>
      )}
    </section>

    {paymentType === 'MIXED' && (
      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-surface p-2 text-xs sm:grid-cols-3">
        <div>
          <label className="text-xs font-bold text-ink-secondary ">نقداً</label>
          <input type="number" min="0" step="0.01" value={splitCash || ''} onChange={(e) => setSplitCash(Number.parseFloat(e.target.value) || 0)} className={numberInputCls} />
        </div>
        <div>
          <label className="text-xs font-bold text-ink-secondary ">بطاقة</label>
          <input type="number" min="0" step="0.01" value={splitCard || ''} onChange={(e) => setSplitCard(Number.parseFloat(e.target.value) || 0)} className={numberInputCls} />
        </div>
        <div>
          <label className="text-xs font-bold text-ink-secondary ">تحويل بنكي</label>
          <input type="number" min="0" step="0.01" value={splitBank || ''} onChange={(e) => setSplitBank(Number.parseFloat(e.target.value) || 0)} className={numberInputCls} />
        </div>
        <div>
          <label className="text-xs font-bold text-ink-secondary ">شيك</label>
          <input type="number" min="0" step="0.01" value={splitCheque || ''} onChange={(e) => setSplitCheque(Number.parseFloat(e.target.value) || 0)} className={numberInputCls} />
        </div>
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between gap-1">
            <label htmlFor="pos-split-credit" className="text-xs font-bold text-ink-secondary ">آجل (على الحساب)</label>
            <button
              type="button"
              onClick={() => setSplitCredit(round2(Math.max(0, totalAmount - (splitCash + splitCard + splitBank + splitCheque))))}
              title="تعبئة المتبقي على حساب العميل"
              className="text-xs font-bold text-primary transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:text-primary"
            >
              تعبئة المتبقي
            </button>
          </div>
          <input id="pos-split-credit" type="number" min="0" step="0.01" value={splitCredit || ''} onChange={(e) => setSplitCredit(Number.parseFloat(e.target.value) || 0)} className={numberInputCls} />
        </div>
        <div className="col-span-2 sm:col-span-3 space-y-0.5">
          <div className="text-xs text-ink-secondary flex items-center justify-between gap-2 flex-wrap">
            <span>مجموع الدفع: <strong className="tabular-nums">{CeramicMath.formatCurrency(round2(splitCash + splitCard + splitBank + splitCheque + splitCredit))}</strong> / الإجمالي: <strong className="tabular-nums">{CeramicMath.formatCurrency(totalAmount)}</strong></span>
            {Math.abs(round2(splitCash + splitCard + splitBank + splitCheque + splitCredit) - totalAmount) > 0.01 ? (
              <span className="text-danger font-bold">يجب أن يساوي إجمالي الفاتورة — لا يمكن اعتماد الفاتورة</span>
            ) : (
              <span className="text-success font-bold">✓ مطابق للإجمالي</span>
            )}
          </div>
          <p className="text-xs text-muted ">يُسجَّل الجزء المسدد فوراً، ويُضاف الجزء الآجل إلى رصيد العميل.</p>
        </div>
      </div>
    )}

    {/* Coupon code */}
    {showCouponCode && (
      <ActivityGate element="promotions">
      <div className="flex items-center gap-2 border-b border-line pb-1.5 ">
        <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="رمز القسيمة" aria-label="رمز القسيمة" className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 " />
        {appliedPromotion && <span className="text-xs font-bold text-success ">✓ {appliedPromotion.name} (-{appliedPromotion.discountAmount})</span>}
      </div>
      </ActivityGate>
    )}

    {/* Loyalty redeem */}
    {showLoyaltyPoints && selectedCustomer && canRedeemPoints && (
      <ActivityGate element="loyalty">
      <div className="flex items-center gap-2 border-b border-line pb-1.5 ">
        <input type="number" min={0} step={1} value={redeemPoints || ''} onChange={(e) => setRedeemPoints(Number.parseFloat(e.target.value) || 0)} placeholder="عدد نقاط الولاء" aria-label="عدد نقاط الولاء" className="min-h-10 w-32 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 " />
        <button type="button" onClick={onRedeemPoints} className="min-h-10 rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-xs font-bold text-warning hover:bg-warning-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning">تطبيق النقاط</button>
        {redeemPoints > 0 && <span className="text-xs text-ink-secondary ">تُخصم عند حفظ الفاتورة</span>}
      </div>
      </ActivityGate>
    )}

    {/* Paid amount */}
    <div className="space-y-1">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-2.5 py-1.5 ">
      <label htmlFor="pos-paid-amount" className="text-xs font-bold text-ink ">
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
        className="min-h-10 w-32 rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm font-black tabular-nums text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-surface-sunken disabled:text-muted dark:disabled:bg-primary"
      />
    </div>
    {paymentType === 'CASH' && (
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="مبالغ دفع سريعة">
        <button
          type="button"
          onClick={() => setPaidAmount(round2(totalAmount))}
          className="min-h-7 rounded-md border border-line bg-surface px-2 text-[11px] font-black text-ink-secondary transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary "
        >
          بالضبط
        </button>
        {[50, 100, 200, 500]
          .map((step) => Math.ceil(totalAmount / step) * step)
          .filter((value, index, all) => value > totalAmount && all.indexOf(value) === index)
          .slice(0, 4)
          .map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => setPaidAmount(round2(amount))}
              className="min-h-7 rounded-md border border-success-border bg-success-soft px-2 text-[11px] font-black tabular-nums text-success transition hover:bg-success-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success dark:bg-success/40 "
            >
              {amount}
            </button>
          ))}
      </div>
    )}
    </div>

    {/* Totals — مرتبة حسب الأهمية: من الإجمالي الفرعي إلى الإجمالي النهائي */}
    <section aria-label="ملخص الفاتورة" className="space-y-1.5 rounded-lg border-r-2 border-line-strong bg-surface-muted p-2 text-xs dark:bg-primary/70">
      <div className="flex justify-between text-muted">
        <span>إجمالي المنتجات ({cartLength} صنف{cartQuantitySummary ? ` / ${cartQuantitySummary}` : ''})</span>
        <span>{CeramicMath.formatCurrency(lineSubtotal)}</span>
      </div>
      {lineDiscountTotal > 0 && (
        <div className="flex justify-between text-danger">
          <span>خصم المنتجات</span>
          <span>-{CeramicMath.formatCurrency(lineDiscountTotal)}</span>
        </div>
      )}
      <div className="flex justify-between text-ink-secondary font-bold">
        <span>المجموع قبل الخصم</span>
        <span>{CeramicMath.formatCurrency(round2(lineSubtotal - lineDiscountTotal))}</span>
      </div>
      {promotionDiscount > 0 && (
        <div className="flex justify-between text-danger">
          <span>خصم العروض والكوبون</span>
          <span>-{CeramicMath.formatCurrency(promotionDiscount)}</span>
        </div>
      )}
      {discountAmount > 0 && (
        <div className="flex justify-between text-danger">
          <span>{copy.invoiceDiscountLabel}{discountMode === 'percent' && discountPercent > 0 ? ` (${discountPercent}%)` : ''}</span>
          <span>-{CeramicMath.formatCurrency(discountAmount)}</span>
        </div>
      )}
      {loyaltyDiscount > 0 && (
        <div className="flex justify-between text-warning">
          <span>خصم نقاط الولاء</span>
          <span>-{CeramicMath.formatCurrency(loyaltyDiscount)}</span>
        </div>
      )}
      {taxAmount > 0 && (
        <div className="flex justify-between text-muted">
          <span>الضرائب ({taxPercentage}%)</span>
          <span>+{CeramicMath.formatCurrency(taxAmount)}</span>
        </div>
      )}
      {shippingCost > 0 && (
        <div className="flex justify-between text-muted">
          <span>{copy.shippingTotalLabel}</span>
          <span>+{CeramicMath.formatCurrency(shippingCost)}</span>
        </div>
      )}
      {extraFees > 0 && (
        <div className="flex justify-between text-muted">
          <span>{copy.extraFeesLabel}</span>
          <span>+{CeramicMath.formatCurrency(extraFees)}</span>
        </div>
      )}
      {remainingAmount > 0 && (
        <div className="flex justify-between font-bold text-warning">
          <span>المتبقي (على الحساب)</span>
          <span>{CeramicMath.formatCurrency(remainingAmount)}</span>
        </div>
      )}
      {changeDue > 0 && (
        <div className="flex justify-between font-bold text-success">
          <span>الباقي للعميل</span>
          <span>{CeramicMath.formatCurrency(changeDue)}</span>
        </div>
      )}
    </section>

    {/* Sales rep */}
    {salesReps && salesReps.length > 0 && onSalesRepChange && (
      <ActivityGate element="sales-rep">
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold text-muted">المندوب</span>
        <select
          value={salesRepId || ''}
          onChange={(e) => onSalesRepChange(e.target.value)}
          className="min-h-10 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-bold text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 "
        >
          <option value="">— بدون —</option>
          {salesReps.map((rep) => (
            <option key={rep.id} value={rep.id}>
              {rep.name}{rep.isSalesRep ? ' · مندوب' : ''}{rep.servesBranch === false ? ` — خارج نطاق الفرع: ${rep.branchNames || ''}` : ''}
            </option>
          ))}
        </select>
      </label>
      </ActivityGate>
    )}

    {/* Notes */}
    <label htmlFor="pos-notes" className="sr-only">{copy.notesAriaLabel}</label>
    <input
      id="pos-notes"
      type="text"
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      placeholder={copy.notesPlaceholder}
      aria-label={copy.notesAriaLabel}
      className="min-h-10 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 "
    />

    {/* Actions */}
    <div className="grid grid-cols-2 gap-1.5">
      <ActivityGate element="hold">
      <button
        onClick={onHoldOrder}
        disabled={cartLength === 0}
        className="flex min-h-8 items-center justify-center gap-1 rounded-lg bg-surface-sunken px-1.5 py-1 text-[11px] font-bold text-ink transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 dark:hover:bg-primary"
      >
        <PauseCircle className="h-3.5 w-3.5" /> {copy.holdLabel}
      </button>
      </ActivityGate>
      <button
        onClick={onClearOrder}
        disabled={cartLength === 0}
        className="flex min-h-8 items-center justify-center gap-1 rounded-lg bg-surface-sunken px-1.5 py-1 text-[11px] font-bold text-ink transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 dark:hover:bg-primary"
      >
        <RefreshCw className="h-3.5 w-3.5" /> إفراغ
      </button>
      {hasCeramicCatalog && (
        <button
          onClick={onOpenCalculator}
          className="min-h-10 rounded-lg bg-surface-sunken px-2 py-2 text-xs font-bold text-ink transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-primary"
        >
          <Calculator className="w-4 h-4" /> {copy.calculatorLabel}
        </button>
      )}
    </div>

    </div>

    <div className="sticky bottom-0 z-10 shrink-0 space-y-1 border-t border-line bg-surface px-2 pb-2 pt-1.5 shadow-[0_-8px_18px_rgba(15,23,42,0.10)] ">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-black text-ink ">الإجمالي النهائي</span>
        <span className="text-left text-xl font-black tabular-nums text-primary ">{CeramicMath.formatCurrency(totalAmount)} <span className="text-xs font-bold">ج.م</span></span>
      </div>
      {remainingAmount > 0 && <div className="text-xs font-bold text-warning ">المتبقي (على الحساب): {CeramicMath.formatCurrency(remainingAmount)}</div>}
      {changeDue > 0 && <div className="text-xs font-bold text-success ">الباقي للعميل: {CeramicMath.formatCurrency(changeDue)}</div>}
      <CentralLimitGuard
      metric="maxInvoices"
      fallback={
        <div className="w-full rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-center text-[11px] font-bold text-warning">
          <span className="text-xs">تم بلوغ الحد الشهري المسموح من الفواتير في الترخيص؛ راجع الإدارة المركزية لرفع الحد.</span>
        </div>
      }
    >
      <button
        onClick={onCheckout}
        disabled={isProcessing || cartLength === 0}
        className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-success px-2.5 py-1.5 text-xs font-black text-white transition hover:bg-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-success"
      >
        <CheckCircle2 className="h-4 w-4" />
        <span>{isProcessing ? copy.checkoutBusyLabel : copy.checkoutLabel}</span>
      </button>
      </CentralLimitGuard>
    </div>
  </div>
  );
};
