import type { Migration } from './support';

export const MIGRATION_PART_60: Migration[] = [
  {
    id: '171_facility_service_vendors_and_sla',
    description: 'Add facility service vendors, contract SLA definitions, payment tracking, renewals, evaluations, and amendments for complete contract lifecycle management.',
    up: (db) => {
      // --- Facility service vendors (suppliers specialized in facility services) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_service_vendors (
          id TEXT PRIMARY KEY,
          supplier_id TEXT NOT NULL,
          company_id TEXT NOT NULL,
          service_categories TEXT NOT NULL CHECK(service_categories IN ('MAINTENANCE', 'CLEANING', 'SECURITY', 'UTILITY', 'LEASE', 'OTHER')),
          contact_name TEXT,
          contact_phone TEXT,
          contact_email TEXT,
          tax_number TEXT,
          commercial_record TEXT,
          address TEXT,
          payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK(payment_terms_days >= 0),
          rating REAL DEFAULT 0 CHECK(rating >= 0 AND rating <= 5),
          total_contracts INTEGER NOT NULL DEFAULT 0,
          active_contracts INTEGER NOT NULL DEFAULT 0,
          is_preferred INTEGER NOT NULL DEFAULT 0 CHECK(is_preferred IN (0, 1)),
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_service_vendors_supplier ON facility_service_vendors(supplier_id);
        CREATE INDEX IF NOT EXISTS idx_facility_service_vendors_category ON facility_service_vendors(service_categories, is_active);
        CREATE INDEX IF NOT EXISTS idx_facility_service_vendors_company ON facility_service_vendors(company_id, is_active);
      `);

      // --- Extend facility_contracts with SLA and supplier linkage ---
      const contractColumns = [
        ['supplier_id', 'TEXT REFERENCES suppliers(id) ON DELETE SET NULL'],
        ['sla_response_time_minutes', 'INTEGER DEFAULT 0 CHECK(sla_response_time_minutes >= 0)'],
        ['sla_resolution_time_minutes', 'INTEGER DEFAULT 0 CHECK(sla_resolution_time_minutes >= 0)'],
        ['sla_penalty_per_delay', 'REAL DEFAULT 0 CHECK(sla_penalty_per_delay >= 0)'],
        ['auto_renew', 'INTEGER NOT NULL DEFAULT 0 CHECK(auto_renew IN (0, 1))'],
        ['renewal_notice_days', 'INTEGER NOT NULL DEFAULT 30 CHECK(renewal_notice_days >= 0)'],
        ['vendor_rating', 'REAL DEFAULT 0 CHECK(vendor_rating >= 0 AND vendor_rating <= 5)'],
        ['last_evaluation_date', 'TEXT'],
        ['amendment_count', 'INTEGER NOT NULL DEFAULT 0 CHECK(amendment_count >= 0)'],
      ];
      for (const [column, definition] of contractColumns) {
        const exists = db.exec(`SELECT 1 FROM pragma_table_info('facility_contracts') WHERE name='${column}'`)[0]?.values?.length === 1;
        if (!exists) {
          db.run(`ALTER TABLE facility_contracts ADD COLUMN ${column} ${definition}`);
        }
      }

      // --- Contract payments tracking ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_contract_payments (
          id TEXT PRIMARY KEY,
          contract_id TEXT NOT NULL,
          payment_number TEXT NOT NULL,
          due_date TEXT NOT NULL,
          amount_due REAL NOT NULL DEFAULT 0 CHECK(amount_due >= 0),
          amount_paid REAL NOT NULL DEFAULT 0 CHECK(amount_paid >= 0),
          payment_date TEXT,
          payment_method TEXT CHECK(payment_method IN ('CASH', 'BANK_TRANSFER', 'WALLET', 'OTHER')),
          reference_number TEXT,
          proof_reference TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED')),
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (contract_id) REFERENCES facility_contracts(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id),
          UNIQUE(contract_id, payment_number)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_contract_payments_contract ON facility_contract_payments(contract_id, due_date);
        CREATE INDEX IF NOT EXISTS idx_facility_contract_payments_status ON facility_contract_payments(status, due_date);
      `);

      // --- Contract renewals ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_contract_renewals (
          id TEXT PRIMARY KEY,
          contract_id TEXT NOT NULL,
          renewal_number TEXT NOT NULL,
          previous_ends_at TEXT NOT NULL,
          new_ends_at TEXT NOT NULL,
          new_payment_amount REAL NOT NULL DEFAULT 0 CHECK(new_payment_amount >= 0),
          new_payment_cycle TEXT NOT NULL DEFAULT 'MONTHLY' CHECK(new_payment_cycle IN ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'YEARLY')),
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'EXECUTED', 'REJECTED')),
          approved_by TEXT,
          approved_at TEXT,
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (contract_id) REFERENCES facility_contracts(id) ON DELETE CASCADE,
          FOREIGN KEY (approved_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_contract_renewals_contract ON facility_contract_renewals(contract_id, status);
      `);

      // --- Vendor performance evaluations ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_vendor_evaluations (
          id TEXT PRIMARY KEY,
          vendor_id TEXT NOT NULL,
          contract_id TEXT,
          evaluation_date TEXT NOT NULL,
          evaluator_id TEXT NOT NULL,
          evaluator_name TEXT NOT NULL,
          quality_rating REAL NOT NULL DEFAULT 0 CHECK(quality_rating >= 0 AND quality_rating <= 5),
          timeliness_rating REAL NOT NULL DEFAULT 0 CHECK(timeliness_rating >= 0 AND timeliness_rating <= 5),
          communication_rating REAL NOT NULL DEFAULT 0 CHECK(communication_rating >= 0 AND communication_rating <= 5),
          overall_rating REAL NOT NULL DEFAULT 0 CHECK(overall_rating >= 0 AND overall_rating <= 5),
          comments TEXT,
          issues_found TEXT,
          actions_required TEXT,
          follow_up_date TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (vendor_id) REFERENCES facility_service_vendors(id) ON DELETE CASCADE,
          FOREIGN KEY (contract_id) REFERENCES facility_contracts(id) ON DELETE SET NULL,
          FOREIGN KEY (evaluator_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_vendor_evaluations_vendor ON facility_vendor_evaluations(vendor_id, evaluation_date);
      `);

      // --- Contract amendments ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_contract_amendments (
          id TEXT PRIMARY KEY,
          contract_id TEXT NOT NULL,
          amendment_number TEXT NOT NULL,
          amendment_date TEXT NOT NULL,
          field_changed TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT,
          reason TEXT NOT NULL,
          approved_by TEXT,
          approved_at TEXT,
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (contract_id) REFERENCES facility_contracts(id) ON DELETE CASCADE,
          FOREIGN KEY (approved_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_contract_amendments_contract ON facility_contract_amendments(contract_id, amendment_date);
      `);
    },
  },
];
