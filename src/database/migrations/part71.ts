import type { Migration } from './support';
import { addColumn } from './support';

export const MIGRATION_PART_71: Migration = {
  id: '181_apartment_estimate_client_terms',
  description: 'Store customer facing estimate terms for consistent print and export documents.',
  up: (db) => addColumn(db, 'project_apartment_estimates', 'terms', "TEXT NOT NULL DEFAULT ''"),
};
