import type { Database } from 'sql.js';
import { addColumn, tableExists } from './support';
import type { Migration } from './support';

/**
 * Migration 256: executed quantities per estimate line (الكميات المنفذة).
 *
 * Each row tracks the cumulative executed quantity of one cost line inside an
 * approved estimate version, so progress certificates and cost reports can be
 * measured against the BOQ instead of a single project-level percentage.
 * One row per (estimate_version_id, line_id) — updated in place.
 */
export const MIGRATION_256_ESTIMATE_LINE_PROGRESS: Migration = {
  id: '256_estimate_line_progress',
  description: 'Add project_estimate_line_progress table for per-line executed quantities',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_estimate_line_progress (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        estimate_version_id TEXT NOT NULL,
        line_id TEXT NOT NULL,
        line_name TEXT NOT NULL,
        unit TEXT,
        planned_quantity REAL NOT NULL DEFAULT 0 CHECK(planned_quantity >= 0),
        executed_quantity REAL NOT NULL DEFAULT 0 CHECK(executed_quantity >= 0),
        measured_at TEXT,
        note TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(estimate_version_id, line_id),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(estimate_version_id) REFERENCES project_apartment_estimate_versions(id) ON DELETE CASCADE,
        FOREIGN KEY(created_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_line_progress_project ON project_estimate_line_progress(project_id, estimate_version_id);
    `);
  },
};

/**
 * Migration 257: general BOQ estimates (مقاييس أعمال عامة).
 *
 * Marks project_apartment_estimates rows as 'APARTMENT' (rooms/measurement
 * takeoff) or 'BOQ' (free-form bill of quantities). BOQ rows reuse the same
 * versions/approval tables so contracts, certificates and line progress work
 * unchanged — only the snapshot shape differs (rooms: [], manual lines).
 */
export const MIGRATION_257_BOQ_ESTIMATE_KIND: Migration = {
  id: '257_boq_estimate_kind',
  description: 'Add estimate_kind discriminator to project_apartment_estimates',
  up: (db: Database) => {
    if (!tableExists(db, 'project_apartment_estimates')) return;
    addColumn(db, 'project_apartment_estimates', 'estimate_kind', "TEXT NOT NULL DEFAULT 'APARTMENT'");
    db.exec(`CREATE INDEX IF NOT EXISTS idx_estimates_kind ON project_apartment_estimates(project_id, estimate_kind);`);
  },
};

/**
 * Migration 258: formal subcontractor contract fields.
 *
 * Extends project_subcontractors from a simple directory entry into a
 * subcontract agreement record: contract number/date, work scope and
 * retention percentage held back from each payment certificate.
 */
export const MIGRATION_258_SUBCONTRACTOR_CONTRACT_FIELDS: Migration = {
  id: '258_subcontractor_contract_fields',
  description: 'Add contract fields to project_subcontractors',
  up: (db: Database) => {
    if (!tableExists(db, 'project_subcontractors')) return;
    addColumn(db, 'project_subcontractors', 'contract_number', 'TEXT');
    addColumn(db, 'project_subcontractors', 'contract_date', 'TEXT');
    addColumn(db, 'project_subcontractors', 'scope', 'TEXT');
    addColumn(db, 'project_subcontractors', 'retention_percent', 'REAL NOT NULL DEFAULT 0');
  },
};

/**
 * Migration 259: subcontractor progress certificates (مستخلصات المقاولين الباطنين).
 *
 * Each certificate bills a subcontractor for work done in a period. The
 * retention percentage is snapshotted from the subcontract at creation time;
 * net_amount = amount - retention_amount. Money columns are piastres.
 */
export const MIGRATION_259_SUBCONTRACTOR_CERTIFICATES: Migration = {
  id: '259_subcontractor_certificates',
  description: 'Add subcontractor_certificates table for sub-contract progress claims',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS subcontractor_certificates (
        id TEXT PRIMARY KEY,
        subcontractor_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        certificate_number TEXT NOT NULL UNIQUE,
        period_start TEXT,
        period_end TEXT,
        description TEXT NOT NULL,
        amount INTEGER NOT NULL DEFAULT 0 CHECK(amount >= 0),
        retention_percent REAL NOT NULL DEFAULT 0,
        retention_amount INTEGER NOT NULL DEFAULT 0 CHECK(retention_amount >= 0),
        net_amount INTEGER NOT NULL DEFAULT 0 CHECK(net_amount >= 0),
        paid_amount INTEGER NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','APPROVED','PAID')),
        review_notes TEXT,
        payment_reference TEXT,
        paid_at TEXT,
        created_by TEXT NOT NULL,
        reviewed_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(subcontractor_id) REFERENCES project_subcontractors(id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(created_by) REFERENCES users(id),
        FOREIGN KEY(reviewed_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_subcert_subcontractor ON subcontractor_certificates(subcontractor_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_subcert_project ON subcontractor_certificates(project_id, status);
    `);
  },
};
