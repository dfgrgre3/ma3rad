import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { localDateString } from '../../../utils/shared/date';
import type { ApprovalRequest } from './approvalTypes';
import { ApprovalPolicyService } from './ApprovalPolicyService';
import { applyRegisteredApprovalEffect } from './ApprovalEffectRegistry';
import { applyRegisteredRejectionEffect } from './ApprovalEffectRegistry';
import '../inventory/InventoryService';

export class ApprovalDecisionService {
  private readonly db = DatabaseManager.getInstance();
  private readonly branchAccess = new BranchAccessService();

  decide(id: string, approved: boolean, notes?: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, approved ? 'ui.approvals.inbox.approve' : 'ui.approvals.inbox.reject');
    ModuleRegistryService.assertModuleEnabled('approvals');
    const row = this.db.query<ApprovalRequest>(
      `SELECT a.*, a.request_type AS requestType, a.reference_type AS referenceType,
              a.reference_id AS referenceId, a.requested_by AS requestedBy, a.requested_value AS requestedValue,
              a.current_value AS currentValue, a.payload AS payload
       FROM approval_requests a WHERE a.id = ? AND ${this.branchAccess.sqlScope('a.branch_id', undefined, actor).clause}`,
      [id, ...this.branchAccess.sqlScope('a.branch_id', undefined, actor).params]
    )[0];
    if (!row) throw new Error('الطلب غير موجود.');
    if (row.status !== 'PENDING') throw new Error('تم اتخاذ قرار في هذا الطلب بالفعل.');
    if (!approved && !notes?.trim()) throw new Error('يجب كتابة سبب الرفض.');
    if (row.requestType === 'STOCK_ADJUSTMENT' && row.referenceType === 'STOCK_ADJUSTMENT') {
      const details = row.payload ? JSON.parse(row.payload) as { policy?: { approverRoles?: string[]; allowSelfApproval?: boolean; minApprovals?: number; approvalMode?: string }; operationCode?: string } : {};
      const policy = details.policy || new ApprovalPolicyService().getPolicy('inventory.adjustment.create');
      PermissionService.require(actor, 'inventory.adjustment.approve');
      if (!policy.allowSelfApproval && row.requestedBy === actor.id) throw new Error('لا يمكن لمنشئ طلب المخزون اعتماده.');
      if (policy.approverRoles?.length && !policy.approverRoles.includes(actor.role) && actor.role !== 'ADMIN') {
        throw new Error('دور المستخدم غير مخول لاعتماد هذا الطلب.');
      }
    }
    if (row.requestedBy === actor.id) {
      const details = row.payload ? JSON.parse(row.payload) as { operationCode?: string; policy?: { allowSelfApproval?: boolean } } : {};
      if (row.requestType !== 'STOCK_ADJUSTMENT' && ModuleRegistryService.getModuleSettings('approvals').requireSegregationOfDuties === true && !details.policy?.allowSelfApproval) {
        throw new Error('لا يمكنك اعتماد طلب أنشأته بنفسك وفق سياسة فصل المهام.');
      }
    }
    if (row.payload) {
      const payload = JSON.parse(row.payload) as { operationCode?: string; policy?: { approverRoles?: string[]; allowSelfApproval?: boolean } };
      if (payload.operationCode && payload.operationCode !== 'inventory.adjustment.create') {
        throw new Error(`لا يمكن اعتماد هذا الطلب؛ تنفيذ العملية ${payload.operationCode} غير موصول بعد.`);
      }
      if (approved && payload.policy?.approverRoles?.length && !payload.policy.approverRoles.includes(actor.role) && actor.role !== 'ADMIN') {
        throw new Error('دور المستخدم غير مخول لاعتماد هذا الطلب.');
      }
    }
    this.db.executeTransaction((db) => {
      if (!db.query<{ id: string }>(`SELECT id FROM approval_requests WHERE id = ? AND status = 'PENDING'`, [id])[0]) {
        throw new Error('تغيرت حالة الطلب؛ أعد تحميل قائمة الموافقات.');
      }
      if (!approved && !notes?.trim()) throw new Error('يجب كتابة سبب الرفض.');
      if (!approved && row.payload) {
        const rejectionPolicy = JSON.parse(row.payload) as { policy?: { approvalMode?: string } };
        if (rejectionPolicy.policy?.approvalMode === 'MULTI') db.run(`INSERT OR IGNORE INTO approval_decisions (id, approval_request_id, decision, decided_by, notes) VALUES (?, ?, 'REJECTED', ?, ?)`, [`apd_${uuidv4().substring(0, 8)}`, id, actor.id, notes || null]);
      }
      if (approved && row.payload) {
        const details = JSON.parse(row.payload) as { policy?: { approvalMode?: string; minApprovals?: number } };
        if (details.policy?.approvalMode === 'MULTI') {
          if (db.query<{ id: string }>('SELECT id FROM approval_decisions WHERE approval_request_id = ? AND decided_by = ?', [id, actor.id]).length) {
            throw new Error('سجلت قرارك لهذا الطلب بالفعل.');
          }
          db.run(`INSERT INTO approval_decisions (id, approval_request_id, decision, decided_by, notes) VALUES (?, ?, 'APPROVED', ?, ?)`,
            [`apd_${uuidv4().substring(0, 8)}`, id, actor.id, notes || null]);
          const approvals = db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM approval_decisions WHERE approval_request_id = ? AND decision = 'APPROVED'`, [id])[0]?.count || 0;
          if (approvals < Math.max(1, details.policy.minApprovals || 1)) {
            db.run(`INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values) VALUES (?, ?, ?, 'تسجيل موافقة مرحلية', 'APPROVALS', ?, ?)`,
              [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ approvals, required: details.policy.minApprovals })]);
            return;
          }
        }
      }

      const applied = row.requestType === 'STOCK_ADJUSTMENT'
        ? (approved ? applyRegisteredApprovalEffect(row, actor, db) : applyRegisteredRejectionEffect(row, actor, db))
        : approved ? this.applyApprovedEffect(row, db) : null;
      db.run(`INSERT OR IGNORE INTO approval_decisions (id, approval_request_id, decision, decided_by, notes) VALUES (?, ?, ?, ?, ?)`,
        [`apd_${uuidv4().substring(0, 8)}`, id, approved ? 'APPROVED' : 'REJECTED', actor.id, notes || null]);
      db.run(
        `UPDATE approval_requests SET status = ?, decided_by = ?, decided_at = ?, decision_notes = ? WHERE id = ? AND status = 'PENDING'`,
        [approved ? 'APPROVED' : 'REJECTED', actor.id, new Date().toISOString(), notes || null, id]
      );
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

  private applyApprovedEffect(row: ApprovalRequest, db: DatabaseManager): string | null {
    if (row.referenceType === 'CONTRACT' && row.referenceId) {
      const contract = db.query<{ status: string; startDate: string | null; endDate: string | null }>(
        `SELECT status, start_date AS startDate, end_date AS endDate FROM enterprise_contracts WHERE id = ?`,
        [row.referenceId]
      )[0];
      if (contract && contract.status === 'DRAFT') {
        const today = localDateString();
        const startDate = contract.startDate && contract.startDate <= (contract.endDate || '')
          ? contract.startDate
          : today;
        db.run(
          "UPDATE enterprise_contracts SET status = 'ACTIVE', start_date = ?, updated_at = ? WHERE id = ?",
          [startDate, new Date().toISOString(), row.referenceId]
        );
        return `تم تفعيل العقد ${row.referenceId}`;
      }
      return null;
    }

    if (row.referenceType === 'DOCUMENT' && row.referenceId) {
      const document = db.query<{ status: string }>(
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

    if (row.requestType === 'DISCOUNT') {
      // The commercial effect is applied atomically when the pending sale is
      // posted: the sales service matches this approval to the invoice and
      // consumes it (reference_type becomes SALES_INVOICE). Approving here only
      // authorises that next invoice.
      return 'تم اعتماد الخصم؛ سيُستهلك الاعتماد عند إصدار الفاتورة المرتبطة.';
    }

    if (!row.referenceId || row.requestedValue == null) return null;
    const value = Number(row.requestedValue);
    if (!Number.isFinite(value) || value < 0) return null;

    if (row.requestType === 'CREDIT_LIMIT') {
      const customer = db.query<{ id: string; credit_limit: number | string | null }>(
        `SELECT id, credit_limit FROM customers WHERE id = ?`,
        [row.referenceId]
      )[0];
      if (!customer) return null;
      db.run(
        `UPDATE customers SET credit_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [value, row.referenceId]
      );
      return `تم تحديث حد الائتمان من ${Number(customer.credit_limit) || 0} إلى ${value}`;
    }

    if (row.requestType === 'PRICE_CHANGE') {
      const product = db.query<{ id: string; selling_price_m2: number | string | null }>(
        `SELECT id, selling_price_m2 FROM products WHERE id = ?`,
        [row.referenceId]
      )[0];
      if (!product) return null;
      db.run(
        `UPDATE products SET selling_price_m2 = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [value, row.referenceId]
      );
      return `تم تحديث سعر البيع من ${Number(product.selling_price_m2) || 0} إلى ${value}`;
    }
    return null;
  }

}






