import type { Database } from 'sql.js';
import { addColumn } from './support';

export function runEnterprisePart4(db: Database): void {
  // 4. Cost Centers & Budgets
  db.run(`
    CREATE TABLE IF NOT EXISTS cost_centers (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      branch_id TEXT,
      manager_id TEXT,
      is_active INTEGER DEFAULT 1,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
  
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      budget_code TEXT UNIQUE NOT NULL,
      fiscal_year_id TEXT NOT NULL,
      cost_center_id TEXT,
      name TEXT NOT NULL,
      total_allocated REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'APPROVED', 'REVISED', 'CLOSED')),
      approved_by TEXT,
      approved_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id),
      FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    );
  
    CREATE TABLE IF NOT EXISTS budget_items (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      allocated_amount REAL NOT NULL DEFAULT 0,
      notes TEXT,
      FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
    );
  `);
  
  // Add cost_center_id to journal_entry_lines, expenses, sales_invoices, purchase_invoices
  addColumn(db, 'journal_entry_lines', 'cost_center_id', 'TEXT');
  addColumn(db, 'expenses', 'cost_center_id', 'TEXT');
  addColumn(db, 'sales_invoices', 'cost_center_id', 'TEXT');
  addColumn(db, 'purchase_invoices', 'cost_center_id', 'TEXT');
}

export function runEnterprisePart5(db: Database): void {
  // 5. Cash Flow Forecasting
  db.run(`
    CREATE TABLE IF NOT EXISTS cash_forecast_items (
      id TEXT PRIMARY KEY,
      forecast_date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('INFLOW', 'OUTFLOW')),
      source_type TEXT NOT NULL,
      source_id TEXT,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      probability REAL DEFAULT 1.0,
      status TEXT DEFAULT 'PROJECTED' CHECK(status IN ('PROJECTED', 'REALIZED', 'CANCELLED')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cash_forecast_date ON cash_forecast_items(forecast_date, type);
  `);
}
