import type { Migration } from './support';
import { tableExists } from './support';

/**
 * Migration 214: widen approval_requests.request_type CHECK constraint.
 *
 * The unified approvals gate creates requests of types that were not in the
 * original CHECK list (PRICE_OVERRIDE, SUPPLIER_PAYMENT, INVOICE_VOID,
 * DATA_DELETE). SQLite cannot alter a CHECK constraint, so the table is
 * rebuilt with the expanded list while preserving rows, indexes and the
 * approval_decisions foreign key.
 */
const NEW_REQUEST_TYPES =
  "'DISCOUNT', 'PRICE_CHANGE', 'PRICE_OVERRIDE', 'SALES_RETURN', 'PURCHASE_RETURN', " +
  "'STOCK_ADJUSTMENT', 'PURCHASE_ORDER', 'EXPENSE', 'SUPPLIER_PAYMENT', " +
  "'INVOICE_VOID', 'CREDIT_LIMIT', 'LEAVE', 'DATA_DELETE', 'OTHER'";

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests(status)',
  'CREATE INDEX IF NOT EXISTS idx_approvals_type ON approval_requests(request_type)',
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_reference_request_type
   ON approval_requests(reference_type, reference_id, request_type)
   WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL`,
];

export const MIGRATION_PART_129: Migration = {
  id: '214_approval_request_types',
  description: 'Expand approval_requests.request_type CHECK for unified approval operations',
  disableForeignKeys: true,
  up: (db) => {
    if (!tableExists(db, 'approval_requests')) return;

    const createSql = db.exec(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'approval_requests'`,
    )[0]?.values[0]?.[0];
    if (!createSql) return;

    // Skip when the constraint already accepts the new types.
    if (String(createSql).includes('PRICE_OVERRIDE')) return;

    const tmp = 'approval_requests__types';
    db.exec(`DROP TABLE IF EXISTS "${tmp}"`);
    db.exec(`
      CREATE TABLE "${tmp}" (
        id TEXT PRIMARY KEY,
        request_number TEXT UNIQUE NOT NULL,
        request_type TEXT NOT NULL CHECK(request_type IN (${NEW_REQUEST_TYPES})),
        reference_type TEXT,
        reference_id TEXT,
        branch_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        requested_value REAL,
        current_value REAL,
        payload TEXT,
        priority TEXT DEFAULT 'NORMAL' CHECK(priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
        status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED')),
        requested_by TEXT NOT NULL,
        decided_by TEXT,
        decided_at TEXT,
        decision_notes TEXT,
        expires_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
        FOREIGN KEY (requested_by) REFERENCES users(id),
        FOREIGN KEY (decided_by) REFERENCES users(id)
      )
    `);
    // Explicit column list: legacy databases may have branch_id appended at a
    // different ordinal position, so SELECT * would misalign the copy.
    const columns = [
      'id', 'request_number', 'request_type', 'reference_type', 'reference_id',
      'branch_id', 'title', 'description', 'requested_value', 'current_value',
      'payload', 'priority', 'status', 'requested_by', 'decided_by',
      'decided_at', 'decision_notes', 'expires_at', 'created_at',
    ];
    const info = db.exec(`PRAGMA table_info(approval_requests)`)[0]?.values || [];
    const existingCols = new Set(info.map((row: any[]) => String(row[1])));
    const selectCols = columns.map((col) => existingCols.has(col) ? col : `NULL AS ${col}`).join(', ');
    db.exec(`INSERT INTO "${tmp}" (${columns.join(', ')}) SELECT ${selectCols} FROM approval_requests`);
    db.exec(`DROP TABLE approval_requests`);
    db.exec(`ALTER TABLE "${tmp}" RENAME TO approval_requests`);
    for (const sql of INDEXES) db.exec(sql);
  },
};
