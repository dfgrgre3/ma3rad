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
import { addColumn } from './migrationSupport';

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
    up: (db) => {
      addColumn(db, 'cash_shifts', 'auto_closed', 'INTEGER NOT NULL DEFAULT 0');
    },
  }
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
