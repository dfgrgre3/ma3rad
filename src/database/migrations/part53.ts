import type { Migration } from './support';

export const MIGRATION_PART_53: Migration[] = [
  {
    id: '165_data_import_batches',
    description: 'Track imported customer and product records for safe rollback.',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS data_import_batches (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('customers', 'products')),
          source_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'COMPLETED'
            CHECK(status IN ('COMPLETED', 'PARTIAL', 'ROLLED_BACK')),
          imported_count INTEGER NOT NULL DEFAULT 0,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS data_import_batch_records (
          id TEXT PRIMARY KEY,
          batch_id TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          FOREIGN KEY (batch_id) REFERENCES data_import_batches(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_data_import_batches_entity
          ON data_import_batches(entity_type, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_data_import_batch_records_batch
          ON data_import_batch_records(batch_id);
      `);
    },
  },
];
