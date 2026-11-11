import type { Migration } from './support';
import { addColumn } from './support_part01';

export const MIGRATION_PART_56: Migration[] = [
  {
    id: '167_payroll_social_insurance_engine',
    description: 'Add Egyptian Social Insurance (tamkeen) contribution engine: employee share, employer share, contribution ceilings, and end-of-service benefit rules with legislative effective dates.',
    up: (db) => {
      // --- Social insurance contribution rules (legislative versions with effective dates) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS payroll_social_insurance_rules (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          name TEXT NOT NULL,
          effective_from TEXT NOT NULL,
          effective_to TEXT,
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          employee_share_percent REAL NOT NULL DEFAULT 0 CHECK(employee_share_percent >= 0 AND employee_share_percent <= 100),
          employer_share_percent REAL NOT NULL DEFAULT 0 CHECK(employer_share_percent >= 0 AND employer_share_percent <= 100),
          contribution_ceiling REAL NOT NULL DEFAULT 0 CHECK(contribution_ceiling >= 0),
          minimum_contribution_base REAL NOT NULL DEFAULT 0 CHECK(minimum_contribution_base >= 0),
          maximum_contribution_base REAL NOT NULL DEFAULT 0 CHECK(maximum_contribution_base >= 0),
          end_of_service_per_year_percent REAL NOT NULL DEFAULT 0 CHECK(end_of_service_per_year_percent >= 0 AND end_of_service_per_year_percent <= 100),
          end_of_service_months_per_year REAL NOT NULL DEFAULT 0 CHECK(end_of_service_months_per_year >= 0 AND end_of_service_months_per_year <= 12),
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id)
        );
        CREATE INDEX IF NOT EXISTS idx_social_insurance_company_dates ON payroll_social_insurance_rules(company_id, is_active, effective_from, effective_to);
      `);

      // --- End-of-service benefit rules by system type (civil, private, etc.) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS payroll_end_of_service_rules (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          system_type TEXT NOT NULL DEFAULT 'PRIVATE' CHECK(system_type IN ('PRIVATE', 'CIVIL', 'PUBLIC', 'OTHER')),
          name TEXT NOT NULL,
          effective_from TEXT NOT NULL,
          effective_to TEXT,
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          service_years_for_full_benefit INTEGER NOT NULL DEFAULT 0 CHECK(service_years_for_full_benefit >= 0),
          benefit_months_per_year_first_period REAL NOT NULL DEFAULT 0 CHECK(benefit_months_per_year_first_period >= 0 AND benefit_months_per_year_first_period <= 12),
          benefit_months_per_year_second_period REAL NOT NULL DEFAULT 0 CHECK(benefit_months_per_year_second_period >= 0 AND benefit_months_per_year_second_period <= 12),
          second_period_threshold_years REAL NOT NULL DEFAULT 0 CHECK(second_period_threshold_years >= 0),
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id)
        );
        CREATE INDEX IF NOT EXISTS idx_end_of_service_company_system ON payroll_end_of_service_rules(company_id, system_type, is_active, effective_from);
      `);

      // --- Social insurance contributions per payroll run item ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS payroll_social_insurance_contributions (
          id TEXT PRIMARY KEY,
          payroll_run_id TEXT NOT NULL,
          payroll_run_item_id TEXT NOT NULL,
          employee_id TEXT NOT NULL,
          period TEXT NOT NULL,
          contribution_base REAL NOT NULL DEFAULT 0 CHECK(contribution_base >= 0),
          employee_share_amount REAL NOT NULL DEFAULT 0 CHECK(employee_share_amount >= 0),
          employer_share_amount REAL NOT NULL DEFAULT 0 CHECK(employer_share_amount >= 0),
          total_amount REAL NOT NULL DEFAULT 0 CHECK(total_amount >= 0),
          rule_id TEXT,
          rule_name TEXT,
          calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
          FOREIGN KEY (payroll_run_item_id) REFERENCES payroll_run_items(id) ON DELETE CASCADE,
          FOREIGN KEY (employee_id) REFERENCES employees(id),
          UNIQUE(payroll_run_item_id)
        );
        CREATE INDEX IF NOT EXISTS idx_social_insurance_contributions_run ON payroll_social_insurance_contributions(payroll_run_id);
        CREATE INDEX IF NOT EXISTS idx_social_insurance_contributions_employee ON payroll_social_insurance_contributions(employee_id, period);
      `);

      // --- End-of-service benefit calculations (for final settlement) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS payroll_end_of_service_settlements (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          termination_date TEXT NOT NULL,
          service_years REAL NOT NULL DEFAULT 0 CHECK(service_years >= 0),
          service_months REAL NOT NULL DEFAULT 0 CHECK(service_months >= 0),
          last_monthly_salary REAL NOT NULL DEFAULT 0 CHECK(last_monthly_salary >= 0),
          benefit_amount REAL NOT NULL DEFAULT 0 CHECK(benefit_amount >= 0),
          rule_id TEXT,
          rule_name TEXT,
          system_type TEXT,
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES employees(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          UNIQUE(employee_id, termination_date)
        );
        CREATE INDEX IF NOT EXISTS idx_end_of_service_settlements_employee ON payroll_end_of_service_settlements(employee_id);
      `);

      // --- Extend payroll run items with social insurance fields ---
      addColumn(db, 'payroll_run_items', 'social_insurance_base', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'payroll_run_items', 'social_insurance_employee_share', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'payroll_run_items', 'social_insurance_employer_share', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'payroll_run_items', 'social_insurance_total', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'payroll_run_items', 'social_insurance_rule_id', 'TEXT');
      addColumn(db, 'payroll_run_items', 'social_insurance_rule_name', 'TEXT');
      addColumn(db, 'payroll_run_items', 'end_of_service_benefit', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'payroll_run_items', 'end_of_service_rule_id', 'TEXT');
      addColumn(db, 'payroll_run_items', 'end_of_service_rule_name', 'TEXT');
    },
  },
];
