import type { Migration } from './support';
import { addColumn, columnExists, DEFAULT_BRANCH_ID, tableExists } from './support';

// Entity types accepted by OperationalFieldService whose target table may
// carry a branch_id column. Used to backfill operational_field_values.scope.
const OPERATIONAL_ENTITY_TABLES = [
  'customers', 'suppliers', 'sales_invoices', 'sales_returns', 'quotations',
  'orders', 'purchase_invoices', 'purchase_orders', 'purchase_returns',
  'projects', 'leads', 'employees', 'vehicles', 'warehouses',
];

export const MIGRATION_PART_120: Migration = {
  id: '205_business_scope_gap_columns',
  description: 'Add branch scope columns to business tables that could not be attributed to a branch',
  up: (db) => {
    const scopedTables = [
      'analytics_snapshots',
      'cash_forecast_items',
      'training_courses',
      'dynamic_records',
      'operational_field_values',
    ];
    for (const table of scopedTables) {
      if (!tableExists(db, table)) continue;
      addColumn(db, table, 'branch_id', 'TEXT');
      db.run(`CREATE INDEX IF NOT EXISTS idx_${table}_branch ON ${table}(branch_id)`);
    }

    // Backfill flat scope columns with the default branch, matching the
    // convention used by earlier branch_id backfill migrations.
    for (const table of ['analytics_snapshots', 'cash_forecast_items', 'training_courses', 'dynamic_records']) {
      if (!tableExists(db, table) || !columnExists(db, table, 'branch_id')) continue;
      db.run(`UPDATE ${table} SET branch_id = ? WHERE branch_id IS NULL`, [DEFAULT_BRANCH_ID]);
    }

    // operational_field_values is polymorphic: resolve branch_id from the
    // referenced record when its entity table is branch-scoped.
    if (tableExists(db, 'operational_field_values') && columnExists(db, 'operational_field_values', 'branch_id')) {
      for (const entityTable of OPERATIONAL_ENTITY_TABLES) {
        if (!tableExists(db, entityTable) || !columnExists(db, entityTable, 'branch_id')) continue;
        db.run(
          `UPDATE operational_field_values
           SET branch_id = (SELECT t.branch_id FROM "${entityTable}" t
                            WHERE t.id = operational_field_values.record_id)
           WHERE entity_type = ? AND branch_id IS NULL`,
          [entityTable],
        );
      }
      db.run('UPDATE operational_field_values SET branch_id = ? WHERE branch_id IS NULL', [DEFAULT_BRANCH_ID]);
    }
  },
};
