import { addColumn, type Migration } from '../migrationSupport';

export const MIGRATION_PART_21: Migration[] = [
  {
    id: '131_partner_capital_and_ownership_history',
    description: 'Track partner ownership changes, capital commitments, bank receipts and payment evidence.',
    up: (db) => {
      addColumn(db, 'business_partners', 'profit_share_percent', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'partner_account_transactions', 'bank_account_id', 'TEXT');
      addColumn(db, 'partner_account_transactions', 'attachments_json', "TEXT NOT NULL DEFAULT '[]'");
      db.exec(`
        UPDATE business_partners
        SET profit_share_percent = ownership_percent
        WHERE profit_share_percent = 0 AND ownership_percent > 0;

        CREATE TABLE IF NOT EXISTS partner_ownership_history (
          id TEXT PRIMARY KEY,
          partner_id TEXT NOT NULL,
          company_id TEXT NOT NULL,
          old_percent REAL NOT NULL,
          new_percent REAL NOT NULL,
          effective_date TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (partner_id) REFERENCES business_partners(id) ON DELETE RESTRICT,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS partner_capital_history (
          id TEXT PRIMARY KEY,
          partner_id TEXT NOT NULL,
          company_id TEXT NOT NULL,
          old_amount REAL NOT NULL,
          new_amount REAL NOT NULL,
          effective_date TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (partner_id) REFERENCES business_partners(id) ON DELETE RESTRICT,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS partner_ownership_policies (
          company_id TEXT PRIMARY KEY,
          basis TEXT NOT NULL CHECK(basis IN ('AGREED_CAPITAL', 'PAID_CONTRIBUTIONS')),
          updated_by TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
          FOREIGN KEY (updated_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS partner_profit_share_history (
          id TEXT PRIMARY KEY,
          partner_id TEXT NOT NULL,
          company_id TEXT NOT NULL,
          old_percent REAL NOT NULL,
          new_percent REAL NOT NULL,
          effective_date TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (partner_id) REFERENCES business_partners(id) ON DELETE RESTRICT,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_partner_ownership_history_partner_date
          ON partner_ownership_history(partner_id, effective_date, created_at);
        CREATE INDEX IF NOT EXISTS idx_partner_capital_history_partner_date
          ON partner_capital_history(partner_id, effective_date, created_at);
        CREATE INDEX IF NOT EXISTS idx_partner_profit_share_history_partner_date
          ON partner_profit_share_history(partner_id, effective_date, created_at);

        CREATE TRIGGER IF NOT EXISTS trg_prevent_update_partner_ownership_history
        BEFORE UPDATE ON partner_ownership_history
        BEGIN
          SELECT RAISE(ABORT, 'Partner ownership history is immutable. Update is prohibited.');
        END;
        CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_partner_ownership_history
        BEFORE DELETE ON partner_ownership_history
        BEGIN
          SELECT RAISE(ABORT, 'Partner ownership history is immutable. Delete is prohibited.');
        END;
        CREATE TRIGGER IF NOT EXISTS trg_prevent_update_partner_capital_history
        BEFORE UPDATE ON partner_capital_history
        BEGIN
          SELECT RAISE(ABORT, 'Partner capital history is immutable. Update is prohibited.');
        END;
        CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_partner_capital_history
        BEFORE DELETE ON partner_capital_history
        BEGIN
          SELECT RAISE(ABORT, 'Partner capital history is immutable. Delete is prohibited.');
        END;
        CREATE TRIGGER IF NOT EXISTS trg_prevent_update_partner_profit_share_history
        BEFORE UPDATE ON partner_profit_share_history
        BEGIN
          SELECT RAISE(ABORT, 'Partner profit share history is immutable. Update is prohibited.');
        END;
        CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_partner_profit_share_history
        BEFORE DELETE ON partner_profit_share_history
        BEGIN
          SELECT RAISE(ABORT, 'Partner profit share history is immutable. Delete is prohibited.');
        END;
      `);
    },
  },
];
