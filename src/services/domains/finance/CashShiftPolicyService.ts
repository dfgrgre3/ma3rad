import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';

export interface ResolvedCashShift {
  shiftId?: string;
  registerId?: string;
}

/** Central policy for associating cash operations with the current cashier's open branch shift. */
export class CashShiftPolicyService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  public resolve(
    branchId: string,
    options: { shiftId?: string; registerId?: string; required?: boolean } = {}
  ): ResolvedCashShift {
    const actor = AuthService.requireAuth();
    this.branchAccess.requireBranchAccess(branchId, actor);
    const params: any[] = [branchId, actor.id];
    let shiftPredicate = '';
    if (options.shiftId) {
      shiftPredicate = 'AND cs.id = ?';
      params.push(options.shiftId);
    } else if (options.registerId) {
      shiftPredicate = 'AND cs.register_id = ?';
      params.push(options.registerId);
    }
    const shift = this.db.query<{ id: string; registerId: string; status: string; userId: string; branchId: string }>(
      `SELECT cs.id, cs.register_id AS registerId, cs.status, cs.user_id AS userId,
              COALESCE(cs.branch_id, cr.branch_id) AS branchId
       FROM cash_shifts cs JOIN cash_registers cr ON cr.id = cs.register_id
       WHERE cr.branch_id = ? AND cr.is_active = 1 AND cs.user_id = ? ${shiftPredicate}
       ORDER BY CASE WHEN cs.status = 'OPEN' THEN 0 ELSE 1 END, cs.opened_at DESC LIMIT 1`,
      params
    )[0];

    if (!shift || shift.status !== 'OPEN') {
      if (options.required) {
        throw new Error('يجب فتح وردية كاشير على فرع الفاتورة قبل تنفيذ حركة نقدية.');
      }
      if (options.shiftId) throw new Error('الوردية المحددة غير مفتوحة للكاشير الحالي وفي فرع الفاتورة.');
      return { registerId: options.registerId };
    }
    if (shift.branchId !== branchId) throw new Error('الوردية المحددة لا تتبع فرع الفاتورة.');

    const accessible = this.branchAccess.requireShiftAccess(shift.id, actor, options.registerId);
    if (accessible.status !== 'OPEN' || accessible.branchId !== branchId || shift.userId !== actor.id) {
      throw new Error('يجب استخدام وردية مفتوحة للكاشير الحالي وفي فرع الفاتورة.');
    }
    return { shiftId: shift.id, registerId: shift.registerId };
  }
}
