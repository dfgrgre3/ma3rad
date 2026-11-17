import type { Migration } from './support';

export const MIGRATION_PART_122: Migration = {
  id: '207_reconciliation_runs',
  description: 'Track scheduled consistency audit runs and their discrepancies',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS reconciliation_runs (
        id TEXT PRIMARY KEY,
        run_type TEXT NOT NULL CHECK(run_type IN (
          'STOCK_VS_TRANSACTIONS', 'STOCK_VS_BATCHES', 'GL_VS_JOURNAL',
          'JOURNAL_BALANCE_INTEGRITY', 'INVENTORY_VS_GL', 'FULL'
        )),
        scope TEXT NOT NULL DEFAULT 'ALL',
        branch_id TEXT,
        warehouse_id TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL DEFAULT 'RUNNING'
          CHECK(status IN ('RUNNING', 'PASSED', 'DISCREPANCY', 'FAILED')),
        summary_json TEXT NOT NULL DEFAULT '{}',
        discrepancies_json TEXT NOT NULL DEFAULT '[]',
        triggered_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_type_date
        ON reconciliation_runs(run_type, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_branch
        ON reconciliation_runs(branch_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_status
        ON reconciliation_runs(status, created_at DESC);
    `);
  },
};
