import type { Migration } from '../migrationSupport';

/**
 * Partner accounts, phase 2.
 *
 * The original partner ledger only stored six movement types and derived the
 * account balance from the type. This migration keeps the existing history
 * intact while widening the model:
 *  - store the signed balance effect on every row so new movement types and
 *    reversals can never disagree with the account balance,
 *  - add partner loans, personal drawings and manual adjustments,
 *  - link reversal rows to the original movement (full audit trail).
 */
export const MIGRATION_PART_20: Migration[] = [
  {
    id: '130_partner_accounts_comprehensive',
    description: 'Extend partner accounts with loans, drawings, adjustments, reversals and signed balance effects.',
    disableForeignKeys: true,
    up: (db) => {
      db.exec(`
        DROP TRIGGER IF EXISTS trg_prevent_update_partner_account_transactions;
        DROP TRIGGER IF EXISTS trg_prevent_delete_partner_account_transactions;

        ALTER TABLE partner_account_transactions RENAME TO partner_account_transactions_legacy;

        CREATE TABLE partner_account_transactions (
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
            'COMPANY_EXPENSE_FOR_PARTNER',
            'PARTNER_LOAN',
            'LOAN_REPAYMENT',
            'PERSONAL_DRAWING',
            'ADJUSTMENT_INCREASE',
            'ADJUSTMENT_DECREASE',
            'REVERSAL'
          )),
          amount REAL NOT NULL CHECK(amount > 0),
          balance_effect REAL NOT NULL DEFAULT 0,
          transaction_date TEXT NOT NULL,
          payment_type TEXT,
          register_id TEXT,
          reference_number TEXT,
          description TEXT NOT NULL,
          journal_entry_id TEXT NOT NULL,
          allocation_batch_id TEXT,
          reversal_of_id TEXT,
          reversal_of_type TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (partner_id) REFERENCES business_partners(id) ON DELETE RESTRICT,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
          FOREIGN KEY (register_id) REFERENCES cash_registers(id) ON DELETE RESTRICT,
          FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT,
          FOREIGN KEY (reversal_of_id) REFERENCES partner_account_transactions(id) ON DELETE RESTRICT,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        INSERT INTO partner_account_transactions (
          id, partner_id, company_id, branch_id, transaction_type, amount, balance_effect,
          transaction_date, payment_type, register_id, description, journal_entry_id,
          allocation_batch_id, created_by, created_at
        )
        SELECT id, partner_id, company_id, branch_id, transaction_type, amount,
               CASE
                 WHEN transaction_type IN (
                   'CAPITAL_CONTRIBUTION', 'PROFIT_ALLOCATION', 'PARTNER_EXPENSE_PAID'
                 ) THEN amount
                 ELSE -amount
               END,
               transaction_date, payment_type, register_id, description, journal_entry_id,
               allocation_batch_id, created_by, created_at
        FROM partner_account_transactions_legacy;

        DROP TABLE partner_account_transactions_legacy;

        CREATE INDEX IF NOT EXISTS idx_partner_transactions_partner_date
          ON partner_account_transactions(partner_id, transaction_date, created_at, id);
        CREATE INDEX IF NOT EXISTS idx_partner_transactions_company_date
          ON partner_account_transactions(company_id, transaction_date, id);
        CREATE INDEX IF NOT EXISTS idx_partner_transactions_reversal
          ON partner_account_transactions(reversal_of_id);
        CREATE INDEX IF NOT EXISTS idx_partner_transactions_type_date
          ON partner_account_transactions(transaction_type, transaction_date);

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

        INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
        VALUES ('acc_3104', '3104', 'تسويات أرصدة الشركاء', 'EQUITY', '3101', 0, 1);
      `);
    },
  },
];
