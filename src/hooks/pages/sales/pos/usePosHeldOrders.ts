import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Customer, PaymentType } from '../../../../types';
import { HeldOrderService } from '../../../../services/domains/sales/HeldOrderService';
import type { CustomerService } from '../../../../services/domains/customers/CustomerService';
import { fromBaseQuantity } from '../../../../utils/products/uom';
import { HELD_STORAGE_KEY, round2, type CartItem, type HeldOrder, type Toast } from '../../../../types/pos';

interface UsePosHeldOrdersOptions {
  heldOrderService: HeldOrderService;
  currentUserId?: string;
  cart: CartItem[];
  setCart: Dispatch<SetStateAction<CartItem[]>>;
  selectedCustomer: Customer | null;
  setSelectedCustomer: Dispatch<SetStateAction<Customer | null>>;
  customerService: Pick<CustomerService, 'getCustomerById'>;
  selectedWarehouseId: string;
  setSelectedWarehouseId: Dispatch<SetStateAction<string>>;
  discountAmount: number;
  setDiscountAmount: Dispatch<SetStateAction<number>>;
  taxPercentage: number;
  setTaxPercentage: Dispatch<SetStateAction<number>>;
  defaultTaxPercentage?: number;
  shippingCost: number;
  setShippingCost: Dispatch<SetStateAction<number>>;
  extraFees?: number;
  setExtraFees?: Dispatch<SetStateAction<number>>;
  splitCash?: number;
  setSplitCash?: Dispatch<SetStateAction<number>>;
  splitCard?: number;
  setSplitCard?: Dispatch<SetStateAction<number>>;
  splitBank?: number;
  setSplitBank?: Dispatch<SetStateAction<number>>;
  splitCheque?: number;
  setSplitCheque?: Dispatch<SetStateAction<number>>;
  splitCredit?: number;
  setSplitCredit?: Dispatch<SetStateAction<number>>;
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
  paidAmount: number;
  setPaidAmount: Dispatch<SetStateAction<number>>;
  paymentType: PaymentType;
  setPaymentType: Dispatch<SetStateAction<PaymentType>>;
  couponCode: string;
  setCouponCode: Dispatch<SetStateAction<string>>;
  redeemPoints: number;
  setRedeemPoints: Dispatch<SetStateAction<number>>;
  loyaltyDiscount: number;
  setLoyaltyDiscount: Dispatch<SetStateAction<number>>;
  setIsHeldModalOpen: Dispatch<SetStateAction<boolean>>;
  notify: (message: string, type?: Toast['type']) => void;
}

