import type { Database } from 'sql.js';
import type { Migration } from '../support';
import { addColumn, DEFAULT_SETTINGS } from '../support';

export const MIGRATION_087_SYNC_EVENT_SCOPE: Migration = {
    id: '087_sync_event_scope',
    description: 'Add tenant and branch scope to synchronization events.',
    up: (db: Database) => {
      addColumn(db, 'sync_outbox', 'data_scope', "TEXT NOT NULL DEFAULT 'BRANCH' CHECK(data_scope IN ('TENANT','BRANCH'))");
      addColumn(db, 'sync_inbox', 'data_scope', "TEXT NOT NULL DEFAULT 'BRANCH' CHECK(data_scope IN ('TENANT','BRANCH'))");
    },
};

export const MIGRATION_088_SYNC_CONFLICTS_AND_VERSIONS: Migration = {
    id: '088_sync_conflicts_and_versions',
    description: 'Persist entity versions and reviewable synchronization conflicts.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_entity_versions (
          tenant_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          entity_version INTEGER NOT NULL,
          source_branch_id TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tenant_id, entity_type, entity_id)
        );
        CREATE TABLE IF NOT EXISTS sync_conflicts (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL UNIQUE,
          tenant_id TEXT NOT NULL,
          source_branch_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          remote_version INTEGER NOT NULL,
          local_version INTEGER,
          remote_payload TEXT NOT NULL,
          local_payload TEXT,
          reason TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN'
            CHECK(status IN ('OPEN','RESOLVED_LOCAL','RESOLVED_REMOTE')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          resolved_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status_created
          ON sync_conflicts(status, created_at);
      `);
    },
};

export const MIGRATION_089_SYNC_MASTER_DATA_BOOTSTRAP: Migration = {
    id: '089_sync_master_data_bootstrap',
    description: 'Track resumable initial publication of existing master data.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_bootstrap_progress (
          tenant_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          cursor_id TEXT,
          completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tenant_id, entity_type)
        );
      `);
    },
};

export const MIGRATION_090_SYNC_ENTITY_POLICIES: Migration = {
    id: '090_sync_entity_policies',
    description: 'Persist administrator-controlled synchronization policies for supported master data.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_entity_policies (
          entity_type TEXT PRIMARY KEY,
          enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
          outbound_enabled INTEGER NOT NULL DEFAULT 0 CHECK(outbound_enabled IN (0,1)),
          inbound_enabled INTEGER NOT NULL DEFAULT 0 CHECK(inbound_enabled IN (0,1)),
          data_scope TEXT NOT NULL DEFAULT 'BRANCH' CHECK(data_scope IN ('TENANT','BRANCH')),
          managed_by_head_office INTEGER NOT NULL DEFAULT 0 CHECK(managed_by_head_office IN (0,1)),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO sync_entity_policies
          (entity_type, enabled, outbound_enabled, inbound_enabled, data_scope, managed_by_head_office)
        VALUES
          ('category', 1, 1, 1, 'TENANT', 0),
          ('brand', 1, 1, 1, 'TENANT', 0),
          ('product', 1, 1, 1, 'TENANT', 0),
          ('customer', 1, 1, 1, 'TENANT', 0),
          ('supplier', 1, 1, 1, 'TENANT', 0);
      `);
    },
};

export const MIGRATION_091_SYNC_REMOTE_BUSINESS_RECORDS: Migration = {
    id: '091_sync_remote_business_records',
    description: 'Store remote business document snapshots separately from local balances and inventory.',
    up: (db: Database) => {
      addColumn(db, 'sync_entity_policies', 'managed_by_head_office', 'INTEGER NOT NULL DEFAULT 0 CHECK(managed_by_head_office IN (0,1))');
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_remote_records (
          event_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          source_branch_id TEXT NOT NULL,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('sales_invoice','sales_return','purchase_invoice','purchase_return')),
          entity_id TEXT NOT NULL,
          entity_version INTEGER NOT NULL,
          payload TEXT NOT NULL,
          received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sync_remote_records_scope
          ON sync_remote_records(tenant_id, entity_type, source_branch_id, received_at);
        CREATE TABLE IF NOT EXISTS sync_remote_entities (
          tenant_id TEXT NOT NULL,
          source_branch_id TEXT NOT NULL,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('sales_invoice','sales_return','purchase_invoice','purchase_return')),
          entity_id TEXT NOT NULL,
          entity_version INTEGER NOT NULL,
          latest_event_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tenant_id, source_branch_id, entity_type, entity_id)
        );
        CREATE INDEX IF NOT EXISTS idx_sync_remote_entities_type
          ON sync_remote_entities(tenant_id, entity_type, source_branch_id, updated_at);
        INSERT OR IGNORE INTO sync_entity_policies
          (entity_type, enabled, outbound_enabled, inbound_enabled, data_scope, managed_by_head_office)
        VALUES
          ('sales_invoice', 0, 0, 0, 'TENANT', 0),
          ('sales_return', 0, 0, 0, 'TENANT', 0),
          ('purchase_invoice', 0, 0, 0, 'TENANT', 0),
          ('purchase_return', 0, 0, 0, 'TENANT', 0);
      `);
    },
};

