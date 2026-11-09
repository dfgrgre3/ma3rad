import { queryLedgerRows } from '../repositories/ledger';
import { type Migration } from './support';
import { reclassifyFixedAssets } from './part09_part01';
import { reclassifyInventoryAdjustments } from './part09_part02';

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
