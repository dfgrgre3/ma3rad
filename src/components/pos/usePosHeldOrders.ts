import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Customer, PaymentType } from '../../types';
import { HeldOrderService } from '../../services/HeldOrderService';
import { fromBaseQuantity } from '../../utils/uom';
import { HELD_STORAGE_KEY, round2, type CartItem, type HeldOrder, type Toast } from './types';

interface UsePosHeldOrdersOptions {
  heldOrderService: HeldOrderService;
  currentUserId?: string;
  cart: CartItem[];
  setCart: Dispatch<SetStateAction<CartItem[]>>;
  selectedCustomer: Customer | null;
  setSelectedCustomer: Dispatch<SetStateAction<Customer | null>>;
  customers: Customer[];
  selectedWarehouseId: string;
  setSelectedWarehouseId: Dispatch<SetStateAction<string>>;
  discountAmount: number;
  setDiscountAmount: Dispatch<SetStateAction<number>>;
  taxPercentage: number;
  setTaxPercentage: Dispatch<SetStateAction<number>>;
  defaultTaxPercentage?: number;
  shippingCost: number;
  setShippingCost: Dispatch<SetStateAction<number>>;
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
  paidAmount: number;
  setPaidAmount: Dispatch<SetStateAction<number>>;
  paymentType: PaymentType;
  setPaymentType: Dispatch<SetStateAction<PaymentType>>;
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
  customers,
  selectedWarehouseId,
  setSelectedWarehouseId,
  discountAmount,
  setDiscountAmount,
  taxPercentage,
  setTaxPercentage,
  defaultTaxPercentage,
  shippingCost,
  setShippingCost,
  notes,
  setNotes,
  paidAmount,
  setPaidAmount,
  paymentType,
  setPaymentType,
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
      notes,
      paidAmount,
      paymentType
    };
    persistHeld((prev) => [hold, ...prev]);
    setCart([]);
    setDiscountAmount(0);
    setTaxPercentage(defaultTaxPercentage || 0);
    setShippingCost(0);
    setNotes('');
    setPaidAmount(0);
    notify('تم تعليق الطلب وإمكانية استرجاعه لاحقاً', 'success');
  };

  const resumeHeldOrder = (order: HeldOrder) => {
    const customer = customers.find((item) => item.id === order.customerId) || null;
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
    setNotes(order.notes || '');
    setPaidAmount(order.paidAmount || 0);
    setPaymentType(order.paymentType || 'CASH');
    persistHeld((prev) => prev.filter((item) => item.id !== order.id));
    setIsHeldModalOpen(false);
    notify(`تم استرجاع الطلب: ${order.customerName}`, 'success');
  };

  const deleteHeldOrder = (id: string) => {
    persistHeld((prev) => prev.filter((order) => order.id !== id));
  };

  return { heldOrders, holdCurrentOrder, resumeHeldOrder, deleteHeldOrder };
};
