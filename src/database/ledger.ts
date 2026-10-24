import type { Database, SqlValue } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';

export interface LedgerPostingLine {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface LedgerPosting {
  date: string;
  description: string;
  referenceType: string;
  referenceId: string;
  createdBy: string;
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
  return Math.round((Number(value) || 0) * 100) / 100;
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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(posting.date) || Number.isNaN(Date.parse(`${posting.date}T00:00:00`))) {
    throw new Error(`Invalid ledger posting date: ${posting.date}`);
  }
  if (!posting.description.trim() || !posting.referenceType || !posting.referenceId || !posting.createdBy) {
    throw new Error('Ledger posting metadata is incomplete.');
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
  const totalDebit = round2(lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round2(lines.reduce((sum, line) => sum + line.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.009) {
    throw new Error(`Unbalanced ledger entry (${totalDebit} debit, ${totalCredit} credit).`);
  }

  db.run('INSERT OR IGNORE INTO sequence_counters (name, value) VALUES (?, 0)', ['JV']);
  const current = queryLedgerRows<{ value: number }>(db, 'SELECT value FROM sequence_counters WHERE name = ?', ['JV'])[0]?.value ?? 0;
  const next = Number(current) + 1;
  db.run('UPDATE sequence_counters SET value = ? WHERE name = ?', [next, 'JV']);
  const entryNumber = `JV-${new Date().getFullYear()}-${String(next).padStart(6, '0')}`;
  const entryId = `jv_${uuidv4().slice(0, 8)}`;

  db.run(
    `INSERT INTO journal_entries (
       id, entry_number, date, description, reference_type, reference_id,
       total_debit, total_credit, is_posted, created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [entryId, entryNumber, posting.date, posting.description.trim(), posting.referenceType,
      posting.referenceId, totalDebit, totalCredit, posting.createdBy]
  );

  for (const line of lines) {
    db.run(
      `INSERT INTO journal_entry_lines (id, entry_id, account_id, debit, credit, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`jvl_${uuidv4().slice(0, 8)}`, entryId, line.accountId, line.debit, line.credit, line.description?.trim() || null]
    );
    db.run('UPDATE chart_of_accounts SET balance = balance + ? WHERE id = ?', [
      line.debit - line.credit,
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
