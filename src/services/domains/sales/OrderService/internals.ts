import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { PermissionService } from '../../auth/PermissionService';
import { round2 } from '../../finance/financials';
import { getProductUnitLabel } from '../../../../utils/products/productUnits';
import { normalizeUom } from '../../../../utils/products/uom';
import { resolveSaleUnits } from '../unitResolution';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import { AppConfigService } from '../../config/AppConfigService';
import { SettingsService } from '../../config/SettingsService';
import type {
  NormalizedOrderItem,
  OrderInput,
  OrderItemInput,
  OrderStatus,
} from './types';

/** Soft check: any active employee may be recorded as the order's sales rep. */
export function validateSalesRep(db: DatabaseManager, salesRepId?: string): string | null {
  if (!salesRepId) return null;
  const rep = db.query<{ id: string }>(
    `SELECT id FROM employees WHERE id = ? AND is_active = 1`,
    [salesRepId]
  )[0];
  if (!rep) throw new Error('المندوب المحدد غير موجود أو غير نشط.');
  return salesRepId;
}

export function resolveWarehouse(db: DatabaseManager, branchAccess: BranchAccessService, warehouseId?: string): string {
  if (warehouseId) {
    branchAccess.requireWarehouseAccess(warehouseId);
    return warehouseId;
  }
  const branchId = branchAccess.getCurrentBranchId();
  const fallback = db.query<{ id: string }>(
    `SELECT id FROM warehouses
     WHERE is_active = 1 AND (branch_id = ? OR id IN (
       SELECT warehouse_id FROM branch_warehouses WHERE branch_id = ?
     ))
     ORDER BY is_default DESC, created_at ASC LIMIT 1`,
    [branchId, branchId]
  )[0];
  if (!fallback) throw new Error('لا يوجد مخزن نشط.');
  branchAccess.requireWarehouseAccess(fallback.id);
  return fallback.id;
}

export function normalizeItems(db: DatabaseManager, items: OrderItemInput[], actor: any): NormalizedOrderItem[] {
  const filtered = (items || []).filter((i) =>
    i.productId && (Number(i.quantity) > 0 || Number(i.quantityM2) > 0)
  );
  return filtered.map((item) => {
    const product = db.query<any>(
      `SELECT id, name, grade, meters_per_box AS metersPerBox, pieces_per_box AS piecesPerBox, is_active,
              product_type AS productType, base_unit AS baseUnit, custom_unit AS customUnit,
              min_selling_price_m2 / 100.0 AS minSellingPriceM2
       FROM products WHERE id = ?`,
      [item.productId]
    )[0];
    if (!product) throw new Error(`الصنف ${item.productId} غير موجود.`);
    if (!product.isActive) throw new Error(`الصنف "${product.name}" غير نشط.`);

    // Orders store base-unit quantities like every other stock path; the
    // entered unit only affects how the line was typed and priced.
    const units = resolveSaleUnits(item, product);
    if (round2(units.baseUnitPrice) < Number(product.minSellingPriceM2 || 0)) {
      PermissionService.require(actor, 'sales.approve');
    }
    const unitPrice = Math.max(0, units.baseUnitPrice);
    const requestedDiscount = Number(item.discountAmount || 0);
    if (!Number.isFinite(requestedDiscount) || requestedDiscount < 0 || requestedDiscount > units.gross + 0.009) {
      throw new Error(`Invalid discount for product "${product.name}".`);
    }
    const discountAmount = round2(requestedDiscount);
    if (discountAmount > 0) PermissionService.require(actor, 'sales.discount');
    const metersPerBox = Number(product.metersPerBox) || 1.44;
    const soldInBoxes = normalizeUom(units.sellUnit, product) === 'BOX';
    const boxesCount = soldInBoxes
      ? round2(units.sellQuantity)
      : product.productType === 'GENERAL' && product.baseUnit === 'BOX'
        ? round2(units.baseQuantity)
        : round2(units.baseQuantity / metersPerBox);
    return {
      productId: product.id as string,
      productName: product.name as string,
      grade: (product.grade as string) || 'GRADE_1',
      quantityM2: units.baseQuantity,
      unitPrice,
      discountAmount,
      boxesCount,
      productType: product.productType,
      baseUnit: product.baseUnit,
      customUnit: product.customUnit,
      totalPrice: round2(units.gross - discountAmount),
    };
  });
}

