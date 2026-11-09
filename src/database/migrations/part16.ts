import { addColumn, type Migration } from './support';

export const MIGRATION_PART_16: Migration[] = [
  {
    id: '122_partner_accounts',
    description: 'Add company-scoped partner ownership accounts and immutable financial transaction history.',
    up: (db) => {
      addColumn(db, 'cash_shifts', 'total_partner_inflows', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'cash_shifts', 'total_partner_outflows', 'REAL NOT NULL DEFAULT 0');
      db.exec(`
        INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
        VALUES
          ('acc_1106', '1106', 'ذمم مدينة على الشركاء', 'ASSET', '1103', 0, 1),
          ('acc_2103', '2103', 'الحسابات الجارية الدائنة للشركاء', 'LIABILITY', '2101', 0, 1),
          ('acc_3103', '3103', 'رأس مال الشركاء', 'EQUITY', '3101', 0, 1);

        CREATE TABLE IF NOT EXISTS business_partners (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          name TEXT NOT NULL,
          phone TEXT,
          email TEXT,
          ownership_percent REAL NOT NULL DEFAULT 0
            CHECK(ownership_percent >= 0 AND ownership_percent <= 100),
          capital_amount REAL NOT NULL DEFAULT 0 CHECK(capital_amount >= 0),
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS partner_account_transactions (
          id TEXT PRIMARY KEY,
          partner_id TEXT NOT NULL,
          company_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          transaction_type TEXT NOT NULL CHECK(transaction_type IN (
            'CAPITAL_CONTRIBUTION',
            'WITHDRAWAL',
            'PROFIT_ALLOCATION',
            'PROFIT_DISTRIBUTION',
            'PARTNER_EXPENSE_PAID',
            'COMPANY_EXPENSE_FOR_PARTNER'
          )),
          amount REAL NOT NULL CHECK(amount > 0),
          transaction_date TEXT NOT NULL,
          payment_type TEXT,
          register_id TEXT,
          description TEXT NOT NULL,
          journal_entry_id TEXT NOT NULL,
          allocation_batch_id TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (partner_id) REFERENCES business_partners(id) ON DELETE RESTRICT,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
          FOREIGN KEY (register_id) REFERENCES cash_registers(id) ON DELETE RESTRICT,
          FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_business_partners_company_active
          ON business_partners(company_id, is_active, name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_partner_transactions_partner_date
          ON partner_account_transactions(partner_id, transaction_date, created_at, id);
        CREATE INDEX IF NOT EXISTS idx_partner_transactions_company_date
          ON partner_account_transactions(company_id, transaction_date, id);

        CREATE TRIGGER IF NOT EXISTS trg_prevent_update_partner_account_transactions
        BEFORE UPDATE ON partner_account_transactions
        BEGIN
          SELECT RAISE(ABORT, 'Partner account history is immutable. Update is prohibited.');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_partner_account_transactions
        BEFORE DELETE ON partner_account_transactions
        BEGIN
          SELECT RAISE(ABORT, 'Partner account history is immutable. Delete is prohibited.');
        END;
      `);
    },
  },
  {
    id: '123_branch_scoped_inventory_reconciliation_logs',
    description: 'Store branch ownership on inventory reconciliation audit logs.',
    up: (db) => {
      addColumn(db, 'inventory_reconciliation_logs', 'branch_id', 'TEXT REFERENCES branches(id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_inventory_reconciliation_logs_branch ON inventory_reconciliation_logs(branch_id, created_at)');
    },
  },
  {
    id: '124_branch_optional_contact_and_tax_fields',
    description: 'Add optional secondary phone and tax number to branches.',
    up: (db) => {
      addColumn(db, 'branches', 'phone2', 'TEXT');
      addColumn(db, 'branches', 'tax_number', 'TEXT');
    },
  },
];
