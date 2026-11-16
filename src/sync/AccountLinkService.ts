import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/repositories/databaseManager.ts';
import { AuthService } from '../services/domains/auth/AuthService';
import { PermissionService } from '../services/domains/auth/PermissionService';
import type { AccountLink, AccountLinkStatus, AccountLinkSummary } from '../types/sync/index.ts';

// The permission that guards link management. It is generated from the
// `sync_center` page in the permission matrix (`ui.admin.sync_center.*`).
export const SYNC_CENTER_MANAGE = 'ui.admin.sync_center.manage';

interface LinkRow {
  id: string;
  companyName: string;
  linkCode: string | null;
  apiToken: string | null;
  passwordHash: string;
  tenantId: string | null;
  branchId: string | null;
  deviceId: string | null;
  status: AccountLinkStatus;
  requiresApproval: number;
  linkedBy: string | null;
  linkedAt: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const MANAGEABLE_COLUMNS = `id, company_name, link_code, api_token, password_hash, tenant_id,
  branch_id, device_id, status, requires_approval, linked_by, linked_at, last_verified_at,
  created_at, updated_at`;

function toLink(row: LinkRow): AccountLink {
  return {
    id: row.id,
    companyName: row.companyName,
    linkCode: row.linkCode,
    apiToken: row.apiToken,
    tenantId: row.tenantId,
    branchId: row.branchId,
    deviceId: row.deviceId,
    status: row.status,
    requiresApproval: row.requiresApproval === 1,
    linkedBy: row.linkedBy,
    linkedAt: row.linkedAt,
    lastVerifiedAt: row.lastVerifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Links this installation to another company account.
 *
 * A link is created by the business owner and handed to the other account
 * either as a short activation code or as an API token. The other party proves
 * ownership by presenting the code/token together with the password that was
 * set when the link was issued. Every link owns its own permission list and
 * can opt into owner approval before its edits propagate.
 */
export class AccountLinkService {
  private readonly db: DatabaseManager;

  constructor(db: DatabaseManager = DatabaseManager.getInstance()) {
    this.db = db;
  }

  private requireManager(): { id: string; fullName: string } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, SYNC_CENTER_MANAGE);
    return { id: actor.id, fullName: actor.fullName };
  }

  /**
   * Owner-side: create a link for another account and return the credential the
   * other account must use (`code` or `apiToken`).
   */
  issue(input: {
    companyName: string;
    password: string;
    branchId?: string | null;
    tenantId?: string | null;
    deviceId?: string | null;
    requiresApproval?: boolean;
    permissions?: string[];
    useApiToken?: boolean;
  }): { id: string; code: string | null; apiToken: string | null } {
    const actor = this.requireManager();
    const companyName = String(input.companyName || '').trim();
    if (!companyName) throw new Error('اسم حساب الشركة مطلوب.');
    const password = String(input.password || '');
    if (password.length < 6) throw new Error('كلمة سر الربط يجب ألا تقل عن 6 محارف.');

    const id = `lnk_${uuidv4().substring(0, 10)}`;
    const useApiToken = input.useApiToken === true;
    const randomChunk = uuidv4().replace(/-/g, '');
    const linkCode = useApiToken ? null : `LK-${randomChunk.slice(0, 8).toUpperCase()}`;
    const apiToken = useApiToken ? `lkn_${randomChunk}${uuidv4().replace(/-/g, '')}` : null;
    const passwordHash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));

    this.db.executeTransaction((transaction) => {
      transaction.run(
        `INSERT INTO sync_account_links
          (id, company_name, link_code, api_token, password_hash, tenant_id, branch_id,
           device_id, status, requires_approval, linked_by, linked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, CURRENT_TIMESTAMP)`,
        [
          id, companyName, linkCode, apiToken, passwordHash,
          input.tenantId ?? null, input.branchId ?? null, input.deviceId ?? null,
          input.requiresApproval === false ? 0 : 1, actor.id,
        ]
      );
      this.replacePermissions(transaction, id, input.permissions ?? []);
      transaction.run(
        `INSERT INTO sync_audit_log (id, action, details) VALUES (?, 'ACCOUNT_LINK_ISSUED', ?)`,
        [`saud_${uuidv4().substring(0, 8)}`, JSON.stringify({ linkId: id, companyName })]
      );
    });

