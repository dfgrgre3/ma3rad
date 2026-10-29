import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import type { User } from '../types';

/**
 * Export/print authorization.
 *
 * Bulk export is a separate capability from viewing data: a user may be allowed
 * to read a screen without being allowed to extract its full dataset to a file.
 * Callers pass the permission code that governs the document they are about to
 * export; the guard is enforced at export time, not only by hiding buttons.
 */
export class ExportService {
  public static assertAllowed(permission: string, user?: User | null): void {
    const actor = user ?? AuthService.getCurrentUser();
    PermissionService.require(actor, permission);
  }

  public static canExport(permission: string, user?: User | null): boolean {
    return PermissionService.can(user ?? AuthService.getCurrentUser(), permission);
  }
}
