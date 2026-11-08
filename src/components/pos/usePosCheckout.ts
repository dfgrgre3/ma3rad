import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { BatchService } from '../../services/BatchService';
import { AppConfigService } from '../../services/AppConfigService';
import { ApprovalService } from '../../services/ApprovalService';
import type { CashierService } from '../../services/CashierService';
import type { LoyaltyService } from '../../services/LoyaltyService';
import type { PricingService, AppliedPromotion } from '../../services/PricingService';
import type { SalesService } from '../../services/SalesService';
import type { CashShift, Customer, PaymentType, SystemSettings, ToneMixingConflict } from '../../types';
import { formatProductQuantity } from '../../utils/productUnits';
import { pricePerUnit } from '../../utils/uom';
import { round2, type CartItem, type Toast } from './types';

interface UsePosCheckoutOptions {
  can: (permission: string) => boolean;
  notify: (message: string, type?: Toast['type']) => void;
  cart: CartItem[];
  setCart: Dispatch<SetStateAction<CartItem[]>>;
  selectedCustomer: Customer | null;
  selectedWarehouseId: string;
  activeShift: CashShift | null;
  settings: SystemSettings | null;
  stockOf: (productId: string) => number;
  discountAmount: number;
  setDiscountAmount: Dispatch<SetStateAction<number>>;
  promotionDiscount: number;
  setPromotionDiscount: Dispatch<SetStateAction<number>>;
  loyaltyDiscount: number;
  setLoyaltyDiscount: Dispatch<SetStateAction<number>>;
  appliedPromotion: AppliedPromotion | null;
  setAppliedPromotion: Dispatch<SetStateAction<AppliedPromotion | null>>;
  couponCode: string;
  setCouponCode: Dispatch<SetStateAction<string>>;
  redeemPoints: number;
  setRedeemPoints: Dispatch<SetStateAction<number>>;
  taxPercentage: number;
  taxAmount: number;
  shippingCost: number;
  /** Extra fees (رسوم إضافية). Recorded on the invoice inside shippingCost. */
  extraFees?: number;
  /** Invoice-discount percentage (for display/storage on the sale record). */
  discountPercentage?: number;
  setShippingCost: Dispatch<SetStateAction<number>>;
  paidAmount: number;
  setPaidAmount: Dispatch<SetStateAction<number>>;
  paymentType: PaymentType;
  splitCash: number;
  splitCard: number;
  splitBank: number;
  splitCheque: number;
  /** الجزء الآجل من الدفع المختلط — يُسجَّل كرصيد على العميل وليس كدفعة */
  splitCredit: number;
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
  remainingAmount: number;
  lineSubtotal: number;
  lineDiscountTotal: number;
  setSuccessInvoice: Dispatch<SetStateAction<any>>;
  setActiveShift: Dispatch<SetStateAction<CashShift | null>>;
  setToneConflicts: Dispatch<SetStateAction<ToneMixingConflict[]>>;
  setIsToneWarningOpen: Dispatch<SetStateAction<boolean>>;
  salesService: SalesService;
  cashierService: CashierService;
  batchService: BatchService;
  loyaltyService: LoyaltyService;
  pricingService: PricingService;
  performedBy: string;
  loadStock: (warehouseId: string) => void;
  onInvoiceCreated: (invoiceId: string) => void;
  validateInvoiceFields: () => void;
}

