import type { Migration } from '../migrationSupport';

export const MIGRATION_PART_17: Migration[] = [
  {
    id: '125_financial_calendar_events',
    description: 'Add branch-scoped financial calendar events, payments, attachments, and audit history.',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS financial_calendar_events (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          title TEXT NOT NULL,
          event_type TEXT NOT NULL CHECK(event_type IN (
            'INCOME', 'EXPENSE', 'CUSTOMER_INVOICE', 'SUPPLIER_INVOICE',
            'PAYROLL', 'INSTALLMENT', 'TAX', 'CHEQUE', 'SUBSCRIPTION'
          )),
          amount REAL NOT NULL CHECK(amount > 0),
          paid_amount REAL NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
          currency TEXT NOT NULL DEFAULT 'EGP',
          due_date TEXT NOT NULL,
          reminder_at TEXT,
          reminder_days TEXT NOT NULL DEFAULT '[]',
          party_type TEXT CHECK(party_type IN ('CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OTHER')),
          party_id TEXT,
          party_name TEXT,
          financial_account TEXT,
          reference TEXT,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'SCHEDULED'
            CHECK(status IN ('SCHEDULED', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_COLLECTED', 'COLLECTED', 'CANCELLED')),
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS financial_calendar_payments (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL,
          company_id TEXT NOT NULL,
          amount REAL NOT NULL CHECK(amount > 0),
          payment_date TEXT NOT NULL,
          reference TEXT,
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (event_id) REFERENCES financial_calendar_events(id) ON DELETE RESTRICT,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_calendar_payment_reference
          ON financial_calendar_payments(company_id, reference)
          WHERE reference IS NOT NULL AND TRIM(reference) <> '';
        CREATE INDEX IF NOT EXISTS idx_fin_calendar_events_branch_due
          ON financial_calendar_events(branch_id, due_date, status);
        CREATE INDEX IF NOT EXISTS idx_fin_calendar_events_company_due
          ON financial_calendar_events(company_id, due_date, status);
        CREATE INDEX IF NOT EXISTS idx_fin_calendar_payments_event_date
          ON financial_calendar_payments(event_id, payment_date, created_at);

        CREATE TABLE IF NOT EXISTS financial_calendar_attachments (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL,
          file_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          data_url TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (event_id) REFERENCES financial_calendar_events(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS financial_calendar_audit (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL,
          action TEXT NOT NULL,
          details TEXT,
          performed_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (event_id) REFERENCES financial_calendar_events(id) ON DELETE RESTRICT,
          FOREIGN KEY (performed_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_fin_calendar_audit_event
          ON financial_calendar_audit(event_id, created_at);
      `);
    },
  },
];
