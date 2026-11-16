import type { Migration } from './support';

/**
 * Multi-branch / multi-account collaboration foundation.
 *
 * 1. `sync_account_links` — links this installation to another company account
 *    (branch) using an activation code or an API token, authenticated with a
 *    password. Each link carries its own permission list and its own
 *    "requires approval" flag.
 * 2. `sync_link_permissions` — per-link permission grants (صلاحيات كل فرع).
 * 3. `sync_pending_changes` — edits produced by a sub-branch or a linked
 *    account that must be approved by the owner before they propagate.
 * 4. `sync_change_notes` — decision notes addressed to one or many accounts.
 */
export const MIGRATION_PART_119: Migration = {
  id: '204_sync_account_links_and_change_approvals',
  description: 'Add company account links, per-link permissions and owner approvals for branch edits',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_account_links (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        link_code TEXT UNIQUE,
        api_token TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        tenant_id TEXT,
        branch_id TEXT,
        device_id TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK(status IN ('PENDING','ACTIVE','DISABLED','REVOKED')),
        requires_approval INTEGER NOT NULL DEFAULT 1 CHECK(requires_approval IN (0,1)),
        linked_by TEXT,
        linked_at TEXT,
        last_verified_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sync_link_permissions (
        link_id TEXT NOT NULL,
        permission_code TEXT NOT NULL,
        allowed INTEGER NOT NULL DEFAULT 1 CHECK(allowed IN (0,1)),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (link_id, permission_code),
        FOREIGN KEY (link_id) REFERENCES sync_account_links(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sync_pending_changes (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        branch_id TEXT,
        device_id TEXT,
        link_id TEXT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation_type TEXT NOT NULL
          CHECK(operation_type IN ('CREATE','UPDATE','DELETE','UPSERT')),
        entity_version INTEGER NOT NULL DEFAULT 1,
        data_scope TEXT NOT NULL DEFAULT 'BRANCH' CHECK(data_scope IN ('TENANT','BRANCH')),
        payload TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK(status IN ('PENDING','APPROVED','REJECTED','APPLIED','CANCELLED')),
        requested_by TEXT NOT NULL,
        requested_by_name TEXT,
        requested_by_role TEXT,
        requested_branch_id TEXT,
        decided_by TEXT,
        decided_by_name TEXT,
        decided_at TEXT,
        decision_notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sync_pending_changes_status
        ON sync_pending_changes(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_sync_pending_changes_entity
        ON sync_pending_changes(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_sync_pending_changes_requester
        ON sync_pending_changes(requested_by, status);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_pending_changes_unique_pending
        ON sync_pending_changes(entity_type, entity_id, requested_by)
        WHERE status = 'PENDING';

      CREATE TABLE IF NOT EXISTS sync_change_notes (
        id TEXT PRIMARY KEY,
        change_id TEXT NOT NULL,
        recipient_user_id TEXT,
        recipient_link_id TEXT,
        recipient_label TEXT,
        notes TEXT NOT NULL,
        created_by TEXT,
        created_by_name TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (change_id) REFERENCES sync_pending_changes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sync_change_notes_change
        ON sync_change_notes(change_id, created_at);
    `);
  },
};
