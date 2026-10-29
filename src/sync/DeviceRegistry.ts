import { DatabaseManager } from '../database/db.ts';
import { v4 as uuidv4 } from 'uuid';

export class DeviceRegistry {
  private dbManager: DatabaseManager;
  constructor(dbManager?: DatabaseManager) { this.dbManager = dbManager || DatabaseManager.getInstance(); }
  register(input: {
    deviceId?: string;
    branchId: string;
    tenantId?: string | null;
    deviceName?: string;
    status?: 'ACTIVE' | 'DISABLED' | 'REVOKED';
    isVerified?: boolean;
    authorizedBy?: string | null;
    deviceType?: string | null;
    activationCode?: string | null;
  }): string {
    const id = input.deviceId || `dev_${uuidv4().substring(0, 8)}`;
    const status = input.status || 'ACTIVE';
    const verified = input.isVerified ? 1 : 0;
    this.dbManager.run(
      `INSERT INTO sync_devices (device_id, branch_id, tenant_id, device_name, status, is_verified, verified_at, authorized_by, device_type, activation_code, activation_used_at, last_seen_at, last_contact_at, last_sync_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(device_id) DO UPDATE SET
         branch_id=excluded.branch_id,
         tenant_id=excluded.tenant_id,
         device_name=excluded.device_name,
         status=excluded.status,
         is_verified=excluded.is_verified,
         verified_at=COALESCE(excluded.verified_at, sync_devices.verified_at),
         authorized_by=COALESCE(excluded.authorized_by, sync_devices.authorized_by),
         device_type=COALESCE(excluded.device_type, sync_devices.device_type),
         activation_code=COALESCE(excluded.activation_code, sync_devices.activation_code),
         activation_used_at=COALESCE(sync_devices.activation_used_at, CURRENT_TIMESTAMP),
         last_seen_at=CURRENT_TIMESTAMP,
         last_contact_at=CURRENT_TIMESTAMP,
         last_sync_at=COALESCE(sync_devices.last_sync_at, CURRENT_TIMESTAMP)`,
      [id, input.branchId, input.tenantId ?? null, input.deviceName ?? null, status, verified, input.isVerified ? new Date().toISOString() : null, input.authorizedBy ?? null, input.deviceType ?? null, input.activationCode ?? null]
    );
    return id;
  }
  verify(deviceId: string, isVerified = true, authorizedBy?: string | null): void {
    this.dbManager.run(
      `UPDATE sync_devices SET is_verified=?, verified_at=?, authorized_by=COALESCE(?, authorized_by), status='ACTIVE' WHERE device_id=?`,
      [isVerified ? 1 : 0, isVerified ? new Date().toISOString() : null, authorizedBy ?? null, deviceId]
    );
  }
  revoke(deviceId: string): void {
    this.dbManager.run(`UPDATE sync_devices SET status='REVOKED' WHERE device_id=?`, [deviceId]);
  }
  disable(deviceId: string): void {
    this.dbManager.run(`UPDATE sync_devices SET status='DISABLED' WHERE device_id=?`, [deviceId]);
  }
  touch(deviceId: string, lastSyncAt?: string | null): void {
    this.dbManager.run(
      `UPDATE sync_devices SET last_seen_at=CURRENT_TIMESTAMP, last_contact_at=CURRENT_TIMESTAMP, last_sync_at=COALESCE(?, last_sync_at) WHERE device_id=?`,
      [lastSyncAt ?? null, deviceId]
    );
  }
  list(branchId?: string): any[] {
    if (branchId) {
      return this.dbManager.query(
        `SELECT device_id AS deviceId, branch_id AS branchId, tenant_id AS tenantId, device_name AS deviceName, device_type AS deviceType, status,
                is_verified AS isVerified, verified_at AS verifiedAt, last_seen_at AS lastSeenAt,
                last_contact_at AS lastContactAt, last_sync_at AS lastSyncAt, authorized_by AS authorizedBy
         FROM sync_devices WHERE branch_id=? ORDER BY device_name`,
        [branchId]
      );
    }
    return this.dbManager.query(
      `SELECT device_id AS deviceId, branch_id AS branchId, tenant_id AS tenantId, device_name AS deviceName, device_type AS deviceType, status,
              is_verified AS isVerified, verified_at AS verifiedAt, last_seen_at AS lastSeenAt,
              last_contact_at AS lastContactAt, last_sync_at AS lastSyncAt, authorized_by AS authorizedBy
       FROM sync_devices ORDER BY device_name`
    );
  }
}
