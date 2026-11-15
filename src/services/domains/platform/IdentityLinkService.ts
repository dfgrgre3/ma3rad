import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';

export interface IdentityLink {
  id: string;
  platformStaffId: string | null;
  erpUserId: string | null;
  tenantUserId: string | null;
  linkType: 'PLATFORM_OWNER' | 'TENANT_USER';
  createdAt: string;
}

export class IdentityLinkService {
  private db = DatabaseManager.getInstance();

  ensureSchema(): void {
    this.db.run(`CREATE TABLE IF NOT EXISTS identity_links (
      id TEXT PRIMARY KEY,
      platform_staff_id TEXT,
      erp_user_id TEXT,
      tenant_user_id TEXT,
      link_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_identity_links_tenant_user ON identity_links(tenant_user_id) WHERE tenant_user_id IS NOT NULL`);
  }

  link(input: { platformStaffId?: string | null; erpUserId?: string | null; tenantUserId?: string | null; linkType: 'PLATFORM_OWNER' | 'TENANT_USER' }): IdentityLink {
    this.ensureSchema();
    const id = `idlnk_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    // Idempotency: never create a second link for the same tenant user.
    if (input.tenantUserId) {
      const existing = this.findByTenantUser(input.tenantUserId);
      if (existing) return existing;
    }
    this.db.run(
      `INSERT INTO identity_links (id, platform_staff_id, erp_user_id, tenant_user_id, link_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.platformStaffId ?? null, input.erpUserId ?? null, input.tenantUserId ?? null, input.linkType, now]
    );
    return { id, platformStaffId: input.platformStaffId ?? null, erpUserId: input.erpUserId ?? null, tenantUserId: input.tenantUserId ?? null, linkType: input.linkType, createdAt: now };
  }

  findByTenantUser(tenantUserId: string): IdentityLink | null {
    this.ensureSchema();
    const row = this.db.query<any>('SELECT * FROM identity_links WHERE tenant_user_id = ? LIMIT 1', [tenantUserId])[0];
    return row ? this.map(row) : null;
  }

  findByErpUser(erpUserId: string): IdentityLink | null {
    this.ensureSchema();
    const row = this.db.query<any>('SELECT * FROM identity_links WHERE erp_user_id = ? LIMIT 1', [erpUserId])[0];
    return row ? this.map(row) : null;
  }

  findByPlatformStaff(platformStaffId: string): IdentityLink | null {
    this.ensureSchema();
    const row = this.db.query<any>('SELECT * FROM identity_links WHERE platform_staff_id = ? LIMIT 1', [platformStaffId])[0];
    return row ? this.map(row) : null;
  }

  private map(row: any): IdentityLink {
    // DatabaseManager normalizes snake_case columns to camelCase on read;
    // accept both shapes so the link is mapped correctly either way.
    return {
      id: String(row.id),
      platformStaffId: row.platformStaffId ?? row.platform_staff_id ?? null,
      erpUserId: row.erpUserId ?? row.erp_user_id ?? null,
      tenantUserId: row.tenantUserId ?? row.tenant_user_id ?? null,
      linkType: row.linkType ?? row.link_type,
      createdAt: String(row.createdAt ?? row.created_at),
    };
  }
}

export const identityLinkService = new IdentityLinkService();