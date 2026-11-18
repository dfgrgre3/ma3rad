import type { Migration } from './support';

/**
 * Migration 229: allow several approvals per business record.
 *
 * The old unique index on (reference_type, reference_id, request_type) made it
 * impossible to consume a second approval for the same record: creating a
 * product and later editing it both use request_type OTHER and reference_type
 * PRODUCT. The index only exists for lookups, so it is recreated as a plain
 * index while keeping the same name and columns.
 */
export const MIGRATION_PART_145: Migration = {
  id: '229_approval_request_reference_index',
  description: 'Allow multiple approval requests to be consumed for one business record',
  up: (db) => {
    db.exec(`DROP INDEX IF EXISTS idx_approvals_reference_request_type`);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_approvals_reference_request_type
        ON approval_requests(reference_type, reference_id, request_type)
        WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL
    `);
  },
};