export const MIGRATION_092_SYNC_REMOTE_PURCHASE_REPORTS: Migration = {
    id: '092_sync_remote_purchase_reports',
    description: 'Store purchasing invoice report snapshots separately from local balances and inventory.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_remote_purchase_records (
          event_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          source_branch_id TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          entity_version INTEGER NOT NULL,
          payload TEXT NOT NULL,
          received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sync_remote_purchase_records_scope
          ON sync_remote_purchase_records(tenant_id, source_branch_id, received_at);
        CREATE TABLE IF NOT EXISTS sync_remote_purchase_entities (
          tenant_id TEXT NOT NULL,
          source_branch_id TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          entity_version INTEGER NOT NULL,
          latest_event_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tenant_id, source_branch_id, entity_id)
        );
        CREATE INDEX IF NOT EXISTS idx_sync_remote_purchase_entities_scope
          ON sync_remote_purchase_entities(tenant_id, source_branch_id, updated_at);
        INSERT OR IGNORE INTO sync_entity_policies
          (entity_type, enabled, outbound_enabled, inbound_enabled, data_scope, managed_by_head_office)
        VALUES
          ('purchase_invoice', 0, 0, 0, 'TENANT', 0),
          ('purchase_return', 0, 0, 0, 'TENANT', 0);
      `);
    },
};

export const MIGRATION_093_SYNC_PAYMENT_BUSINESS_RECORDS: Migration = {
    id: '093_sync_payment_business_records',
    description: 'Allow detailed payment snapshots in the business sync layer and seed their policies.',
    up: (db: Database) => {
      db.exec(`
        INSERT OR IGNORE INTO sync_entity_policies
          (entity_type, enabled, outbound_enabled, inbound_enabled, data_scope, managed_by_head_office)
        VALUES
          ('customer_payment', 0, 0, 0, 'TENANT', 0),
          ('supplier_payment', 0, 0, 0, 'TENANT', 0);
      `);

      const remoteRecordSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='sync_remote_records'")[0]?.values?.[0]?.[0] as string | undefined;
      if (remoteRecordSql && !remoteRecordSql.includes("'customer_payment'") && !remoteRecordSql.includes("'supplier_payment'")) {
        db.exec(`
          CREATE TABLE sync_remote_records__tmp (
            event_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            source_branch_id TEXT NOT NULL,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('sales_invoice','sales_return','purchase_invoice','purchase_return','customer_payment','supplier_payment')),
            entity_id TEXT NOT NULL,
            entity_version INTEGER NOT NULL,
            payload TEXT NOT NULL,
            received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO sync_remote_records__tmp
            (event_id, tenant_id, source_branch_id, entity_type, entity_id, entity_version, payload, received_at)
          SELECT event_id, tenant_id, source_branch_id, entity_type, entity_id, entity_version, payload, received_at
          FROM sync_remote_records;
          DROP TABLE sync_remote_records;
          ALTER TABLE sync_remote_records__tmp RENAME TO sync_remote_records;
          CREATE INDEX IF NOT EXISTS idx_sync_remote_records_scope
            ON sync_remote_records(tenant_id, entity_type, source_branch_id, received_at);
        `);
      }

      const remoteEntitiesSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='sync_remote_entities'")[0]?.values?.[0]?.[0] as string | undefined;
      if (remoteEntitiesSql && !remoteEntitiesSql.includes("'customer_payment'") && !remoteEntitiesSql.includes("'supplier_payment'")) {
        db.exec(`
          CREATE TABLE sync_remote_entities__tmp (
            tenant_id TEXT NOT NULL,
            source_branch_id TEXT NOT NULL,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('sales_invoice','sales_return','purchase_invoice','purchase_return','customer_payment','supplier_payment')),
            entity_id TEXT NOT NULL,
            entity_version INTEGER NOT NULL,
            latest_event_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tenant_id, source_branch_id, entity_type, entity_id)
          );
          INSERT INTO sync_remote_entities__tmp
            (tenant_id, source_branch_id, entity_type, entity_id, entity_version, latest_event_id, payload, updated_at)
          SELECT tenant_id, source_branch_id, entity_type, entity_id, entity_version, latest_event_id, payload, updated_at
          FROM sync_remote_entities;
          DROP TABLE sync_remote_entities;
          ALTER TABLE sync_remote_entities__tmp RENAME TO sync_remote_entities;
          CREATE INDEX IF NOT EXISTS idx_sync_remote_entities_type
            ON sync_remote_entities(tenant_id, entity_type, source_branch_id, updated_at);
        `);
      }
    },
};

export const MIGRATION_094_SYNC_STOCK_TRANSFER_BUSINESS_RECORDS: Migration = {
    id: '094_sync_stock_transfer_business_records',
    description: 'Allow stock transfer snapshots in the business sync layer and seed their policies.',
    up: (db: Database) => {
      db.exec(`
        INSERT OR IGNORE INTO sync_entity_policies
          (entity_type, enabled, outbound_enabled, inbound_enabled, data_scope, managed_by_head_office)
        VALUES
          ('stock_transfer', 0, 0, 0, 'TENANT', 0);
      `);

      const remoteRecordSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='sync_remote_records'")[0]?.values?.[0]?.[0] as string | undefined;
      if (remoteRecordSql && !remoteRecordSql.includes("'stock_transfer'")) {
        db.exec(`
          CREATE TABLE sync_remote_records__tmp (
            event_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            source_branch_id TEXT NOT NULL,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('sales_invoice','sales_return','purchase_invoice','purchase_return','customer_payment','supplier_payment','stock_transfer')),
            entity_id TEXT NOT NULL,
            entity_version INTEGER NOT NULL,
            payload TEXT NOT NULL,
            received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO sync_remote_records__tmp
            (event_id, tenant_id, source_branch_id, entity_type, entity_id, entity_version, payload, received_at)
          SELECT event_id, tenant_id, source_branch_id, entity_type, entity_id, entity_version, payload, received_at
          FROM sync_remote_records;
          DROP TABLE sync_remote_records;
          ALTER TABLE sync_remote_records__tmp RENAME TO sync_remote_records;
          CREATE INDEX IF NOT EXISTS idx_sync_remote_records_scope
            ON sync_remote_records(tenant_id, entity_type, source_branch_id, received_at);
        `);
      }

      const remoteEntitiesSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='sync_remote_entities'")[0]?.values?.[0]?.[0] as string | undefined;
      if (remoteEntitiesSql && !remoteEntitiesSql.includes("'stock_transfer'")) {
        db.exec(`
          CREATE TABLE sync_remote_entities__tmp (
            tenant_id TEXT NOT NULL,
            source_branch_id TEXT NOT NULL,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('sales_invoice','sales_return','purchase_invoice','purchase_return','customer_payment','supplier_payment','stock_transfer')),
            entity_id TEXT NOT NULL,
            entity_version INTEGER NOT NULL,
            latest_event_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tenant_id, source_branch_id, entity_type, entity_id)
          );
          INSERT INTO sync_remote_entities__tmp
            (tenant_id, source_branch_id, entity_type, entity_id, entity_version, latest_event_id, payload, updated_at)
          SELECT tenant_id, source_branch_id, entity_type, entity_id, entity_version, latest_event_id, payload, updated_at
          FROM sync_remote_entities;
          DROP TABLE sync_remote_entities;
          ALTER TABLE sync_remote_entities__tmp RENAME TO sync_remote_entities;
          CREATE INDEX IF NOT EXISTS idx_sync_remote_entities_type
            ON sync_remote_entities(tenant_id, entity_type, source_branch_id, updated_at);
        `);
      }
    },
};

export const MIGRATION_095_SYNC_BRANCH_DEVICE_VERIFICATION: Migration = {
    id: '095_sync_branch_device_verification',
    description: 'Track authorization, contact health and sync freshness for registered branches and devices.',
    up: (db: Database) => {
      const addIfMissing = (table: string, column: string, definition: string) => {
        const existing = db.exec(`PRAGMA table_info("${table}")`)[0]?.values ?? [];
        if (!existing.some((row) => String(row[1]) === column)) {
          db.exec(`ALTER TABLE "${table}" ADD COLUMN ${column} ${definition};`);
        }
      };

      addIfMissing('sync_branches', 'is_verified', 'INTEGER NOT NULL DEFAULT 0 CHECK(is_verified IN (0,1))');
      addIfMissing('sync_branches', 'verified_at', 'TEXT');
      addIfMissing('sync_branches', 'last_contact_at', 'TEXT');
      addIfMissing('sync_branches', 'last_sync_at', 'TEXT');
      addIfMissing('sync_branches', 'authorized_by', 'TEXT');

      addIfMissing('sync_devices', 'is_verified', 'INTEGER NOT NULL DEFAULT 0 CHECK(is_verified IN (0,1))');
      addIfMissing('sync_devices', 'verified_at', 'TEXT');
      addIfMissing('sync_devices', 'last_contact_at', 'TEXT');
      addIfMissing('sync_devices', 'last_sync_at', 'TEXT');
      addIfMissing('sync_devices', 'authorized_by', 'TEXT');
    },
};

export const MIGRATION_096_BRANCH_DEVICE_ACTIVATION_ONBOARDING: Migration = {
    id: '096_branch_device_activation_onboarding',
    description: 'Add device type and single-use activation codes for branch onboarding and branch/device binding.',
    up: (db: Database) => {
      const addIfMissing = (table: string, column: string, definition: string) => {
        const existing = db.exec(`PRAGMA table_info("${table}")`)[0]?.values ?? [];
        if (!existing.some((row) => String(row[1]) === column)) {
          db.exec(`ALTER TABLE "${table}" ADD COLUMN ${column} ${definition};`);
        }
      };

      addIfMissing('sync_branches', 'device_type', 'TEXT');
      addIfMissing('sync_branches', 'activation_code', 'TEXT');
      addIfMissing('sync_branches', 'activated_device_id', 'TEXT');
      addIfMissing('sync_branches', 'activation_used_at', 'TEXT');

      addIfMissing('sync_devices', 'device_type', 'TEXT');
      addIfMissing('sync_devices', 'activation_code', 'TEXT');
      addIfMissing('sync_devices', 'activation_used_at', 'TEXT');

      const branchTableInfo = db.exec('PRAGMA table_info("sync_branches")')[0]?.values ?? [];
      if (branchTableInfo.length && !branchTableInfo.some((row) => String(row[1]) === 'activation_code')) {
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_branches_activation_code ON sync_branches(activation_code);');
      }
    },
};

export const MIGRATION_097_BUSINESS_TERMINOLOGY_OVERRIDES: Migration = {
    id: '097_business_terminology_overrides',
    description: 'Persist organization-level business terminology overrides in existing settings tables',
    up: (db: Database) => {
      db.run('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)', [
        'businessTerminologyOverrides',
        DEFAULT_SETTINGS.businessTerminologyOverrides,
      ]);
    },
};

export const MIGRATION_098_ACTIVITY_CONFIGURATION_VERSIONS: Migration = {
    id: '098_activity_configuration_versions',
    description: 'Store append-only activity configuration snapshots for review and safe restoration',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS activity_configuration_versions (
          id TEXT PRIMARY KEY,
          version INTEGER NOT NULL UNIQUE,
          snapshot_json TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_by_name TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_activity_config_versions_created
          ON activity_configuration_versions(created_at DESC, version DESC);
        CREATE TRIGGER IF NOT EXISTS trg_activity_config_versions_no_update
        BEFORE UPDATE ON activity_configuration_versions
        BEGIN
          SELECT RAISE(ABORT, 'Activity configuration history is append-only.');
        END;
        CREATE TRIGGER IF NOT EXISTS trg_activity_config_versions_no_delete
        BEFORE DELETE ON activity_configuration_versions
        BEGIN
          SELECT RAISE(ABORT, 'Activity configuration history is append-only.');
        END;
      `);
    },
};
