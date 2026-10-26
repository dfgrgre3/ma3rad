import type { Database } from 'sql.js';
import { SCHEMA_SQL } from './schema';
import type { Migration } from './migrationSupport';
import { MIGRATION_PART_01 } from './migrations/part01';
import { MIGRATION_PART_02 } from './migrations/part02';
import { MIGRATION_PART_03 } from './migrations/part03';
import { MIGRATION_PART_04 } from './migrations/part04';
import { MIGRATION_PART_05 } from './migrations/part05';
import { MIGRATION_PART_06 } from './migrations/part06';
import { MIGRATION_PART_07 } from './migrations/part07';
import { MIGRATION_PART_08 } from './migrations/part08';
import { MIGRATION_PART_09 } from './migrations/part09';
import { MIGRATION_PART_10 } from './migrations/part10';
import { MIGRATION_PART_11 } from './migrations/part11';
import { MIGRATION_PART_12 } from './migrations/part12';
import { MIGRATION_PART_13 } from './migrations/part13';
import { MIGRATION_ENTERPRISE } from './migrations/enterprise';
import { addColumn, columnExists } from './migrationSupport';

export { DEFAULT_SETTINGS, DEFAULT_BRANCH_ID } from './migrationSupport';
export type { Migration } from './migrationSupport';

