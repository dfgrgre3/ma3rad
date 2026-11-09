import type { Database } from 'sql.js';
import { postLedgerEntry, queryLedgerRows } from '../repositories/ledger';

export function reclassifyFixedAsset(db: Database, assetId: string, fallbackActor?: string): void {
  if (queryLedgerRows(db, `SELECT id FROM journal_entries WHERE reference_type='ASSET_CLEARING_POLICY' AND reference_id=?`, [assetId]).length) return;
  const acquisition = queryLedgerRows<{ id: string; date: string; created_by: string }>(
    db, `SELECT id,date,created_by FROM journal_entries WHERE reference_type='ASSET_ACQUISITION' AND reference_id=?`, [assetId]
  )[0];
  if (!acquisition) return;
  const equityCredit = Number(queryLedgerRows<{ amount: number }>(db, `
    SELECT COALESCE(SUM(l.credit),0) AS amount FROM journal_entry_lines l
    JOIN chart_of_accounts a ON a.id=l.account_id
    WHERE l.entry_id=? AND a.code='3102'
  `, [acquisition.id])[0]?.amount || 0);
  if (equityCredit <= 0) return;
  const createdBy = acquisition.created_by || fallbackActor;
  if (!createdBy) throw new Error('Cannot reclassify fixed asset acquisition without a valid user.');
  const amount = Math.round(equityCredit * 100) / 100;
  postLedgerEntry(db, {
    date: acquisition.date,
    description: `Reclassify fixed asset acquisition ${assetId} to payable`,
    referenceType: 'ASSET_CLEARING_POLICY',
    referenceId: assetId,
    createdBy,
    lines: [
      { accountCode: '3102', debit: amount, credit: 0 },
      { accountCode: '2201', debit: 0, credit: amount },
    ],
  });
}

export function reclassifyFixedAssets(db: Database, fallbackActor?: string): void {
  const assets = queryLedgerRows<{ id: string }>(db, 'SELECT id FROM fixed_assets ORDER BY id');
  for (const asset of assets) {
    reclassifyFixedAsset(db, asset.id, fallbackActor);
  }
}
