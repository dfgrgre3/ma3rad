import type { Migration } from './support';
import { addColumn, tableExists } from './support';

/**
 * Configurable payroll income tax.
 *
 * A company used to apply one flat `payroll_tax_rate` to the whole gross
 * salary. Real jurisdictions use effective-dated rules, progressive brackets,
 * taxable-base choices and employee exemptions. These tables keep every rule
 * versioned so a closed payroll period can always explain how its tax was
 * produced, while the employee columns carry the personal exemption inputs.
 */
export const MIGRATION_PART_38: Migration[] = [
  {
    id: '150_payroll_tax_engine',
    description: 'Add configurable payroll tax rules, progressive brackets and employee tax exemptions.',
    disableForeignKeys: true,
    up: (db) => {
      if (tableExists(db, 'employees')) {
        addColumn(db, 'employees', 'tax_exempt', 'INTEGER NOT NULL DEFAULT 0');
        addColumn(db, 'employees', 'tax_exemption_amount', 'REAL NOT NULL DEFAULT 0');
        addColumn(db, 'employees', 'tax_dependents', 'INTEGER NOT NULL DEFAULT 0');
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS payroll_tax_rules (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          name TEXT NOT NULL,
          jurisdiction TEXT,
          taxable_basis TEXT NOT NULL DEFAULT 'GROSS'
            CHECK (taxable_basis IN ('GROSS', 'BASE')),
          effective_from TEXT NOT NULL,
          effective_to TEXT,
          dependent_allowance REAL NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          notes TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_payroll_tax_rules_company_dates
          ON payroll_tax_rules(company_id, is_active, effective_from, effective_to);

        CREATE TABLE IF NOT EXISTS payroll_tax_brackets (
          id TEXT PRIMARY KEY,
          rule_id TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          lower_limit REAL NOT NULL DEFAULT 0,
          upper_limit REAL,
          rate_percent REAL NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_payroll_tax_brackets_rule
          ON payroll_tax_brackets(rule_id, lower_limit);
      `);
    },
  },
];
