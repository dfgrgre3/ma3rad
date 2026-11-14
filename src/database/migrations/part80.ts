import type { Migration } from './support';
import { addColumn, columnExists, tableExists } from './support';

export const MIGRATION_PART_80: Migration = {
  id: '196_platform_release_rollout',
  description: 'Add mandatory/min version/rollout group to releases and release targets tracking.',
  up: (db) => {
    if (tableExists(db, 'platform_releases')) {
      const columns: Array<[string, string]> = [
        ['is_mandatory', 'INTEGER NOT NULL DEFAULT 0'],
        ['min_version', 'TEXT'],
        ['rollout_group', "TEXT NOT NULL DEFAULT 'ALL'"],
      ];
      for (const [column, definition] of columns) {
        if (!columnExists(db, 'platform_releases', column)) addColumn(db, 'platform_releases', column, definition);
      }
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS platform_release_targets (
        id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SUCCESS','FAILED','SKIPPED')),
        applied_at TEXT,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (release_id) REFERENCES platform_releases(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
      )
    `);
  },
};
