import { useCallback, useMemo, useState } from 'react';
import type { Customer, SystemSettings } from '../../../types';
import { SalesService } from '../../../services/SalesService';
import { CashierService } from '../../../services/CashierService';
import { BatchService } from '../../../services/BatchService';
import { ApprovalService } from '../../../services/ApprovalService';
import { PrintService } from '../../../services/PrintService';
import { round2, type CartItem, type Toast } from '../../../components/pos/types';
import { pricePerUnit } from '../../../utils/uom';
import { formatProductQuantity } from '../../../utils/productUnits';
import { CeramicMath } from '../../../utils/ceramicMath';
import { exportToExcel } from '../../../utils/export';
import { buildWhatsAppUrl, openExternalShare } from '../../../utils/externalLinks';

export interface CheckoutState {
  cart: CartItem[];
  selectedCustomer: Customer | null;
  selectedWarehouseId: string;
  activeShiftId?: string;
  discountAmount: number;
  taxPercentage: number;
  taxAmount: number;
  shippingCost: number;
  paidAmount: number;
  paymentType: string;
  notes: string;
  currentUserId: string;
  lineSubtotal: number;
  lineDiscountTotal: number;
  remainingAmount: number;
  settings: SystemSettings | null;
}

export function usePosCheckout(
  can: (perm: string) => boolean,
  notify: (msg: string, type: Toast['type']) => void,
  stockOf: (id: string) => number,
  reloadProductsAndStock: (wid: string) => void,
  setActiveShift: (s: any) => void,
) {
  const salesService = useMemo(() => new SalesService(), []);
  const cashierService = useMemo(() => new CashierService(), []);
  const batchService = useMemo(() => new BatchService(), []);
  const printService = useMemo(() => new PrintService(), []);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successInvoice, setSuccessInvoice] = useState<any | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<any | null>(null);
  const [toneConflicts, setToneConflicts] = useState<any[]>([]);
  const [isToneWarningOpen, setIsToneWarningOpen] = useState(false);

  const validateCheckout = useCallback((s: CheckoutState) => {
    const { cart, discountAmount, shippingCost, taxPercentage, paidAmount,
      selectedCustomer, selectedWarehouseId, remainingAmount } = s;
    if (!Number.isFinite(discountAmount) || discountAmount < 0
      || !Number.isFinite(shippingCost) || shippingCost < 0
      || !Number.isFinite(taxPercentage) || taxPercentage < 0
      || !Number.isFinite(paidAmount) || paidAmount < 0) {
      notify('قيم الخصم / الشحن / الضريبة / المدفوع غير صالحة', 'error'); return false;
    }
    const badItem = cart.find((i) => !Number.isFinite(i.quantityM2) || i.quantityM2 <= 0);
    if (badItem) { notify('تحقق من كمية ' + badItem.product.name, 'error'); return false; }
    if (cart.length === 0) { notify('السلة فارغة', 'error'); return false; }
    if (!selectedCustomer) { notify('يرجى اختيار العميل', 'error'); return false; }
    if (!selectedWarehouseId) { notify('يرجى اختيار المخزن', 'error'); return false; }
    if (!can('sales.create')) { notify('لا تملك صلاحية انشاء فاتورة', 'error'); return false; }
    if (remainingAmount > 0 && !can('sales.credit')) { notify('لا تملك صلاحية البيع الاجل', 'error'); return false; }
    if ((s.settings as any)?.enableNegativeStock !== true) {
      for (const item of cart) {
        const avail = stockOf(item.product.id);
        if (item.quantityM2 > avail) {
          notify('الرصيد المتاح من ' + item.product.name + ' ' + formatProductQuantity(avail, item.product) + ' فقط', 'error');
          return false;
        }
      }
    }
    for (const item of cart) {
      const min = item.product.minSellingPriceM2 || 0;
      if (min > 0 && item.unitPrice < min && !can('sales.approve')) {
        notify('سعر ' + item.product.name + ' اقل من الحد الادنى', 'error'); return false;
      }
    }
    const totalDiscount = round2(discountAmount + s.lineDiscountTotal);
    if (totalDiscount > s.lineSubtotal) { notify('اجمالي الخصومات يتجاوز قيمة الاصناف', 'error'); return false; }
    if (totalDiscount > 0 && !can('sales.discount')) { notify('غير مصرح لك بمنح خصم', 'error'); return false; }
    if (totalDiscount > 0 && s.lineSubtotal > 0) {
      const pct = (totalDiscount / s.lineSubtotal) * 100;
      const threshold = (s.settings as any)?.discountApprovalThresholdPercent ?? 10;
      if (pct > threshold && !can('sales.approve')) {
        try {
          const req = new ApprovalService().createRequest({ requestType: 'DISCOUNT', title: 'اعتماد خصم ' + pct.toFixed(1) + '%', description: 'الخصم يتجاوز الحد', requestedValue: totalDiscount, currentValue: s.lineSubtotal, priority: 'HIGH', referenceType: 'POS' });
          notify('تم ارسال طلب اعتماد رقم ' + req.requestNumber, 'warning');
        } catch { notify('الخصم يتجاوز الحد المسموح ويلزم اعتماد المسؤول', 'error'); }
        return false;
      }
    }
    if (selectedCustomer && remainingAmount > 0 && selectedCustomer.creditLimit > 0) {
      const projected = round2((selectedCustomer.currentBalance || 0) + remainingAmount);
      if (projected > selectedCustomer.creditLimit) { notify('تجاوز حد الائتمان للعميل', 'error'); return false; }
    }
    if (!s.activeShiftId) {
      if (!window.confirm('لا توجد وردية مفتوحة. هل تريد المتابعة؟')) return false;
    }
    return true;
  }, [can, notify, stockOf]);

  const handleCheckout = useCallback((s: CheckoutState, skipToneCheck = false) => {
    if (isProcessing || !validateCheckout(s) || !s.selectedCustomer) return;
    try {
      setIsProcessing(true);
      if (!skipToneCheck) {
        const checkItems = s.cart.filter((ci) => ci.product.productType !== 'GENERAL')
          .map((ci) => ({ productId: ci.product.id, productName: ci.product.name, warehouseId: s.selectedWarehouseId, quantityM2: ci.quantityM2 }));
        if (checkItems.length > 0) {
          const conflicts = batchService.checkToneMixing(checkItems);
          if (conflicts.length > 0) { setToneConflicts(conflicts); setIsToneWarningOpen(true); setIsProcessing(false); return; }
        }
      }
      const invoice = salesService.createSale({
        customerId: s.selectedCustomer.id, warehouseId: s.selectedWarehouseId, shiftId: s.activeShiftId,
        items: s.cart.map((item) => ({ productId: item.product.id, soldBy: item.soldBy, uom: item.soldBy, quantity: item.soldQuantity, quantityM2: item.quantityM2, boxesCount: item.boxesCount, piecesCount: item.piecesCount, unitPrice: round2(pricePerUnit(item.unitPrice, item.soldBy, item.product)), unitCost: item.product.costPrice, discountAmount: item.discountAmount })),
        discountAmount: s.discountAmount, taxPercentage: s.taxPercentage, taxAmount: s.taxAmount,
        shippingCost: s.shippingCost, paidAmount: s.paidAmount, paymentType: s.paymentType as any,
        notes: s.notes, performedBy: s.currentUserId,
      });
      setSuccessInvoice(invoice);
      reloadProductsAndStock(s.selectedWarehouseId);
      setActiveShift(cashierService.getActiveShift());
      notify('تم اصدار الفاتورة ' + invoice.invoiceNumber + ' بنجاح', 'success');
    } catch (e: any) {
      notify(e.message || 'خطا اثناء حفظ الفاتورة', 'error');
    } finally { setIsProcessing(false); }
  }, [isProcessing, validateCheckout, batchService, salesService, cashierService, reloadProductsAndStock, setActiveShift, notify]);

  const openInvoicePreview = useCallback((inv: any) => {
    if (!inv) return;
    const rows = (inv.items || []).map((it: any, i: number) => ({ idx: i + 1, product: it.productName, qty: formatProductQuantity(it.quantityM2, it), boxes: it.productType === 'GENERAL' ? '' : it.boxesCount, price: it.unitPrice, total: it.totalPrice }));
    const excelOpts = { title: 'فاتورة ' + inv.invoiceNumber, columns: [{ key: 'idx', label: '#' }, { key: 'product', label: 'الصنف' }, { key: 'qty', label: 'الكمية' }, { key: 'boxes', label: 'الكراتين' }, { key: 'price', label: 'السعر' }, { key: 'total', label: 'الاجمالي' }], rows, fileName: 'invoice-' + inv.invoiceNumber, permission: 'sales.export' };
    setInvoicePreview({
      title: 'معاينة الفاتورة ' + inv.invoiceNumber,
      subtitle: (inv.customerName || 'عميل نقدي') + ' - ' + CeramicMath.formatCurrency(inv.totalAmount),
      fileName: 'invoice-' + inv.invoiceNumber, html: printService.getInvoiceHtml(inv),
      excel: () => exportToExcel(excelOpts),
      whatsapp: inv.customerPhone ? () => {
        const phone = String(inv.customerPhone).replace(/[^0-9]/g, '');
        const text = encodeURIComponent('فاتورة ' + inv.invoiceNumber + ' - الاجمالي: ' + CeramicMath.formatCurrency(inv.totalAmount));
        openExternalShare(buildWhatsAppUrl(phone, text), decodeURIComponent(text));
      } : undefined,
    });
  }, [printService]);

  return {
    isProcessing, successInvoice, setSuccessInvoice, invoicePreview, setInvoicePreview,
    toneConflicts, setToneConflicts, isToneWarningOpen, setIsToneWarningOpen,
    handleCheckout, openInvoicePreview,
  };
}
