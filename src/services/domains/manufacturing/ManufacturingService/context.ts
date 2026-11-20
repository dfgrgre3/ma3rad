import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { BranchAccessService } from '../../auth/BranchAccessService';
import { ModuleRegistryService } from '../../config/ModuleRegistryService';
import type { User } from '../../../../types/auth/identity';

/**
 * Shared dependencies and cross-cutting guards for the manufacturing
 * sub-modules. Extracted verbatim from ManufacturingService.
 */
export class ManufacturingContext {
  public db = DatabaseManager.getInstance();
  public branchAccess = new BranchAccessService();

  public require(permission: string): User {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, permission);
    return actor;
  }

  /**
   * Accept any of the given permission codes — used to honour the granular
   * manufacturing.* permissions while keeping manufacturing.manage/view as
   * backward-compatible fallbacks.
   */
  public requireAny(permissions: string[]): User {
    const actor = AuthService.requireAuth();
    const allowed = permissions.some((code) => {
      try {
        PermissionService.require(actor, code);
        return true;
      } catch {
        return false;
      }
    });
    if (!allowed) {
      throw new Error(`ليس لديك صلاحية تنفيذ هذا الإجراء (${permissions.join(' / ')}).`);
    }
    return actor;
  }

  public guardWrites(): void {
    ModuleRegistryService.assertModuleEnabled('manufacturing');
  }

  public audit(action: string, recordId: string, values?: unknown): void {
    const actor = AuthService.requireAuth();
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'MANUFACTURING', ?, ?)`,
      [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, action, recordId,
        values === undefined ? null : JSON.stringify(values),
      ]
    );
  }
}
