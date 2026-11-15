import type { Migration } from './support';

export const MIGRATION_PART_114: Migration = {
  id: '114_platform_tenant_user_provisioning',
  description: 'Add provisioning/invite metadata to platform tenant users so Super Admin creates or invites real tenant identity accounts',
  up: (db) => {
    const columns = db.exec(`PRAGMA table_info(platform_tenant_users)`)[0]?.values?.map((r) => String(r[1])) || [];
    const add = (name: string, def: string) => {
      if (!columns.includes(name)) db.run(`ALTER TABLE platform_tenant_users ADD COLUMN ${name} ${def}`);
    };
    add('provisioning_status', `TEXT NOT NULL DEFAULT 'NOT_REQUESTED'`);
    add('provisioning_mode', `TEXT`);
    add('identity_user_id', `TEXT`);
    add('scope', `TEXT`);
    add('invite_code', `TEXT`);
    add('temporary_password', `TEXT`);
    add('provisioned_at', `TEXT`);
    add('invite_expires_at', `TEXT`);
    add('last_error', `TEXT`);
    // Existing directory-only rows must not be treated as real provisioned accounts.
    db.run(`
      UPDATE platform_tenant_users
      SET provisioning_status = CASE
        WHEN status = 'INVITED' THEN 'INVITED'
        WHEN status = 'ACTIVE' THEN 'DIRECTORY_ONLY'
        WHEN status = 'SUSPENDED' THEN 'DIRECTORY_ONLY'
        ELSE 'NOT_REQUESTED'
      END
      WHERE provisioning_status = 'NOT_REQUESTED' OR provisioning_status IS NULL
    `);
  },
};
