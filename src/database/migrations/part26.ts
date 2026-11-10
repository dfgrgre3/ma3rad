import type { Migration } from './support';

export const MIGRATION_PART_26: Migration[] = [
  {
    id: '137_quotation_service_items',
    description: 'Support priced service and labor lines in sales quotations.',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS quotation_service_items (
          id TEXT PRIMARY KEY,
          quotation_id TEXT NOT NULL,
          product_id TEXT,
          description TEXT NOT NULL,
          unit TEXT NOT NULL DEFAULT 'بند',
          quantity REAL NOT NULL CHECK(quantity > 0),
          unit_price REAL NOT NULL CHECK(unit_price >= 0),
          discount_amount REAL NOT NULL DEFAULT 0 CHECK(discount_amount >= 0),
          total_price REAL NOT NULL CHECK(total_price >= 0),
          FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id)
        );
        CREATE INDEX IF NOT EXISTS idx_quotation_service_items_quotation
          ON quotation_service_items(quotation_id);
      `);
    },
  },
  {
    id: '138_project_apartment_estimates',
    description: 'Persist apartment room measurements and finish estimates by project.',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_apartment_estimates (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          area_m2 REAL NOT NULL DEFAULT 0 CHECK(area_m2 >= 0),
          total_amount REAL NOT NULL DEFAULT 0 CHECK(total_amount >= 0),
          rooms_json TEXT NOT NULL,
          cost_lines_json TEXT NOT NULL,
          quotation_id TEXT,
          created_by TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id),
          FOREIGN KEY (updated_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_project_apartment_estimates_project
          ON project_apartment_estimates(project_id, updated_at DESC);
      `);
    },
  },
];
