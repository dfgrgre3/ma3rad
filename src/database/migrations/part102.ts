import type { Migration } from './support';
import { tableExists, addColumn } from './support';

export const MIGRATION_PART_102: Migration[] = [
  {
    id: '152_product_control_enhancements',
    description:
      'Extend platform_releases with package file details, checksums, signatures, rollback and changelog. Add platform_feature_overrides for targeted rollout.',
    disableForeignKeys: true,
    up: (db) => {
      // 1. Extend platform_releases
      if (tableExists(db, 'platform_releases')) {
        addColumn(db, 'platform_releases', 'file_url', 'TEXT');
        addColumn(db, 'platform_releases', 'file_name', 'TEXT');
        addColumn(db, 'platform_releases', 'file_size', 'INTEGER');
        addColumn(db, 'platform_releases', 'checksum_sha256', 'TEXT');
        addColumn(db, 'platform_releases', 'package_signature', 'TEXT');
        addColumn(db, 'platform_releases', 'changelog', 'TEXT');
        addColumn(db, 'platform_releases', 'rollback_version', 'TEXT');
        addColumn(db, 'platform_releases', 'staging_group', "TEXT NOT NULL DEFAULT 'PRODUCTION'");
      }

      // 2. Extend platform_feature_flags
      if (tableExists(db, 'platform_feature_flags')) {
        addColumn(db, 'platform_feature_flags', 'is_staging_only', 'INTEGER NOT NULL DEFAULT 0');
        addColumn(db, 'platform_feature_flags', 'min_plan_tier', 'TEXT');
      }

      // 3. Create platform_feature_overrides (Tenant or Plan specific overrides)
      db.exec(`
        CREATE TABLE IF NOT EXISTS platform_feature_overrides (
          id TEXT PRIMARY KEY,
          feature_id TEXT NOT NULL,
          target_type TEXT NOT NULL CHECK(target_type IN ('TENANT', 'PLAN', 'STAGING_GROUP')),
          target_id TEXT NOT NULL,
          is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0,1)),
          custom_rollout_percent INTEGER DEFAULT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (feature_id) REFERENCES platform_feature_flags(id) ON DELETE CASCADE,
          UNIQUE(feature_id, target_type, target_id)
        );
        CREATE INDEX IF NOT EXISTS idx_feature_overrides_lookup ON platform_feature_overrides(feature_id, target_type, target_id);
      `);

      // 4. Extend platform_release_targets
      if (tableExists(db, 'platform_release_targets')) {
        addColumn(db, 'platform_release_targets', 'device_id', 'TEXT');
        addColumn(db, 'platform_release_targets', 'client_version', 'TEXT');
        addColumn(db, 'platform_release_targets', 'attempt_count', 'INTEGER NOT NULL DEFAULT 0');
      }
    },
  },
];
