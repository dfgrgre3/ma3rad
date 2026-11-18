import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import type { ApprovalType } from './approvalTypes';
import { ApprovalPolicyService, type ApprovalPolicy } from './ApprovalPolicyService';

export interface OperationApprovalEvaluation {
  policy: ApprovalPolicy;
  /** True when the current actor must raise an approval request before executing. */
  required: boolean;
}

export interface PendingOperationApprovalInput {
  operationCode: string;
  requestType: ApprovalType;
  title: string;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  branchId?: string | null;
  requestedValue?: number | null;
  currentValue?: number | null;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  /** Operation-specific snapshot stored in payload.details for audit/review. */
  details?: Record<string, unknown>;
}

/**
 * Unified gate for sensitive operations governed by approval_policies.
 *
 * Flow (same contract as the discount and plan-change approvals):
 *  1. The service evaluates the policy. When approval is required and no
 *     approvalId is supplied, a PENDING approval_requests row is registered
 *     (deduplicated per operation+reference) and the operation is rejected.
 *  2. A different user approves the request in the approvals inbox.
 *  3. The operator retries the operation with the approvalId; the service
 *     validates it (APPROVED, same requester, unconsumed, matching payload)
 *     and consumes it atomically with the business effect.
 */
export class OperationApprovalGate {
  private readonly db: DatabaseManager;
  private readonly policies = new ApprovalPolicyService();
  private readonly branchAccess = new BranchAccessService();

  constructor(db: DatabaseManager = DatabaseManager.getInstance()) {
    this.db = db;
  }

  /**
   * Evaluates whether `operationCode` requires approval for `value`.
   * Mirrors the stock-adjustment rule: ADMIN/SUPER_ADMIN bypass the gate,
   * mode APPROVAL always requires it, and maxValue acts as a threshold.
   */
  evaluate(operationCode: string, value?: number | null): OperationApprovalEvaluation {
    const actor = AuthService.requireAuth();
    const policy = this.policies.assertCanExecute(operationCode, actor);
    const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN';
    const numericValue = value == null ? null : Number(value);
    const required = !isAdmin && (
      policy.mode === 'APPROVAL' ||
      (policy.maxValue != null && numericValue != null && Number.isFinite(numericValue) && numericValue > policy.maxValue)
    );
    return { policy, required };
  }

  /**
   * Registers (or reuses) a PENDING approval request for an operation and
   * returns its id. Caller is expected to throw right after so nothing executes.
   */
  requestApproval(input: PendingOperationApprovalInput, db: DatabaseManager = this.db): string {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'approvals.create');
    ModuleRegistryService.assertModuleEnabled('approvals');
    if (!input.title.trim()) throw new Error('عنوان طلب الموافقة مطلوب.');
    const policy = this.policies.getPolicy(input.operationCode);

    // Gate requests keep reference_type NULL until consumption (that column is
    // the consumed marker checked by assertApproved). Deduplication therefore
    // relies on details.dedupeKey inside the payload.
    const dedupeKey = typeof input.details?.dedupeKey === 'string' ? input.details.dedupeKey : null;
    const existing = dedupeKey
      ? db.query<{ id: string }>(
        `SELECT id FROM approval_requests
         WHERE status = 'PENDING' AND request_type = ? AND requested_by = ?
           AND payload LIKE ?
         ORDER BY created_at DESC LIMIT 1`,
        [input.requestType, actor.id, `%"dedupeKey":"${dedupeKey}"%`]
      )[0]
      : null;
    if (existing) return existing.id;

