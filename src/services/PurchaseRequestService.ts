import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { round2 } from './financials';
import { BranchAccessService } from './BranchAccessService';

export type PurchaseRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ORDERED' | 'CANCELLED';
export type RequestPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface PurchaseRequest {
  id: string;
  requestNumber: string;
  date: string;
  branchId?: string | null;
  branchName?: string;
  warehouseId?: string | null;
  warehouseName?: string;
  requestedBy: string;
  requesterName?: string;
  neededBy?: string | null;
  priority: RequestPriority;
  status: PurchaseRequestStatus;
  decidedBy?: string | null;
  decidedByName?: string;
  decidedAt?: string | null;
  notes?: string | null;
  itemsCount?: number;
  estimatedTotal?: number;
  createdAt: string;
}

export interface PurchaseRequestItemInput {
  productId: string;
  quantityM2: number;
  estimatedUnitCost?: number;
  notes?: string;
}

export class PurchaseRequestService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  public getRequests(search = '', status = 'ALL'): PurchaseRequest[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.view');
    const scope = this.branchAccess.sqlScope('pr.branch_id', undefined, actor);
    let sql = `
      SELECT pr.*, u.full_name AS requester_name, du.full_name AS decided_by_name,
        b.name AS branch_name, w.name AS warehouse_name,
        (SELECT COUNT(*) FROM purchase_request_items pri WHERE pri.request_id = pr.id) AS items_count,
        (SELECT COALESCE(SUM(pri.quantity_m2 * pri.estimated_unit_cost), 0)
           FROM purchase_request_items pri WHERE pri.request_id = pr.id) AS estimated_total
      FROM purchase_requests pr
      LEFT JOIN users u ON u.id = pr.requested_by
      LEFT JOIN users du ON du.id = pr.decided_by
      LEFT JOIN branches b ON b.id = pr.branch_id
      LEFT JOIN warehouses w ON w.id = pr.warehouse_id
      WHERE ${scope.clause}`;
    const params: any[] = [...scope.params];
    if (status !== 'ALL') { sql += ` AND pr.status = ?`; params.push(status); }
    if (search.trim()) {
      sql += ` AND (pr.request_number LIKE ? OR u.full_name LIKE ? OR pr.notes LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    sql += ` ORDER BY pr.date DESC, pr.created_at DESC`;
    return this.db.query<PurchaseRequest>(sql, params);
  }

  public getItems(requestId: string): any[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.view');
    const scope = this.branchAccess.sqlScope('pr.branch_id', undefined, actor);
    if (!this.db.query(
      `SELECT pr.id FROM purchase_requests pr WHERE pr.id = ? AND ${scope.clause}`,
      [requestId, ...scope.params]
    ).length) {
      throw new Error('طلب الشراء غير موجود أو خارج نطاق الفروع المصرح به.');
    }
    return this.db.query(
      `SELECT pri.*, p.sku, p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
       FROM purchase_request_items pri LEFT JOIN products p ON p.id = pri.product_id WHERE pri.request_id = ?`,
      [requestId]
    );
  }

  public createRequest(input: {
    warehouseId?: string;
    branchId?: string;
    neededBy?: string;
    priority?: RequestPriority;
    notes?: string;
    items: PurchaseRequestItemInput[];
  }): PurchaseRequest {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.create');
    const items = input.items.filter((i) => i.quantityM2 > 0);
    if (items.length === 0) throw new Error('أضف صنفاً واحداً على الأقل بكمية أكبر من صفر.');

    let branchId = input.branchId;
    if (input.warehouseId) {
      const warehouseBranchId = this.branchAccess.requireWarehouseAccess(input.warehouseId, actor);
      if (branchId && branchId !== warehouseBranchId) {
        throw new Error('فرع الطلب لا يطابق فرع المخزن المحدد.');
      }
      branchId = warehouseBranchId;
    }
    branchId = branchId || this.branchAccess.getDefaultAccessibleBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);

    const id = `prq_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const requestNumber = db.nextNumber('PRQ');
      db.run(
        `INSERT INTO purchase_requests (id, request_number, date, branch_id, warehouse_id, requested_by,
          needed_by, priority, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
        [
          id, requestNumber, localDateString(), branchId,
          input.warehouseId || null, actor.id, input.neededBy || null,
          input.priority || 'NORMAL', input.notes || null,
        ]
      );
      for (const item of items) {
        const p = db.query<any>(`SELECT name FROM products WHERE id = ?`, [item.productId])[0];
        if (!p?.name) throw new Error('صنف غير موجود.');
        db.run(
          `INSERT INTO purchase_request_items (id, request_id, product_id, product_name, quantity_m2,
            estimated_unit_cost, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            `pri_${uuidv4().substring(0, 8)}`, id, item.productId, p.name,
            item.quantityM2, round2(item.estimatedUnitCost || 0), item.notes || null,
          ]
        );
      }
      return this.getRequests().find((r) => r.id === id)!;
    });
  }

  public decide(id: string, status: 'APPROVED' | 'REJECTED' | 'ORDERED' | 'CANCELLED'): void {
    const actor = AuthService.requireAuth();
    const requiredPermission = status === 'APPROVED' || status === 'ORDERED'
      ? 'purchases.approve'
      : status === 'REJECTED'
        ? 'purchases.reject'
        : 'purchases.cancel_request';
    PermissionService.require(actor, requiredPermission);
    const scope = this.branchAccess.sqlScope('branch_id', undefined, actor);
    const req = this.db.query<{ status: string }>(
      `SELECT status FROM purchase_requests WHERE id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    )[0];
    if (!req) throw new Error('الطلب غير موجود.');
    if (req.status !== 'PENDING' && !(req.status === 'APPROVED' && status === 'ORDERED')) {
      throw new Error('لا يمكن تعديل طلب مغلق أو تنفيذ هذا الانتقال من حالته الحالية.');
    }
    this.db.run(
      `UPDATE purchase_requests SET status = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, actor.id, id]
    );
  }
}
