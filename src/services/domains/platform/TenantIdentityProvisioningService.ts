import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { CentralLicenseService } from '../licensing/CentralLicenseService';
import { CentralTenantUserSyncService } from './CentralTenantUserSyncService';

/**
 * Tenant-identity provisioning channel (device side).
 *
 * The super-admin console enqueues tenant-user mutations on the central
 * server; this service polls them through the device-authenticated channel
 * (`X-Device-Id` + credential injected by the Electron bridge) and applies
 * each job to the local `users` table — the same table the ERP login and
 * user-management screens use.
 *
 * Job events:
 *   PROVISION — create or reset a login account (temporary password).
 *   UPDATE    — profile/role/username change.
 *   STATUS    — activate or suspend the account.
 *   DELETE    — remove the account.
 *
 * Every job is reported back so the console can show PROVISIONED / FAILED
 * with the linked local user id. All network access goes through the secured
 * Electron bridge (`window.ceramisys.central.request`), which enforces the
 * generated route allowlist and attaches the device credential.
 */

type ProvisioningJobPayload = {
  username?: string | null;
  previousUsername?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  temporaryPassword?: string | null;
  mode?: string | null;
  isActive?: boolean;
};

type ProvisioningJob = {
  id: string;
  tenantUserId?: string;
  event: 'PROVISION' | 'UPDATE' | 'STATUS' | 'DELETE' | string;
  payload?: ProvisioningJobPayload;
};

type CentralBridgeResponse = { ok: boolean; status: number; body: any };

const PENDING_PATH = '/api/v1/device/provisioning/pending';
const RESULT_PATH = (jobId: string) => `/api/v1/device/provisioning/${encodeURIComponent(jobId)}/result`;

const ROLE_MAP: Record<string, string> = {
  admin: 'ADMIN',
  manager: 'MANAGER',
  accountant: 'ACCOUNTANT',
  cashier: 'CASHIER',
  sales: 'SALES',
  warehouse: 'WAREHOUSE',
};
// Unknown/absent roles get the least-privileged built-in role, never ADMIN.
const FALLBACK_ROLE = 'CASHIER';

function nowIso(): string {
  return new Date().toISOString();
}

export class TenantIdentityProvisioningService {
  private static syncing = false;

  private static bridge(): { request: (req: Record<string, unknown>) => Promise<CentralBridgeResponse> } | null {
    const central = typeof globalThis !== 'undefined' ? (globalThis as any)?.window?.ceramisys?.central : null;
    return central && typeof central.request === 'function' ? central : null;
  }

