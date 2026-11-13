import type { Migration } from './support';

export const MIGRATION_PART_68: Migration[] = [
  {
    id: '178_apartment_estimate_pricing_payments',
    description: 'Persist apartment estimate contingency, tax, and payment records.',
    up: (db) => {
      const columns = new Set(db.exec("PRAGMA table_info('project_apartment_estimates')")[0]?.values.map((row) => String(row[1])) || []);
      if (!columns.has('contingency_percent')) db.exec('ALTER TABLE project_apartment_estimates ADD COLUMN contingency_percent REAL NOT NULL DEFAULT 0');
      if (!columns.has('tax_percent')) db.exec('ALTER TABLE project_apartment_estimates ADD COLUMN tax_percent REAL NOT NULL DEFAULT 0');
      if (!columns.has('payments_json')) db.exec("ALTER TABLE project_apartment_estimates ADD COLUMN payments_json TEXT NOT NULL DEFAULT '[]'");
    },
  },
];
