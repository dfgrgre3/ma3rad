import { DatabaseManager } from '../database/db.ts';

export class SyncAuditLogger {
  private dbManager: DatabaseManager;
  constructor(dbManager?: DatabaseManager) { this.dbManager = dbManager || DatabaseManager.getInstance(); }
  log(input: { tenantId?: string | null; branchId?: string | null; deviceId?: string | null; action: string; details?: unknown }): void {
    const id = `sal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.dbManager.run(
      `INSERT INTO sync_audit_log (id, tenant_id, branch_id, device_id, action, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.tenantId ?? null, input.branchId ?? null, input.deviceId ?? null, input.action, JSON.stringify(input.details ?? null)]
    );
  }
  list(limit = 100): any[] {
    return this.dbManager.query(`SELECT * FROM sync_audit_log ORDER BY created_at DESC LIMIT ?`, [limit]);
  }
}