    const id = `apr_${uuidv4().substring(0, 8)}`;
    const requestNumber = db.nextNumber('APR');
    const expiresAt = policy.expiresAfterHours == null
      ? null
      : new Date(Date.now() + policy.expiresAfterHours * 3_600_000).toISOString();
    // approval_requests.branch_id is NOT NULL; fall back to the actor's default branch.
    const branchId = input.branchId
      ?? this.branchAccess.getDefaultAccessibleBranchId(actor)
      ?? db.query<{ id: string }>(`SELECT id FROM branches WHERE is_main = 1 LIMIT 1`)[0]?.id
      ?? null;
    if (!branchId) throw new Error('تعذر تحديد فرع طلب الموافقة.');
    db.run(`
      INSERT INTO approval_requests (
        id, request_number, request_type, reference_type, reference_id, branch_id,
        title, description, payload, requested_value, current_value, priority, requested_by, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, requestNumber, input.requestType, null, null,
      branchId, input.title.trim(), input.description ?? null,
      JSON.stringify({
        operationCode: input.operationCode,
        policy,
        details: input.details ?? {},
      }),
      input.requestedValue ?? null, input.currentValue ?? null,
      input.priority || 'NORMAL', actor.id, expiresAt,
    ]);
    db.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
      VALUES (?, ?, ?, 'إنشاء طلب اعتماد عملية', 'APPROVALS', ?, ?)
    `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
      JSON.stringify({ requestNumber, operationCode: input.operationCode, status: 'PENDING' })]);
    return id;
  }

  /**
   * Finds an APPROVED, unconsumed request created by the current actor for the
   * same operation whose payload.details match `matchDetails`. Lets the caller
   * retry the exact same operation after approval without threading an id
   * through the UI.
   */
  findApproved(
    operationCode: string,
    requestType: ApprovalType,
    matchDetails: Record<string, unknown> = {},
    db: DatabaseManager = this.db
  ): string | null {
    const actor = AuthService.requireAuth();
    const rows = db.query<{ id: string; payload: string | null; expiresAt: string | null }>(
      `SELECT id, payload, expires_at FROM approval_requests
       WHERE request_type = ? AND status = 'APPROVED' AND requested_by = ?
         AND reference_type IS NULL
       ORDER BY decided_at DESC, created_at DESC`,
      [requestType, actor.id]
    );
    const now = new Date().toISOString();
    for (const row of rows) {
      // Check expiration
      if (row.expiresAt && row.expiresAt < now) continue;

      let payload: { operationCode?: string; details?: Record<string, unknown> } = {};
      try { payload = row.payload ? JSON.parse(row.payload) : {}; } catch { continue; }
      if (payload.operationCode !== operationCode) continue;
      const matches = Object.entries(matchDetails).every(
        ([key, expected]) => JSON.stringify(payload.details?.[key]) === JSON.stringify(expected)
      );
      if (matches) return row.id;
    }
    return null;
  }

  /**
   * Validates an approvalId supplied by the caller: it must be an APPROVED,
   * unconsumed request created by the same actor for the same operation whose
   * payload.details match `matchDetails` (exact JSON equality per key).
   */
  assertApproved(
    approvalId: string,
    operationCode: string,
    matchDetails: Record<string, unknown> = {},
    db: DatabaseManager = this.db
  ): { id: string } {
    const actor = AuthService.requireAuth();
    const row = db.query<{
      id: string; status: string; requestType: string; requestedBy: string;
      referenceType: string | null; payload: string | null; expiresAt: string | null;
    }>(
      `SELECT id, status, request_type, requested_by, reference_type, payload, expires_at
       FROM approval_requests WHERE id = ?`,
      [approvalId]
    )[0];
    if (!row) throw new Error('طلب الموافقة غير موجود.');
    if (row.status !== 'APPROVED') throw new Error('طلب الموافقة غير معتمد بعد.');
    if (row.referenceType != null) throw new Error('تم استهلاك طلب الموافقة هذا من قبل.');
    if (row.requestedBy !== actor.id) throw new Error('طلب الموافقة لا يخص المستخدم الحالي.');
    // Check expiration
    if (row.expiresAt && row.expiresAt < new Date().toISOString()) {
      throw new Error('طلب الموافقة منتهي الصلاحية.');
    }
    let payload: { operationCode?: string; details?: Record<string, unknown> } = {};
    try { payload = row.payload ? JSON.parse(row.payload) : {}; } catch { payload = {}; }
    if (payload.operationCode !== operationCode) {
      throw new Error('طلب الموافقة لا يخص هذه العملية.');
    }
    for (const [key, expected] of Object.entries(matchDetails)) {
      const actual = payload.details?.[key];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error('تفاصيل العملية لا تطابق طلب الموافقة المعتمد.');
      }
    }
    return { id: row.id };
  }

  /**
   * Marks an approved request as consumed by linking it to the business record
   * that executed under it. Must run inside the same transaction as the effect
   * so a failed operation never burns the approval.
   */
  consume(approvalId: string, referenceType: string, referenceId: string, db: DatabaseManager = this.db): void {
    db.run(
      `UPDATE approval_requests SET reference_type = ?, reference_id = ?
       WHERE id = ? AND status = 'APPROVED' AND reference_type IS NULL`,
      [referenceType, referenceId, approvalId]
    );
    if ((db.getDatabase() as any).getRowsModified() !== 1) {
      throw new Error('تعذر ربط الاعتماد بالعملية؛ ربما استُهلك من قبل.');
    }
  }

  /** Throws the standard "approval requested" error after registering the request. */
  throwRequested(approvalId: string): never {
    throw new Error(
      `العملية تتطلب موافقة. تم تسجيل طلب الموافقة (${approvalId}). بعد اعتماده أعد تنفيذ العملية مع رقم الاعتماد.`
    );
  }
}
