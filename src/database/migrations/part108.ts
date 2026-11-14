import type { Migration } from './support';

export const MIGRATION_PART_108: Migration[] = [
  {
    id: '158_platform_app_config_rollout',
    description:
      'Add platform_config_templates, platform_tenant_configs, platform_tenant_config_versions, platform_config_rollouts, and platform_tenant_config_ack for central dynamic configuration, signing, and phased rollouts.',
    disableForeignKeys: true,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS platform_config_templates (
          id TEXT PRIMARY KEY,
          code TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          business_type TEXT,
          plan_id TEXT,
          config_payload TEXT NOT NULL DEFAULT '{}',
          version INTEGER NOT NULL DEFAULT 1,
          is_default INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS platform_tenant_configs (
          id TEXT PRIMARY KEY,
          tenant_id TEXT UNIQUE NOT NULL,
          template_id TEXT,
          config_payload TEXT NOT NULL DEFAULT '{}',
          signature TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('DRAFT','ACTIVE','DEPRECATED')),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tenant_config_tenant ON platform_tenant_configs(tenant_id);

        CREATE TABLE IF NOT EXISTS platform_tenant_config_versions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          config_payload TEXT NOT NULL,
          signature TEXT,
          change_summary TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tenant_config_versions ON platform_tenant_config_versions(tenant_id, version);

        CREATE TABLE IF NOT EXISTS platform_config_rollouts (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          target_type TEXT NOT NULL CHECK(target_type IN ('ALL','ACTIVITY','PLAN','CANARY_PERCENT','SPECIFIC_TENANTS')),
          target_filter TEXT DEFAULT '{}',
          config_snapshot TEXT NOT NULL,
          signature TEXT NOT NULL,
          status TEXT DEFAULT 'IN_PROGRESS' CHECK(status IN ('DRAFT','IN_PROGRESS','COMPLETED','ROLLED_BACK')),
          total_tenants INTEGER DEFAULT 0,
          received_count INTEGER DEFAULT 0,
          applied_count INTEGER DEFAULT 0,
          failed_count INTEGER DEFAULT 0,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS platform_tenant_config_ack (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          device_id TEXT,
          rollout_id TEXT,
          version INTEGER NOT NULL,
          status TEXT DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','APPLIED','FAILED')),
          error_message TEXT,
          acknowledged_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_config_ack_tenant ON platform_tenant_config_ack(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_config_ack_rollout ON platform_tenant_config_ack(rollout_id);

        -- Seed initial central configuration templates
        INSERT OR IGNORE INTO platform_config_templates (id, code, name, business_type, config_payload, is_default)
        VALUES 
          ('pct_general', 'GENERAL_DEFAULT', 'التكوين القياسي العام', 'general', '{"taxRate":14,"currency":"EGP","syncIntervalSec":30,"offlineGraceDays":14,"cashierBarcodeScanner":true,"autoPrintReceipt":true}', 1),
          ('pct_ceramics', 'CERAMICS_DEFAULT', 'تكوين معارض السيراميك والبورسلين', 'ceramics', '{"taxRate":14,"currency":"EGP","syncIntervalSec":15,"enableToneManagement":true,"enableCaliberSize":true,"enableBatchTraceability":true}', 0),
          ('pct_restaurant', 'RESTAURANT_DEFAULT', 'تكوين المطاعم والمقاهي والضيافة', 'restaurant', '{"taxRate":14,"serviceChargeRate":12,"currency":"EGP","enableKitchenDisplay":true,"autoKitchenPrint":true,"tableManagement":true}', 0),
          ('pct_supermarket', 'SUPERMARKET_DEFAULT', 'تكوين السوبرماركت وتجارة التجزئة', 'supermarket', '{"taxRate":14,"currency":"EGP","fastCheckoutMode":true,"scaleBarcodePrefix":"21","syncIntervalSec":10}', 0);
      `);
    },
  },
];
