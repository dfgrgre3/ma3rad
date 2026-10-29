import { DatabaseManager } from '../database/db.ts';
import { v4 as uuidv4 } from 'uuid';

export class BranchRegistry {
  private dbManager: DatabaseManager;
  constructor(dbManager?: DatabaseManager) { this.dbManager = dbManager || DatabaseManager.getInstance(); }
  register(input: {
    branchId?: string;
    tenantId?: string | null;
    name: string;
    baseUrl?: string | null;
    status?: 'ACTIVE' | 'DISABLED' | 'REVOKED';
    isVerified?: boolean;
    authorizedBy?: string | null;
    deviceType?: string | null;
    activationCode?: string | null;
  }): string {
    const id = input.branchId || `br_${uuidv4().substring(0, 8)}`;
    const status = input.status || 'ACTIVE';
    const verified = input.isVerified ? 1 : 0;
    this.dbManager.run(
      `INSERT INTO sync_branches (branch_id, tenant_id, name, base_url, status, is_verified, verified_at, authorized_by, device_type, activation_code, last_contact_at, last_sync_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(branch_id) DO UPDATE SET
         name=excluded.name,
         base_url=excluded.base_url,
         status=excluded.status,
         is_verified=excluded.is_verified,
         verified_at=COALESCE(excluded.verified_at, sync_branches.verified_at),
         authorized_by=COALESCE(excluded.authorized_by, sync_branches.authorized_by),
         device_type=COALESCE(excluded.device_type, sync_branches.device_type),
         activation_code=COALESCE(excluded.activation_code, sync_branches.activation_code),
         last_contact_at=CURRENT_TIMESTAMP,
         last_sync_at=COALESCE(sync_branches.last_sync_at, CURRENT_TIMESTAMP),
         updated_at=CURRENT_TIMESTAMP`,
      [id, input.tenantId ?? null, input.name, input.baseUrl ?? null, status, verified, input.isVerified ? new Date().toISOString() : null, input.authorizedBy ?? null, input.deviceType ?? null, input.activationCode ?? null]
    );
    return id;
  }
  issueActivationCode(branchId: string, deviceType?: string | null, name?: string | null, authorizedBy?: string | null): string {
    const code = `BR-${uuidv4().slice(0, 8).toUpperCase()}`;
    const currentName = name || this.dbManager.query<{ name: string }>(`SELECT name FROM sync_branches WHERE branch_id=?`, [branchId])[0]?.name || 'Branch';
    this.dbManager.run(
      `INSERT INTO sync_branches (branch_id, tenant_id, name, status, is_verified, verified_at, authorized_by, device_type, activation_code, last_contact_at, last_sync_at, updated_at)
       VALUES (?, ?, ?, 'ACTIVE', 1, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(branch_id) DO UPDATE SET
         name=COALESCE(excluded.name, sync_branches.name),
         status='ACTIVE',
         is_verified=1,
         verified_at=COALESCE(excluded.verified_at, sync_branches.verified_at),
         authorized_by=COALESCE(excluded.authorized_by, sync_branches.authorized_by),
         device_type=COALESCE(excluded.device_type, sync_branches.device_type),
         activation_code=excluded.activation_code,
         last_contact_at=CURRENT_TIMESTAMP,
         last_sync_at=CURRENT_TIMESTAMP,
         updated_at=CURRENT_TIMESTAMP`,
      [branchId, null, currentName, new Date().toISOString(), authorizedBy ?? null, deviceType ?? null, code]
    );
    return code;
  }
  consumeActivationCode(code: string, deviceId: string, deviceName?: string | null, deviceType?: string | null): { branchId: string; deviceType: string | null } {
    const rows = this.dbManager.query<any>(`SELECT branch_id AS branchId, device_type AS deviceType, name FROM sync_branches WHERE activation_code = ? AND (activated_device_id IS NULL OR activated_device_id = ?)`, [code, deviceId]);
    if (!rows.length) throw new Error('رمز تفعيل الجهاز غير صالح أو تم استخدامه بالفعل.');
    const branchId = rows[0].branchId;
    const deviceTypeValue = deviceType || rows[0].deviceType || 'WINDOWS';
    this.dbManager.run(
      `UPDATE sync_branches SET activated_device_id=?, activation_used_at=CURRENT_TIMESTAMP, device_type=COALESCE(?, device_type), last_contact_at=CURRENT_TIMESTAMP, last_sync_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE branch_id=?`,
      [deviceId, deviceTypeValue, branchId]
    );
    this.dbManager.run(
      `INSERT INTO sync_devices (device_id, branch_id, tenant_id, device_name, status, is_verified, verified_at, authorized_by, device_type, activation_code, activation_used_at, last_seen_at, last_contact_at, last_sync_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', 1, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(device_id) DO UPDATE SET
         branch_id=excluded.branch_id,
         tenant_id=COALESCE(excluded.tenant_id, sync_devices.tenant_id),
         device_name=COALESCE(excluded.device_name, sync_devices.device_name),
         status='ACTIVE',
         is_verified=1,
         verified_at=COALESCE(excluded.verified_at, sync_devices.verified_at),
         authorized_by=COALESCE(excluded.authorized_by, sync_devices.authorized_by),
         device_type=COALESCE(excluded.device_type, sync_devices.device_type),
         activation_code=COALESCE(excluded.activation_code, sync_devices.activation_code),
         activation_used_at=CURRENT_TIMESTAMP,
         last_seen_at=CURRENT_TIMESTAMP,
         last_contact_at=CURRENT_TIMESTAMP,
         last_sync_at=CURRENT_TIMESTAMP`,
      [deviceId, branchId, null, deviceName ?? `Device-${deviceId}`, new Date().toISOString(), null, deviceTypeValue, code]
    );
    return { branchId, deviceType: deviceTypeValue };
  }
  verify(branchId: string, isVerified = true, authorizedBy?: string | null): void {
    this.dbManager.run(
      `UPDATE sync_branches SET is_verified=?, verified_at=?, authorized_by=COALESCE(?, authorized_by), status='ACTIVE', updated_at=CURRENT_TIMESTAMP WHERE branch_id=?`,
      [isVerified ? 1 : 0, isVerified ? new Date().toISOString() : null, authorizedBy ?? null, branchId]
    );
  }
  revoke(branchId: string): void {
    this.dbManager.run(`UPDATE sync_branches SET status='REVOKED', updated_at=CURRENT_TIMESTAMP WHERE branch_id=?`, [branchId]);
  }
  disable(branchId: string): void {
    this.dbManager.run(`UPDATE sync_branches SET status='DISABLED', updated_at=CURRENT_TIMESTAMP WHERE branch_id=?`, [branchId]);
  }
  touch(branchId: string, lastSyncAt?: string | null): void {
    this.dbManager.run(
      `UPDATE sync_branches SET last_contact_at=CURRENT_TIMESTAMP, last_sync_at=COALESCE(?, last_sync_at), updated_at=CURRENT_TIMESTAMP WHERE branch_id=?`,
      [lastSyncAt ?? null, branchId]
    );
  }
  list(tenantId?: string | null): any[] {
    if (tenantId) {
      return this.dbManager.query(
        `SELECT branch_id AS branchId, tenant_id AS tenantId, name, base_url AS baseUrl, status,
                is_verified AS isVerified, verified_at AS verifiedAt, last_contact_at AS lastContactAt,
                last_sync_at AS lastSyncAt, authorized_by AS authorizedBy, device_type AS deviceType,
                activation_code AS activationCode, updated_at AS updatedAt
         FROM sync_branches WHERE tenant_id=? ORDER BY name`,
        [tenantId]
      );
    }
    return this.dbManager.query(
      `SELECT branch_id AS branchId, tenant_id AS tenantId, name, base_url AS baseUrl, status,
              is_verified AS isVerified, verified_at AS verifiedAt, last_contact_at AS lastContactAt,
              last_sync_at AS lastSyncAt, authorized_by AS authorizedBy, device_type AS deviceType,
              activation_code AS activationCode, updated_at AS updatedAt
       FROM sync_branches ORDER BY name`
    );
  }
  get(branchId: string): any | null {
    const rows = this.dbManager.query(
      `SELECT branch_id AS branchId, tenant_id AS tenantId, name, base_url AS baseUrl, status,
              is_verified AS isVerified, verified_at AS verifiedAt, last_contact_at AS lastContactAt,
              last_sync_at AS lastSyncAt, authorized_by AS authorizedBy, device_type AS deviceType,
              activation_code AS activationCode, updated_at AS updatedAt
       FROM sync_branches WHERE branch_id=?`,
      [branchId]
    );
    return rows.length ? rows[0] : null;
  }
}
