import type { Database } from 'sql.js';
import { paymentAccountCode, postLedgerEntry, queryLedgerRows } from './ledger';
import { DEFAULT_SETTINGS } from './migrationSettings';
export { DEFAULT_SETTINGS, DEFAULT_BRANCH_ID, EXTENDED_SETTINGS_KEYS } from './migrationSettings';

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

type SalesReturnLedgerRow = {
  id: string; date: string; return_number: string; total_amount: number; refunded_amount: number;
  remaining_to_balance: number; refund_method: string; created_by: string; total_invoice: number;
  invoice_tax: number;
};

function backfillSalesReturnLedgerEntries(db: Database, actorId: string): void {
  const salesReturns = queryLedgerRows<SalesReturnLedgerRow>(
    db,
    `SELECT sr.id, sr.date, sr.return_number, sr.total_amount, sr.refunded_amount,
            sr.remaining_to_balance, sr.refund_method, sr.created_by,
            si.total_amount AS total_invoice, si.tax_amount AS invoice_tax
     FROM sales_returns sr JOIN sales_invoices si ON si.id = sr.original_invoice_id
     ORDER BY sr.date, sr.created_at, sr.id`
  );
  for (const returned of salesReturns) {
    postSalesReturnLedgerEntry(db, returned, actorId);
  }
}

function postSalesReturnLedgerEntry(
  db: Database,
  returned: SalesReturnLedgerRow,
  actorId: string
): void {
  const returnedCost = queryLedgerRows<{ total_cost: number }>(
    db,
    'SELECT COALESCE(SUM(quantity_m2 * unit_cost), 0) AS total_cost FROM sales_return_items WHERE return_id = ?',
    [returned.id]
  )[0]?.total_cost || 0;
  const taxReduction = Number(returned.total_invoice) > 0
    ? Math.round(Number(returned.total_amount) * Number(returned.invoice_tax || 0) / Number(returned.total_invoice) * 100) / 100
    : 0;
  postLedgerEntry(db, {
    date: returned.date,
    description: `Sales return ${returned.return_number}`,
    referenceType: 'SALES_RETURN',
    referenceId: returned.id,
    createdBy: returned.created_by || actorId,
    lines: [
      { accountCode: '4101', debit: Number(returned.total_amount) - taxReduction, credit: 0 },
      ...(taxReduction > 0 ? [{ accountCode: '2102', debit: taxReduction, credit: 0 }] : []),
      ...(Number(returned.remaining_to_balance) > 0 ? [{
        accountCode: '1103',
        debit: 0,
        credit: Number(returned.remaining_to_balance),
      }] : []),
      ...(Number(returned.refunded_amount) > 0 ? [{
        accountCode: paymentAccountCode(returned.refund_method || 'CASH'),
        debit: 0,
        credit: Number(returned.refunded_amount),
      }] : []),
      ...(Number(returnedCost) > 0 ? [
        { accountCode: '1104', debit: Number(returnedCost), credit: 0 },
        { accountCode: '5101', debit: 0, credit: Number(returnedCost) },
      ] : []),
    ],
  });
}

type PurchaseReturnLedgerRow = {
  id: string; date: string; return_number: string; total_amount: number; refunded_amount: number;
  remaining_to_balance: number; created_by: string;
};

function backfillPurchaseReturnLedgerEntries(db: Database, actorId: string): void {
  const purchaseReturns = queryLedgerRows<PurchaseReturnLedgerRow>(
    db,
    'SELECT id, date, return_number, total_amount, refunded_amount, remaining_to_balance, created_by FROM purchase_returns ORDER BY date, created_at, id'
  );
  for (const returned of purchaseReturns) {
    postPurchaseReturnLedgerEntry(db, returned, actorId);
  }
}

function postPurchaseReturnLedgerEntry(
  db: Database,
  returned: PurchaseReturnLedgerRow,
  actorId: string
): void {
  postLedgerEntry(db, {
    date: returned.date,
    description: `Purchase return ${returned.return_number}`,
    referenceType: 'PURCHASE_RETURN',
    referenceId: returned.id,
    createdBy: returned.created_by || actorId,
    lines: [
      ...(Number(returned.refunded_amount) > 0 ? [{
        accountCode: '1101',
        debit: Number(returned.refunded_amount),
        credit: 0,
      }] : []),
      ...(Number(returned.remaining_to_balance) > 0 ? [{
        accountCode: '2101',
        debit: Number(returned.remaining_to_balance),
        credit: 0,
      }] : []),
      { accountCode: '1104', debit: 0, credit: Number(returned.total_amount) },
    ],
  });
}

// ─── Migrations ───────────────────────────────────────────────────────────────

export interface Migration {
  id: string;
  description: string;
  disableForeignKeys?: boolean;
  up: (db: Database) => void;
}
