import type { Migration } from './support';

/**
 * Phase 0 of the central-admin migration: introduce the `platform.dataSource`
 * runtime flag so the UI can switch between the local PlatformAdminService
 * and the central server gradually. Default remains 'local' for backward
 * compatibility until each center is migrated and verified.
 */
export const MIGRATION_PART_117: Migration = {
  id: '202_platform_data_source_flag',
  description: 'Seed platform_settings.platform.dataSource = local (central-admin migration switch).',
  up: (db) => {
    db.run(`INSERT OR IGNORE INTO platform_settings (key, value) VALUES ('platform.dataSource', 'local')`);
  },
};