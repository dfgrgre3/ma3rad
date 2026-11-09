import type { Database } from 'sql.js';
import { queryLedgerRows } from '../repositories/ledger';
import { backfillPurchaseReturnLedgerEntries, postSalesReturnLedgerEntry } from './support_part02';

export function tableExists(db: Database, table: string): boolean {
  const res = db.exec(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table]
  );
  return (res[0]?.values?.length ?? 0) > 0;
}

export function columnExists(db: Database, table: string, column: string): boolean {
  if (!tableExists(db, table)) return false;
  // PRAGMA does not accept bound parameters, and `table` is always a literal
  // from the MIGRATIONS list below — never user input.
  const res = db.exec(`PRAGMA table_info(${table})`);
  const nameIdx = res[0]?.columns?.indexOf('name') ?? -1;
  if (nameIdx < 0) return false;
  return (res[0]?.values ?? []).some((row) => String(row[nameIdx]) === column);
}

/**
 * Adds a column only if the table exists and the column does not.
 * SQLite's ADD COLUMN cannot carry PRIMARY KEY/UNIQUE, and with foreign keys
 * enabled a REFERENCES column must default to NULL — so `definition` should
 * stay a plain nullable column.
 */
export function addColumn(db: Database, table: string, column: string, definition: string): boolean {
  if (!tableExists(db, table)) return false;
  if (columnExists(db, table, column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

export function backfillReturnLedgerEntries(db: Database): void {
  const actorId = queryLedgerRows<{ id: string }>(db, 'SELECT id FROM users ORDER BY created_at, id LIMIT 1')[0]?.id;
  if (!actorId) return;

  backfillSalesReturnLedgerEntries(db, actorId);
  backfillPurchaseReturnLedgerEntries(db, actorId);
}

export type SalesReturnLedgerRow = {
  id: string; date: string; return_number: string; total_amount: number; refunded_amount: number;
  remaining_to_balance: number; refund_method: string; created_by: string; invoice_subtotal: number;
  invoice_discount: number; invoice_tax: number;
};

export function backfillSalesReturnLedgerEntries(db: Database, actorId: string): void {
  const salesReturns = queryLedgerRows<SalesReturnLedgerRow>(
    db,
    `SELECT sr.id, sr.date, sr.return_number, sr.total_amount, sr.refunded_amount,
            sr.remaining_to_balance, sr.refund_method, sr.created_by,
            si.subtotal AS invoice_subtotal, si.discount_amount AS invoice_discount,
            si.tax_amount AS invoice_tax
     FROM sales_returns sr JOIN sales_invoices si ON si.id = sr.original_invoice_id
     ORDER BY sr.date, sr.created_at, sr.id`
  );
  for (const returned of salesReturns) {
    postSalesReturnLedgerEntry(db, returned, actorId);
  }
}
