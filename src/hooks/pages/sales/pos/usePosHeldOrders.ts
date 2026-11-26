import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Customer, PaymentType } from '../../../../types';
import { HeldOrderService } from '../../../../services/domains/sales/HeldOrderService';
import { auditLogger } from '../../../../services/domains/security/auditLogger';
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
  /** sales.pos.held.manage — allows listing/resuming/deleting other employees' held orders. */
  canManageHeldOrders?: boolean;
  /** Company policy: hours before a held order expires (cannot be resumed). Default 72. */
  heldOrderTtlHours?: number;
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
  canManageHeldOrders = false,
  heldOrderTtlHours = 72,
  notify,
}: UsePosHeldOrdersOptions) => {
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const heldOrdersRef = useRef<HeldOrder[]>([]);
  const heldOrderStaleHours = 24;

  const removeHeldOrderLocal = (id: string) => {
    const next = heldOrdersRef.current.filter((order) => order.id !== id);
    heldOrdersRef.current = next;
    setHeldOrders(next);
  };

  useEffect(() => {
    if (!currentUserId) {
      heldOrdersRef.current = [];
      setHeldOrders([]);
      return;
    }
    try {
      // Auto-clean held orders past the facility TTL — they can no longer be
      // resumed anyway; keeping them is dead weight. LocalStorage copies of
      // expired orders are dropped below when merging.
      try {
        const cutoff = new Date(Date.now() - heldOrderTtlHours * 3600_000)
          .toISOString().slice(0, 19).replace('T', ' ');
        const purged = heldOrderService.purgeExpired(cutoff);
        if (purged > 0) {
          auditLogger.log(
            currentUserId || 'system', 'pos', 'pos_held_order_expire_purge', 'held_order', 'batch',
            `تنظيف تلقائي: حُذف ${purged} طلب معلق منتهٍ الصلاحية (سياسة ${heldOrderTtlHours} ساعة)`,
            { purged, ttlHours: heldOrderTtlHours },
          );
        }
      } catch { /* cleanup is best-effort — listing still works */ }
      const dbRows = heldOrderService.getAll(currentUserId);
      const restored: HeldOrder[] = dbRows.flatMap((r) => {
        try { return [{ ...JSON.parse(r.data) as HeldOrder, createdBy: r.createdBy || currentUserId }]; }
        catch { return []; }
      });
      const raw = localStorage.getItem(`${HELD_STORAGE_KEY}:${currentUserId}`);
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw);
          const localOrders = Array.isArray(parsed) ? parsed as HeldOrder[] : [];
          const ttlMs = heldOrderTtlHours * 3600_000;
          const merged = new Map(restored.map((order) => [order.id, order]));
          localOrders.forEach((order) => {
            // Drop expired local snapshots — they must not be resurrected into
            // the database by the sync-back below.
            const age = Date.now() - Date.parse(order.createdAt);
            if (Number.isFinite(age) && age <= ttlMs) {
              merged.set(order.id, { ...order, createdBy: currentUserId });
            }
          });
          restored.splice(0, restored.length, ...merged.values());
          restored.forEach((order) => heldOrderService.save(order.id, JSON.stringify(order), currentUserId));
          // Rewrite localStorage without the dropped expired snapshots.
          localStorage.setItem(
            `${HELD_STORAGE_KEY}:${currentUserId}`,
            JSON.stringify(restored.filter((order) => !order.managed))
          );
        } catch (error) {
          notify(error instanceof Error ? `Local held orders are corrupt: ${error.message}` : 'Local held orders are corrupt', 'error');
        }
      }
      // Supervisor view: merge other employees' held orders (read-only until resumed).
      if (canManageHeldOrders) {
        try {
          const ownIds = new Set(restored.map((order) => order.id));
          const managed = heldOrderService.listAll().flatMap((row) => {
            if (ownIds.has(row.id)) return [];
            try {
              const order = JSON.parse(row.data) as HeldOrder;
              return [{
                ...order,
                id: row.id,
                createdBy: row.createdBy ?? order.createdBy,
                ownerName: row.userName ?? undefined,
                branchName: row.branchName,
                managed: true,
              }];
            } catch { return []; }
          });
          restored.push(...managed);
        } catch { /* without sales.pos.held.manage the own-orders view still works */ }
      }
      const isExpired = (order: HeldOrder) =>
        Number.isFinite(Date.parse(order.createdAt))
        && Date.now() - Date.parse(order.createdAt) > heldOrderTtlHours * 3600_000;
      const staleCount = restored.filter((order) =>
        !isExpired(order)
        && Date.now() - Date.parse(order.createdAt) > heldOrderStaleHours * 3600_000
      ).length;
      if (staleCount > 0) {
        notify(`تنبيه: ${staleCount} طلب معلق بقي معلقاً لأكثر من ${heldOrderStaleHours} ساعة`, 'warning');
      }
      const expiryWarnHours = heldOrderTtlHours * 0.75;
      const nearExpiryCount = restored.filter((order) => {
        const ageMs = Date.now() - Date.parse(order.createdAt);
        return Number.isFinite(ageMs) && ageMs > expiryWarnHours * 3600_000 && ageMs <= heldOrderTtlHours * 3600_000;
      }).length;
      if (nearExpiryCount > 0) {
        notify(`تنبيه: ${nearExpiryCount} طلب معلق يقترب من انتهاء صلاحيته (سياسة المنشأة: ${heldOrderTtlHours} ساعة)`, 'warning');
      }
      heldOrdersRef.current = restored;
      setHeldOrders(restored);
    } catch (error) {
      heldOrdersRef.current = [];
      setHeldOrders([]);
      notify(error instanceof Error ? `تعذر تحميل الطلبات المعلقة: ${error.message}` : 'تعذر تحميل الطلبات المعلقة', 'error');
    }
  }, [heldOrderService, currentUserId, canManageHeldOrders, heldOrderTtlHours, heldOrderStaleHours, notify]);

  const persistHeld = (orders: HeldOrder[] | ((current: HeldOrder[]) => HeldOrder[])): boolean => {
    const merged = typeof orders === 'function' ? orders(heldOrdersRef.current) : orders;
    // Managed (other employees') orders are read-only here — never rewrite or delete them.
    const next = merged.filter((order) => !order.managed);
    if (!currentUserId) {
      notify('تعذر حفظ الطلب المعلق: المستخدم غير محدد', 'error');
      return false;
    }
    const owned = next.map((order) => ({ ...order, createdBy: currentUserId }));
    const previous = heldOrdersRef.current.filter((order) => !order.managed);
    let persisted = false;
    try {
      localStorage.setItem(`${HELD_STORAGE_KEY}:${currentUserId}`, JSON.stringify(owned));
      persisted = true;
    } catch (error) {
      notify(error instanceof Error ? `تعذر حفظ نسخة الطلبات المحلية: ${error.message}` : 'تعذر حفظ نسخة الطلبات المحلية', 'error');
    }
    try {
      const previousIds = new Set(previous.map((order) => order.id));
      const nextIds = new Set(owned.map((order) => order.id));
      previousIds.forEach((id) => { if (!nextIds.has(id)) heldOrderService.delete(id, currentUserId); });
      owned.forEach((order) => heldOrderService.save(order.id, JSON.stringify(order), currentUserId));
      persisted = true;
    } catch (error) {
      notify(error instanceof Error ? `تعذر حفظ الطلبات في قاعدة البيانات: ${error.message}` : 'تعذر حفظ الطلبات في قاعدة البيانات', 'error');
    }
    if (!persisted) return false;
    heldOrdersRef.current = [...owned, ...heldOrdersRef.current.filter((order) => order.managed)];
    setHeldOrders(heldOrdersRef.current);
    return true;
  };

  const holdCurrentOrder = () => {
    if (cart.length === 0) {
      notify('لا يوجد أصناف لتعليقها', 'error');
      return;
    }
    const hold: HeldOrder = {
      id: `hold_${Date.now()}`,
      createdBy: currentUserId || '',
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
    if (!currentUserId) { notify('يلزم تسجيل الدخول قبل تعليق الطلب', 'error'); return; }
    if (!persistHeld((prev) => [hold, ...prev])) return;
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
    const isManaged = !!order.managed;
    if (isManaged) {
      if (!canManageHeldOrders) { notify('لا تملك صلاحية استرجاع طلبات الموظفين الآخرين', 'error'); return; }
    } else if (!currentUserId || order.createdBy !== currentUserId) {
      notify('لا تملك صلاحية استرجاع هذا الطلب', 'error'); return;
    }
    if (Number.isFinite(Date.parse(order.createdAt))
      && Date.now() - Date.parse(order.createdAt) > heldOrderTtlHours * 3600_000) {
      notify('انتهت صلاحية هذا الطلب المعلق وفق سياسة المنشأة — لا يمكن استرجاعه', 'error');
      return;
    }
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
    if (isManaged) {
      try {
        heldOrderService.deleteManaged(order.id);
        auditLogger.log(
          currentUserId || 'system', 'pos', 'pos_held_order_resume', 'held_order', order.id,
          `استرجاع طلب معلق لموظف آخر (${order.ownerName ?? order.createdBy ?? 'غير معروف'}) — عميل: ${order.customerName}`,
          { ownerName: order.ownerName, customerName: order.customerName, itemCount: order.items?.length ?? 0 },
        );
      } catch (error) {
        notify(error instanceof Error ? `تعذر حذف الطلب الأصلي: ${error.message}` : 'تعذر حذف الطلب الأصلي', 'warning');
      }
      removeHeldOrderLocal(order.id);
    } else {
      persistHeld((prev) => prev.filter((item) => item.id !== order.id));
    }
    setIsHeldModalOpen(false);
    notify(`تم استرجاع الطلب: ${order.customerName}`, 'success');
  };

  const deleteHeldOrder = (id: string) => {
    const target = heldOrdersRef.current.find((order) => order.id === id);
    if (target?.managed) {
      if (!canManageHeldOrders) { notify('لا تملك صلاحية حذف طلبات الموظفين الآخرين', 'error'); return; }
      try {
        heldOrderService.deleteManaged(id);
        const targetOrder = heldOrdersRef.current.find((order) => order.id === id);
        auditLogger.log(
          currentUserId || 'system', 'pos', 'pos_held_order_delete', 'held_order', id,
          `حذف طلب معلق لموظف آخر (${targetOrder?.ownerName ?? targetOrder?.createdBy ?? 'غير معروف'})`,
          { ownerName: targetOrder?.ownerName, customerName: targetOrder?.customerName },
        );
        removeHeldOrderLocal(id);
      } catch (error) {
        notify(error instanceof Error ? `تعذر حذف الطلب: ${error.message}` : 'تعذر حذف الطلب', 'error');
      }
      return;
    }
    if (!currentUserId || !heldOrdersRef.current.some((order) => order.id === id && order.createdBy === currentUserId)) {
      notify('لا تملك صلاحية حذف هذا الطلب', 'error'); return;
    }
    persistHeld((prev) => prev.filter((order) => order.id !== id));
  };

  return {
    heldOrders, holdCurrentOrder, resumeHeldOrder, deleteHeldOrder,
    heldOrderTtlHours, heldOrderStaleHours,
  };
};
