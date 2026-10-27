import type { Database } from 'sql.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { paymentAccountCode, postLedgerEntry, queryLedgerRows } from '../ledger';
import { localDateString } from '../../utils/date';
import {
  DEFAULT_SETTINGS, DEFAULT_BRANCH_ID, EXTENDED_SETTINGS_KEYS,
  tableExists, columnExists, addColumn, backfillReturnLedgerEntries,
  type Migration,
} from '../migrationSupport';

function reclassifyFixedAsset(db: Database, assetId: string, fallbackActor?: string): void {
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

function reclassifyFixedAssets(db: Database, fallbackActor?: string): void {
  const assets = queryLedgerRows<{ id: string }>(db, 'SELECT id FROM fixed_assets ORDER BY id');
  for (const asset of assets) {
    reclassifyFixedAsset(db, asset.id, fallbackActor);
  }
}

function reclassifyInventoryAdjustment(
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

function reclassifyInventoryAdjustments(db: Database, fallbackActor?: string): void {
  const adjustments = queryLedgerRows<{ id: string; adjustment_type: string }>(
    db, `SELECT id,adjustment_type FROM stock_adjustments WHERE status='POSTED' ORDER BY id`
  );
  for (const adjustment of adjustments) {
    reclassifyInventoryAdjustment(db, adjustment, fallbackActor);
  }
}

export const MIGRATION_PART_09: Migration[] = [
{
    id: '036_apply_accounting_policy_choices',
    description: 'Reclassify historical asset and inventory adjustment entries to the approved clearing and expense accounts',
    up: (db) => {
      const fallbackActor = queryLedgerRows<{ id: string }>(db, 'SELECT id FROM users ORDER BY created_at,id LIMIT 1')[0]?.id;
      reclassifyFixedAssets(db, fallbackActor);
      reclassifyInventoryAdjustments(db, fallbackActor);
    },
  },

{
    id: '037_remove_network_sync',
    description: 'Remove obsolete network synchronization configuration and queues',
    up: (db) => {
      db.exec(`
        DROP TABLE IF EXISTS sync_conflict_logs;
        DROP TABLE IF EXISTS sync_inbox;
        DROP TABLE IF EXISTS sync_outbox;
        DROP TABLE IF EXISTS branch_sync_config;
      `);
    },
  }
];
