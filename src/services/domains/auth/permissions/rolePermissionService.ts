import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { writeAuditLog } from '../../security/auditWriter';
import type { Role, User } from '../../../../types';
import { v4 as uuidv4 } from 'uuid';

function nowIso(): string {
  return new Date().toISOString();
}

export class RolePermissionService {
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

  public static getRoles(): Role[] {
    return DatabaseManager.getInstance().query<Role>(
      'SELECT id, code, name, description, is_system AS isSystem, created_at AS createdAt FROM roles ORDER BY is_system DESC, name ASC'
    );
  }

  public static getRolePermissions(roleCode: string): string[] {
    return DatabaseManager.getInstance()
      .query<{ permissionCode: string }>(
        'SELECT permission_code AS permissionCode FROM role_permissions WHERE role_code = ?',
        [roleCode]
      )
      .map((r) => r.permissionCode);
  }

  public static setRolePermissions(
    roleCode: string,
    codes: string[],
    actor?: User | null,
    onChanged?: () => void,
    requireCheck?: (actor: User | null, code: string) => void
  ): void {
    if (requireCheck) {
      requireCheck(actor ?? null, 'roles.manage');
    }
    const db = DatabaseManager.getInstance();
    const before = RolePermissionService.getRolePermissions(roleCode);
    db.executeTransaction(() => {
      db.run('DELETE FROM role_permissions WHERE role_code = ?', [roleCode]);
      for (const code of codes) {
        db.run(
          'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
          [roleCode, code]
        );
      }
    });
    if (onChanged) onChanged();
    RolePermissionService.audit(actor, 'تعديل صلاحيات دور', 'ROLES', roleCode, before, codes);
  }

  public static createRole(
    input: { code: string; name: string; description?: string },
    actor?: User | null,
    requireCheck?: (actor: User | null, code: string) => void
  ): Role {
    if (requireCheck) {
      requireCheck(actor ?? null, 'roles.manage');
    }
    const db = DatabaseManager.getInstance();
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,30}$/.test(code)) {
      throw new Error('كود الدور يجب أن يكون بالإنجليزية (حروف كبيرة وأرقام و_ فقط).');
    }
    if (db.query('SELECT id FROM roles WHERE code = ?', [code]).length > 0) {
      throw new Error('كود الدور مستخدم مسبقاً.');
    }
    const id = `role_${uuidv4().substring(0, 8)}`;
    db.run(
      'INSERT INTO roles (id, code, name, description, is_system) VALUES (?, ?, ?, ?, 0)',
      [id, code, input.name.trim(), input.description || '']
    );
    RolePermissionService.audit(actor, 'إنشاء دور جديد', 'ROLES', id, null, input);
    return { id, code, name: input.name, description: input.description, isSystem: false, createdAt: nowIso() };
  }

  public static updateRole(
    id: string,
    patch: { name?: string; description?: string },
    actor?: User | null,
    requireCheck?: (actor: User | null, code: string) => void
  ): void {
    if (requireCheck) {
      requireCheck(actor ?? null, 'roles.manage');
    }
    const db = DatabaseManager.getInstance();
    const role = db.query<Role>('SELECT id, code, name, is_system AS isSystem FROM roles WHERE id = ?', [id])[0];
    if (!role) throw new Error('الدور غير موجود.');
    db.run('UPDATE roles SET name = ?, description = ? WHERE id = ?', [
      patch.name ?? role.name,
      patch.description ?? '',
      id,
    ]);
    RolePermissionService.audit(actor, 'تعديل دور', 'ROLES', id, role, patch);
  }

  public static deleteRole(
    id: string,
    actor?: User | null,
    onChanged?: () => void,
    requireCheck?: (actor: User | null, code: string) => void
  ): void {
    if (requireCheck) {
      requireCheck(actor ?? null, 'roles.manage');
    }
    const db = DatabaseManager.getInstance();
    const role = db.query<Role>('SELECT id, code, is_system AS isSystem FROM roles WHERE id = ?', [id])[0];
    if (!role) throw new Error('الدور غير موجود.');
    if (role.isSystem) throw new Error('لا يمكن حذف دور أساسي من النظام.');
    const inUse = db.query<{ c: number }>('SELECT COUNT(*) AS c FROM users WHERE role = ?', [role.code])[0]?.c ?? 0;
    if (inUse > 0) throw new Error('لا يمكن حذف دور مرتبط بمستخدمين.');
    db.executeTransaction(() => {
      db.run('DELETE FROM role_permissions WHERE role_code = ?', [role.code]);
      db.run('DELETE FROM roles WHERE id = ?', [id]);
    });
    if (onChanged) onChanged();
    RolePermissionService.audit(actor, 'حذف دور', 'ROLES', id, role, null);
  }
}

