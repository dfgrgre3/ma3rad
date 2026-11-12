import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { writeAuditLog } from '../../security/auditWriter';
import type { User } from '../../../../types';
import type { PermissionEffect } from './types';

export class UserPermissionService {
  private static audit(
    actor: User | null | undefined,
    action: string,
    module: string,
    recordId: string | null,
    oldValues: unknown,
    newValues: unknown
  ): void {
    try {
      writeAuditLog({
        userId: actor?.id || 'system',
        userName: actor?.fullName || 'النظام',
        action,
        module,
        recordId: recordId || undefined,
        oldValues: oldValues == null ? undefined : JSON.stringify(oldValues),
        newValues: newValues == null ? undefined : JSON.stringify(newValues),
      });
    } catch {
      // auditing must never break the operation
    }
  }

  public static getUserOverrides(userId: string): { code: string; effect: PermissionEffect }[] {
    try {
      return DatabaseManager.getInstance().query<{ code: string; effect: PermissionEffect }>(
        'SELECT permission_code AS code, COALESCE(effect, \'GRANT\') AS effect FROM user_permissions WHERE user_id = ?',
        [userId]
      );
    } catch {
      return [];
    }
  }

  public static setUserOverride(
    userId: string,
    permissionCode: string,
    effect: PermissionEffect | null,
    actor?: User | null,
    onChanged?: () => void,
    requireCheck?: (actor: User | null, code: string) => void
  ): void {
    if (requireCheck) {
      requireCheck(actor ?? null, 'users.permissions');
    }
    const db = DatabaseManager.getInstance();
    if (effect === null) {
      db.run('DELETE FROM user_permissions WHERE user_id = ? AND permission_code = ?', [userId, permissionCode]);
    } else {
      // Replace is not valid with a composite PK in sql.js for every version,
      // so delete-then-insert keeps behaviour deterministic.
      db.run('DELETE FROM user_permissions WHERE user_id = ? AND permission_code = ?', [userId, permissionCode]);
      db.run('INSERT INTO user_permissions (user_id, permission_code, effect) VALUES (?, ?, ?)', [
        userId,
        permissionCode,
        effect,
      ]);
    }
    if (onChanged) onChanged();
    UserPermissionService.audit(actor, 'تعديل صلاحية مستخدم', 'USERS', userId, null, { permissionCode, effect });
  }

  public static clearUserOverrides(
    userId: string,
    actor?: User | null,
    onChanged?: () => void,
    requireCheck?: (actor: User | null, code: string) => void
  ): void {
    if (requireCheck) {
      requireCheck(actor ?? null, 'users.permissions');
    }
    DatabaseManager.getInstance().run('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
    if (onChanged) onChanged();
    UserPermissionService.audit(actor, 'مسح تخصيصات صلاحيات مستخدم', 'USERS', userId, null, null);
  }
}

