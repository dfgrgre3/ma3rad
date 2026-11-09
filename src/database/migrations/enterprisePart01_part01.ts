import type { Database } from 'sql.js';

export function runEnterprisePart1(db: Database): void {
  // 1. Fiscal Years & Periods
  db.run(`
    CREATE TABLE IF NOT EXISTS fiscal_years (
      id TEXT PRIMARY KEY,
      year_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED', 'LOCKED')),
      closed_at TEXT,
      closed_by TEXT,
      closing_entry_id TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (closed_by) REFERENCES users(id)
    );
  
    CREATE TABLE IF NOT EXISTS fiscal_periods (
      id TEXT PRIMARY KEY,
      fiscal_year_id TEXT NOT NULL,
      period_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED', 'LOCKED')),
      closed_at TEXT,
      closed_by TEXT,
      closing_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(fiscal_year_id, period_number),
      FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id) ON DELETE CASCADE,
      FOREIGN KEY (closed_by) REFERENCES users(id)
    );
  
    CREATE INDEX IF NOT EXISTS idx_fiscal_periods_dates ON fiscal_periods(start_date, end_date, status);
  `);
}
