import type { Migration } from '../migrationSupport';

const FIELD_RECORD_TABLES: Array<[string, string]> = [
  ['products', 'products'],
  ['customers', 'customers'],
  ['suppliers', 'suppliers'],
  ['sales_invoices', 'sales_invoices'],
  ['sales_returns', 'sales_returns'],
  ['quotations', 'quotations'],
  ['orders', 'orders'],
  ['purchase_invoices', 'purchase_invoices'],
  ['purchase_orders', 'purchase_orders'],
  ['purchase_returns', 'purchase_returns'],
  ['projects', 'projects'],
  ['leads', 'leads'],
  ['employees', 'employees'],
  ['vehicles', 'vehicles'],
  ['warehouses', 'warehouses'],
  ['branches', 'branches'],
];

export const MIGRATION_PART_24: Migration[] = [
  {
    id: '134_cleanup_operational_field_values_on_record_delete',
    description: 'Remove custom field values when their operational record is deleted.',
    up: (db) => {
      FIELD_RECORD_TABLES.forEach(([entityType, table]) => {
        const tableExists = db.exec(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
          [table],
        ).length > 0;
        if (!tableExists) return;
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_operational_fields_cleanup_${table}
          AFTER DELETE ON ${table}
          BEGIN
            DELETE FROM operational_field_values
            WHERE entity_type = '${entityType}' AND record_id = OLD.id;
          END;
        `);
      });
    },
  },
];
