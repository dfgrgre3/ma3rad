import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import type { ApprovalRequest, CreateApprovalRequestInput } from './approvalTypes';
import { ApprovalPolicyService } from './ApprovalPolicyService';

export class ApprovalRequestService {
  private readonly db = DatabaseManager.getInstance();
  private readonly branchAccess = new BranchAccessService();

  createRequest(input: CreateApprovalRequestInput): ApprovalRequest {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.approvals.inbox.create');
    ModuleRegistryService.assertModuleEnabled('approvals');
    if (!input.title.trim()) throw new Error('عنوان الطلب مطلوب.');
    if (input.operationCode) throw new Error('يجب إنشاء الاعتماد من خدمة العملية لضمان تنفيذ أثره بعد الموافقة.');
    const referenceBranchId = this.resolveReferenceBranch(input.referenceType, input.referenceId);
    const referenceType = input.referenceType?.toUpperCase();
    const requiresBranchSource = Boolean(input.referenceId && referenceType && [
      'SALES_INVOICE', 'INVOICE', 'PURCHASE_INVOICE', 'PURCHASE', 'INVENTORY_TRANSACTION', 'STOCK_ADJUSTMENT', 'PURCHASE_REQUEST',
    ].includes(referenceType));
    if (requiresBranchSource && !referenceBranchId) throw new Error('تعذر تحديد فرع المعاملة المرتبطة بطلب الاعتماد.');
    if (input.branchId && referenceBranchId && input.branchId !== referenceBranchId) throw new Error('فرع الطلب لا يطابق فرع المعاملة المرتبطة.');
    const branchId = input.branchId || referenceBranchId || this.branchAccess.getDefaultAccessibleBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);

    const id = `apr_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const requestNumber = db.nextNumber('APR');
      db.run(`INSERT INTO approval_requests (
        id, request_number, request_type, reference_type, reference_id, branch_id, title, description,
        requested_value, current_value, priority, requested_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        id, requestNumber, input.requestType, input.referenceType || null, input.referenceId || null,
        branchId, input.title.trim(), input.description || null, input.requestedValue ?? null,
        input.currentValue ?? null, input.priority || 'NORMAL', actor.id,
      ]);
      db.run(`INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'إنشاء طلب اعتماد', 'APPROVALS', ?, ?)`, [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
        JSON.stringify({ operationCode: null, requestNumber, status: 'PENDING' }),
      ]);
      return db.query<ApprovalRequest>('SELECT * FROM approval_requests WHERE id = ?', [id])[0];
    });
  }
  createInventoryAdjustmentRequest(input: {
    id: string; adjustmentNumber: string; warehouseId: string; productName: string;
    productId: string; quantity: number; reason: string; branchId: string | null;
    expiresAfterHours: number | null;
  }, actor: ReturnType<typeof AuthService.requireAuth>, db: DatabaseManager = this.db): void {
    // Persist policy context with the immutable request. Later policy edits apply only to new requests.
    const operationPolicy = new ApprovalPolicyService().getPolicy('inventory.adjustment.create');
    const warehouse = db.query<{ name: string }>('SELECT name FROM warehouses WHERE id = ?', [input.warehouseId])[0];
    if (!warehouse) throw new Error('المخزن المرتبط بطلب الموافقة غير موجود.');
    const existing = db.query<{ id: string }>(
      `SELECT id FROM approval_requests WHERE reference_type = 'STOCK_ADJUSTMENT' AND reference_id = ? AND request_type = 'STOCK_ADJUSTMENT'`,
      [input.id]
    )[0];
    if (existing) throw new Error('طلب موافقة هذه التسوية موجود بالفعل.');
    const id = `apr_${uuidv4().substring(0, 8)}`;
    const requestNumber = db.nextNumber('APR');
    const expiresAt = input.expiresAfterHours == null ? null : new Date(Date.now() + input.expiresAfterHours * 3_600_000).toISOString();
    db.run(`
      INSERT INTO approval_requests (
        id, request_number, request_type, reference_type, reference_id, branch_id,
        title, description, payload, requested_value, current_value, priority, requested_by, expires_at
      ) VALUES (?, ?, 'STOCK_ADJUSTMENT', 'STOCK_ADJUSTMENT', ?, ?, ?, ?, ?, ?, NULL, 'NORMAL', ?, ?)
    `, [id, requestNumber, input.id, input.branchId, `إضافة مخزون ${input.productName} — ${input.adjustmentNumber}`,
      `إضافة ${input.quantity} من ${input.productName} إلى ${warehouse.name}. ${input.reason}`,
      JSON.stringify({ operationCode: 'inventory.adjustment.create', policy: operationPolicy, adjustmentId: input.id, productId: input.productId, productName: input.productName,
        warehouseId: input.warehouseId, warehouseName: warehouse.name, quantity: input.quantity, reason: input.reason }),
      input.quantity, actor.id, expiresAt]);
    db.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
      VALUES (?, ?, ?, 'إنشاء طلب إضافة مخزون', 'APPROVALS', ?, ?)
    `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
      JSON.stringify({ requestNumber, operation: 'inventory.adjustment.create', quantity: input.quantity, adjustmentId: input.id })]);
  }

  cancel(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.approvals.inbox.cancel');
    ModuleRegistryService.assertModuleEnabled('approvals');
    const scope = this.branchAccess.sqlScope('branch_id', undefined, actor);
    const row = this.db.query<ApprovalRequest>(
      `SELECT * FROM approval_requests WHERE id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    )[0];
    if (!row) throw new Error('الطلب غير موجود أو خارج نطاق الفروع المصرح به.');
    if (row.status !== 'PENDING') throw new Error('لا يمكن إلغاء طلب غير معلق.');
    this.db.executeTransaction((db) => {
      if (row.requestType === 'STOCK_ADJUSTMENT' && row.referenceType === 'STOCK_ADJUSTMENT' && row.referenceId) {
        const adjustment = db.query<{ status: string; approvalStatus: string }>(
          `SELECT status, approval_status AS approvalStatus FROM stock_adjustments WHERE id = ?`, [row.referenceId]
        )[0];
        if (!adjustment || adjustment.status !== 'PENDING_APPROVAL' || adjustment.approvalStatus !== 'PENDING') {
          throw new Error('تسوية المخزون لم تعد معلقة ولا يمكن إلغاء طلبها.');
        }
        db.run(`UPDATE stock_adjustments SET status = 'CANCELLED' WHERE id = ? AND status = 'PENDING_APPROVAL' AND approval_status = 'PENDING'`, [row.referenceId]);
      }
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

  /**
   * An approved discount authorisation that has not yet been consumed by an
   * invoice. The cashier can retry the same sale without raising a duplicate
   * request; the sales service still re-validates and consumes it atomically.
   */
  findApprovedDiscountRequest(customerId: string | null | undefined, amount: number): { id: string } | null {
    const actor = AuthService.requireAuth();
    const row = this.db.query<{ id: string }>(
      `SELECT id FROM approval_requests
       WHERE request_type = 'DISCOUNT' AND status = 'APPROVED'
         AND requested_by = ?
         AND ABS(COALESCE(requested_value, 0) - ?) <= 0.01
         AND (reference_type IS NULL OR reference_type IN ('POS', 'MANUAL'))
         AND (reference_id IS NULL OR reference_id = ?)
       ORDER BY decided_at DESC, created_at DESC LIMIT 1`,
      [actor.id, Number(amount) || 0, customerId || null]
    )[0];
    return row || null;
  }

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
}