export function computeTotals(items: NormalizedOrderItem[], input: OrderInput) {
  const subtotal = round2(items.reduce((s, i) => s + i.totalPrice, 0));
  const requestedDiscount = Number(input.discountAmount || 0);
  if (!Number.isFinite(requestedDiscount) || requestedDiscount < 0 || requestedDiscount > subtotal + 0.009) {
    throw new Error('Order discount is invalid or exceeds the item subtotal.');
  }
  const discountAmount = round2(requestedDiscount);
  const taxAmount = round2(Math.max(0, Number(input.taxAmount) || 0));
  const shippingCost = round2(Math.max(0, Number(input.shippingCost) || 0));
  return {
    subtotal,
    discountAmount,
    taxAmount,
    shippingCost,
    totalAmount: round2(Math.max(0, subtotal - discountAmount + taxAmount + shippingCost)),
  };
}

export function validateOrderDiscounts(items: NormalizedOrderItem[], input: OrderInput, actor: any): void {
  const lineDiscounts = round2(items.reduce((sum, item) => sum + item.discountAmount, 0));
  const headerDiscount = round2(Math.max(0, Number(input.discountAmount) || 0));
  const totalDiscount = round2(lineDiscounts + headerDiscount);
  if (totalDiscount <= 0) return;
  PermissionService.require(actor, 'sales.discount');
  const grossSubtotal = round2(items.reduce((sum, item) => sum + item.totalPrice + item.discountAmount, 0));
  const configuredThreshold = SettingsService.getSettings().discountApprovalThresholdPercent ?? 10;
  const threshold = AppConfigService.getPolicyNumber('sales.discountApprovalThreshold', configuredThreshold);
  const discountPercent = grossSubtotal > 0 ? totalDiscount / grossSubtotal * 100 : 0;
  if (discountPercent > threshold) PermissionService.require(actor, 'sales.approve');
}

export function assertStockAndReserve(
  db: DatabaseManager,
  warehouseId: string,
  items: NormalizedOrderItem[]
): void {
  const requested = new Map<string, { name: string; qty: number }>();
  for (const item of items) {
    const entry = requested.get(item.productId) || { name: item.productName, qty: 0 };
    entry.qty = round2(entry.qty + item.quantityM2);
    requested.set(item.productId, entry);
  }

  for (const [productId, entry] of requested) {
    const stock = db.query<any>(
      `SELECT quantity_m2, reserved_m2 FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
      [productId, warehouseId]
    )[0];
    const available = Number(stock?.quantityM2 || 0) - Number(stock?.reservedM2 || 0);
    if (!stock) {
      throw new Error(`لا يوجد رصيد مخزني للصنف "${entry.name}" في المخزن المحدد.`);
    }
    if (available < entry.qty) {
      const product = db.query<any>(
        `SELECT product_type AS productType, base_unit AS baseUnit, custom_unit AS customUnit FROM products WHERE id = ?`,
        [productId]
      )[0];
      const unitLabel = product ? getProductUnitLabel(product) : 'وحدة';
      throw new Error(`الرصيد المتاح من الصنف "${entry.name}" غير كافٍ للحجز. المتاح: ${round2(available)} ${unitLabel}، المطلوب: ${entry.qty} ${unitLabel}`);
    }
    db.run(
      `UPDATE warehouse_stock SET reserved_m2 = reserved_m2 + ?, last_updated = CURRENT_TIMESTAMP
       WHERE product_id = ? AND warehouse_id = ?`,
      [entry.qty, productId, warehouseId]
    );
  }
}

export function releaseReservations(db: DatabaseManager, warehouseId: string, items: Array<{ productId: string; quantityM2: number }>): void {
  const grouped = new Map<string, number>();
  for (const item of items) {
    grouped.set(item.productId, round2((grouped.get(item.productId) || 0) + Number(item.quantityM2 || 0)));
  }
  for (const [productId, qty] of grouped) {
    db.run(
      `UPDATE warehouse_stock SET reserved_m2 = MAX(0, reserved_m2 - ?), last_updated = CURRENT_TIMESTAMP
       WHERE product_id = ? AND warehouse_id = ?`,
      [qty, productId, warehouseId]
    );
  }
}

export function logStatus(
  db: DatabaseManager,
  orderId: string,
  from: OrderStatus | null,
  to: OrderStatus,
  note: string | null,
  userId: string,
  userName: string
): void {
  db.run(
    `INSERT INTO order_status_history
       (id, order_id, from_status, to_status, note, created_by, created_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [`osh_${uuidv4().substring(0, 8)}`, orderId, from, to, note, userId, userName]
  );
}

export function audit(db: DatabaseManager, userId: string, userName: string, action: string, recordId: string, values: any): void {
  db.run(
    `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
     VALUES (?, ?, ?, ?, 'SALES', ?, ?)`,
    [`aud_${uuidv4().substring(0, 8)}`, userId, userName, action, recordId, JSON.stringify(values)]
  );
}
