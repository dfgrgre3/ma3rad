import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { User } from '../../../../types';
import { v4 as uuidv4 } from 'uuid';
import { PermissionService } from '../PermissionService';
import { authSession } from '../session';
import { OperationApprovalGate } from '../../approvals/OperationApprovalGate';

/**
 * Base class for AuthService. Holds the shared database handle, the thin
 * authSession wrappers and the cross-cutting helpers (audit logging, user
 * mapping, actor resolution and operation-approval gating) used by every
 * responsibility group. Not part of the public API — AuthService in
 * ../AuthService.ts is the exported entry point.
 */
export class AuthServiceCore {
  protected db = DatabaseManager.getInstance();

  /** Returns the logged-in user, or null if not authenticated. Never silently impersonates admin. */
  public static getCurrentUser(): User | null {
    return authSession.getCurrentUser();
  }

  /** Throws if no user is authenticated. Use at the top of every service method (brief §108). */
  public static requireAuth(): User {
    return authSession.requireAuth();
  }

  protected static requireSetupAuth(): User {
    return authSession.requireAuth({ allowIncompleteSetup: true });
  }

  public static setCurrentUser(user: User): void {
    authSession.setCurrentUser(user);
    PermissionService.invalidate(user);
  }

  protected requireActor(_actor?: User | null): User {
    return AuthServiceCore.requireAuth();
  }

  /** Evaluate an approval policy and return the gate with an approved id when one exists. */
  protected prepareOperationApproval(
    operationCode: string,
    title: string,
    description: string,
    matchDetails: Record<string, unknown>,
    dedupeKey: string,
    options?: { approvalId?: string }
  ): { gate: OperationApprovalGate; approvalId: string | null } {
    const gate = new OperationApprovalGate(this.db);
    const { required } = gate.evaluate(operationCode);
    if (!required) return { gate, approvalId: null };
    const approvalId = options?.approvalId
      ?? gate.findApproved(operationCode, 'OTHER', matchDetails);
    if (options?.approvalId) gate.assertApproved(options.approvalId, operationCode, matchDetails);
    if (!approvalId) {
      const requestId = gate.requestApproval({
        operationCode,
        requestType: 'OTHER',
        title,
        description,
        details: { ...matchDetails, dedupeKey },
      });
      gate.throwRequested(requestId);
    }
    return { gate, approvalId };
  }

  protected mapUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      fullName: row.fullName,
      role: row.role,
      phone: row.phone,
      isActive: Boolean(row.isActive),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  protected audit(actor: User, action: string, module: string, recordId: string, oldValues: unknown, newValues: unknown): void {
    try {
      this.db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 10)}`,
          actor.id,
          actor.fullName,
          action,
          module,
          recordId,
          oldValues == null ? null : JSON.stringify(oldValues),
          newValues == null ? null : JSON.stringify(newValues),
        ]
      );
    } catch {
      // audit must never break the operation
    }
  }
}