export const MIGRATIONS: Migration[] = [
  MIGRATION_PART_01,
  MIGRATION_PART_02,
  MIGRATION_PART_03,
  MIGRATION_PART_04,
  MIGRATION_PART_05,
  MIGRATION_PART_06,
  MIGRATION_PART_07,
  MIGRATION_PART_08,
  MIGRATION_PART_09,
  MIGRATION_PART_10,
  MIGRATION_PART_11,
  MIGRATION_PART_12,
  MIGRATION_PART_13,
  MIGRATION_ENTERPRISE,
  {
    id: '050_cash_shift_auto_close',
    description: 'Track automatically closed cashier shifts',
    up: (db: Database) => {
      addColumn(db, 'cash_shifts', 'auto_closed', 'INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    id: '051_cheques_represented_status',
    description: 'Allow re-presented cheques in the cheque status lifecycle',
    disableForeignKeys: true,
    up: (db: Database) => {
      const columns = [
        'id', 'cheque_number', 'type', 'party_type', 'party_id', 'party_name', 'bank_name',
        'amount', 'due_date', 'status', 'notes', 'created_by', 'created_at', 'updated_at',
        'bank_account_id', 'deposited_at', 'cleared_at', 'bounced_at', 'bounce_reason',
        'bounce_fee', 'journal_entry_id', 'clearing_entry_id', 'bounce_entry_id',
      ].filter((column) => columnExists(db, 'cheques', column));
      db.exec(`
        CREATE TABLE cheques_status_update (
          id TEXT PRIMARY KEY,
          cheque_number TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(type IN ('RECEIVED', 'ISSUED')),
          party_type TEXT NOT NULL DEFAULT 'OTHER' CHECK(party_type IN ('CUSTOMER', 'SUPPLIER', 'OTHER')),
          party_id TEXT,
          party_name TEXT NOT NULL,
          bank_name TEXT,
          amount REAL NOT NULL DEFAULT 0,
          due_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK(status IN ('PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'CANCELLED', 'RE_PRESENTED')),
          notes TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          bank_account_id TEXT,
          deposited_at TEXT,
          cleared_at TEXT,
          bounced_at TEXT,
          bounce_reason TEXT,
          bounce_fee REAL DEFAULT 0,
          journal_entry_id TEXT,
          clearing_entry_id TEXT,
          bounce_entry_id TEXT
        )
      `);
      db.exec(`INSERT INTO cheques_status_update (${columns.join(', ')})
        SELECT ${columns.join(', ')} FROM cheques`);
      db.exec('DROP TABLE cheques');
      db.exec('ALTER TABLE cheques_status_update RENAME TO cheques');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cheques_due ON cheques(due_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cheques_status ON cheques(status, type)');
    },
  },
  {
    id: '052_purchase_invoice_due_dates',
    description: 'Track supplier invoice due dates for cash flow forecasts',
    up: (db: Database) => {
      addColumn(db, 'purchase_invoices', 'due_date', 'TEXT');
      db.run(`
        UPDATE purchase_invoices
        SET due_date = date(date, '+' || COALESCE(
          (SELECT payment_terms_days FROM suppliers WHERE suppliers.id = purchase_invoices.supplier_id), 0
        ) || ' days')
        WHERE due_date IS NULL
      `);
    },
  },
  {
    id: '053_sales_batch_return_traceability',
    description: 'Track batch consumption per sale line and batch restoration per return line',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sales_invoice_batch_allocations (
          id TEXT PRIMARY KEY,
          invoice_item_id TEXT NOT NULL,
          batch_id TEXT NOT NULL,
          quantity_m2 REAL NOT NULL CHECK(quantity_m2 > 0),
          returned_m2 REAL NOT NULL DEFAULT 0 CHECK(returned_m2 >= 0),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (invoice_item_id) REFERENCES sales_invoice_items(id) ON DELETE CASCADE,
          FOREIGN KEY (batch_id) REFERENCES product_batches(id)
        );
        CREATE INDEX IF NOT EXISTS idx_sale_batch_alloc_item ON sales_invoice_batch_allocations(invoice_item_id);
        CREATE TABLE IF NOT EXISTS sales_return_batch_allocations (
          id TEXT PRIMARY KEY,
          return_item_id TEXT NOT NULL,
          sale_allocation_id TEXT,
          batch_id TEXT NOT NULL,
          quantity_m2 REAL NOT NULL CHECK(quantity_m2 > 0),
          is_pending INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (return_item_id) REFERENCES sales_return_items(id) ON DELETE CASCADE,
          FOREIGN KEY (sale_allocation_id) REFERENCES sales_invoice_batch_allocations(id),
          FOREIGN KEY (batch_id) REFERENCES product_batches(id)
        );
        CREATE INDEX IF NOT EXISTS idx_return_batch_alloc_item ON sales_return_batch_allocations(return_item_id);
      `);
    },
  },
  {
    id: '054_sales_financial_reconciliations',
    description: 'Store reviewed sales financial reconciliation snapshots',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sales_financial_reconciliations (
          id TEXT PRIMARY KEY,
          date_from TEXT NOT NULL,
          date_to TEXT NOT NULL,
          checks_json TEXT NOT NULL,
          notes TEXT NOT NULL,
          closed_by TEXT NOT NULL,
          closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sales_financial_reconciliations_period
          ON sales_financial_reconciliations(date_from, date_to, closed_at);
      `);
    },
  },
].flat();

export interface MigrationReport {
  applied: string[];
  skipped: string[];
  failed: Array<{ id: string; error: string }>;
}

function appliedIds(db: Database): Set<string> {
  const res = db.exec('SELECT id FROM schema_migrations');
  return new Set((res[0]?.values ?? []).map((row) => String(row[0])));
}

/**
 * Brings any database — brand new or years old — up to the current schema.
 * Call on every startup, before any service issues a query.
 *
 * A migration that throws is left unrecorded. Later migrations depend on earlier
 * schema and data invariants, so stop immediately and retry on the next launch.
 */
export function runMigrations(db: Database): MigrationReport {
  const report: MigrationReport = { applied: [], skipped: [], failed: [] };

  // PRAGMA foreign_keys is connection-scoped and SQLite ignores changes made
  // inside a transaction, so configure it before executing schema/migrations.
  db.run('PRAGMA foreign_keys = ON');
  const foreignKeysEnabled = Number(db.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0]) === 1;
  if (!foreignKeysEnabled) {
    throw new Error('SQLite foreign key enforcement could not be enabled.');
  }

  // 1. Create missing tables before migrations. Indexes are deferred because a
  //    legacy table may not have the columns referenced by a newer index yet.
  //    Executing the whole schema at once would roll back table creation too,
  //    leaving migrations unable to add those columns on the next launch.
  const schemaWithoutIndexes = SCHEMA_SQL.replace(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?;\s*/gi,
    ''
  );
  db.run('BEGIN TRANSACTION');
  try {
    db.exec(schemaWithoutIndexes);
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }

  // 2. Apply the ordered migration list.
  const done = appliedIds(db);

  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) {
      report.skipped.push(migration.id);
      continue;
    }
    if (migration.disableForeignKeys) {
      db.run('PRAGMA foreign_keys = OFF');
    }
    try {
      db.run('BEGIN TRANSACTION');
      migration.up(db);
      db.run('INSERT OR REPLACE INTO schema_migrations (id, description) VALUES (?, ?)', [
        migration.id,
        migration.description,
      ]);
      db.run('COMMIT');
      report.applied.push(migration.id);
    } catch (error) {
      try { db.run('ROLLBACK'); } catch { /* transaction may already be closed */ }
      const message = error instanceof Error ? error.message : String(error);
      report.failed.push({ id: migration.id, error: message });
      console.error(`❌ Migration ${migration.id} failed:`, message);
      break;
    } finally {
      db.run('PRAGMA foreign_keys = ON');
      const enabled = Number(db.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0]) === 1;
      if (!enabled) {
        throw new Error(`SQLite foreign key enforcement was not restored after migration ${migration.id}.`);
      }
    }
  }

  // 3. Re-run the idempotent schema after column migrations so all indexes
  //    exist on both fresh and upgraded databases.
  if (report.failed.length === 0) {
    db.run('BEGIN TRANSACTION');
    try {
      db.exec(SCHEMA_SQL);
      db.run('COMMIT');
    } catch (error) {
      try { db.run('ROLLBACK'); } catch { /* transaction may already be closed */ }
      throw error;
    }
  }

  if (report.applied.length > 0) {
    console.log(`✅ Applied ${report.applied.length} migration(s):`, report.applied.join(', '));
  }

  return report;
}
