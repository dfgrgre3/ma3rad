import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { BatchService } from '../../services/BatchService';
import { AppConfigService } from '../../services/AppConfigService';
import { ApprovalService } from '../../services/ApprovalService';
import type { CashierService } from '../../services/CashierService';
import type { LoyaltyService } from '../../services/LoyaltyService';
import type { PricingService, AppliedPromotion } from '../../services/PricingService';
import type { ProductService } from '../../services/ProductService';
import type { SalesService } from '../../services/SalesService';
import type { CashShift, Customer, PaymentType, Product, SystemSettings, ToneMixingConflict } from '../../types';
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
  setRedeemPoints: Dispatch<SetStateAction<number>>;
  taxPercentage: number;
  taxAmount: number;
  shippingCost: number;
  setShippingCost: Dispatch<SetStateAction<number>>;
  paidAmount: number;
  setPaidAmount: Dispatch<SetStateAction<number>>;
  paymentType: PaymentType;
  splitCash: number;
  splitCard: number;
  splitBank: number;
  splitCheque: number;
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
  remainingAmount: number;
  lineSubtotal: number;
  lineDiscountTotal: number;
  setSuccessInvoice: Dispatch<SetStateAction<any>>;
  setProducts: Dispatch<SetStateAction<Product[]>>;
  setActiveShift: Dispatch<SetStateAction<CashShift | null>>;
  setToneConflicts: Dispatch<SetStateAction<ToneMixingConflict[]>>;
  setIsToneWarningOpen: Dispatch<SetStateAction<boolean>>;
  salesService: SalesService;
  productService: ProductService;
  cashierService: CashierService;
  batchService: BatchService;
  loyaltyService: LoyaltyService;
  pricingService: PricingService;
  performedBy: string;
  loadStock: (warehouseId: string) => void;
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
  setRedeemPoints,
  taxPercentage,
  taxAmount,
  shippingCost,
  setShippingCost,
  paidAmount,
  setPaidAmount,
  paymentType,
  splitCash,
  splitCard,
  splitBank,
  splitCheque,
  notes,
  setNotes,
  remainingAmount,
  lineSubtotal,
  lineDiscountTotal,
  setSuccessInvoice,
  setProducts,
  setActiveShift,
  setToneConflicts,
  setIsToneWarningOpen,
  salesService,
  productService,
  cashierService,
  batchService,
  loyaltyService,
  pricingService,
  performedBy,
  loadStock,
}: UsePosCheckoutOptions) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const validateCartAndPermissions = useCallback(() => {
    if (!Number.isFinite(discountAmount) || discountAmount < 0
      || !Number.isFinite(shippingCost) || shippingCost < 0
      || !Number.isFinite(taxPercentage) || taxPercentage < 0
      || !Number.isFinite(paidAmount) || paidAmount < 0) {
      notify('تحقق من أن الخصم والضريبة والشحن والمدفوع أرقام صحيحة غير سالبة', 'error');
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
    return true;
  }, [cart, discountAmount, shippingCost, taxPercentage, paidAmount, selectedCustomer, selectedWarehouseId, can, remainingAmount, notify]);

  const validateStockAvailability = useCallback(() => {
    if (settings?.enableNegativeStock ?? false) return true;
    for (const item of cart) {
      const available = stockOf(item.product.id);
      if (item.quantityM2 > available) {
        notify(
          `الرصيد المتاح من «${item.product.name}» ${formatProductQuantity(available, item.product)} فقط، والمطلوب ${formatProductQuantity(item.quantityM2, item.product)}`,
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
    const totalDiscount = round2(discountAmount + lineDiscountTotal);
    if (totalDiscount > lineSubtotal) {
      notify('إجمالي الخصومات لا يمكن أن يتجاوز قيمة الأصناف', 'error');
      return false;
    }
    if (totalDiscount > 0 && !can('sales.discount')) {
      notify('غير مصرح لك بمنح خصم على الفاتورة', 'error');
      return false;
    }
    if (totalDiscount > 0) {
      const discountPercent = lineSubtotal > 0 ? (totalDiscount / lineSubtotal) * 100 : 0;
      const configuredThreshold = settings?.discountApprovalThresholdPercent ?? 10;
      const threshold = AppConfigService.getPolicyNumber('sales.discountApprovalThreshold', configuredThreshold);
      if (discountPercent > threshold && !can('sales.approve')) {
        try {
          const request = new ApprovalService().createRequest({
            requestType: 'DISCOUNT',
            title: `اعتماد خصم ${discountPercent.toFixed(1)}% على فاتورة بيع`,
            description: `العميل: ${selectedCustomer?.name ?? ''} — قيمة الخصم ${totalDiscount} ج.م من إجمالي ${lineSubtotal} ج.م (الحد المسموح ${threshold}%).`,
            requestedValue: totalDiscount,
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
  }, [discountAmount, lineDiscountTotal, can, lineSubtotal, settings, selectedCustomer, notify]);

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
      && confirmActiveShift()
  ), [
    validateCartAndPermissions, validateStockAvailability, validateMinimumPrices,
    validateDiscount, validateCreditLimit, confirmActiveShift,
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
    if (isProcessing || !validateCheckoutDetails() || !selectedCustomer) return;
    try {
      setIsProcessing(true);
      if (!skipToneCheck && showToneMixingWarning()) {
        setIsProcessing(false);
        return;
      }
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
        taxPercentage,
        taxAmount,
        shippingCost,
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

      setSuccessInvoice(invoice);
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
      setProducts(productService.getAllProducts());
      if (selectedWarehouseId) loadStock(selectedWarehouseId);
      setActiveShift(cashierService.getActiveShift());
      notify(`تم إصدار الفاتورة ${invoice.invoiceNumber} بنجاح`, 'success');
    } catch (error: any) {
      notify(error.message || 'خطأ أثناء حفظ الفاتورة', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [
    isProcessing, validateCheckoutDetails, selectedCustomer, showToneMixingWarning,
    salesService, selectedWarehouseId, activeShift, cart, discountAmount,
    promotionDiscount, loyaltyDiscount, taxPercentage, taxAmount, shippingCost,
    paidAmount, paymentType, splitCash, splitCard, splitBank, splitCheque, notes,
    performedBy, appliedPromotion, pricingService, couponCode, loyaltyService,
    setCart, setDiscountAmount, setPromotionDiscount, setLoyaltyDiscount,
    setAppliedPromotion, setCouponCode, setRedeemPoints, setShippingCost,
    setNotes, setPaidAmount, setSuccessInvoice, setProducts, productService,
    loadStock, setActiveShift, cashierService, notify,
  ]);

  return { isProcessing, setIsProcessing, handleCheckout };
};
