import type { Database, SqlValue } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';

export interface LedgerPostingLine {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
  costCenterId?: string;
}

export interface LedgerPosting {
  date: string;
  description: string;
  referenceType: string;
  referenceId: string;
  createdBy: string;
  branchId?: string | null;
  lines: LedgerPostingLine[];
}

export function queryLedgerRows<T extends Record<string, unknown>>(
  db: Database,
  sql: string,
  params: SqlValue[] = []
): T[] {
  const result = db.exec(sql, params)[0];
  if (!result) return [];
  return result.values.map((values) => {
    const row: Record<string, unknown> = {};
    result.columns.forEach((column, index) => { row[column] = values[index]; });
    return row as T;
  });
}

function round2(value: number): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON * Math.sign(amount)) * 100) / 100;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function resolvePostingBranchId(db: Database, posting: LedgerPosting): string | null {
  if (posting.branchId) return posting.branchId;

  const referenceId = posting.referenceId.split(':', 1)[0];
  const sourceByType: Record<string, string> = {
    SALES_INVOICE: 'sales_invoices',
    SALES_VOID: 'sales_invoices',
    PURCHASE_INVOICE: 'purchase_invoices',
    PURCHASE_VOID: 'purchase_invoices',
    EXPENSE: 'expenses',
    EXPENSE_EDIT: 'expenses',
    CUSTOMER_PAYMENT: 'customer_payments',
    CUSTOMER_PAYMENT_VOID: 'customer_payments',
    SUPPLIER_PAYMENT: 'supplier_payments',
    SUPPLIER_PAYMENT_VOID: 'supplier_payments',
    SALES_RETURN: 'sales_returns',
    PURCHASE_RETURN: 'purchase_returns',
    PAYROLL_TRANSACTION: 'payroll_transactions',
    PAYROLL_REVERSAL: 'payroll_transactions',
    COMMISSION_APPROVAL: 'commissions',
    COMMISSION_PAYMENT: 'commissions',
    COMMISSION_CANCELLATION: 'commissions',
  };
  const sourceTable = sourceByType[posting.referenceType];
  if (posting.referenceType === 'PAYROLL_SALARY_ACCRUAL' || posting.referenceType === 'PAYROLL_ADVANCE_APPLICATION') {
    return queryLedgerRows<{ branch_id: string | null }>(
      db,
      'SELECT branch_id FROM employees WHERE id = ?',
      [referenceId]
    )[0]?.branch_id ?? null;
  }
  if (sourceTable === 'sales_returns') {
    return queryLedgerRows<{ branch_id: string | null }>(db, `
      SELECT si.branch_id
      FROM sales_returns sr JOIN sales_invoices si ON si.id = sr.original_invoice_id
      WHERE sr.id = ?
    `, [referenceId])[0]?.branch_id ?? null;
  }
  if (sourceTable === 'purchase_returns') {
    return queryLedgerRows<{ branch_id: string | null }>(db, `
      SELECT pi.branch_id
      FROM purchase_returns pr JOIN purchase_invoices pi ON pi.id = pr.original_purchase_id
      WHERE pr.id = ?
    `, [referenceId])[0]?.branch_id ?? null;
  }
  if (sourceTable) {
    return queryLedgerRows<{ branch_id: string | null }>(
      db,
      `SELECT branch_id FROM ${sourceTable} WHERE id = ?`,
      [referenceId]
    )[0]?.branch_id ?? null;
  }
  if (posting.referenceType === 'CUSTOMER_PAYMENT_GROUP' || posting.referenceType === 'CUSTOMER_PAYMENT_GROUP_VOID') {
    return queryLedgerRows<{ branch_id: string | null }>(db, `
      SELECT branch_id FROM customer_payments
      WHERE payment_group_id = ? ORDER BY date, id LIMIT 1
    `, [referenceId])[0]?.branch_id ?? null;
  }
  if (posting.referenceType.startsWith('INVENTORY_') || posting.referenceType === 'TRANSFER_LOSS') {
    return queryLedgerRows<{ branch_id: string | null }>(db, `
      SELECT COALESCE(w.branch_id, (
        SELECT bw.branch_id FROM branch_warehouses bw
        WHERE bw.warehouse_id = t.warehouse_id
        ORDER BY bw.is_primary DESC, bw.branch_id LIMIT 1
      )) AS branch_id
      FROM inventory_transactions t
      LEFT JOIN warehouses w ON w.id = t.warehouse_id
      WHERE t.id = ?
    `, [referenceId])[0]?.branch_id ?? null;
  }
  const priorBranch = queryLedgerRows<{ branch_id: string | null }>(db, `
    SELECT branch_id FROM journal_entries
    WHERE reference_id = ? AND branch_id IS NOT NULL
    ORDER BY created_at DESC LIMIT 1
  `, [referenceId])[0]?.branch_id;
  return priorBranch ?? null;
}

export function paymentAccountCode(paymentType: string): string {
  switch (paymentType) {
    case 'CASH': return '1101';
    case 'CARD':
    case 'BANK_TRANSFER': return '1102';
    case 'CHEQUE': return '1105';
    case 'MIXED': return '1106';
    default: throw new Error(`Unsupported ledger payment type: ${paymentType}`);
  }
}

