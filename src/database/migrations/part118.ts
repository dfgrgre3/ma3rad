import type { Migration } from './support';
import { PLATFORM_PERMISSION_CATALOG } from '../../services/domains/platform/platformPermissionCatalog';

/**
 * Permission split for the central backup console: create/restore/delete are
 * now distinct codes from view. Existing PLATFORM_ADMIN matrices receive the
 * new codes (INSERT OR IGNORE — operator edits are never overwritten); no
 * other role gains them by default.
 */
export const MIGRATION_PART_118: Migration = {
  id: '203_platform_backups_permission_split',
  description: 'Seed platform.backups.restore/delete granular permission codes and grant them to PLATFORM_ADMIN.',
  up: (db) => {
    const newCodes = PLATFORM_PERMISSION_CATALOG.filter(
      (permission) => permission.code === 'platform.backups.restore' || permission.code === 'platform.backups.delete',
    );
    for (const [index, permission] of newCodes.entries()) {
      db.run(
        `INSERT OR IGNORE INTO platform_permissions (code, module, action, name, is_special, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [permission.code, permission.module, permission.action, permission.name, permission.special ? 1 : 0, 9000 + index],
      );
      db.run(
        `INSERT OR IGNORE INTO platform_role_permissions (role_code, permission_code) VALUES ('PLATFORM_ADMIN', ?)`,
        [permission.code],
      );
    }
  },
};
