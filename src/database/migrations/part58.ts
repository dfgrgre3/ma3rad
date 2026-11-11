import type { Migration } from './support';
import { addColumn } from './support';

export const MIGRATION_PART_58: Migration[] = [
  {
    id: '171_fiscal_close_workflow',
    description:
      'Enterprise fiscal closing workflow: company/branch scoped years and periods, workflow states, close runs, tasks, reconciliations, adjustments, opening balances, approvals, snapshots and audit trail.',
    up: (db) => {
      // ---------------------------------------------------------------
      // Fiscal year / period metadata. Existing status values are kept
      // for backward compatibility; workflow_state carries the richer
      // OPEN → IN_REVIEW → PENDING_APPROVAL → CLOSED → LOCKED cycle.
      // ---------------------------------------------------------------
      addColumn(db, 'fiscal_years', 'company_id', "TEXT NOT NULL DEFAULT 'cmp_main'");
      addColumn(db, 'fiscal_years', 'branch_scope', "TEXT NOT NULL DEFAULT 'ALL'");
      addColumn(db, 'fiscal_years', 'currency', "TEXT NOT NULL DEFAULT 'EGP'");
      addColumn(db, 'fiscal_years', 'year_type', "TEXT NOT NULL DEFAULT 'STANDARD'");
      addColumn(db, 'fiscal_years', 'period_count', 'INTEGER NOT NULL DEFAULT 12');
      addColumn(db, 'fiscal_years', 'previous_year_id', 'TEXT REFERENCES fiscal_years(id)');
      addColumn(db, 'fiscal_years', 'workflow_state', "TEXT NOT NULL DEFAULT 'OPEN'");
      addColumn(db, 'fiscal_years', 'approved_by', 'TEXT REFERENCES users(id)');
      addColumn(db, 'fiscal_years', 'approved_at', 'TEXT');
      addColumn(db, 'fiscal_years', 'locked_by', 'TEXT REFERENCES users(id)');
      addColumn(db, 'fiscal_years', 'locked_at', 'TEXT');
      addColumn(db, 'fiscal_years', 'close_report_json', 'TEXT');

      addColumn(db, 'fiscal_periods', 'company_id', "TEXT NOT NULL DEFAULT 'cmp_main'");
      addColumn(db, 'fiscal_periods', 'branch_id', 'TEXT REFERENCES branches(id)');
      addColumn(db, 'fiscal_periods', 'period_type', "TEXT NOT NULL DEFAULT 'MONTHLY'");
      addColumn(db, 'fiscal_periods', 'workflow_state', "TEXT NOT NULL DEFAULT 'OPEN'");
      addColumn(db, 'fiscal_periods', 'review_started_by', 'TEXT REFERENCES users(id)');
      addColumn(db, 'fiscal_periods', 'review_started_at', 'TEXT');
      addColumn(db, 'fiscal_periods', 'submitted_by', 'TEXT REFERENCES users(id)');
      addColumn(db, 'fiscal_periods', 'submitted_at', 'TEXT');
      addColumn(db, 'fiscal_periods', 'approved_by', 'TEXT REFERENCES users(id)');
      addColumn(db, 'fiscal_periods', 'approved_at', 'TEXT');
      addColumn(db, 'fiscal_periods', 'locked_by', 'TEXT REFERENCES users(id)');
      addColumn(db, 'fiscal_periods', 'locked_at', 'TEXT');
      addColumn(db, 'fiscal_periods', 'close_run_id', 'TEXT');

      db.exec(`
        UPDATE fiscal_years
        SET workflow_state = CASE
          WHEN status = 'LOCKED' THEN 'LOCKED'
          WHEN status = 'CLOSED' THEN 'CLOSED'
          ELSE COALESCE(NULLIF(workflow_state, ''), 'OPEN')
        END;

        UPDATE fiscal_periods
        SET workflow_state = CASE
          WHEN status = 'LOCKED' THEN 'LOCKED'
          WHEN status = 'CLOSED' THEN 'CLOSED'
          ELSE COALESCE(NULLIF(workflow_state, ''), 'OPEN')
        END;

        CREATE INDEX IF NOT EXISTS idx_fiscal_years_company_dates
          ON fiscal_years(company_id, start_date, end_date);
        CREATE INDEX IF NOT EXISTS idx_fiscal_periods_year_workflow
          ON fiscal_periods(fiscal_year_id, workflow_state);
      `);

      // ---------------------------------------------------------------
      // Close runs: one auditable record per close attempt.
      // ---------------------------------------------------------------
      db.exec(`
        CREATE TABLE IF NOT EXISTS period_close_runs (
          id TEXT PRIMARY KEY,
          fiscal_period_id TEXT NOT NULL,
          run_number INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'IN_PROGRESS'
            CHECK(status IN ('IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'APPROVED', 'REOPENED')),
          started_by TEXT NOT NULL,
          started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_by TEXT,
          completed_at TEXT,
          approved_by TEXT,
          approved_at TEXT,
          summary_json TEXT,
          notes TEXT,
          FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE CASCADE,
          FOREIGN KEY (started_by) REFERENCES users(id),
          FOREIGN KEY (completed_by) REFERENCES users(id),
          FOREIGN KEY (approved_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_period_close_runs_period
          ON period_close_runs(fiscal_period_id, started_at DESC);
      `);

      // ---------------------------------------------------------------
      // Period close tasks (real workflow tasks, not checkboxes).
      // ---------------------------------------------------------------
      db.exec(`
        CREATE TABLE IF NOT EXISTS period_close_tasks (
          id TEXT PRIMARY KEY,
          fiscal_period_id TEXT NOT NULL,
          close_run_id TEXT,
          title TEXT NOT NULL,
          description TEXT,
          department TEXT,
          category TEXT NOT NULL DEFAULT 'GENERAL',
          assignee_user_id TEXT,
          due_date TEXT,
          priority TEXT NOT NULL DEFAULT 'MEDIUM'
            CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
          status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK(status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REVIEWED', 'APPROVED', 'CANCELLED')),
          notes TEXT,
          completed_at TEXT,
          completed_by TEXT,
          reviewed_at TEXT,
          reviewed_by TEXT,
          approved_at TEXT,
          approved_by TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE CASCADE,
          FOREIGN KEY (close_run_id) REFERENCES period_close_runs(id) ON DELETE SET NULL,
          FOREIGN KEY (assignee_user_id) REFERENCES users(id),
          FOREIGN KEY (completed_by) REFERENCES users(id),
          FOREIGN KEY (reviewed_by) REFERENCES users(id),
          FOREIGN KEY (approved_by) REFERENCES users(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_period_close_tasks_period
          ON period_close_tasks(fiscal_period_id, status);
        CREATE INDEX IF NOT EXISTS idx_period_close_tasks_assignee
          ON period_close_tasks(assignee_user_id, status, due_date);

        CREATE TABLE IF NOT EXISTS period_close_task_attachments (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          file_name TEXT NOT NULL,
          mime_type TEXT,
          file_size INTEGER NOT NULL DEFAULT 0,
          storage_name TEXT,
          notes TEXT,
          uploaded_by TEXT NOT NULL,
          uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (task_id) REFERENCES period_close_tasks(id) ON DELETE CASCADE,
          FOREIGN KEY (uploaded_by) REFERENCES users(id)
        );
      `);

      // ---------------------------------------------------------------
      // Reconciliation results, adjustments, approvals, snapshots.
      // ---------------------------------------------------------------
      db.exec(`
        CREATE TABLE IF NOT EXISTS period_reconciliations (
          id TEXT PRIMARY KEY,
          fiscal_period_id TEXT NOT NULL,
          close_run_id TEXT,
          area TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK(status IN ('PASS', 'WARNING', 'FAIL', 'NOT_APPLICABLE')),
          issue_count INTEGER NOT NULL DEFAULT 0,
          details_json TEXT,
          checked_by TEXT,
          checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE CASCADE,
          FOREIGN KEY (close_run_id) REFERENCES period_close_runs(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_period_reconciliations_period
          ON period_reconciliations(fiscal_period_id, area);

        CREATE TABLE IF NOT EXISTS period_adjustments (
          id TEXT PRIMARY KEY,
          fiscal_period_id TEXT NOT NULL,
          adjustment_type TEXT NOT NULL
            CHECK(adjustment_type IN (
              'ACCRUED_EXPENSE', 'PREPAID_EXPENSE', 'ACCRUED_REVENUE', 'DEFERRED_REVENUE',
              'DEPRECIATION', 'BAD_DEBT_PROVISION', 'INVENTORY_VARIANCE', 'COGS_ADJUSTMENT',
              'CASH_VARIANCE', 'BANK_VARIANCE', 'PAYROLL_ACCRUAL', 'OTHER'
            )),
          description TEXT NOT NULL,
          amount REAL NOT NULL CHECK(amount > 0),
          debit_account_code TEXT NOT NULL,
          credit_account_code TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'DRAFT'
            CHECK(status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED')),
          journal_entry_id TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          submitted_by TEXT,
          submitted_at TEXT,
          approved_by TEXT,
          approved_at TEXT,
          posted_by TEXT,
          posted_at TEXT,
          rejection_reason TEXT,
          FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE CASCADE,
          FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
          FOREIGN KEY (created_by) REFERENCES users(id),
          FOREIGN KEY (approved_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_period_adjustments_period
          ON period_adjustments(fiscal_period_id, status);

        CREATE TABLE IF NOT EXISTS period_close_reports (
          id TEXT PRIMARY KEY,
          fiscal_period_id TEXT NOT NULL,
          report_type TEXT NOT NULL DEFAULT 'MONTHLY_CLOSE',
          payload_json TEXT NOT NULL,
          content_hash TEXT,
          approved_by TEXT,
          approved_at TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_period_close_reports_period
          ON period_close_reports(fiscal_period_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS fiscal_year_openings (
          id TEXT PRIMARY KEY,
          fiscal_year_id TEXT NOT NULL,
          source_year_id TEXT,
          company_id TEXT NOT NULL DEFAULT 'cmp_main',
          branch_id TEXT,
          account_code TEXT NOT NULL,
          account_name TEXT,
          account_type TEXT NOT NULL,
          debit REAL NOT NULL DEFAULT 0,
          credit REAL NOT NULL DEFAULT 0,
          balance REAL NOT NULL DEFAULT 0,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id) ON DELETE CASCADE,
          FOREIGN KEY (source_year_id) REFERENCES fiscal_years(id)
        );
        CREATE INDEX IF NOT EXISTS idx_fiscal_year_openings_year
          ON fiscal_year_openings(fiscal_year_id, account_code);

        CREATE TABLE IF NOT EXISTS fiscal_close_approvals (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('PERIOD', 'YEAR', 'ADJUSTMENT', 'TASK')),
          entity_id TEXT NOT NULL,
          stage TEXT NOT NULL,
          decision TEXT NOT NULL CHECK(decision IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'REOPENED', 'LOCKED')),
          actor_id TEXT NOT NULL,
          actor_name TEXT NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (actor_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_fiscal_close_approvals_entity
          ON fiscal_close_approvals(entity_type, entity_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS fiscal_close_audit (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('PERIOD', 'YEAR', 'ADJUSTMENT', 'TASK')),
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL,
          previous_state TEXT,
          new_state TEXT,
          reason TEXT,
          actor_id TEXT NOT NULL,
          actor_name TEXT NOT NULL,
          approved_by TEXT,
          journal_entry_id TEXT,
          attachments_json TEXT,
          metadata_json TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (actor_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_fiscal_close_audit_entity
          ON fiscal_close_audit(entity_type, entity_id, created_at DESC);
      `);
    },
  },
];