export const usePosHeldOrders = ({
  heldOrderService,
  currentUserId,
  cart,
  setCart,
  selectedCustomer,
  setSelectedCustomer,
  customerService,
  selectedWarehouseId,
  setSelectedWarehouseId,
  discountAmount,
  setDiscountAmount,
  taxPercentage,
  setTaxPercentage,
  defaultTaxPercentage,
  shippingCost,
  setShippingCost,
  extraFees = 0,
  setExtraFees,
  splitCash = 0,
  setSplitCash,
  splitCard = 0,
  setSplitCard,
  splitBank = 0,
  setSplitBank,
  splitCheque = 0,
  setSplitCheque,
  splitCredit = 0,
  setSplitCredit,
  notes,
  setNotes,
  paidAmount,
  setPaidAmount,
  paymentType,
  setPaymentType,
  couponCode,
  setCouponCode,
  redeemPoints,
  setRedeemPoints,
  loyaltyDiscount,
  setLoyaltyDiscount,
  setIsHeldModalOpen,
  notify,
}: UsePosHeldOrdersOptions) => {
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const heldOrdersRef = useRef<HeldOrder[]>([]);

  useEffect(() => {
    try {
      const dbRows = heldOrderService.getAll();
      let restored: HeldOrder[] = [];
      if (dbRows.length > 0) {
        restored = dbRows.map((r) => { try { return JSON.parse(r.data) as HeldOrder; } catch { return null; } }).filter(Boolean) as HeldOrder[];
      } else {
        const raw = localStorage.getItem(HELD_STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          restored = Array.isArray(parsed) ? parsed as HeldOrder[] : [];
          restored.forEach((order) => heldOrderService.save(order.id, JSON.stringify(order), currentUserId));
        }
      }
      heldOrdersRef.current = restored;
      setHeldOrders(restored);
    } catch {
      heldOrdersRef.current = [];
      setHeldOrders([]);
    }
  }, [heldOrderService, currentUserId]);

  const persistHeld = (orders: HeldOrder[] | ((current: HeldOrder[]) => HeldOrder[])) => {
    const next = typeof orders === 'function' ? orders(heldOrdersRef.current) : orders;
    heldOrdersRef.current = next;
    setHeldOrders(next);
    try {
      localStorage.setItem(HELD_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage may be full; the database copy remains available.
    }
    try {
      heldOrderService.clearAll();
      next.forEach((order) => heldOrderService.save(order.id, JSON.stringify(order), currentUserId));
    } catch {
      // Keep local storage as the recovery copy if database persistence fails.
    }
  };

  const holdCurrentOrder = () => {
    if (cart.length === 0) {
      notify('لا يوجد أصناف لتعليقها', 'error');
      return;
    }
    const hold: HeldOrder = {
      id: `hold_${Date.now()}`,
      label: `طلب معلّق (${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })})`,
      createdAt: new Date().toISOString(),
      customerId: selectedCustomer?.id || '',
      customerName: selectedCustomer?.name || 'عميل نقدي',
      warehouseId: selectedWarehouseId,
      items: cart,
      discountAmount,
      taxPercentage,
      shippingCost,
      extraFees,
      splitCash,
      splitCard,
      splitBank,
      splitCheque,
      splitCredit,
      notes,
      paidAmount,
      paymentType,
      couponCode,
      redeemPoints,
      loyaltyDiscount,
    };
    persistHeld((prev) => [hold, ...prev]);
    setCart([]);
    setDiscountAmount(0);
    setTaxPercentage(defaultTaxPercentage || 0);
    setShippingCost(0);
    setExtraFees?.(0);
    setSplitCash?.(0);
    setSplitCard?.(0);
    setSplitBank?.(0);
    setSplitCheque?.(0);
    setSplitCredit?.(0);
    setNotes('');
    setPaidAmount(0);
    setCouponCode('');
    setRedeemPoints(0);
    setLoyaltyDiscount(0);
    notify('تم تعليق الطلب وإمكانية استرجاعه لاحقاً', 'success');
  };

  const resumeHeldOrder = (order: HeldOrder) => {
    const customer = order.customerId ? customerService.getCustomerById(order.customerId) : null;
    setSelectedCustomer(customer);
    if (order.warehouseId) setSelectedWarehouseId(order.warehouseId);
    setCart((order.items || []).map((item) => ({
      ...item,
      soldBy: item.soldBy || item.product.baseUnit || 'M2',
      soldQuantity: Number.isFinite(item.soldQuantity)
        ? item.soldQuantity
        : round2(fromBaseQuantity(item.quantityM2, item.soldBy || item.product.baseUnit || 'M2', item.product)),
    })));
    setDiscountAmount(order.discountAmount || 0);
    setTaxPercentage(order.taxPercentage ?? defaultTaxPercentage ?? 0);
    setShippingCost(order.shippingCost || 0);
    setExtraFees?.(order.extraFees || 0);
    setSplitCash?.(order.splitCash || 0);
    setSplitCard?.(order.splitCard || 0);
    setSplitBank?.(order.splitBank || 0);
    setSplitCheque?.(order.splitCheque || 0);
    setSplitCredit?.(order.splitCredit || 0);
    setNotes(order.notes || '');
    setPaidAmount(order.paidAmount || 0);
    setPaymentType(order.paymentType || 'CASH');
    setCouponCode(order.couponCode || '');
    setRedeemPoints(order.redeemPoints || 0);
    setLoyaltyDiscount(order.loyaltyDiscount || 0);
    persistHeld((prev) => prev.filter((item) => item.id !== order.id));
    setIsHeldModalOpen(false);
    notify(`تم استرجاع الطلب: ${order.customerName}`, 'success');
  };

  const deleteHeldOrder = (id: string) => {
    persistHeld((prev) => prev.filter((order) => order.id !== id));
  };

  return { heldOrders, holdCurrentOrder, resumeHeldOrder, deleteHeldOrder };
};
