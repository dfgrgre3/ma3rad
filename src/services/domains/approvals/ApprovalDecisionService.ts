import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { localDateString } from '../../../utils/shared/date';
import type { ApprovalRequest } from './approvalTypes';

export class ApprovalDecisionService {
  private readonly db = DatabaseManager.getInstance();
  private readonly branchAccess = new BranchAccessService();

  decide(id: string, approved: boolean, notes?: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, approved ? 'ui.approvals.inbox.approve' : 'ui.approvals.inbox.reject');
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
