import type { Migration } from './support';
import { tableExists, addColumn } from './support';

/**
 * Migration 218: reconcile platform tenant directory tables with the service
 * layer.
 *
 * PlatformTenantService persists the trial subscription id and plan price on
 * platform_tenants, and stores credential fields (password_hash,
 * activation_code, is_active, provisioned) on platform_tenant_users. Those
 * columns were referenced by the service but never added to the schema or an
 * earlier migration.
 */
export const MIGRATION_PART_133: Migration = {
  id: '218_platform_tenant_directory_fields',
  description: 'Add subscription/price fields to platform_tenants and credential fields to platform_tenant_users',
  up: (db) => {
    if (tableExists(db, 'platform_tenants')) {
      addColumn(db, 'platform_tenants', 'subscription_id', 'TEXT');
      addColumn(db, 'platform_tenants', 'price', 'REAL');
    }
    if (tableExists(db, 'platform_invoice_items')) {
      addColumn(db, 'platform_invoice_items', 'created_at', 'TEXT');
    }
    if (tableExists(db, 'platform_invoices')) {
      addColumn(db, 'platform_invoices', 'paid_at', 'TEXT');
    }
    if (tableExists(db, 'platform_audit_logs')) {
      db.exec(`
        CREATE VIEW IF NOT EXISTS platform_audit AS
        SELECT id, actor_id, actor_name, actor_type, tenant_id, device_id, device_name,
               ip_address, user_agent, action, entity_type, entity_id, severity, status,
               details, old_values, new_values, error_message, prev_hash,
               record_hash AS hash, created_at
        FROM platform_audit_logs
      `);
    }
    // Repair: migration 190 seeded only plan_basic because is_default received
    // the sort ordinal (2/3) for the other plans, violating the CHECK constraint.
    if (tableExists(db, 'platform_plans')) {
      const seedPlans: Array<[string, string, string, string, string, number, number, number, number, number, string, string, number]> = [
        ['plan_basic', 'BASIC', 'الأساسية', 'مناسبة للمعارض الصغيرة والبداية السريعة', 'YEARLY', 1499, 2, 1, 2, 1, '["dashboard","sales","pos","inventory"]', '["offline_sync"]', 1],
        ['plan_professional', 'PROFESSIONAL', 'الاحترافية', 'الأكثر طلباً للمعارض المتوسطة متعددة الفروع', 'YEARLY', 3499, 10, 3, 8, 2, '["dashboard","sales","pos","inventory","purchases","customers","crm","finance","reports"]', '["offline_sync","multi_branch","advanced_reports","e_invoicing"]', 0],
        ['plan_enterprise', 'ENTERPRISE', 'المؤسسية', 'تحكم كامل بكل الوحدات والفروع والمستخدمين', 'YEARLY', 7999, 50, 20, 30, 3, '["dashboard","sales","pos","inventory","purchases","customers","crm","finance","cashier","reports","hr","projects","manufacturing","operations","documents","approvals","restaurant"]', '["offline_sync","multi_branch","advanced_reports","e_invoicing","loyalty","restaurant_mode","api_access","audit_export"]', 0],
      ];
      for (const [id, code, name, description, cycle, price, seats, branches, devices, sort, modules, features, isDefault] of seedPlans) {
        db.run(
          `INSERT OR IGNORE INTO platform_plans
             (id, code, name, description, billing_cycle, price, currency, seats_limit, branches_limit,
              devices_limit, included_modules, features, is_active, is_default, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, 'EGP', ?, ?, ?, ?, ?, 1, ?, ?)`,
          [id, code, name, description, cycle, price, seats, branches, devices, modules, features, isDefault, sort]
        );
      }
    }
    if (!tableExists(db, 'platform_branches')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS platform_branches (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          name TEXT NOT NULL,
          code TEXT,
          branches_limit INTEGER NOT NULL DEFAULT 1,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_platform_branches_tenant ON platform_branches(tenant_id)');
    }
    if (tableExists(db, 'platform_staff')) {
      addColumn(db, 'platform_staff', 'username', 'TEXT');
      addColumn(db, 'platform_staff', 'mfa_enabled', 'INTEGER NOT NULL DEFAULT 0');
      addColumn(db, 'platform_staff', 'mfa_enforcement', "TEXT NOT NULL DEFAULT 'optional'");
      addColumn(db, 'platform_staff', 'totp_secret', 'TEXT');
      addColumn(db, 'platform_staff', 'backup_codes', 'TEXT');
      addColumn(db, 'platform_staff', 'data_scope_tenant_ids', 'TEXT');
      addColumn(db, 'platform_staff', 'force_password_change', 'INTEGER NOT NULL DEFAULT 0');
    }
    if (tableExists(db, 'platform_staff_logins')) {
      addColumn(db, 'platform_staff_logins', 'username', 'TEXT');
      addColumn(db, 'platform_staff_logins', 'success', 'INTEGER');
      addColumn(db, 'platform_staff_logins', 'mfa_used', 'INTEGER');
      addColumn(db, 'platform_staff_logins', 'created_at', 'TEXT');
    }
    if (tableExists(db, 'platform_staff_invites')) {
      addColumn(db, 'platform_staff_invites', 'token', 'TEXT');
      addColumn(db, 'platform_staff_invites', 'status', "TEXT NOT NULL DEFAULT 'PENDING'");
      addColumn(db, 'platform_staff_invites', 'updated_at', 'TEXT');
    }
    if (tableExists(db, 'platform_releases')) {
      addColumn(db, 'platform_releases', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
      addColumn(db, 'platform_releases', 'release_date', 'TEXT');
    }
    if (tableExists(db, 'platform_license_activations')) {
      addColumn(db, 'platform_license_activations', 'is_online', 'INTEGER');
      addColumn(db, 'platform_license_activations', 'activated_at', 'TEXT');
    }
    if (tableExists(db, 'platform_tenant_users')) {
      addColumn(db, 'platform_tenant_users', 'password_hash', 'TEXT');
      addColumn(db, 'platform_tenant_users', 'activation_code', 'TEXT');
      addColumn(db, 'platform_tenant_users', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
      addColumn(db, 'platform_tenant_users', 'provisioned', 'INTEGER NOT NULL DEFAULT 0');
      addColumn(db, 'platform_tenant_users', 'status', "TEXT NOT NULL DEFAULT 'ACTIVE'");
      addColumn(db, 'platform_tenant_users', 'provisioning_status', "TEXT NOT NULL DEFAULT 'NOT_REQUESTED'");
      addColumn(db, 'platform_tenant_users', 'provisioning_mode', 'TEXT');
      addColumn(db, 'platform_tenant_users', 'identity_user_id', 'TEXT');
      addColumn(db, 'platform_tenant_users', 'scope', 'TEXT');
      addColumn(db, 'platform_tenant_users', 'invite_code', 'TEXT');
      addColumn(db, 'platform_tenant_users', 'temporary_password', 'TEXT');
      addColumn(db, 'platform_tenant_users', 'invite_expires_at', 'TEXT');
      addColumn(db, 'platform_tenant_users', 'provisioned_at', 'TEXT');
      addColumn(db, 'platform_tenant_users', 'last_error', 'TEXT');
      addColumn(db, 'platform_tenant_users', 'notes', 'TEXT');
    }
  },
};
