import type { Migration } from './support';
import { tableExists, addColumn } from './support';

/**
 * Migration 233: page_paths on platform_feature_flags — the tenant app page
 * paths a feature owns. When the feature is excluded from a tenant's plan or
 * disabled via override, the signed central config hides those pages.
 */
export const MIGRATION_PART_149: Migration = {
  id: '233_feature_flag_page_paths',
  description: 'Add page_paths column to platform_feature_flags for feature→page binding',
  up: (db) => {
    if (tableExists(db, 'platform_feature_flags')) {
      addColumn(db, 'platform_feature_flags', 'page_paths', 'TEXT');
    }
  },
};
