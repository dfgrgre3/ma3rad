import type { Migration } from '../migrationSupport';

export const MIGRATION_PART_23: Migration[] = [
  {
    id: '133_operational_custom_fields_and_configurable_grades',
    description: 'Add reusable operational custom fields and configurable product grade choices.',
    disableForeignKeys: true,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS operational_field_definitions (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          data_type TEXT NOT NULL CHECK(data_type IN ('TEXT','NUMBER','BOOLEAN','SELECT','MULTI_SELECT','DATE')),
          unit TEXT,
          is_required INTEGER NOT NULL DEFAULT 0,
          is_filterable INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(entity_type, code)
        );
        CREATE INDEX IF NOT EXISTS idx_operational_fields_entity
          ON operational_field_definitions(entity_type, sort_order, name);

        CREATE TABLE IF NOT EXISTS operational_field_options (
          id TEXT PRIMARY KEY,
          field_id TEXT NOT NULL,
          value TEXT NOT NULL,
          label TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          UNIQUE(field_id, value),
          FOREIGN KEY (field_id) REFERENCES operational_field_definitions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS operational_field_values (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL,
          record_id TEXT NOT NULL,
          field_id TEXT NOT NULL,
          value TEXT,
          UNIQUE(entity_type, record_id, field_id),
          FOREIGN KEY (field_id) REFERENCES operational_field_definitions(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_operational_field_values_record
          ON operational_field_values(entity_type, record_id);
        CREATE INDEX IF NOT EXISTS idx_operational_field_values_field
          ON operational_field_values(field_id, value);

        CREATE TABLE IF NOT EXISTS product_grade_options (
          id TEXT NOT NULL UNIQUE,
          value TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO product_grade_options(id, value, label, sort_order) VALUES
          ('GRADE_1', 'GRADE_1', 'فرز أول', 0),
          ('GRADE_2', 'GRADE_2', 'فرز ثاني', 1),
          ('GRADE_3', 'GRADE_3', 'فرز ثالث', 2),
          ('COMMERCIAL', 'COMMERCIAL', 'تجاري', 3);

        INSERT OR IGNORE INTO sync_entity_policies
          (entity_type, enabled, outbound_enabled, inbound_enabled, data_scope)
        VALUES
          ('operational_field', 1, 1, 1, 'TENANT'),
          ('operational_field_option', 1, 1, 1, 'TENANT'),
          ('operational_field_value', 1, 1, 1, 'TENANT'),
          ('product_grade_option', 1, 1, 1, 'TENANT');
      `);

      const productDefinition = db.exec(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'products'`
      )[0]?.values?.[0]?.[0];
      if (typeof productDefinition === 'string'
        && productDefinition.includes("CHECK(grade IN ('GRADE_1', 'GRADE_2', 'GRADE_3', 'COMMERCIAL'))")) {
        const replacementDefinition = productDefinition.replace(
          " CHECK(grade IN ('GRADE_1', 'GRADE_2', 'GRADE_3', 'COMMERCIAL'))",
          '',
        );
        if (replacementDefinition === productDefinition || replacementDefinition.includes('CHECK(grade IN')) {
          throw new Error('Could not safely prepare the products table for configurable grade values.');
        }
        const schemaVersion = Number(db.exec('PRAGMA schema_version')[0]?.values?.[0]?.[0] || 0);
        db.run('PRAGMA writable_schema = ON');
        try {
          db.run(`UPDATE sqlite_master SET sql = ? WHERE type = 'table' AND name = 'products'`, [replacementDefinition]);
        } finally {
          db.run('PRAGMA writable_schema = OFF');
        }
        db.run(`PRAGMA schema_version = ${schemaVersion + 1}`);
      }
    },
  },
];