    return { id, code: linkCode, apiToken };
  }

  /** Other-account side: prove ownership with the activation code + password. */
  linkWithCode(input: { code: string; password: string; deviceId?: string | null }): AccountLink {
    const code = String(input.code || '').trim().toUpperCase();
    if (!code) throw new Error('كود الربط مطلوب.');
    return this.verifyAndActivate({ column: 'link_code', value: code, password: input.password, deviceId: input.deviceId });
  }

  /** Other-account side: prove ownership with the API token + password. */
  linkWithApiToken(input: { apiToken: string; password: string; deviceId?: string | null }): AccountLink {
    const token = String(input.apiToken || '').trim();
    if (!token) throw new Error('مفتاح API مطلوب.');
    return this.verifyAndActivate({ column: 'api_token', value: token, password: input.password, deviceId: input.deviceId });
  }

  private verifyAndActivate(input: {
    column: 'link_code' | 'api_token';
    value: string;
    password: string;
    deviceId?: string | null;
  }): AccountLink {
    const row = this.db.query<LinkRow>(
      `SELECT ${MANAGEABLE_COLUMNS} FROM sync_account_links WHERE ${input.column} = ?`,
      [input.value]
    )[0];
    if (!row) throw new Error('بيانات الربط غير صحيحة.');
    if (row.status === 'REVOKED') throw new Error('تم إلغاء هذا الربط ولا يمكن استخدامه.');
    if (row.status === 'DISABLED') throw new Error('هذا الربط معطّل من قبل صاحب النشاط.');
    if (!bcrypt.compareSync(String(input.password || ''), row.passwordHash)) {
      throw new Error('كلمة السر غير صحيحة.');
    }

    this.db.executeTransaction((transaction) => {
      transaction.run(
        `UPDATE sync_account_links
         SET status = 'ACTIVE',
             device_id = COALESCE(?, device_id),
             last_verified_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [input.deviceId ?? null, row.id]
      );
      transaction.run(
        `INSERT INTO sync_audit_log (id, action, details) VALUES (?, 'ACCOUNT_LINK_VERIFIED', ?)`,
        [`saud_${uuidv4().substring(0, 8)}`, JSON.stringify({ linkId: row.id, method: input.column })]
      );
    });
    return this.get(row.id)!;
  }

  list(): AccountLinkSummary[] {
    const links = this.db
      .query<LinkRow>(`SELECT ${MANAGEABLE_COLUMNS} FROM sync_account_links ORDER BY company_name`)
      .map(toLink);
    return links.map((link) => this.summarize(link));
  }

  listActive(): AccountLinkSummary[] {
    return this.list().filter((link) => link.status === 'ACTIVE');
  }

  get(id: string): AccountLink | null {
    const row = this.db.query<LinkRow>(
      `SELECT ${MANAGEABLE_COLUMNS} FROM sync_account_links WHERE id = ?`,
      [id]
    )[0];
    return row ? toLink(row) : null;
  }

  getSummary(id: string): AccountLinkSummary | null {
    const link = this.get(id);
    return link ? this.summarize(link) : null;
  }

  private summarize(link: AccountLink): AccountLinkSummary {
    return {
      ...link,
      permissions: this.getPermissions(link.id),
      pendingChanges: Number(
        this.db.query<{ count: number }>(
          `SELECT COUNT(*) AS count FROM sync_pending_changes WHERE link_id = ? AND status = 'PENDING'`,
          [link.id]
        )[0]?.count ?? 0
      ),
    };
  }

  revoke(id: string): void {
    this.requireManager();
    this.setStatus(id, 'REVOKED');
    this.db.run(
      `INSERT INTO sync_audit_log (id, action, details) VALUES (?, 'ACCOUNT_LINK_REVOKED', ?)`,
      [`saud_${uuidv4().substring(0, 8)}`, JSON.stringify({ linkId: id })]
    );
  }

  disable(id: string): void {
    this.requireManager();
    this.setStatus(id, 'DISABLED');
  }

  enable(id: string): void {
    this.requireManager();
    this.setStatus(id, 'ACTIVE');
  }

  private setStatus(id: string, status: AccountLinkStatus): void {
    if (!this.get(id)) throw new Error('الربط غير موجود.');
    this.db.run(
      `UPDATE sync_account_links SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, id]
    );
  }

  setRequiresApproval(id: string, requiresApproval: boolean): void {
    this.requireManager();
    if (!this.get(id)) throw new Error('الربط غير موجود.');
    this.db.run(
      `UPDATE sync_account_links SET requires_approval = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [requiresApproval ? 1 : 0, id]
    );
  }

  /** Replace the whole permission list for a link (صلاحيات كل فرع). */
  setPermissions(id: string, permissionCodes: string[]): void {
    this.requireManager();
    if (!this.get(id)) throw new Error('الربط غير موجود.');
    this.db.executeTransaction((transaction) => {
      this.replacePermissions(transaction, id, permissionCodes);
      transaction.run(
        `INSERT INTO sync_audit_log (id, action, details) VALUES (?, 'ACCOUNT_LINK_PERMISSIONS', ?)`,
        [`saud_${uuidv4().substring(0, 8)}`, JSON.stringify({ linkId: id, permissions: permissionCodes })]
      );
    });
  }

  private replacePermissions(transaction: DatabaseManager, linkId: string, permissionCodes: string[]): void {
    transaction.run('DELETE FROM sync_link_permissions WHERE link_id = ?', [linkId]);
    const seen = new Set<string>();
    for (const raw of permissionCodes) {
      const code = String(raw || '').trim();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      transaction.run(
        `INSERT INTO sync_link_permissions (link_id, permission_code, allowed) VALUES (?, ?, 1)`,
        [linkId, code]
      );
    }
  }

  getPermissions(id: string): string[] {
    return this.db
      .query<{ permissionCode: string }>(
        `SELECT permission_code AS permission_code FROM sync_link_permissions WHERE link_id = ? AND allowed = 1 ORDER BY permission_code`,
        [id]
      )
      .map((row) => row.permissionCode);
  }

  canPerform(id: string, permissionCode: string): boolean {
    return this.getPermissions(id).includes(permissionCode);
  }

  /** The link (if any) that owns the device this installation is running on. */
  findActiveLinkForDevice(deviceId?: string | null, branchId?: string | null): AccountLink | null {
    const row = this.db.query<LinkRow>(
      `SELECT ${MANAGEABLE_COLUMNS} FROM sync_account_links
       WHERE status = 'ACTIVE'
         AND ((? IS NOT NULL AND device_id = ?) OR (? IS NOT NULL AND branch_id = ?))
       ORDER BY last_verified_at DESC LIMIT 1`,
      [deviceId ?? null, deviceId ?? null, branchId ?? null, branchId ?? null]
    )[0];
    return row ? toLink(row) : null;
  }

  touch(id: string): void {
    this.db.run(
      `UPDATE sync_account_links SET last_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );
  }
}
