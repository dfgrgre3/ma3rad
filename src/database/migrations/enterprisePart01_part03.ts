import type { Database } from 'sql.js';
import { addColumn } from './support';

export function runEnterprisePart3(db: Database): void {
  // 3. Cheque status history & enhancements
  db.run(`
    CREATE TABLE IF NOT EXISTS cheque_status_history (
      id TEXT PRIMARY KEY,
      cheque_id TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      changed_by TEXT NOT NULL,
      journal_entry_id TEXT,
      notes TEXT,
      FOREIGN KEY (cheque_id) REFERENCES cheques(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by) REFERENCES users(id)
    );
  `);
  
  // Add columns to cheques if missing
  addColumn(db, 'cheques', 'bank_account_id', 'TEXT');
  addColumn(db, 'cheques', 'deposited_at', 'TEXT');
  addColumn(db, 'cheques', 'cleared_at', 'TEXT');
  addColumn(db, 'cheques', 'bounced_at', 'TEXT');
  addColumn(db, 'cheques', 'bounce_reason', 'TEXT');
  addColumn(db, 'cheques', 'bounce_fee', 'REAL DEFAULT 0');
  addColumn(db, 'cheques', 'journal_entry_id', 'TEXT');
  addColumn(db, 'cheques', 'clearing_entry_id', 'TEXT');
  addColumn(db, 'cheques', 'bounce_entry_id', 'TEXT');
}
