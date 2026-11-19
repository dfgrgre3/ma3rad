import type { Migration } from './support';

/**
 * Migration 231: extend the orders.status CHECK constraint with the shared
 * sector-agnostic statuses ON_HOLD (معلّق) and READY (جاهز).
 *
 * SQLite cannot alter a CHECK constraint in place, so — like the products
 * grade migration — the stored table SQL is rewritten through
 * PRAGMA writable_schema, preserving every column and index.
 * Per-activity enablement and transition rules stay in the application
 * layer; the database accepts the full shared superset.
 */
const NEW_CHECK =
  "CHECK(status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'PARTIAL', 'READY', 'ON_HOLD', 'COMPLETED', 'CANCELLED'))";

export const MIGRATION_PART_147: Migration = {
  id: '231_orders_status_on_hold_ready',
  description: 'Allow ON_HOLD and READY order statuses for sector workflows',
  up: (db) => {
    const row = db.exec(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'`
    )[0]?.values?.[0]?.[0];
    if (typeof row !== 'string') return;
    if (row.includes('ON_HOLD')) return; // already migrated

    // Match the status CHECK whatever its exact spacing/quoting, but only
    // when it constrains the `status` column of the orders table.
    const next = row.replace(/CHECK\s*\(\s*status\s+IN\s*\([^)]*\)\s*\)/i, NEW_CHECK);
    if (next === row) {
      throw new Error('Could not locate the orders.status CHECK constraint to extend.');
    }

    const schemaVersion = Number(db.exec('PRAGMA schema_version')[0]?.values?.[0]?.[0] || 0);
    db.run('PRAGMA writable_schema = ON');
    try {
      db.run(`UPDATE sqlite_master SET sql = ? WHERE type = 'table' AND name = 'orders'`, [next]);
    } finally {
      db.run('PRAGMA writable_schema = OFF');
    }
    db.run(`PRAGMA schema_version = ${schemaVersion + 1}`);
  },
};