  /** Poll pending jobs once and apply them. Safe to call repeatedly. */
  static async sync(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const status = await CentralLicenseService.getStatus();
      if (!status.configured || !status.activated) return;
      const bridge = this.bridge();
      if (!bridge) return;

      const res = await bridge.request({
        path: PENDING_PATH,
        method: 'GET',
        headers: { 'X-Device-Id': CentralLicenseService.getDeviceId() },
      });
      if (!res || res.ok === false) return;
      const body = res.body;
      const jobs: ProvisioningJob[] = Array.isArray(body?.data)
        ? body.data
        : Array.isArray(body)
          ? body
          : [];

      for (const job of jobs) {
        try {
          // Provisioning-originated writes must not be reported back to the
          // directory — the platform already knows about them.
          const identityUserId = CentralTenantUserSyncService.suppress(() => this.applyJob(job));
          await this.report(job.id, { ok: true, identityUserId });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.report(job.id, { ok: false, error: message });
        }
      }
    } catch {
      // Provisioning must never break the app; the next poll retries.
    } finally {
      this.syncing = false;
    }
  }

  private static async report(jobId: string, result: { ok: boolean; identityUserId?: string | null; error?: string }): Promise<void> {
    const bridge = this.bridge();
    if (!bridge) return;
    try {
      await bridge.request({
        path: RESULT_PATH(jobId),
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Id': CentralLicenseService.getDeviceId() },
        body: JSON.stringify(result),
      });
    } catch {
      // A lost report leaves the job CLAIMED; the server re-queues it after
      // the stale-claim window, so a retry is safe (jobs are idempotent).
    }
  }

  private static applyJob(job: ProvisioningJob): string | null {
    const db = DatabaseManager.getInstance();
    const payload = job.payload || {};

    switch (job.event) {
      case 'PROVISION':
        return this.provisionUser(db, payload);
      case 'UPDATE':
        return this.updateUser(db, payload);
      case 'STATUS':
        return this.setUserActive(db, payload);
      case 'DELETE':
        return this.deleteUser(db, payload);
      default:
        throw new Error(`Unsupported provisioning event: ${String(job.event)}`);
    }
  }

  private static resolveRole(db: DatabaseManager, rawRole?: string | null): string {
    const mapped = ROLE_MAP[String(rawRole || '').trim().toLowerCase()];
    const candidates = [mapped, FALLBACK_ROLE, 'SALES', 'CASHIER', 'ADMIN'];
    for (const code of candidates) {
      if (!code) continue;
      if (db.query('SELECT code FROM roles WHERE code = ? LIMIT 1', [code]).length > 0) return code;
    }
    return mapped || FALLBACK_ROLE;
  }

  private static mainBranchId(db: DatabaseManager): string {
    const row = db.query<any>('SELECT id FROM branches ORDER BY is_main DESC, created_at ASC LIMIT 1')[0];
    return row?.id || 'br_main';
  }

  private static provisionUser(db: DatabaseManager, payload: ProvisioningJobPayload): string {
    const username = String(payload.username || '').trim().toLowerCase();
    if (!username) throw new Error('Provisioning job is missing username');
    const password = String(payload.temporaryPassword || '');
    if (!password) throw new Error('Provisioning job is missing temporary password');

    const fullName = String(payload.fullName || '').trim() || username;
    const phone = payload.phone ? String(payload.phone).trim() : null;
    const role = this.resolveRole(db, payload.role);
    const hash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
    const now = nowIso();

    const existing = db.query<any>('SELECT id FROM users WHERE username = ?', [username])[0];
    if (existing) {
      db.run(
        'UPDATE users SET password_hash = ?, full_name = ?, phone = ?, role = ?, is_active = 1, updated_at = ? WHERE id = ?',
        [hash, fullName, phone, role, now, existing.id]
      );
      return String(existing.id);
    }

    const branchId = this.mainBranchId(db);
    const id = `usr_${uuidv4().substring(0, 8)}`;
    db.executeTransaction((tx) => {
      tx.run(
        `INSERT INTO users (id, username, password_hash, full_name, role, phone, pin_code, is_active, branch_id, branch_scope)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, 'ALL')`,
        [id, username, hash, fullName, role, phone, branchId]
      );
      tx.run('INSERT INTO users_branches (user_id, branch_id) VALUES (?, ?)', [id, branchId]);
    });
    return id;
  }

  private static findUserId(db: DatabaseManager, payload: ProvisioningJobPayload): any {
    const candidates = [payload.previousUsername, payload.username]
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean);
    for (const username of candidates) {
      const row = db.query<any>('SELECT * FROM users WHERE username = ?', [username])[0];
      if (row) return row;
    }
    return null;
  }

  private static updateUser(db: DatabaseManager, payload: ProvisioningJobPayload): string | null {
    const existing = this.findUserId(db, payload);
    if (!existing) throw new Error('User not found on this device');

    const username = String(payload.username || existing.username || '').trim().toLowerCase();
    if (!username) throw new Error('Provisioning job is missing username');
    if (username !== existing.username) {
      const conflict = db.query<any>('SELECT id FROM users WHERE username = ? AND id <> ?', [username, existing.id])[0];
      if (conflict) throw new Error(`Username ${username} is already used by another account`);
    }

    const fullName = payload.fullName !== undefined && payload.fullName !== null && String(payload.fullName).trim()
      ? String(payload.fullName).trim()
      : existing.full_name;
    const phone = payload.phone !== undefined ? (payload.phone ? String(payload.phone).trim() : null) : existing.phone;
    const role = payload.role ? this.resolveRole(db, payload.role) : existing.role;
    const isActive = typeof payload.isActive === 'boolean' ? (payload.isActive ? 1 : 0) : existing.is_active;
    const now = nowIso();

    db.run(
      `UPDATE users SET username = ?, full_name = ?, phone = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ?`,
      [username, fullName, phone, role, isActive, now, existing.id]
    );
    return String(existing.id);
  }

  private static setUserActive(db: DatabaseManager, payload: ProvisioningJobPayload): string | null {
    const existing = this.findUserId(db, payload);
    if (!existing) throw new Error('User not found on this device');
    db.run('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?', [
      payload.isActive ? 1 : 0,
      nowIso(),
      existing.id,
    ]);
    return String(existing.id);
  }

  private static deleteUser(db: DatabaseManager, payload: ProvisioningJobPayload): string | null {
    const existing = this.findUserId(db, payload);
    if (!existing) return null; // Already absent — treat as success (idempotent).
    db.executeTransaction((tx) => {
      tx.run('DELETE FROM user_permissions WHERE user_id = ?', [existing.id]);
      tx.run('DELETE FROM users_branches WHERE user_id = ?', [existing.id]);
      tx.run('DELETE FROM users WHERE id = ?', [existing.id]);
    });
    return null;
  }
}

export const tenantIdentityProvisioningService = new TenantIdentityProvisioningService();
