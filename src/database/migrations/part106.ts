import type { Migration } from './support';

export const MIGRATION_PART_106: Migration[] = [
  {
    id: '156_platform_branding_and_whitelabel',
    description:
      'Add platform_tenant_branding and platform_tenant_branding_versions for master and per-tenant branding, custom themes, login screens, invoice templates, and snapshots.',
    disableForeignKeys: true,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS platform_tenant_branding (
          id TEXT PRIMARY KEY,
          tenant_id TEXT UNIQUE,
          company_name TEXT,
          logo_url TEXT,
          logo_dark_url TEXT,
          favicon_url TEXT,
          primary_color TEXT DEFAULT '#10b981',
          secondary_color TEXT DEFAULT '#064e3b',
          accent_color TEXT DEFAULT '#3b82f6',
          font_family TEXT DEFAULT 'Tajawal',
          invoice_template TEXT DEFAULT 'classic' CHECK(invoice_template IN ('classic','modern','minimal','thermal_pos')),
          login_background_url TEXT,
          login_welcome_title TEXT,
          login_welcome_subtitle TEXT,
          email_header_logo TEXT,
          email_footer_text TEXT,
          custom_subdomain TEXT,
          allowed_customizations TEXT DEFAULT '{"canChangeLogo":true,"canChangeColors":true,"canChangeInvoiceTemplate":true,"canChangeLogin":false}',
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tenant_branding_tenant ON platform_tenant_branding(tenant_id);

        CREATE TABLE IF NOT EXISTS platform_tenant_branding_versions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT,
          version INTEGER NOT NULL,
          branding_snapshot TEXT NOT NULL,
          change_summary TEXT,
          created_by TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tenant_branding_versions ON platform_tenant_branding_versions(tenant_id, version);
      `);
    },
  },
];
