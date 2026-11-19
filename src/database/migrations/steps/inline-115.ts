import type { Database } from 'sql.js';
import type { Migration } from '../support';
import { addColumn } from '../support';

export const MIGRATION_115_SUPPLIER_CLAIM_BRANCH_SCOPE: Migration = {
    id: '115_supplier_claim_branch_scope',
    description: 'Scope supplier claims to the branch that owns their source documents.',
    up: (db: Database) => {
      addColumn(db, 'supplier_claims', 'branch_id', 'TEXT');
      db.exec(`
        UPDATE supplier_claims
        SET branch_id = COALESCE(
          (SELECT COALESCE(pi.branch_id, piw.branch_id)
           FROM purchase_invoices pi
           LEFT JOIN warehouses piw ON piw.id = pi.warehouse_id
           WHERE pi.id = supplier_claims.purchase_invoice_id),
          (SELECT grnw.branch_id
           FROM goods_receipt_notes grn
           JOIN warehouses grnw ON grnw.id = grn.warehouse_id
           WHERE grn.id = supplier_claims.grn_id),
          (SELECT pow.branch_id
           FROM purchase_orders po
           JOIN warehouses pow ON pow.id = po.warehouse_id
           WHERE po.id = supplier_claims.purchase_order_id)
        )
        WHERE branch_id IS NULL;
        CREATE INDEX IF NOT EXISTS idx_supplier_claims_branch
          ON supplier_claims(branch_id, created_at DESC);
      `);
    },
};

