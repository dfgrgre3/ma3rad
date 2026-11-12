import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { AuditService } from '../security/AuditService';
import { CORE_PROTECTED_TABLES, IDENTIFIER } from './dataAdminConstants';

export abstract class DataAdminBaseService {
  protected readonly db = DatabaseManager.getInstance();

  protected require(permission: string) {
    const user = AuthService.requireAuth();
    PermissionService.require(user, permission);
    return user;
  }

  protected assertDeletableTable(table: string): void {
    if (!IDENTIFIER.test(table)) throw new Error(`اسم الجدول غير صالح: ${table}`);
    if (CORE_PROTECTED_TABLES.includes(table)) throw new Error(`لا يمكن تفريغ جدول أساسي: ${table}`);
  }

  protected logDeletion(
    user: { id: string; fullName: string },
    description: string,
    details: string,
  ): void {
    new AuditService().log({
      userId: user.id,
      userName: user.fullName,
      action: description,
      module: 'ADMIN',
      newValues: details,
    });
  }
}
