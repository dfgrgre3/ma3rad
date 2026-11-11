import type { Migration } from './support';

export const MIGRATION_PART_67: Migration[] = [
  {
    id: '173_dashboard_query_indexes',
    description: 'Index date-based dashboard aggregates and sales return lookups.',
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sales_returns_date
          ON sales_returns(date);
        CREATE INDEX IF NOT EXISTS idx_sales_return_items_return
          ON sales_return_items(return_id);
        CREATE INDEX IF NOT EXISTS idx_purchase_invoices_date
          ON purchase_invoices(date);
      `);
    },
  },
];
