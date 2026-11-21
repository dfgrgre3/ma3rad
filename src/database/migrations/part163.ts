import type { Migration } from './support';

// Platform Policies & Compliance: versioned policy documents with a
// draft → pending-approval → published workflow. Mirrors the central-server
// schema (central-server/lib/db.js) so local and central data sources behave
// identically.
export const MIGRATION_262_PLATFORM_POLICY_DOCUMENTS: Migration = {
  id: '262_platform_policy_documents',
  description:
    'Create platform_policy_documents and platform_policy_versions for the policies & compliance workflow',
  up: (db) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_policy_documents (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','PUBLISHED')),
        draft_content TEXT NOT NULL DEFAULT '',
        draft_change_summary TEXT,
        draft_updated_by TEXT,
        draft_updated_at TEXT,
        submitted_by TEXT,
        submitted_at TEXT,
        current_version_id TEXT,
        published_at TEXT,
        published_by TEXT,
        review_note TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS platform_policy_versions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        change_summary TEXT,
        created_by TEXT,
        created_by_name TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        approved_by TEXT,
        approved_by_name TEXT,
        approved_at TEXT,
        is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1)),
        FOREIGN KEY (document_id) REFERENCES platform_policy_documents(id) ON DELETE CASCADE
      )
    `);

    db.run('CREATE INDEX IF NOT EXISTS idx_platform_policy_documents_status ON platform_policy_documents(status, updated_at)');
    db.run('CREATE INDEX IF NOT EXISTS idx_platform_policy_versions_doc ON platform_policy_versions(document_id, version)');
  },
};
