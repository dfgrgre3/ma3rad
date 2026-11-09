import type { Database } from 'sql.js';
import { postLedgerEntry, queryLedgerRows } from '../repositories/ledger';

export function reclassifyInventoryAdjustment(
  db: Database,
  adjustment: { id: string; adjustment_type: string },
  fallbackActor?: string
): void {
  if (adjustment.adjustment_type === 'OPENING_BALANCE') return;
  if (queryLedgerRows(db, `SELECT id FROM journal_entries WHERE reference_type='INVENTORY_ADJUSTMENT_POLICY' AND reference_id=?`, [adjustment.id]).length) return;
  const entry = queryLedgerRows<{ id: string; date: string; created_by: string }>(
    db, `SELECT id,date,created_by FROM journal_entries WHERE reference_type='INVENTORY_ADJUSTMENT' AND reference_id=?`, [adjustment.id]
  )[0];
  if (!entry) return;
  const gain = Number(queryLedgerRows<{ amount: number }>(db, `
    SELECT COALESCE(SUM(l.credit),0) AS amount FROM journal_entry_lines l
    JOIN chart_of_accounts a ON a.id=l.account_id
    WHERE l.entry_id=? AND a.code='4190'
  `, [entry.id])[0]?.amount || 0);
  const loss = Number(queryLedgerRows<{ amount: number }>(db, `
    SELECT COALESCE(SUM(l.debit),0) AS amount FROM journal_entry_lines l
    JOIN chart_of_accounts a ON a.id=l.account_id
    WHERE l.entry_id=? AND a.code='5290'
  `, [entry.id])[0]?.amount || 0);
  const amount = Math.round((gain || loss) * 100) / 100;
  if (amount <= 0) return;
  const createdBy = entry.created_by || fallbackActor;
  if (!createdBy) throw new Error('Cannot reclassify inventory adjustments without a valid user.');
  const lines = gain > 0
    ? [
      { accountCode: '4190', debit: amount, credit: 0 },
      { accountCode: '1104', debit: amount, credit: 0 },
      { accountCode: '1104', debit: 0, credit: amount },
      { accountCode: '5201', debit: 0, credit: amount },
    ]
    : [
      { accountCode: '1104', debit: amount, credit: 0 },
      { accountCode: '5290', debit: 0, credit: amount },
      { accountCode: '5201', debit: amount, credit: 0 },
      { accountCode: '1104', debit: 0, credit: amount },
    ];
  postLedgerEntry(db, {
    date: entry.date,
    description: `Reclassify inventory adjustment ${adjustment.id}`,
    referenceType: 'INVENTORY_ADJUSTMENT_POLICY',
    referenceId: adjustment.id,
    createdBy,
    lines,
  });
}

export function reclassifyInventoryAdjustments(db: Database, fallbackActor?: string): void {
  const adjustments = queryLedgerRows<{ id: string; adjustment_type: string }>(
    db, `SELECT id,adjustment_type FROM stock_adjustments WHERE status='POSTED' ORDER BY id`
  );
  for (const adjustment of adjustments) {
    reclassifyInventoryAdjustment(db, adjustment, fallbackActor);
  }
}