export function postLedgerEntry(db: Database, posting: LedgerPosting): string {
  const prior = queryLedgerRows<{ id: string }>(
    db,
    'SELECT id FROM journal_entries WHERE reference_type = ? AND reference_id = ? LIMIT 1',
    [posting.referenceType, posting.referenceId]
  )[0];
  if (prior) return prior.id;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(posting.date) || Number.isNaN(Date.parse(`${posting.date}T00:00:00Z`)) ||
      new Date(`${posting.date}T00:00:00Z`).toISOString().slice(0, 10) !== posting.date) {
    throw new Error(`Invalid ledger posting date: ${posting.date}`);
  }
  if (!posting.description.trim() || !posting.referenceType || !posting.referenceId || !posting.createdBy) {
    throw new Error('Ledger posting metadata is incomplete.');
  }

  // Enforce fiscal period closing: prevent postings to locked/closed financial periods
  const closedPeriodRow = queryLedgerRows<{ value: string }>(
    db,
    "SELECT value FROM system_settings WHERE key = 'accounting_closed_until_date'"
  )[0];
  if (closedPeriodRow?.value && posting.date <= closedPeriodRow.value) {
    throw new Error(`لا يمكن الترحيل في فترة محاسبية مغلقة (الفترة مغلقة حتى تاريخ: ${closedPeriodRow.value}).`);
  }

  // Enforce period lock from fiscal_periods table if present
  const closedFiscalPeriod = queryLedgerRows<{ name: string; status: string }>(
    db,
    "SELECT name, status FROM fiscal_periods WHERE ? >= start_date AND ? <= end_date AND status IN ('CLOSED', 'LOCKED') LIMIT 1",
    [posting.date, posting.date]
  )[0];
  if (closedFiscalPeriod) {
    throw new Error(`لا يمكن الترحيل في فترة محاسبية مقفلة: ${closedFiscalPeriod.name} (${closedFiscalPeriod.status}).`);
  }

  const lines = posting.lines.map((line) => {
    const debit = Number(line.debit);
    const credit = Number(line.credit);
    if (!Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0) {
      throw new Error('Ledger amounts must be finite and non-negative.');
    }
    const roundedDebit = round2(debit);
    const roundedCredit = round2(credit);
    if ((roundedDebit > 0) === (roundedCredit > 0)) {
      throw new Error('Each ledger line must contain either a debit or a credit.');
    }
    const account = queryLedgerRows<{ id: string; is_active: number }>(
      db,
      'SELECT id, is_active FROM chart_of_accounts WHERE code = ?',
      [line.accountCode]
    )[0];
    if (!account || account.is_active !== 1) {
      throw new Error(`Ledger account ${line.accountCode} is missing or inactive.`);
    }
    return { ...line, accountId: account.id, debit: roundedDebit, credit: roundedCredit };
  }).filter((line) => line.debit > 0 || line.credit > 0);

  if (lines.length < 2) throw new Error('A ledger entry requires at least two non-zero lines.');
  const totalDebitCents = lines.reduce((sum, line) => sum + cents(line.debit), 0);
  const totalCreditCents = lines.reduce((sum, line) => sum + cents(line.credit), 0);
  const totalDebit = totalDebitCents / 100;
  const totalCredit = totalCreditCents / 100;
  if (totalDebitCents !== totalCreditCents) {
    throw new Error(`Unbalanced ledger entry (${totalDebit} debit, ${totalCredit} credit).`);
  }

  db.run('INSERT OR IGNORE INTO sequence_counters (name, value) VALUES (?, 0)', ['JV']);
  const current = queryLedgerRows<{ value: number }>(db, 'SELECT value FROM sequence_counters WHERE name = ?', ['JV'])[0]?.value ?? 0;
  const next = Number(current) + 1;
  db.run('UPDATE sequence_counters SET value = ? WHERE name = ?', [next, 'JV']);
  const entryNumber = `JV-${new Date().getFullYear()}-${String(next).padStart(6, '0')}`;
  const entryId = `jv_${uuidv4().slice(0, 8)}`;
  const branchId = resolvePostingBranchId(db, posting);

  db.run(
    `INSERT INTO journal_entries (
       id, entry_number, date, description, reference_type, reference_id,
       total_debit, total_credit, is_posted, created_by, branch_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [entryId, entryNumber, posting.date, posting.description.trim(), posting.referenceType,
      posting.referenceId, totalDebit, totalCredit, posting.createdBy, branchId]
  );

  for (const line of lines) {
    db.run(
      `INSERT INTO journal_entry_lines (id, entry_id, account_id, debit, credit, description, cost_center_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`jvl_${uuidv4().slice(0, 8)}`, entryId, line.accountId, line.debit, line.credit, line.description?.trim() || null, line.costCenterId || null]
    );
    db.run('UPDATE chart_of_accounts SET balance = balance + ? WHERE id = ?', [
      round2(line.debit - line.credit),
      line.accountId,
    ]);
  }

  return entryId;
}

/** Post an auditable, balanced reversal of an existing journal entry. */
export function reverseLedgerEntry(
  db: Database,
  entryId: string,
  posting: Omit<LedgerPosting, 'lines'> & { referenceType: string; referenceId: string }
): string | null {
  const original = queryLedgerRows<{ id: string }>(db,
    'SELECT id FROM journal_entries WHERE id = ? AND is_posted = 1', [entryId])[0];
  if (!original) return null;
  const originalLines = queryLedgerRows<{ code: string; debit: number; credit: number; description: string | null }>(db, `
    SELECT coa.code, jel.debit, jel.credit, jel.description
    FROM journal_entry_lines jel
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE jel.entry_id = ? ORDER BY jel.id
  `, [entryId]);
  if (originalLines.length < 2) throw new Error(`Cannot reverse incomplete journal entry ${entryId}.`);
  return postLedgerEntry(db, {
    ...posting,
    lines: originalLines.map((line) => ({
      accountCode: line.code,
      debit: Number(line.credit),
      credit: Number(line.debit),
      description: line.description || undefined,
    })),
  });
}
