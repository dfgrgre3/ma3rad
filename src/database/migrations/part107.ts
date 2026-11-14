import type { Migration } from './support';

export const MIGRATION_PART_107: Migration[] = [
  {
    id: '157_platform_ui_customization',
    description:
      'Add platform_ui_profiles, platform_tenant_ui_customizations, and platform_tenant_ui_versions for per-tenant UI customization, page/button visibility, and form field control.',
    disableForeignKeys: true,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS platform_ui_profiles (
          id TEXT PRIMARY KEY,
          code TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          business_type TEXT,
          hidden_pages TEXT DEFAULT '[]',
          hidden_actions TEXT DEFAULT '[]',
          custom_labels TEXT DEFAULT '{}',
          nav_order TEXT DEFAULT '[]',
          form_field_rules TEXT DEFAULT '{}',
          is_default INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS platform_tenant_ui_customizations (
          id TEXT PRIMARY KEY,
          tenant_id TEXT UNIQUE NOT NULL,
          profile_id TEXT,
          hidden_pages TEXT DEFAULT '[]',
          hidden_actions TEXT DEFAULT '[]',
          custom_labels TEXT DEFAULT '{}',
          nav_order TEXT DEFAULT '[]',
          form_field_rules TEXT DEFAULT '{}',
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tenant_ui_tenant ON platform_tenant_ui_customizations(tenant_id);

        CREATE TABLE IF NOT EXISTS platform_tenant_ui_versions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          config_snapshot TEXT NOT NULL,
          change_summary TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tenant_ui_versions ON platform_tenant_ui_versions(tenant_id, version);

        -- Seed initial activity-based UI profiles
        INSERT OR IGNORE INTO platform_ui_profiles (id, code, name, business_type, hidden_pages, hidden_actions, form_field_rules, is_default)
        VALUES 
          ('uip_default', 'DEFAULT', 'القالب القياسي الشامل', 'general', '[]', '[]', '{}', 1),
          ('uip_ceramics', 'CERAMICS', 'معارض ومستودعات السيراميك والبورسلين', 'ceramics', '["/manufacturing","/restaurant-tables"]', '[]', '{"expiryDate":{"visible":false},"colorTone":{"visible":true},"caliberSize":{"visible":true}}', 0),
          ('uip_supermarket', 'SUPERMARKET', 'السوبرماركت والبقالة التموينية', 'supermarket', '["/projects","/manufacturing","/contracts"]', '["print_chassis_label"]', '{"expiryDate":{"visible":true},"serialNumber":{"visible":false}}', 0),
          ('uip_restaurant', 'RESTAURANT', 'المطاعم والكافيهات والضيافة', 'restaurant', '["/manufacturing","/warranty-claims","/installments"]', '["wholesale_bulk_pricing"]', '{"kitchenNotes":{"visible":true},"tableNumber":{"visible":true}}', 0),
          ('uip_pharmacy', 'PHARMACY', 'الصيدليات والمستلزمات الطبية', 'pharmacy', '["/restaurant-tables","/projects"]', '[]', '{"expiryDate":{"visible":true,"required":true},"batchNumber":{"visible":true,"required":true}}', 0),
          ('uip_workshops', 'WORKSHOPS', 'الورش والمقاولات والصيانة', 'workshops', '["/restaurant-tables","/pos-fast-checkout"]', '[]', '{"chassisNumber":{"visible":true},"meterReading":{"visible":true}}', 0);
      `);
    },
  },
];
