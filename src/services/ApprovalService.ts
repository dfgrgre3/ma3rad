import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { ModuleRegistryService } from './ModuleRegistryService';

export type ApprovalType =
  | 'DISCOUNT' | 'PRICE_CHANGE' | 'SALES_RETURN' | 'PURCHASE_RETURN'
  | 'STOCK_ADJUSTMENT' | 'PURCHASE_ORDER' | 'EXPENSE' | 'CREDIT_LIMIT' | 'LEAVE' | 'OTHER';

export interface ApprovalRequest {
  id: string;
  requestNumber: string;
  requestType: ApprovalType;
  referenceType?: string | null;
  referenceId?: string | null;
  title: string;
  description?: string | null;
  requestedValue?: number | null;
  currentValue?: number | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  requestedBy: string;
  requestedByName?: string;
  decidedBy?: string | null;
  decidedByName?: string;
  decidedAt?: string | null;
  decisionNotes?: string | null;
  createdAt: string;
}

export class ApprovalService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private resolveReferenceBranch(referenceType?: string, referenceId?: string): string | null {
    if (!referenceType || !referenceId) return null;
    switch (referenceType.toUpperCase()) {
      case 'SALES_INVOICE':
      case 'INVOICE':
        return this.db.query<{ branchId: string | null }>(
          `SELECT COALESCE(si.branch_id, w.branch_id) AS branchId
           FROM sales_invoices si LEFT JOIN warehouses w ON w.id = si.warehouse_id WHERE si.id = ?`,
          [referenceId]
        )[0]?.branchId ?? null;
      case 'PURCHASE_INVOICE':
      case 'PURCHASE':
        return this.db.query<{ branchId: string | null }>(
          `SELECT COALESCE(pi.branch_id, w.branch_id) AS branchId
           FROM purchase_invoices pi LEFT JOIN warehouses w ON w.id = pi.warehouse_id WHERE pi.id = ?`,
          [referenceId]
        )[0]?.branchId ?? null;
      case 'INVENTORY_TRANSACTION':
      case 'STOCK_ADJUSTMENT':
        return this.db.query<{ branchId: string | null }>(
          `SELECT w.branch_id AS branchId FROM inventory_transactions it
           JOIN warehouses w ON w.id = it.warehouse_id WHERE it.id = ?`,
          [referenceId]
        )[0]?.branchId ?? null;
      case 'PURCHASE_REQUEST':
        return this.db.query<{ branchId: string | null }>(
          'SELECT branch_id AS branchId FROM purchase_requests WHERE id = ?',
          [referenceId]
        )[0]?.branchId ?? null;
      case 'DOCUMENT':
        return this.db.query<{ branchId: string | null }>(
          'SELECT branch_id AS branchId FROM enterprise_documents WHERE id = ?',
          [referenceId]
        )[0]?.branchId ?? null;
      case 'CONTRACT':
        return this.db.query<{ branchId: string | null }>(
          'SELECT branch_id AS branchId FROM enterprise_contracts WHERE id = ?',
          [referenceId]
        )[0]?.branchId ?? null;
      default:
        return null;
    }
  }

  public getRequests(status = 'ALL', search = '', type = 'ALL'): ApprovalRequest[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'approvals.view');
    const scope = this.branchAccess.sqlScope('a.branch_id', undefined, actor);
    let sql = `
      SELECT a.*, ru.full_name AS requested_by_name, du.full_name AS decided_by_name
      FROM approval_requests a
      LEFT JOIN users ru ON ru.id = a.requested_by
      LEFT JOIN users du ON du.id = a.decided_by
      WHERE ${scope.clause}`;
    const params: any[] = [...scope.params];
    if (status !== 'ALL') { sql += ` AND a.status = ?`; params.push(status); }
    if (type !== 'ALL') { sql += ` AND a.request_type = ?`; params.push(type); }
    if (search.trim()) {
      sql += ` AND (a.title LIKE ? OR a.description LIKE ? OR a.request_number LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    sql += ` ORDER BY CASE a.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END, a.created_at DESC`;
    return this.db.query<ApprovalRequest>(sql, params);
  }

  public getStats(): { pending: number; approved: number; rejected: number } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'approvals.view');
    const scope = this.branchAccess.sqlScope('branch_id', undefined, actor);
    const rows = this.db.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*) AS count FROM approval_requests
       WHERE ${scope.clause} AND status IN ('PENDING','APPROVED','REJECTED') GROUP BY status`,
      scope.params
    );
    const map = new Map(rows.map((r) => [r.status, Number(r.count)]));
    return {
      pending: map.get('PENDING') || 0,
      approved: map.get('APPROVED') || 0,
      rejected: map.get('REJECTED') || 0,
    };
  }

  public createRequest(input: {
    requestType: ApprovalType; title: string; description?: string;
    requestedValue?: number; currentValue?: number;
    priority?: ApprovalRequest['priority']; referenceType?: string; referenceId?: string; branchId?: string;
  }): ApprovalRequest {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'approvals.create');
    ModuleRegistryService.assertModuleEnabled('approvals');
    if (!input.title.trim()) throw new Error('عنوان الطلب مطلوب.');
    const referenceBranchId = this.resolveReferenceBranch(input.referenceType, input.referenceId);
    const referenceType = input.referenceType?.toUpperCase();
    const requiresBranchSource = Boolean(input.referenceId && referenceType && [
      'SALES_INVOICE', 'INVOICE', 'PURCHASE_INVOICE', 'PURCHASE',
      'INVENTORY_TRANSACTION', 'STOCK_ADJUSTMENT', 'PURCHASE_REQUEST',
    ].includes(referenceType));
    if (requiresBranchSource && !referenceBranchId) {
      throw new Error('تعذر تحديد فرع المعاملة المرتبطة بطلب الاعتماد.');
    }
    if (input.branchId && referenceBranchId && input.branchId !== referenceBranchId) {
      throw new Error('فرع الطلب لا يطابق فرع المعاملة المرتبطة.');
    }
    const branchId = input.branchId || referenceBranchId || this.branchAccess.getDefaultAccessibleBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);

    const id = `apr_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const requestNumber = db.nextNumber('APR');
      db.run(
        `INSERT INTO approval_requests (
          id, request_number, request_type, reference_type, reference_id, branch_id, title, description,
          requested_value, current_value, priority, requested_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, requestNumber, input.requestType, input.referenceType || null, input.referenceId || null,
          branchId, input.title.trim(), input.description || null, input.requestedValue ?? null,
          input.currentValue ?? null, input.priority || 'NORMAL', actor.id,
        ]
      );
      return this.db.query<ApprovalRequest>(`SELECT * FROM approval_requests WHERE id = ?`, [id])[0];
    });
  }

  public decide(id: string, approved: boolean, notes?: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, approved ? 'approvals.approve' : 'approvals.reject');
    ModuleRegistryService.assertModuleEnabled('approvals');
    const scope = this.branchAccess.sqlScope('branch_id', undefined, actor);
    const row = this.db.query<ApprovalRequest>(
      `SELECT * FROM approval_requests WHERE id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    )[0];
    if (!row) throw new Error('الطلب غير موجود.');
    if (row.status !== 'PENDING') throw new Error('تم اتخاذ قرار في هذا الطلب بالفعل.');
    if (ModuleRegistryService.getModuleSettings('approvals').requireSegregationOfDuties === true
      && row.requestedBy === actor.id) {
      throw new Error('لا يمكنك اعتماد طلب أنشأته بنفسك وفق سياسة فصل المهام.');
    }

    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE approval_requests SET status = ?, decided_by = ?, decided_at = ?, decision_notes = ? WHERE id = ?`,
        [approved ? 'APPROVED' : 'REJECTED', actor.id, new Date().toISOString(), notes || null, id]
      );
      const applied = approved ? this.applyApprovedEffect(row, db) : null;
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, ?, 'APPROVALS', ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName,
          approved ? 'اعتماد طلب' : 'رفض طلب', id,
          JSON.stringify({ decision: approved ? 'APPROVED' : 'REJECTED', notes, applied }),
        ]
      );
    });
  }

  /** Execute the approved operation when it has an unambiguous system effect. */
  private applyApprovedEffect(row: ApprovalRequest, db: any): string | null {

    if (row.referenceType === 'CONTRACT' && row.referenceId) {
      const contract = db.query(
        `SELECT status, start_date AS startDate, end_date AS endDate FROM enterprise_contracts WHERE id = ?`,
        [row.referenceId]
      )[0];
      if (contract && contract.status === 'DRAFT') {
        const today = new Date().toISOString().slice(0, 10);
        const startDate = contract.startDate && contract.startDate <= contract.endDate ? contract.startDate : today;
        db.run(
          "UPDATE enterprise_contracts SET status = 'ACTIVE', start_date = ?, updated_at = ? WHERE id = ?",
          [startDate, new Date().toISOString(), row.referenceId]
        );
        return `تم تفعيل العقد ${row.referenceId}`;
      }
      return null;
    }

    if (row.referenceType === 'DOCUMENT' && row.referenceId) {
      const document = db.query(
        `SELECT status FROM enterprise_documents WHERE id = ?`,
        [row.referenceId]
      )[0];
      if (document && document.status === 'DRAFT') {
        db.run(
          "UPDATE enterprise_documents SET status = 'ACTIVE', updated_at = ? WHERE id = ?",
          [new Date().toISOString(), row.referenceId]
        );
        return `تم تفعيل المستند ${row.referenceId}`;
      }
      return null;
    }

    if (!row.referenceId || row.requestedValue == null) return null;
    const value = Number(row.requestedValue);
    if (!Number.isFinite(value) || value < 0) return null;

    if (row.requestType === 'CREDIT_LIMIT') {
      const customer = db.query(`SELECT id, credit_limit FROM customers WHERE id = ?`, [row.referenceId])[0];
      if (!customer) return null;
      db.run(
        `UPDATE customers SET credit_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [value, row.referenceId]
      );
      return `تم تحديث حد الائتمان من ${Number(customer.credit_limit) || 0} إلى ${value}`;
    }

    if (row.requestType === 'PRICE_CHANGE') {
      const product = db.query(`SELECT id, selling_price_m2 FROM products WHERE id = ?`, [row.referenceId])[0];
      if (!product) return null;
      db.run(
        `UPDATE products SET selling_price_m2 = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [value, row.referenceId]
      );
      return `تم تحديث سعر البيع من ${Number(product.selling_price_m2) || 0} إلى ${value}`;
    }
    return null;
  }

  public cancel(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'approvals.cancel');
    ModuleRegistryService.assertModuleEnabled('approvals');
    const scope = this.branchAccess.sqlScope('branch_id', undefined, actor);
    const row = this.db.query<ApprovalRequest>(
      `SELECT * FROM approval_requests WHERE id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    )[0];
    if (!row) throw new Error('الطلب غير موجود أو خارج نطاق الفروع المصرح به.');
    if (row.status !== 'PENDING') throw new Error('لا يمكن إلغاء طلب غير معلق.');
    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE approval_requests SET status = 'CANCELLED', decided_by = ?, decided_at = ?
         WHERE id = ? AND status = 'PENDING'`,
        [actor.id, new Date().toISOString(), id]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'إلغاء طلب اعتماد', 'APPROVALS', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ status: 'CANCELLED' })]
      );
    });
  }
}
