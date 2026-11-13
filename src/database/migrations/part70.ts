import type { Migration } from './support';
import { addColumn } from './support';

export const MIGRATION_PART_70: Migration = {
  id: '180_project_estimate_execution_cycle',
  description: 'Link approved apartment estimate versions to project contracts, schedules, certificates and actual costs.',
  up: (db) => {
    addColumn(db, 'purchase_requests', 'project_id', 'TEXT');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_purchase_requests_project ON purchase_requests(project_id);
      CREATE TABLE IF NOT EXISTS project_estimate_execution_setups (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        estimate_id TEXT NOT NULL,
        estimate_version_id TEXT NOT NULL UNIQUE,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(estimate_id) REFERENCES project_apartment_estimates(id) ON DELETE CASCADE,
        FOREIGN KEY(estimate_version_id) REFERENCES project_apartment_estimate_versions(id) ON DELETE CASCADE,
        FOREIGN KEY(created_by) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS project_estimate_contracts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        estimate_id TEXT NOT NULL,
        estimate_version_id TEXT NOT NULL,
        contract_number TEXT NOT NULL UNIQUE,
        contract_date TEXT NOT NULL,
        contract_value REAL NOT NULL CHECK(contract_value >= 0),
        terms TEXT,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SIGNED','CANCELLED')),
        quotation_id TEXT,
        signed_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(estimate_id) REFERENCES project_apartment_estimates(id),
        FOREIGN KEY(estimate_version_id) REFERENCES project_apartment_estimate_versions(id),
        FOREIGN KEY(quotation_id) REFERENCES quotations(id) ON DELETE SET NULL,
        FOREIGN KEY(created_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_project_estimate_contracts_project ON project_estimate_contracts(project_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS project_payment_certificates (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        estimate_id TEXT NOT NULL,
        estimate_version_id TEXT NOT NULL,
        contract_id TEXT,
        certificate_number TEXT NOT NULL UNIQUE,
        certificate_date TEXT NOT NULL,
        period_start TEXT,
        period_end TEXT,
        description TEXT NOT NULL,
        progress_percent REAL NOT NULL DEFAULT 0 CHECK(progress_percent >= 0 AND progress_percent <= 100),
        requested_amount REAL NOT NULL CHECK(requested_amount >= 0),
        approved_amount REAL,
        paid_amount REAL NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','APPROVED','RETURNED','PAID')),
        review_notes TEXT,
        payment_reference TEXT,
        paid_at TEXT,
        created_by TEXT NOT NULL,
        reviewed_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(estimate_id) REFERENCES project_apartment_estimates(id),
        FOREIGN KEY(estimate_version_id) REFERENCES project_apartment_estimate_versions(id),
        FOREIGN KEY(contract_id) REFERENCES project_estimate_contracts(id) ON DELETE SET NULL,
        FOREIGN KEY(created_by) REFERENCES users(id),
        FOREIGN KEY(reviewed_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_project_certificates_project ON project_payment_certificates(project_id, certificate_date DESC);
      CREATE TABLE IF NOT EXISTS project_actual_cost_entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        estimate_version_id TEXT,
        budget_line_id TEXT,
        cost_date TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount >= 0),
        source_type TEXT NOT NULL DEFAULT 'MANUAL' CHECK(source_type IN ('MANUAL','PURCHASE','LABOR','OTHER')),
        reference_id TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(estimate_version_id) REFERENCES project_apartment_estimate_versions(id) ON DELETE SET NULL,
        FOREIGN KEY(budget_line_id) REFERENCES project_budget_lines(id) ON DELETE SET NULL,
        FOREIGN KEY(created_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_project_actual_costs_project_date ON project_actual_cost_entries(project_id, cost_date DESC);
    `);
  },
};
