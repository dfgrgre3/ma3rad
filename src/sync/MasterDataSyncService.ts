import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/db.ts';
import { InboxRepository } from './InboxRepository.ts';
import { OutboxRepository } from './OutboxRepository.ts';
import { SyncPolicyService } from './SyncPolicyService.ts';
import { BusinessRecordSyncService } from './BusinessRecordSyncService.ts';
import type { SyncEvent, SyncOperation } from './types.ts';
import type { EventDispatcher } from './PullChangesService.ts';

type MasterEntityType = 'category' | 'brand' | 'product' | 'customer' | 'supplier';
type SyncIdentity = { tenantId: string; branchId: string; deviceId: string; canManagePolicies?: boolean };
type EntitySpec = { table: string; columns: string[] };

export interface SyncConflict {
  id: string;
  eventId: string;
  tenantId: string;
  sourceBranchId: string;
  entityType: MasterEntityType;
  entityId: string;
  remoteVersion: number;
  localVersion: number | null;
  remotePayload: string;
  localPayload: string | null;
  reason: string;
  createdAt: string;
}

export interface SyncBootstrapEntityProgress {
  entityType: MasterEntityType;
  processed: number;
  total: number;
  completed: boolean;
}

export interface SyncBootstrapProgress {
  processedThisBatch: number;
  entities: SyncBootstrapEntityProgress[];
  completed: boolean;
}

const ENTITY_SPECS: Record<MasterEntityType, EntitySpec> = {
  category: { table: 'categories', columns: ['id', 'name', 'parent_id', 'description', 'created_at'] },
  brand: { table: 'brands', columns: ['id', 'name', 'country', 'created_at'] },
  product: {
    table: 'products',
    columns: [
      'id', 'company_id', 'product_type', 'custom_unit', 'sku', 'barcode', 'name',
      'category_id', 'brand_id', 'grade', 'size', 'thickness', 'color', 'tone',
      'finish', 'surface_location', 'base_unit', 'sell_unit', 'pieces_per_box',
      'meters_per_box', 'weight_per_box', 'cost_price', 'selling_price_m2',
      'selling_price_box', 'wholesale_price_m2', 'min_selling_price_m2',
      'min_stock_level', 'max_stock_level', 'notes', 'is_active', 'created_at',
    ],
  },
  customer: {
    table: 'customers',
    columns: [
      'id', 'company_id', 'code', 'name', 'phone', 'phone2', 'national_id',
      'address', 'city', 'customer_type', 'credit_limit', 'payment_terms_days',
      'notes', 'created_at',
    ],
  },
  supplier: {
    table: 'suppliers',
    columns: [
      'id', 'company_id', 'code', 'name', 'company_name', 'phone', 'email',
      'tax_number', 'commercial_record', 'address', 'is_active',
      'payment_terms_days', 'notes', 'created_at',
    ],
  },
};

const BOOTSTRAP_ORDER: MasterEntityType[] = ['category', 'brand', 'customer', 'supplier', 'product'];