export const MIGRATION_116_SYNC_EXPENSE_BUSINESS_RECORDS: Migration = {
    id: '116_sync_expense_business_records',
    description: 'Allow expense snapshots and deletion tombstones in business record synchronization.',
    up: (db: Database) => {
      db.run(
        `INSERT OR IGNORE INTO sync_entity_policies
          (entity_type, enabled, outbound_enabled, inbound_enabled, data_scope, managed_by_head_office)
         VALUES ('expense', 0, 0, 0, 'TENANT', 0)`
      );

      const supportedTypes = [
        'sales_invoice', 'sales_return', 'purchase_invoice', 'purchase_return',
        'customer_payment', 'supplier_payment', 'stock_transfer', 'expense',
      ];
      const allowedTypes = supportedTypes.map((entityType) => `'${entityType}'`).join(',');
      const rebuildRemoteTable = (
        table: 'sync_remote_records' | 'sync_remote_entities',
        tableDefinition: string,
        columns: string,
        index: string
      ) => {
        const sql = db.exec(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`
        )[0]?.values?.[0]?.[0] as string | undefined;
        if (!sql || supportedTypes.every((entityType) => sql.includes(`'${entityType}'`))) return;
        db.exec(`
          CREATE TABLE ${table}__tmp (${tableDefinition.replace('{allowedTypes}', allowedTypes)});
          INSERT INTO ${table}__tmp (${columns})
          SELECT ${columns} FROM ${table};
          DROP TABLE ${table};
          ALTER TABLE ${table}__tmp RENAME TO ${table};
          CREATE INDEX IF NOT EXISTS ${index};
        `);
      };

      rebuildRemoteTable(
        'sync_remote_records',
        `event_id TEXT PRIMARY KEY,
         tenant_id TEXT NOT NULL,
         source_branch_id TEXT NOT NULL,
         entity_type TEXT NOT NULL CHECK(entity_type IN ({allowedTypes})),
         entity_id TEXT NOT NULL,
         entity_version INTEGER NOT NULL,
         payload TEXT NOT NULL,
         received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`,
        'event_id, tenant_id, source_branch_id, entity_type, entity_id, entity_version, payload, received_at',
        `idx_sync_remote_records_scope
          ON sync_remote_records(tenant_id, entity_type, source_branch_id, received_at)`
      );
      rebuildRemoteTable(
        'sync_remote_entities',
        `tenant_id TEXT NOT NULL,
         source_branch_id TEXT NOT NULL,
         entity_type TEXT NOT NULL CHECK(entity_type IN ({allowedTypes})),
         entity_id TEXT NOT NULL,
         entity_version INTEGER NOT NULL,
         latest_event_id TEXT NOT NULL,
         payload TEXT NOT NULL,
         updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (tenant_id, source_branch_id, entity_type, entity_id)`,
        'tenant_id, source_branch_id, entity_type, entity_id, entity_version, latest_event_id, payload, updated_at',
        `idx_sync_remote_entities_type
          ON sync_remote_entities(tenant_id, entity_type, source_branch_id, updated_at)`
      );
    },
};

export const MIGRATION_117_SALES_RETURN_CUSTOMER_CREDITS: Migration = {
    id: '117_sales_return_customer_credits',
    description: 'Align invoice return totals with the actual customer credit including VAT.',
    up: (db: Database) => {
      db.exec(`
        UPDATE sales_invoices
        SET returned_amount = COALESCE((
          SELECT SUM(COALESCE(sr.refunded_amount, 0) + COALESCE(sr.remaining_to_balance, 0))
          FROM sales_returns sr
          WHERE sr.original_invoice_id = sales_invoices.id
        ), 0)
      `);
    },
};

export const MIGRATION_118_SALES_RETURN_CUSTOMER_CREDIT_VAT: Migration = {
    id: '118_sales_return_customer_credit_vat',
    description: 'Recalculate legacy sales return credits including proportional VAT.',
    up: (db: Database) => {
      db.exec(`
        UPDATE sales_invoices
        SET returned_amount = COALESCE((
          SELECT SUM(
            COALESCE(sr.refunded_amount, 0) +
            COALESCE(sr.remaining_to_balance, 0) +
            CASE
              WHEN MAX(0, COALESCE(sales_invoices.subtotal, 0) - COALESCE(sales_invoices.discount_amount, 0)) > 0
              THEN ROUND(
                COALESCE(sr.total_amount, 0) * COALESCE(sales_invoices.tax_amount, 0) /
                MAX(0, COALESCE(sales_invoices.subtotal, 0) - COALESCE(sales_invoices.discount_amount, 0)),
                2
              )
              ELSE 0
            END
          )
          FROM sales_returns sr
          WHERE sr.original_invoice_id = sales_invoices.id
        ), 0)
      `);
    },
};

export const MIGRATION_119_SALES_RETURN_TAX_AND_RECONCILIATION: Migration = {
    id: '119_sales_return_tax_and_reconciliation',
    description: 'Store sales return tax separately and add an auditable historical reconciliation workflow.',
    up: (db: Database) => {
      addColumn(db, 'sales_returns', 'return_tax_amount', 'REAL');
      db.exec(`
        CREATE TABLE IF NOT EXISTS sales_return_reconciliations (
          id TEXT PRIMARY KEY,
          return_id TEXT NOT NULL UNIQUE,
          invoice_returned_amount_before REAL NOT NULL,
          stored_cash_amount REAL NOT NULL,
          stored_balance_amount REAL NOT NULL,
          calculated_tax_amount REAL NOT NULL,
          confirmed_cash_amount REAL NOT NULL,
          confirmed_balance_amount REAL NOT NULL,
          existing_ledger_summary TEXT NOT NULL,
          correction_entry_id TEXT,
          approved_by TEXT NOT NULL,
          approved_at TEXT NOT NULL,
          notes TEXT NOT NULL,
          FOREIGN KEY (return_id) REFERENCES sales_returns(id),
          FOREIGN KEY (approved_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_sales_return_reconciliations_return
          ON sales_return_reconciliations(return_id);
        CREATE TABLE IF NOT EXISTS sales_return_reconciliation_reviews (
          id TEXT PRIMARY KEY,
          reviewed_by TEXT NOT NULL,
          reviewed_at TEXT NOT NULL,
          candidate_count INTEGER NOT NULL,
          snapshot_json TEXT NOT NULL,
          used_at TEXT,
          FOREIGN KEY (reviewed_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_sales_return_reconciliation_reviews_user
          ON sales_return_reconciliation_reviews(reviewed_by, reviewed_at);
      `);
    },
};

export const MIGRATION_120_RESTORE_RECORDED_SALES_RETURN_CREDITS: Migration = {
    id: '120_restore_recorded_sales_return_credits',
    description: 'Keep invoice return totals at recorded cash and customer-credit amounts until historical review.',
    up: (db: Database) => {
      db.exec(`
        UPDATE sales_invoices
        SET returned_amount = COALESCE((
          SELECT SUM(COALESCE(sr.refunded_amount, 0) + COALESCE(sr.remaining_to_balance, 0))
          FROM sales_returns sr
          WHERE sr.original_invoice_id = sales_invoices.id
        ), 0)
      `);
    },
};

export const MIGRATION_121_RECORD_HISTORICAL_RETURN_PURCHASE_TAX_DECISION: Migration = {
    id: '121_record_historical_return_purchase_tax_decision',
    description: 'Record whether historical return tax was already deducted from customer purchases.',
    up: (db: Database) => {
      addColumn(db, 'sales_return_reconciliations', 'customer_purchase_tax_included', 'INTEGER NOT NULL DEFAULT 0');
    },
};

export const MIGRATION_170_FISCAL_CLOSE_DATABASE_GUARDS: Migration = {
    id: '170_fiscal_close_database_guards',
    description: 'Enforce posted-entry and closed-period prerequisites at the database layer.',
    up: (db: Database) => {
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_fiscal_period_close_requires_posted_entries
        BEFORE UPDATE OF status ON fiscal_periods
        WHEN NEW.status = 'CLOSED' AND OLD.status = 'OPEN'
        BEGIN
          SELECT RAISE(ABORT, 'لا يمكن إقفال فترة تحتوي على قيود يومية غير مرحلة.')
          WHERE EXISTS (
            SELECT 1 FROM journal_entries e
            WHERE e.date >= OLD.start_date AND e.date <= OLD.end_date AND e.is_posted = 0
          );
        END;

        CREATE TRIGGER IF NOT EXISTS trg_fiscal_year_close_requires_closed_periods
        BEFORE UPDATE OF status ON fiscal_years
        WHEN NEW.status = 'CLOSED' AND OLD.status = 'OPEN'
        BEGIN
          SELECT RAISE(ABORT, 'لا يمكن إقفال السنة قبل إقفال جميع فتراتها.')
          WHERE NOT EXISTS (
            SELECT 1 FROM fiscal_periods fp WHERE fp.fiscal_year_id = OLD.id
          ) OR EXISTS (
            SELECT 1 FROM fiscal_periods fp
            WHERE fp.fiscal_year_id = OLD.id AND fp.status = 'OPEN'
          );

          SELECT RAISE(ABORT, 'لا يمكن إقفال السنة لوجود قيود يومية غير مرحلة.')
          WHERE EXISTS (
            SELECT 1 FROM journal_entries e
            WHERE e.date >= OLD.start_date AND e.date <= OLD.end_date AND e.is_posted = 0
          );
        END;
      `);
    },
};

export const MIGRATION_171_FISCAL_PARTY_SUBLEDGER_HISTORY: Migration = {
    id: '171_fiscal_party_subledger_history',
    description: 'Establish a party-level ledger baseline and preserve dated receivable/payable movements.',
    up: (db: Database) => {
      const currentDate = new Date().toISOString().slice(0, 10);
      const latestLedgerDate = db.exec(`
        SELECT MAX(date) FROM journal_entries WHERE is_posted = 1
      `)[0]?.values[0]?.[0];
      const coverageStartDate = typeof latestLedgerDate === 'string' && latestLedgerDate > currentDate
        ? latestLedgerDate
        : currentDate;
      const capturedAt = new Date().toISOString();
      const cutoffEntryRowId = Number(db.exec('SELECT COALESCE(MAX(rowid), 0) FROM journal_entries')[0]?.values[0]?.[0] || 0);

      db.exec(`
        CREATE TABLE IF NOT EXISTS finance_subledger_coverage (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          coverage_start_date TEXT NOT NULL,
          captured_at TEXT NOT NULL,
          cutoff_entry_rowid INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS finance_subledger_party_baselines (
          company_id TEXT NOT NULL,
          party_type TEXT NOT NULL CHECK(party_type IN ('CUSTOMER', 'SUPPLIER')),
          party_id TEXT NOT NULL,
          balance REAL NOT NULL,
          captured_at TEXT NOT NULL,
          PRIMARY KEY(company_id, party_type, party_id)
        );
        CREATE TABLE IF NOT EXISTS finance_subledger_control_baselines (
          company_id TEXT NOT NULL,
          account_code TEXT NOT NULL CHECK(account_code IN ('1103', '2101')),
          balance REAL NOT NULL,
          captured_at TEXT NOT NULL,
          PRIMARY KEY(company_id, account_code)
        );
        CREATE TABLE IF NOT EXISTS finance_subledger_events (
          id TEXT PRIMARY KEY,
          journal_entry_id TEXT NOT NULL,
          company_id TEXT NOT NULL,
          party_type TEXT NOT NULL CHECK(party_type IN ('CUSTOMER', 'SUPPLIER')),
          party_id TEXT NOT NULL,
          account_code TEXT NOT NULL CHECK(account_code IN ('1103', '2101')),
          amount INTEGER NOT NULL,
          effective_date TEXT NOT NULL,
          reference_type TEXT NOT NULL,
          reference_id TEXT NOT NULL,
          UNIQUE(journal_entry_id, party_type, party_id, account_code),
          FOREIGN KEY(journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_finance_subledger_events_party_date
          ON finance_subledger_events(party_type, party_id, effective_date);
        CREATE TABLE IF NOT EXISTS fiscal_period_subledger_snapshots (
          id TEXT PRIMARY KEY,
          snapshot_batch_id TEXT NOT NULL,
          period_id TEXT NOT NULL,
          company_id TEXT NOT NULL,
          party_type TEXT NOT NULL CHECK(party_type IN ('CUSTOMER', 'SUPPLIER')),
          party_id TEXT NOT NULL,
          control_account_code TEXT NOT NULL CHECK(control_account_code IN ('1103', '2101')),
          balance INTEGER NOT NULL,
          effective_date TEXT NOT NULL,
          captured_at TEXT NOT NULL,
          FOREIGN KEY(period_id) REFERENCES fiscal_periods(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_fiscal_period_subledger_snapshot
          ON fiscal_period_subledger_snapshots(period_id, snapshot_batch_id, party_type);
      `);
      db.run(
        `INSERT OR IGNORE INTO finance_subledger_coverage
          (id, coverage_start_date, captured_at, cutoff_entry_rowid) VALUES (1, ?, ?, ?)`,
        [coverageStartDate, capturedAt, cutoffEntryRowId],
      );
      db.run(`
        INSERT OR IGNORE INTO finance_subledger_party_baselines
          (company_id, party_type, party_id, balance, captured_at)
        SELECT COALESCE(company_id, 'cmp_main'), 'CUSTOMER', id, current_balance, ? FROM customers
      `, [capturedAt]);
      db.run(`
        INSERT OR IGNORE INTO finance_subledger_party_baselines
          (company_id, party_type, party_id, balance, captured_at)
        SELECT COALESCE(company_id, 'cmp_main'), 'SUPPLIER', id, current_balance, ? FROM suppliers
      `, [capturedAt]);
      db.run(`
        INSERT OR IGNORE INTO finance_subledger_control_baselines
          (company_id, account_code, balance, captured_at)
        SELECT c.id, a.code, COALESCE(SUM(
          CASE WHEN e.id IS NULL THEN 0
               WHEN a.code = '1103' THEN l.debit - l.credit
               ELSE l.credit - l.debit END
        ), 0), ?
        FROM companies c
        CROSS JOIN chart_of_accounts a
        LEFT JOIN journal_entry_lines l ON l.account_id = a.id
        LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.is_posted = 1
          AND e.date <= ? AND COALESCE(e.company_id, 'cmp_main') = c.id
        WHERE a.code IN ('1103', '2101')
        GROUP BY c.id, a.code
      `, [capturedAt, coverageStartDate]);
    },
};

export const MIGRATION_172_FISCAL_PARTY_SUBLEDGER_RECONCILIATION: Migration = {
    id: '172_fiscal_party_subledger_reconciliation',
    description: 'Support company-scoped legacy matching and preserve manual reconciliation evidence.',
    up: (db: Database) => {
      const hasColumn = (table: string, column: string): boolean =>
        db.exec(`PRAGMA table_info(${table})`)[0]?.values.some((row) => row[1] === column) || false;

      if (!hasColumn('finance_subledger_party_baselines', 'company_id')) {
        db.exec(`
          CREATE TABLE finance_subledger_party_baselines_company (
            company_id TEXT NOT NULL,
            party_type TEXT NOT NULL CHECK(party_type IN ('CUSTOMER', 'SUPPLIER')),
            party_id TEXT NOT NULL,
            balance REAL NOT NULL,
            captured_at TEXT NOT NULL,
            PRIMARY KEY(company_id, party_type, party_id)
          );
          INSERT OR IGNORE INTO finance_subledger_party_baselines_company
            (company_id, party_type, party_id, balance, captured_at)
          SELECT COALESCE(c.company_id, 'cmp_main'), b.party_type, b.party_id, b.balance, b.captured_at
          FROM finance_subledger_party_baselines b
          LEFT JOIN customers c ON b.party_type = 'CUSTOMER' AND c.id = b.party_id
          WHERE b.party_type = 'CUSTOMER'
          UNION ALL
          SELECT COALESCE(s.company_id, 'cmp_main'), b.party_type, b.party_id, b.balance, b.captured_at
          FROM finance_subledger_party_baselines b
          LEFT JOIN suppliers s ON b.party_type = 'SUPPLIER' AND s.id = b.party_id
          WHERE b.party_type = 'SUPPLIER';
          DROP TABLE finance_subledger_party_baselines;
          ALTER TABLE finance_subledger_party_baselines_company RENAME TO finance_subledger_party_baselines;
        `);
      }

      if (!hasColumn('finance_subledger_control_baselines', 'company_id')) {
        const coverage = db.exec(`
          SELECT coverage_start_date, cutoff_entry_rowid, captured_at
          FROM finance_subledger_coverage WHERE id = 1
        `)[0]?.values[0] || [];
        const coverageStartDate = coverage[0] || new Date().toISOString().slice(0, 10);
        const cutoffEntryRowId = Number(coverage[1] || 0);
        const baselineCapturedAt = coverage[2] || new Date().toISOString();
        db.exec(`
          CREATE TABLE finance_subledger_control_baselines_company (
            company_id TEXT NOT NULL,
            account_code TEXT NOT NULL CHECK(account_code IN ('1103', '2101')),
            balance REAL NOT NULL,
            captured_at TEXT NOT NULL,
            PRIMARY KEY(company_id, account_code)
          );
        `);
        db.run(`
          INSERT OR IGNORE INTO finance_subledger_control_baselines_company
            (company_id, account_code, balance, captured_at)
          SELECT c.id, a.code, COALESCE(SUM(
            CASE WHEN a.code = '1103' THEN l.debit - l.credit ELSE l.credit - l.debit END
          ), 0), ?
          FROM companies c
          CROSS JOIN chart_of_accounts a
          LEFT JOIN journal_entry_lines l ON l.account_id = a.id
          LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.is_posted = 1
            AND e.date <= ? AND e.rowid <= ? AND COALESCE(e.company_id, 'cmp_main') = c.id
          WHERE a.code IN ('1103', '2101')
          GROUP BY c.id, a.code
        `, [baselineCapturedAt, coverageStartDate, cutoffEntryRowId]);
        db.exec(`
          DROP TABLE finance_subledger_control_baselines;
          ALTER TABLE finance_subledger_control_baselines_company RENAME TO finance_subledger_control_baselines;
        `);
      }

      if (!hasColumn('finance_subledger_events', 'company_id')) {
        db.exec(`
          ALTER TABLE finance_subledger_events
          ADD COLUMN company_id TEXT NOT NULL DEFAULT 'cmp_main';
          UPDATE finance_subledger_events
          SET company_id = COALESCE((
            SELECT company_id FROM journal_entries WHERE id = journal_entry_id
          ), 'cmp_main');
        `);
      }
      if (!hasColumn('fiscal_period_subledger_snapshots', 'company_id')) {
        db.exec(`
          ALTER TABLE fiscal_period_subledger_snapshots
          ADD COLUMN company_id TEXT NOT NULL DEFAULT 'cmp_main';
          UPDATE fiscal_period_subledger_snapshots
          SET company_id = COALESCE((
            SELECT fy.company_id FROM fiscal_periods fp
            JOIN fiscal_years fy ON fy.id = fp.fiscal_year_id
            WHERE fp.id = period_id
          ), 'cmp_main');
        `);
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_finance_subledger_events_company_date
          ON finance_subledger_events(company_id, effective_date, account_code);
        CREATE TABLE IF NOT EXISTS finance_subledger_manual_reconciliations (
          id TEXT PRIMARY KEY,
          period_id TEXT NOT NULL,
          company_id TEXT NOT NULL,
          party_type TEXT NOT NULL CHECK(party_type IN ('CUSTOMER', 'SUPPLIER')),
          verified_subledger_balance REAL NOT NULL,
          control_balance REAL NOT NULL,
          evidence_reference TEXT NOT NULL,
          notes TEXT,
          created_by TEXT NOT NULL,
          created_by_name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(period_id) REFERENCES fiscal_periods(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_finance_subledger_manual_reconciliation
          ON finance_subledger_manual_reconciliations(period_id, party_type, created_at DESC);
      `);
    },
};
