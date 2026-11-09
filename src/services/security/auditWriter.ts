import { DatabaseManager } from '../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';

export interface AuditWriteEntry {
  userId?: string;
  userName?: string;
  action: string;
  module: string;
  recordId?: string;
  oldValues?: string;
  newValues?: string;
  ipAddress?: string;
}

/**
 * Low-level append-only audit writer.
 *
 * Kept dependency-free of `AuthService`/`PermissionService` so that permission
 * checks can record security events without importing the read/query side of
 * `AuditService`. Never throws: logging must not break a business action.
 */
export function writeAuditLog(entry: AuditWriteEntry): void {
  try {
    DatabaseManager.getInstance().run(
      `INSERT INTO audit_logs
         (id, user_id, user_name, action, module, record_id, old_values, new_values, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `aud_${uuidv4().substring(0, 10)}`,
        entry.userId || 'system',
        entry.userName || 'النظام',
        entry.action,
        entry.module,
        entry.recordId || null,
        entry.oldValues || null,
        entry.newValues || null,
        entry.ipAddress || null,
        new Date().toISOString(),
      ]
    );
  } catch (error) {
    console.error('Failed to write audit log', error);
  }
}