function isMasterEntityType(value: string): value is MasterEntityType {
  return Object.prototype.hasOwnProperty.call(ENTITY_SPECS, value);
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export class MasterDataSyncService {
  private static configuredIdentity: SyncIdentity | null = null;
  private readonly outbox: OutboxRepository;
  private readonly inbox: InboxRepository;
  private readonly policies: SyncPolicyService;
  private readonly businessRecords: BusinessRecordSyncService;
  private readonly dbManager: DatabaseManager;

  constructor(
    dbManager: DatabaseManager = DatabaseManager.getInstance(),
    identity?: SyncIdentity | null
  ) {
    this.dbManager = dbManager;
    this.outbox = new OutboxRepository(dbManager);
    this.inbox = new InboxRepository(dbManager);
    this.policies = new SyncPolicyService(dbManager);
    this.businessRecords = new BusinessRecordSyncService(dbManager);
    if (identity) MasterDataSyncService.configure(identity);
  }

  static configure(identity: SyncIdentity | null): void {
    if (!identity) {
      MasterDataSyncService.configuredIdentity = null;
      SyncPolicyService.configureIdentity(null);
      return;
    }
    for (const [field, value] of Object.entries(identity)) {
      if (field === 'canManagePolicies') continue;
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new TypeError(`Sync ${field} must be a non-empty string`);
      }
    }
    MasterDataSyncService.configuredIdentity = { ...identity };
    SyncPolicyService.configureIdentity({
      ...identity,
      canManagePolicies: identity.canManagePolicies === true,
    });
  }

  static isConfigured(): boolean {
    return MasterDataSyncService.configuredIdentity !== null;
  }

  getBootstrapProgress(): SyncBootstrapProgress {
    const identity = MasterDataSyncService.configuredIdentity;
    if (!identity) throw new Error('Synchronization identity is not configured');

    const entities = BOOTSTRAP_ORDER.map((entityType) => {
      const { table } = ENTITY_SPECS[entityType];
      const progress = this.dbManager.query<{ cursorId: string | null; completed: number }>(
        `SELECT cursor_id AS cursorId, completed
         FROM sync_bootstrap_progress WHERE tenant_id=? AND entity_type=?`,
        [identity.tenantId, entityType]
      )[0];
      const total = Number(this.dbManager.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM "${table}"`
      )[0]?.count ?? 0);
      const processed = progress?.cursorId
        ? Number(this.dbManager.query<{ count: number }>(
          `SELECT COUNT(*) AS count FROM "${table}" WHERE id<=?`,
          [progress.cursorId]
        )[0]?.count ?? 0)
        : 0;
      return {
        entityType,
        processed,
        total,
        completed: progress?.completed === 1,
      };
    });

    return {
      processedThisBatch: 0,
      entities,
      completed: entities.every((entity) => entity.completed),
    };
  }

  publishExistingDataBatch(batchSize = 100): SyncBootstrapProgress {
    const identity = MasterDataSyncService.configuredIdentity;
    if (!identity) throw new Error('Synchronization identity is not configured');
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
      throw new RangeError('Bootstrap batch size must be an integer between 1 and 500');
    }

    let processedThisBatch = 0;
    this.dbManager.executeTransaction((transaction) => {
      for (const entityType of BOOTSTRAP_ORDER) {
        const { table } = ENTITY_SPECS[entityType];
        let progress = transaction.query<{ cursorId: string | null; completed: number }>(
          `SELECT cursor_id AS cursorId, completed
           FROM sync_bootstrap_progress WHERE tenant_id=? AND entity_type=?`,
          [identity.tenantId, entityType]
        )[0];
        if (progress?.completed === 1) continue;

        const remaining = batchSize - processedThisBatch;
        if (remaining <= 0) break;
        const rows = transaction.query<{ id: string }>(
          `SELECT id FROM "${table}"
           WHERE (? IS NULL OR id>?)
           ORDER BY id ASC LIMIT ?`,
          [progress?.cursorId ?? null, progress?.cursorId ?? null, remaining]
        );

        if (rows.length === 0) {
          transaction.run(
            `INSERT INTO sync_bootstrap_progress (tenant_id, entity_type, cursor_id, completed)
             VALUES (?, ?, ?, 1)
             ON CONFLICT(tenant_id, entity_type) DO UPDATE SET
               completed=1, updated_at=CURRENT_TIMESTAMP`,
            [identity.tenantId, entityType, progress?.cursorId ?? null]
          );
          continue;
        }

        for (const row of rows) {
          this.capture(transaction, entityType, row.id, 'UPSERT');
          processedThisBatch++;
        }
        progress = { cursorId: rows[rows.length - 1].id, completed: 0 };
        transaction.run(
          `INSERT INTO sync_bootstrap_progress (tenant_id, entity_type, cursor_id, completed)
           VALUES (?, ?, ?, 0)
           ON CONFLICT(tenant_id, entity_type) DO UPDATE SET
             cursor_id=excluded.cursor_id, completed=0, updated_at=CURRENT_TIMESTAMP`,
          [identity.tenantId, entityType, progress.cursorId]
        );
        if (rows.length < remaining) {
          transaction.run(
            `UPDATE sync_bootstrap_progress SET completed=1, updated_at=CURRENT_TIMESTAMP
             WHERE tenant_id=? AND entity_type=?`,
            [identity.tenantId, entityType]
          );
        }
        if (processedThisBatch >= batchSize) break;
      }
    });

    return {
      ...this.getBootstrapProgress(),
      processedThisBatch,
    };
  }

  capture(
    transaction: DatabaseManager,
    entityType: MasterEntityType,
    entityId: string,
    operationType: SyncOperation
  ): string | null {
    const identity = MasterDataSyncService.configuredIdentity;
    if (!identity) return null;
    const policy = this.policies.get(entityType);
    if (!this.policies.canSend(entityType)) return null;
    if (!['CREATE', 'UPDATE', 'DELETE', 'UPSERT'].includes(operationType)) {
      throw new TypeError('Invalid master-data synchronization operation');
    }

    const spec = ENTITY_SPECS[entityType];
    if (operationType === 'DELETE') {
      return this.outbox.enqueue({
        tenantId: identity.tenantId,
        branchId: identity.branchId,
        deviceId: identity.deviceId,
        entityType,
        entityId,
        operationType,
        entityVersion: this.nextLocalVersion(transaction, identity, entityType, entityId),
        dataScope: policy.dataScope,
        payload: { deleted: true },
      });
    }

    const columns = this.availableColumns(transaction, spec);
    const row = this.readEntity(transaction, spec, columns, entityId);
    if (!row) {
      throw new Error(`Cannot enqueue ${entityType} sync event because the record does not exist: ${entityId}`);
    }

    const entityVersion = this.nextLocalVersion(transaction, identity, entityType, entityId);
    return this.outbox.enqueue({
      tenantId: identity.tenantId,
      branchId: identity.branchId,
      deviceId: identity.deviceId,
      entityType,
      entityId,
      operationType,
      entityVersion,
      dataScope: policy.dataScope,
      payload: { row },
    });
  }

  registerHandlers(dispatcher: EventDispatcher): void {
    this.policies.registerHandler(dispatcher);
    this.businessRecords.registerHandler(dispatcher);
    for (const entityType of Object.keys(ENTITY_SPECS) as MasterEntityType[]) {
      dispatcher.register(entityType, (event) => this.applyIncoming(event));
    }
  }

  listOpenConflicts(limit = 100): SyncConflict[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError('Conflict list size must be an integer between 1 and 500');
    }
    const identity = MasterDataSyncService.configuredIdentity;
    if (!identity) return [];
    return this.dbManager.query(
      `SELECT id, event_id, tenant_id, source_branch_id, entity_type, entity_id,
              remote_version, local_version, remote_payload, local_payload, reason, created_at
       FROM sync_conflicts WHERE tenant_id=? AND status='OPEN'
       ORDER BY created_at ASC, id ASC LIMIT ?`,
      [identity.tenantId, limit]
    );
  }

  resolveConflict(conflictId: string, resolution: 'KEEP_LOCAL' | 'ACCEPT_REMOTE'): void {
    const identity = MasterDataSyncService.configuredIdentity;
    if (!identity) throw new Error('Synchronization identity is not configured');
    if (!conflictId.trim()) throw new TypeError('Conflict ID is required');
    if (resolution !== 'KEEP_LOCAL' && resolution !== 'ACCEPT_REMOTE') {
      throw new TypeError('Invalid synchronization conflict resolution');
    }

    this.dbManager.executeTransaction((transaction) => {
      const conflict = transaction.query<{
        id: string;
        eventId: string;
        entityType: string;
        entityId: string;
        remoteVersion: number;
        remotePayload: string;
        status: string;
      }>(
        `SELECT id, event_id AS eventId, entity_type AS entityType, entity_id AS entityId,
                remote_version AS remoteVersion, remote_payload AS remotePayload, status
         FROM sync_conflicts WHERE id=? AND tenant_id=?`,
        [conflictId, identity.tenantId]
      )[0];
      if (!conflict || conflict.status !== 'OPEN') throw new Error('Open synchronization conflict was not found');
      if (!isMasterEntityType(conflict.entityType)) throw new Error('Conflict entity type cannot be resolved by this service');

      const event = JSON.parse(conflict.remotePayload) as SyncEvent;
      const spec = ENTITY_SPECS[conflict.entityType];
      const columns = this.availableColumns(transaction, spec);
      if (resolution === 'ACCEPT_REMOTE') {
        this.writeIncomingRow(transaction, spec, columns, event);
        this.saveVersion(
          transaction,
          identity.tenantId,
          conflict.entityType,
          conflict.entityId,
          conflict.remoteVersion,
          event.branchId
        );
        transaction.run(
          `UPDATE sync_conflicts SET status='RESOLVED_REMOTE', resolved_at=CURRENT_TIMESTAMP WHERE id=? AND status='OPEN'`,
          [conflictId]
        );
        this.logResolution(transaction, identity, event, resolution);
        this.inbox.markApplied(conflict.eventId);
        return;
      }

      const row = this.readEntity(transaction, spec, columns, conflict.entityId);
      const localVersion = this.getVersion(
        transaction,
        identity.tenantId,
        conflict.entityType,
        conflict.entityId
      )?.entityVersion ?? 0;
      const nextVersion = Math.max(localVersion, conflict.remoteVersion) + 1;
      if (row) {
        this.saveVersion(
          transaction,
          identity.tenantId,
          conflict.entityType,
          conflict.entityId,
          nextVersion,
          identity.branchId
        );
        this.outbox.enqueue({
          tenantId: identity.tenantId,
          branchId: identity.branchId,
          deviceId: identity.deviceId,
          entityType: conflict.entityType,
          entityId: conflict.entityId,
          operationType: 'UPDATE',
          entityVersion: nextVersion,
          dataScope: 'TENANT',
          payload: { row },
        });
      } else {
        this.saveVersion(
          transaction,
          identity.tenantId,
          conflict.entityType,
          conflict.entityId,
          nextVersion,
          identity.branchId
        );
        this.outbox.enqueue({
          tenantId: identity.tenantId,
          branchId: identity.branchId,
          deviceId: identity.deviceId,
          entityType: conflict.entityType,
          entityId: conflict.entityId,
          operationType: 'DELETE',
          entityVersion: nextVersion,
          dataScope: 'TENANT',
          payload: { deleted: true },
        });
      }
      transaction.run(
        `UPDATE sync_conflicts SET status='RESOLVED_LOCAL', resolved_at=CURRENT_TIMESTAMP WHERE id=? AND status='OPEN'`,
        [conflictId]
      );
      this.logResolution(transaction, identity, event, resolution);
      this.inbox.markApplied(conflict.eventId);
    });
  }

  private applyIncoming(event: SyncEvent): void | 'DEFERRED' {
    const identity = MasterDataSyncService.configuredIdentity;
    if (!identity || event.tenantId !== identity.tenantId) {
      throw new Error('Master-data sync event tenant or visibility scope is not authorized');
    }
    if (!isMasterEntityType(event.entityType)) throw new Error(`Unsupported master-data entity: ${event.entityType}`);
    const policy = this.policies.get(event.entityType);
    if (!this.policies.canReceive(event.entityType)) return 'DEFERRED';
    if (event.dataScope !== policy.dataScope) {
      throw new Error('Master-data sync event scope does not match the configured policy');
    }
    if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
      throw new Error('Master-data event payload must be an object');
    }
    const payload = event.payload as { row?: unknown; deleted?: unknown };
    const payloadKeys = Object.keys(event.payload as Record<string, unknown>);
    if (payload.deleted === true) {
      if (event.operationType !== 'DELETE' || payloadKeys.length !== 1 || payloadKeys[0] !== 'deleted') {
        throw new Error('Master-data deletion marker must match a DELETE event');
      }
    } else if (
      event.operationType === 'DELETE' ||
      payload.deleted !== undefined ||
      payloadKeys.length !== 1 ||
      payloadKeys[0] !== 'row'
    ) {
      throw new Error('Master-data row snapshot must match a non-DELETE event');
    }

    const spec = ENTITY_SPECS[event.entityType];
    const columns = this.availableColumns(this.dbManager, spec);

    this.dbManager.executeTransaction((transaction) => {
      const version = this.getVersion(transaction, identity.tenantId, event.entityType, event.entityId);
      const localRow = this.readEntity(transaction, spec, columns, event.entityId);
      const remoteRow = payload.row && typeof payload.row === 'object' && !Array.isArray(payload.row)
        ? payload.row as Record<string, unknown>
        : null;

      if (remoteRow && remoteRow.id !== event.entityId) {
        throw new Error('Master-data payload ID does not match the event');
      }
      if (payload.deleted !== true && !remoteRow) {
        throw new Error('Master-data event must contain a row snapshot or deletion marker');
      }

      if (version && event.entityVersion <= version.entityVersion) {
        if (
          event.entityVersion === version.entityVersion &&
          version.sourceBranchId === event.branchId &&
          stableJson(localRow) === stableJson(remoteRow)
        ) {
          this.inbox.markApplied(event.eventId);
          return;
        }
        this.recordConflict(transaction, identity, event, version.entityVersion, localRow, 'Stale or concurrent entity version');
        this.inbox.markApplied(event.eventId);
        return;
      }

      const expectedVersion = (version?.entityVersion ?? 0) + 1;
      if (event.entityVersion !== expectedVersion) {
        this.recordConflict(transaction, identity, event, version?.entityVersion ?? null, localRow, 'Missing prior entity version');
        this.inbox.markApplied(event.eventId);
        return;
      }

      if (localRow && !version && stableJson(localRow) !== stableJson(remoteRow)) {
        this.recordConflict(transaction, identity, event, null, localRow, 'Existing local record has no synchronization history');
        this.inbox.markApplied(event.eventId);
        return;
      }
      try {
        this.writeIncomingRow(transaction, spec, columns, event);
      } catch (error) {
        this.recordConflict(
          transaction,
          identity,
          event,
          version?.entityVersion ?? null,
          localRow,
          `Could not apply synchronized record: ${error instanceof Error ? error.message : String(error)}`
        );
        this.inbox.markApplied(event.eventId);
        return;
      }

      this.saveVersion(
        transaction,
        identity.tenantId,
        event.entityType,
        event.entityId,
        event.entityVersion,
        event.branchId
      );
      this.inbox.markApplied(event.eventId);
    });
  }

  private writeIncomingRow(
    transaction: DatabaseManager,
    spec: EntitySpec,
    columns: string[],
    event: SyncEvent
  ): void {
    const payload = event.payload as { row?: unknown; deleted?: unknown };
    if (payload.deleted === true) {
      const references = transaction.query<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      );
      for (const { name: table } of references) {
        if (table === spec.table || table.startsWith('sync_')) continue;
        const foreignKeys = transaction.query<{ table: string; from: string }>(
          `PRAGMA foreign_key_list("${table.replace(/"/g, '""')}")`
        );
        for (const foreignKey of foreignKeys) {
          if (foreignKey.table !== spec.table) continue;
          const count = transaction.query<{ count: number }>(
            `SELECT COUNT(*) AS count FROM "${table.replace(/"/g, '""')}" WHERE "${foreignKey.from.replace(/"/g, '""')}"=?`,
            [event.entityId]
          )[0]?.count ?? 0;
          if (count > 0) {
            if (columns.includes('is_active')) {
              transaction.run(`UPDATE "${spec.table}" SET is_active=0 WHERE id=?`, [event.entityId]);
              return;
            }
            throw new Error(`Record is still referenced by ${table}`);
          }
        }
      }
      transaction.run(`DELETE FROM "${spec.table}" WHERE id=?`, [event.entityId]);
      return;
    }

    const sourceRow = (payload as { row: Record<string, unknown> }).row;
    if (!sourceRow || typeof sourceRow !== 'object' || Array.isArray(sourceRow)) {
      throw new Error('Invalid synchronized row snapshot');
    }
    const allowedKeys = new Set(columns.flatMap((column) => [column, snakeToCamel(column)]));
    for (const [key, value] of Object.entries(sourceRow)) {
      if (!allowedKeys.has(key)) throw new Error(`Unexpected synchronized field: ${key}`);
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
        throw new Error(`Invalid synchronized value for field: ${key}`);
      }
    }
    const row: Record<string, unknown> = {};
    for (const column of columns) {
      const camelName = snakeToCamel(column);
      if (Object.prototype.hasOwnProperty.call(sourceRow, column)) row[column] = sourceRow[column];
      else if (Object.prototype.hasOwnProperty.call(sourceRow, camelName)) row[column] = sourceRow[camelName];
    }
    if (row.id !== event.entityId) throw new Error('Synchronized row is missing its matching ID');
    const names = Object.keys(row);
    const quoted = names.map((column) => `"${column}"`).join(', ');
    const placeholders = names.map(() => '?').join(', ');
    const updates = names.filter((column) => column !== 'id')
      .map((column) => `"${column}"=excluded."${column}"`).join(', ');
    const sql = updates
      ? `INSERT INTO "${spec.table}" (${quoted}) VALUES (${placeholders})
         ON CONFLICT(id) DO UPDATE SET ${updates}`
      : `INSERT OR IGNORE INTO "${spec.table}" (${quoted}) VALUES (${placeholders})`;
    transaction.run(sql, names.map((column) => row[column]));
  }

  private recordConflict(
    transaction: DatabaseManager,
    identity: SyncIdentity,
    event: SyncEvent,
    localVersion: number | null,
    localRow: Record<string, unknown> | null,
    reason: string
  ): void {
    transaction.run(
      `INSERT OR IGNORE INTO sync_conflicts
        (id, event_id, tenant_id, source_branch_id, entity_type, entity_id,
         remote_version, local_version, remote_payload, local_payload, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `scf_${uuidv4()}`,
        event.eventId,
        identity.tenantId,
        event.branchId,
        event.entityType,
        event.entityId,
        event.entityVersion,
        localVersion,
        JSON.stringify(event),
        localRow ? JSON.stringify(localRow) : null,
        reason.slice(0, 1000),
      ]
    );
    transaction.run(
      `INSERT INTO sync_audit_log (id, tenant_id, branch_id, device_id, action, details)
       VALUES (?, ?, ?, ?, 'CONFLICT_RECORDED', ?)`,
      [
        `sal_${uuidv4()}`,
        identity.tenantId,
        identity.branchId,
        identity.deviceId,
        JSON.stringify({ eventId: event.eventId, entityType: event.entityType, entityId: event.entityId, reason }),
      ]
    );
  }

  private logResolution(
    transaction: DatabaseManager,
    identity: SyncIdentity,
    event: SyncEvent,
    resolution: string
  ): void {
    transaction.run(
      `INSERT INTO sync_audit_log (id, tenant_id, branch_id, device_id, action, details)
       VALUES (?, ?, ?, ?, 'CONFLICT_RESOLVED', ?)`,
      [
        `sal_${uuidv4()}`,
        identity.tenantId,
        identity.branchId,
        identity.deviceId,
        JSON.stringify({ eventId: event.eventId, entityType: event.entityType, entityId: event.entityId, resolution }),
      ]
    );
  }

  private nextLocalVersion(
    transaction: DatabaseManager,
    identity: SyncIdentity,
    entityType: MasterEntityType,
    entityId: string
  ): number {
    const version = this.getVersion(transaction, identity.tenantId, entityType, entityId);
    const nextVersion = (version?.entityVersion ?? 0) + 1;
    this.saveVersion(transaction, identity.tenantId, entityType, entityId, nextVersion, identity.branchId);
    return nextVersion;
  }

  private getVersion(
    transaction: DatabaseManager,
    tenantId: string,
    entityType: string,
    entityId: string
  ): { entityVersion: number; sourceBranchId: string } | null {
    const row = transaction.query<{ entityVersion: number; sourceBranchId: string }>(
      `SELECT entity_version AS entityVersion, source_branch_id AS sourceBranchId
       FROM sync_entity_versions WHERE tenant_id=? AND entity_type=? AND entity_id=?`,
      [tenantId, entityType, entityId]
    )[0];
    return row ?? null;
  }

  private saveVersion(
    transaction: DatabaseManager,
    tenantId: string,
    entityType: string,
    entityId: string,
    entityVersion: number,
    sourceBranchId: string
  ): void {
    transaction.run(
      `INSERT INTO sync_entity_versions
        (tenant_id, entity_type, entity_id, entity_version, source_branch_id, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(tenant_id, entity_type, entity_id) DO UPDATE SET
         entity_version=excluded.entity_version,
         source_branch_id=excluded.source_branch_id,
         updated_at=CURRENT_TIMESTAMP`,
      [tenantId, entityType, entityId, entityVersion, sourceBranchId]
    );
  }

  private availableColumns(transaction: DatabaseManager, spec: EntitySpec): string[] {
    const present = new Set(
      transaction.query<{ name: string }>(`PRAGMA table_info("${spec.table}")`).map((column) => column.name)
    );
    if (!present.has('id')) throw new Error(`Sync entity table is unavailable: ${spec.table}`);
    return spec.columns.filter((column) => present.has(column));
  }

  private readEntity(
    transaction: DatabaseManager,
    spec: EntitySpec,
    columns: string[],
    entityId: string
  ): Record<string, unknown> | null {
    const result = transaction.query<Record<string, unknown>>(
      `SELECT ${columns.map((column) => `"${column}"`).join(', ')} FROM "${spec.table}" WHERE id=?`,
      [entityId]
    )[0];
    if (!result) return null;
    const row: Record<string, unknown> = {};
    for (const column of columns) {
      const camelName = snakeToCamel(column);
      row[column] = result[camelName] ?? null;
    }
    return row;
  }
}