export const usePosCheckout = ({
  can,
  notify,
  cart,
  setCart,
  selectedCustomer,
  selectedWarehouseId,
  activeShift,
  settings,
  stockOf,
  discountAmount,
  setDiscountAmount,
  promotionDiscount,
  setPromotionDiscount,
  loyaltyDiscount,
  setLoyaltyDiscount,
  appliedPromotion,
  setAppliedPromotion,
  couponCode,
  setCouponCode,
  redeemPoints,
  setRedeemPoints,
  taxPercentage,
  taxAmount,
  shippingCost,
  extraFees = 0,
  discountPercentage = 0,
  setShippingCost,
  paidAmount,
  setPaidAmount,
  paymentType,
  splitCash,
  splitCard,
  splitBank,
  splitCheque,
  splitCredit,
  notes,
  setNotes,
  remainingAmount,
  lineSubtotal,
  lineDiscountTotal,
  setSuccessInvoice,
  setActiveShift,
  setToneConflicts,
  setIsToneWarningOpen,
  salesService,
  cashierService,
  batchService,
  loyaltyService,
  pricingService,
  performedBy,
  loadStock,
  onInvoiceCreated,
  validateInvoiceFields,
}: UsePosCheckoutOptions) => {
  const [isProcessing, setIsProcessing] = useState(false);
  // قفل متزامن داخل الذاكرة: يمنع فاتورة مكررة عند الضغط المزدوج أو F9 في اللحظة نفسها
  // (isProcessing وحده لا يكفي لأن تحديث الحالة لا يتم فورياً).
  const inFlightRef = useRef(false);

  const validateCartAndPermissions = useCallback(() => {
    if (!Number.isFinite(discountAmount) || discountAmount < 0
      || !Number.isFinite(shippingCost) || shippingCost < 0
      || !Number.isFinite(extraFees) || extraFees < 0
      || !Number.isFinite(taxPercentage) || taxPercentage < 0
      || !Number.isFinite(paidAmount) || paidAmount < 0) {
      notify('تحقق من أن الخصم والضريبة والشحن والمصاريف الإضافية والمدفوع أرقام صحيحة غير سالبة', 'error');
      return false;
    }
    const invalidItem = cart.find((item) => !Number.isFinite(item.quantityM2) || item.quantityM2 <= 0
      || !Number.isFinite(item.unitPrice) || item.unitPrice < 0
      || !Number.isFinite(item.discountAmount) || item.discountAmount < 0
      || item.discountAmount > item.quantityM2 * item.unitPrice);
    if (invalidItem) {
      notify(`تحقق من الكمية والسعر والخصم للصنف «${invalidItem.product.name}»`, 'error');
      return false;
    }
    if (cart.length === 0) {
      notify('السلة فارغة، أضف أصنافاً أولاً', 'error');
      return false;
    }
    if (!selectedCustomer) {
      notify('يرجى اختيار العميل', 'error');
      return false;
    }
    if (!selectedWarehouseId) {
      notify('يرجى اختيار المخزن', 'error');
      return false;
    }
    if (!can('sales.create')) {
      notify('لا تملك صلاحية إنشاء فاتورة بيع', 'error');
      return false;
    }
    if (remainingAmount > 0 && !can('sales.credit')) {
      notify('لا تملك صلاحية البيع الآجل أو ترك مبلغ متبقٍ', 'error');
      return false;
    }
    if (paymentType === 'MIXED') {
      const paidPart = round2(splitCash + splitCard + splitBank + splitCheque);
      const splitSum = round2(paidPart + splitCredit);
      const expectedTotal = round2(paidAmount + remainingAmount);
      if (splitSum <= 0) {
        notify('أدخل مبالغ الدفع المختلط أولاً', 'error');
        return false;
      }
      if (Math.abs(splitSum - expectedTotal) > 0.01) {
        notify(`مجموع طرق الدفع المختلط (${splitSum.toFixed(2)}) يجب أن يساوي إجمالي الفاتورة (${expectedTotal.toFixed(2)}) — الفرق ${round2(Math.abs(splitSum - expectedTotal)).toFixed(2)}`, 'error');
        return false;
      }
      if (splitCredit > 0 && !can('sales.credit')) {
        notify('لا تملك صلاحية البيع الآجل (الجزء الآجل من الدفع المختلط)', 'error');
        return false;
      }
    }
    return true;
  }, [cart, discountAmount, shippingCost, extraFees, taxPercentage, paidAmount, paymentType, splitCash, splitCard, splitBank, splitCheque, splitCredit, selectedCustomer, selectedWarehouseId, can, remainingAmount, notify]);

  const validateStockAvailability = useCallback(() => {
    if (settings?.enableNegativeStock ?? false) return true;
    const plannedByProduct = new Map<string, number>();
    for (const item of cart) {
      const available = stockOf(item.product.id);
      const planned = round2((plannedByProduct.get(item.product.id) || 0) + item.quantityM2);
      plannedByProduct.set(item.product.id, planned);
      if (planned > available) {
        notify(
          `الرصيد المتاح من «${item.product.name}» ${formatProductQuantity(available, item.product)} فقط، وإجمالي المطلوب ${formatProductQuantity(planned, item.product)}`,
          'error'
        );
        return false;
      }
    }
    return true;
  }, [cart, settings, stockOf, notify]);

  const validateMinimumPrices = useCallback(() => {
    for (const item of cart) {
      const min = item.product.minSellingPriceM2 || 0;
      if (min > 0 && item.unitPrice < min && !can('sales.approve')) {
        notify(`سعر «${item.product.name}» أقل من الحد الأدنى المسموح (${min}). يلزم اعتماد المسؤول`, 'error');
        return false;
      }
    }
    return true;
  }, [cart, can, notify]);

  const validateDiscount = useCallback(() => {
    const totalDiscount = round2(discountAmount + promotionDiscount + loyaltyDiscount + lineDiscountTotal);
    const approvalDiscount = round2(discountAmount + lineDiscountTotal);
    if (totalDiscount > lineSubtotal) {
      notify('إجمالي الخصومات لا يمكن أن يتجاوز قيمة الأصناف', 'error');
      return false;
    }
    if (totalDiscount > 0 && !can('sales.discount')) {
      notify('غير مصرح لك بمنح خصم على الفاتورة', 'error');
      return false;
    }
    if (approvalDiscount > 0) {
      const discountPercent = lineSubtotal > 0 ? (approvalDiscount / lineSubtotal) * 100 : 0;
      const configuredThreshold = settings?.discountApprovalThresholdPercent ?? 10;
      const threshold = AppConfigService.getPolicyNumber('sales.discountApprovalThreshold', configuredThreshold);
      if (discountPercent > threshold && !can('sales.approve')) {
        try {
          const request = new ApprovalService().createRequest({
            requestType: 'DISCOUNT',
            title: `اعتماد خصم ${discountPercent.toFixed(1)}% على فاتورة بيع`,
            description: `العميل: ${selectedCustomer?.name ?? ''} — قيمة الخصم ${approvalDiscount} ج.م من إجمالي ${lineSubtotal} ج.م (الحد المسموح ${threshold}%).`,
            requestedValue: approvalDiscount,
            currentValue: lineSubtotal,
            priority: 'HIGH',
            referenceType: 'POS',
          });
          notify(`الخصم يتجاوز الحد المسموح (${threshold}%). تم إرسال طلب اعتماد رقم ${request.requestNumber}`, 'warning');
        } catch (error: any) {
          notify(error?.message || 'الخصم يتجاوز الحد المسموح ويلزم اعتماد المسؤول', 'error');
        }
        return false;
      }
    }
    return true;
  }, [discountAmount, promotionDiscount, loyaltyDiscount, lineDiscountTotal, can, lineSubtotal, settings, selectedCustomer, notify]);

  const validateCreditLimit = useCallback(() => {
    if (selectedCustomer && remainingAmount > 0 && selectedCustomer.creditLimit > 0) {
      const projected = round2((selectedCustomer.currentBalance || 0) + remainingAmount);
      if (projected > selectedCustomer.creditLimit) {
        notify(
          `تجاوز حد الائتمان للعميل. الرصيد الحالي ${selectedCustomer.currentBalance} + الآجل ${remainingAmount} > الحد ${selectedCustomer.creditLimit}`,
          'error'
        );
        return false;
      }
    }
    return true;
  }, [remainingAmount, selectedCustomer, notify]);

  const validateLoyaltyRedemption = useCallback(() => {
    if (redeemPoints === 0 && loyaltyDiscount === 0) return true;
    if (!selectedCustomer || !Number.isInteger(redeemPoints) || redeemPoints <= 0
      || round2(loyaltyDiscount) !== round2(redeemPoints)) {
      notify('تحقق من تطبيق عدد صحيح من نقاط الولاء على العميل المحدد', 'error');
      return false;
    }
    try {
      const availablePoints = loyaltyService.getRedeemablePointBalance(selectedCustomer.id);
      if (availablePoints < redeemPoints) {
        notify(`رصيد الولاء غير كافٍ: المتاح ${availablePoints} نقطة`, 'error');
        return false;
      }
      return true;
    } catch (error: any) {
      notify(error?.message || 'تعذر التحقق من رصيد نقاط الولاء', 'error');
      return false;
    }
  }, [redeemPoints, loyaltyDiscount, selectedCustomer, loyaltyService, notify]);

  const confirmActiveShift = useCallback(() => {
    if (!activeShift) {
      const proceed = window.confirm(
        'لا توجد وردية كاشير مفتوحة. سيتم تسجيل الفاتورة بدون ربطها بوردية. هل تريد المتابعة؟'
      );
      if (!proceed) return false;
    }
    return true;
  }, [activeShift]);

  const validateCheckoutDetails = useCallback(() => (
    validateCartAndPermissions()
      && validateStockAvailability()
      && validateMinimumPrices()
      && validateDiscount()
      && validateCreditLimit()
      && validateLoyaltyRedemption()
      && confirmActiveShift()
  ), [
    validateCartAndPermissions, validateStockAvailability, validateMinimumPrices,
    validateDiscount, validateCreditLimit, validateLoyaltyRedemption, confirmActiveShift,
  ]);

  const showToneMixingWarning = useCallback(() => {
    const checkItems = cart
      .filter((item) => item.product.productType !== 'GENERAL')
      .map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        warehouseId: selectedWarehouseId,
        quantityM2: item.quantityM2,
      }));
    if (checkItems.length === 0) return false;
    const conflicts = batchService.checkToneMixing(checkItems);
    if (conflicts.length === 0) return false;
    setToneConflicts(conflicts);
    setIsToneWarningOpen(true);
    return true;
  }, [cart, selectedWarehouseId, batchService, setToneConflicts, setIsToneWarningOpen]);

  const handleCheckout = useCallback((skipToneCheck = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (isProcessing || !validateCheckoutDetails() || !selectedCustomer) {
      inFlightRef.current = false;
      return;
    }
    try {
      setIsProcessing(true);
      if (!skipToneCheck && showToneMixingWarning()) {
        setIsProcessing(false);
        return;
      }
      validateInvoiceFields();
      const invoice = salesService.createSale({
        customerId: selectedCustomer.id,
        warehouseId: selectedWarehouseId,
        shiftId: activeShift?.id,
        items: cart.map((item) => ({
          productId: item.product.id,
          soldBy: item.soldBy,
          uom: item.soldBy,
          quantity: item.soldQuantity,
          quantityM2: item.quantityM2,
          boxesCount: item.boxesCount,
          piecesCount: item.piecesCount,
          unitPrice: round2(pricePerUnit(item.unitPrice, item.soldBy, item.product)),
          unitCost: item.product.costPrice,
          discountAmount: item.discountAmount
        })),
        discountAmount: round2(discountAmount + promotionDiscount + loyaltyDiscount),
        discountPercentage: round2(discountPercentage),
        taxPercentage,
        taxAmount,
        shippingCost: round2(shippingCost + (extraFees || 0)),
        paidAmount,
        paymentType,
        payments: paymentType === 'MIXED' ? ([
          { method: 'CASH', amount: splitCash },
          { method: 'CARD', amount: splitCard },
          { method: 'BANK_TRANSFER', amount: splitBank },
          { method: 'CHEQUE', amount: splitCheque },
        ].filter((payment) => payment.amount > 0) as { method: PaymentType; amount: number }[]) : undefined,
        notes,
        performedBy
      });
      onInvoiceCreated(invoice.id);

      setSuccessInvoice(invoice);
      let loyaltyRedemptionError: string | null = null;
      if (redeemPoints > 0) {
        try {
          loyaltyService.redeemPoints({
            customerId: selectedCustomer.id,
            points: redeemPoints,
            referenceType: 'SALES_INVOICE',
            referenceId: invoice.id,
            description: `استبدال نقاط مقابل فاتورة ${invoice.invoiceNumber}`,
          });
        } catch (error: any) {
          loyaltyRedemptionError = error?.message || 'خطأ غير معروف';
        }
      }
      if (appliedPromotion) {
        try {
          pricingService.recordPromotionUsage(appliedPromotion.promotionId, invoice.id, couponCode || undefined, appliedPromotion.discountAmount);
        } catch {
          // Promotion tracking is supplementary to the completed sale.
        }
      }
      if (selectedCustomer.id) {
        try {
          const points = Math.floor((invoice.totalAmount || 0) / 10);
          if (points > 0) {
            loyaltyService.earnPoints({
              customerId: selectedCustomer.id,
              points,
              referenceType: 'SALES_INVOICE',
              referenceId: invoice.id,
              description: `نقاط من فاتورة ${invoice.invoiceNumber}`
            });
          }
        } catch {
          // Loyalty tracking is supplementary to the completed sale.
        }
      }
      setCart([]);
      setDiscountAmount(0);
      setPromotionDiscount(0);
      setLoyaltyDiscount(0);
      setAppliedPromotion(null);
      setCouponCode('');
      setRedeemPoints(0);
      setShippingCost(0);
      setNotes('');
      setPaidAmount(0);
      // جدول المنتجات لم يتغير — نُعيد تحميل الأرصدة من المخزن فقط (تحديث البيانات المتأثرة فقط)
      if (selectedWarehouseId) loadStock(selectedWarehouseId);
      setActiveShift(cashierService.getActiveShift());
      notify(
        loyaltyRedemptionError
          ? `تم إصدار الفاتورة ${invoice.invoiceNumber}، لكن تعذر خصم نقاط الولاء: ${loyaltyRedemptionError}`
          : `تم إصدار الفاتورة ${invoice.invoiceNumber} بنجاح`,
        loyaltyRedemptionError ? 'warning' : 'success'
      );
    } catch (error: any) {
      notify(error.message || 'خطأ أثناء حفظ الفاتورة', 'error');
    } finally {
      inFlightRef.current = false;
      setIsProcessing(false);
    }
  }, [
    isProcessing, validateCheckoutDetails, selectedCustomer, showToneMixingWarning,
    salesService, selectedWarehouseId, activeShift, cart, discountAmount,
    promotionDiscount, loyaltyDiscount, taxPercentage, taxAmount, shippingCost, extraFees, discountPercentage,
    paidAmount, paymentType, splitCash, splitCard, splitBank, splitCheque, notes,
    redeemPoints,
    performedBy, appliedPromotion, pricingService, couponCode, loyaltyService,
    setCart, setDiscountAmount, setPromotionDiscount, setLoyaltyDiscount,
    setAppliedPromotion, setCouponCode, setRedeemPoints, setShippingCost,
    setNotes, setPaidAmount, setSuccessInvoice,
    loadStock, setActiveShift, cashierService, notify, onInvoiceCreated, validateInvoiceFields,
  ]);

  return { isProcessing, setIsProcessing, handleCheckout };
};
