import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import { unscaleMoneyRow } from '../../../../utils/money';
import {
  ORDER_ITEM_MONEY_FIELDS,
  ORDER_MONEY_FIELDS,
  type Order,
  type OrderDeposit,
  type OrderItem,
  type OrderStats,
  type OrderStatus,
  type OrderStatusEntry,
} from './types';

function orderBranchScope(access: BranchAccessService) {
  return access.sqlScope('o.branch_id', '(SELECT w2.branch_id FROM warehouses w2 WHERE w2.id = o.warehouse_id)');
}

export function getOrders(db: DatabaseManager, access: BranchAccessService, search = '', status: 'ALL' | OrderStatus = 'ALL', dateFrom?: string, dateTo?: string): Order[] {
  PermissionService.require(AuthService.requireAuth(), 'sales.view');
  let sql = `
      SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, w.name AS warehouse_name,
             si.invoice_number AS invoice_number,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count,
              (SELECT COALESCE(SUM(oi.quantity_m2), 0) FROM order_items oi WHERE oi.order_id = o.id) AS total_m2,
              (SELECT COALESCE(SUM(oi.delivered_m2), 0) FROM order_items oi WHERE oi.order_id = o.id) AS delivered_m2,
              (SELECT COALESCE(SUM(oi.invoiced_m2), 0) FROM order_items oi WHERE oi.order_id = o.id) AS invoiced_m2
              ,(SELECT COALESCE(AVG(CASE WHEN oi.quantity_m2 > 0 THEN MIN(1.0, oi.delivered_m2 / oi.quantity_m2) ELSE 0 END), 0) FROM order_items oi WHERE oi.order_id = o.id) * 100 AS deliveryProgress
       FROM orders o
      JOIN customers c ON c.id = o.customer_id
      JOIN warehouses w ON w.id = o.warehouse_id
      LEFT JOIN sales_invoices si ON si.id = o.invoice_id
      WHERE 1 = 1`;
  const scope = orderBranchScope(access);
  sql += ` AND ${scope.clause}`;
  const params: any[] = [...scope.params];

  if (status !== 'ALL') {
    sql += ` AND o.status = ?`;
    params.push(status);
  }
  if (search.trim()) {
    sql += ` AND (o.order_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR si.invoice_number LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }
  if (dateFrom) {
    sql += ` AND o.date >= ?`;
    params.push(dateFrom);
  }
  if (dateTo) {
    sql += ` AND o.date <= ?`;
    params.push(dateTo);
  }
  sql += ` ORDER BY o.date DESC, o.created_at DESC`;
  return db.query<Order>(sql, params).map((row) => unscaleMoneyRow(row, ORDER_MONEY_FIELDS));
}

export function getOrderItems(db: DatabaseManager, access: BranchAccessService, orderId: string): OrderItem[] {
  PermissionService.require(AuthService.requireAuth(), 'sales.view');
  return db.query<OrderItem>(
    `SELECT oi.*, p.sku, p.size, p.meters_per_box,
            p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ? AND EXISTS (
       SELECT 1 FROM orders o
       WHERE o.id = oi.order_id AND ${orderBranchScope(access).clause}
     )
     ORDER BY oi.rowid ASC`,
    [orderId, ...orderBranchScope(access).params]
  ).map((row) => unscaleMoneyRow(row, ORDER_ITEM_MONEY_FIELDS));
}

export function getOrder(db: DatabaseManager, access: BranchAccessService, id: string): Order | null {
  PermissionService.require(AuthService.requireAuth(), 'sales.view');
  const scope = orderBranchScope(access);
  const rows = db.query<Order>(
    `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, w.name AS warehouse_name,
            si.invoice_number AS invoice_number
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN warehouses w ON w.id = o.warehouse_id
     LEFT JOIN sales_invoices si ON si.id = o.invoice_id
     WHERE o.id = ? AND ${scope.clause}`,
    [id, ...scope.params]
  );
  if (rows.length === 0) return null;
  return { ...unscaleMoneyRow(rows[0], ORDER_MONEY_FIELDS), items: getOrderItems(db, access, id) };
}

export function getOrderDeposits(db: DatabaseManager, access: BranchAccessService, orderId: string): OrderDeposit[] {
  PermissionService.require(AuthService.requireAuth(), 'sales.view');
  if (!getOrder(db, access, orderId)) return [];
  return db.query<OrderDeposit>(
    `SELECT od.id, od.order_id AS orderId, od.deposit_number AS depositNumber,
            od.amount / 100.0 AS amount, od.payment_method AS paymentMethod, od.date, od.invoice_id AS invoiceId,
            odr.id AS refundId, odr.refund_number AS refundNumber,
            CASE WHEN od.invoice_id IS NULL AND odr.id IS NULL THEN od.amount / 100.0 ELSE 0 END AS refundable
     FROM order_deposits od
     LEFT JOIN order_deposit_refunds odr ON odr.order_deposit_id = od.id
     WHERE od.order_id = ? ORDER BY od.date, od.created_at, od.id`,
    [orderId]
  );
}

export function getStats(db: DatabaseManager, access: BranchAccessService): OrderStats {
  PermissionService.require(AuthService.requireAuth(), 'sales.view');
  const scope = orderBranchScope(access);
  const row = db.query<any>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(total_amount) / 100.0, 0) AS totalValue,
            COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending,
            COALESCE(SUM(CASE WHEN status = 'PENDING' THEN total_amount ELSE 0 END) / 100.0, 0) AS pendingValue,
            COALESCE(SUM(CASE WHEN status IN ('CONFIRMED','PROCESSING','PARTIAL','READY','ON_HOLD') THEN 1 ELSE 0 END), 0) AS processing,
            COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completed,
            COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_amount ELSE 0 END) / 100.0, 0) AS completedValue,
            COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelled
     FROM orders o
     WHERE ${scope.clause}`,
    scope.params
  )[0] || {};
  return {
    total: Number(row.total || 0),
    totalValue: Number(row.totalValue || 0),
    pending: Number(row.pending || 0),
    pendingValue: Number(row.pendingValue || 0),
    processing: Number(row.processing || 0),
    completed: Number(row.completed || 0),
    completedValue: Number(row.completedValue || 0),
    cancelled: Number(row.cancelled || 0),
  };
}

export function getStatusHistory(db: DatabaseManager, access: BranchAccessService, orderId: string): OrderStatusEntry[] {
  PermissionService.require(AuthService.requireAuth(), 'sales.view');
  if (!getOrder(db, access, orderId)) return [];
  return db.query<OrderStatusEntry>(
    `SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC, rowid ASC`,
    [orderId]
  );
}
