import { DatabaseManager } from '../database/db.ts';
import { OutboxRepository } from './OutboxRepository.ts';
import { InboxRepository } from './InboxRepository.ts';
import type { SyncDataScope, SyncEvent } from './types.ts';
import type { EventDispatcher } from './PullChangesService.ts';

export const SUPPORTED_SYNC_ENTITIES = [
  { entityType: 'category', label: 'التصنيفات' },
  { entityType: 'brand', label: 'الماركات' },
  { entityType: 'product', label: 'المنتجات' },
  { entityType: 'customer', label: 'العملاء' },
  { entityType: 'supplier', label: 'الموردون' },
  { entityType: 'sales_invoice', label: 'فواتير البيع (نسخ تقارير)' },
  { entityType: 'sales_return', label: 'مرتجعات البيع (نسخ تقارير)' },
  { entityType: 'purchase_invoice', label: 'فواتير الشراء (نسخ تقارير)' },
  { entityType: 'purchase_return', label: 'مرتجعات الشراء (نسخ تقارير)' },
  { entityType: 'customer_payment', label: 'المدفوعات التفصيلية (نسخ تقارير)' },
  { entityType: 'supplier_payment', label: 'سداد الموردين (نسخ تقارير)' },
  { entityType: 'stock_transfer', label: 'تحويلات المخزون (نسخ تقارير)' },
] as const;

export type SupportedSyncEntity = typeof SUPPORTED_SYNC_ENTITIES[number]['entityType'];

export interface SyncEntityPolicy {
  entityType: SupportedSyncEntity;
  enabled: boolean;
  outboundEnabled: boolean;
  inboundEnabled: boolean;
  dataScope: SyncDataScope;
  managedByHeadOffice: boolean;
  updatedAt: string;
}

const SUPPORTED_ENTITY_TYPES = new Set<string>(SUPPORTED_SYNC_ENTITIES.map((item) => item.entityType));
const REMOTE_BUSINESS_RECORD_TYPES = new Set([
  'sales_invoice',
  'sales_return',
  'purchase_invoice',
  'purchase_return',
  'customer_payment',
  'supplier_payment',
  'stock_transfer',
]);
type PolicyIdentity = { tenantId: string; branchId: string; deviceId: string; canManagePolicies: boolean };

export class SyncPolicyService {
  private static identity: PolicyIdentity | null = null;
  private readonly db: DatabaseManager;
  private readonly outbox: OutboxRepository;
  private readonly inbox: InboxRepository;

  constructor(db: DatabaseManager = DatabaseManager.getInstance()) {
    this.db = db;
    this.outbox = new OutboxRepository(db);
    this.inbox = new InboxRepository(db);
  }

  static configureIdentity(identity: PolicyIdentity | null): void {
    if (identity) {
      for (const [field, value] of Object.entries(identity)) {
        if (field === 'canManagePolicies') continue;
        if (typeof value !== 'string' || value.trim().length === 0) {
          throw new TypeError(`Sync policy ${field} must be a non-empty string`);
        }
      }
    }
    SyncPolicyService.identity = identity ? { ...identity } : null;
  }

  static isPolicyAuthority(): boolean {
    return SyncPolicyService.identity?.canManagePolicies === true;
  }

  static currentIdentity(): PolicyIdentity | null {
    return SyncPolicyService.identity ? { ...SyncPolicyService.identity } : null;
  }

  static pushGate(): { configured: boolean; authority: boolean } {
    return {
      configured: SyncPolicyService.identity !== null,
      authority: SyncPolicyService.isPolicyAuthority(),
    };
  }

  list(): SyncEntityPolicy[] {
    const rows = this.db.query<{
      entityType: string;
      enabled: number;
      outboundEnabled: number;
      inboundEnabled: number;
      dataScope: SyncDataScope;
      managedByHeadOffice: number;
      updatedAt: string;
    }>(
      `SELECT entity_type AS entityType, enabled, outbound_enabled AS outboundEnabled,
              inbound_enabled AS inboundEnabled, data_scope AS dataScope,
              managed_by_head_office AS managedByHeadOffice, updated_at AS updatedAt
       FROM sync_entity_policies ORDER BY entity_type`
    );
    return rows.map((row) => ({
      entityType: this.assertSupported(row.entityType),
      enabled: row.enabled === 1,
      outboundEnabled: row.outboundEnabled === 1,
      inboundEnabled: row.inboundEnabled === 1,
      dataScope: row.dataScope,
      managedByHeadOffice: row.managedByHeadOffice === 1,
      updatedAt: row.updatedAt,
    }));
  }

  get(entityType: string): SyncEntityPolicy {
    const type = this.assertSupported(entityType);
    const row = this.db.query<{
      enabled: number;
      outboundEnabled: number;
      inboundEnabled: number;
      dataScope: SyncDataScope;
      managedByHeadOffice: number;
      updatedAt: string;
    }>(
      `SELECT enabled, outbound_enabled AS outboundEnabled, inbound_enabled AS inboundEnabled,
              data_scope AS dataScope, managed_by_head_office AS managedByHeadOffice,
              updated_at AS updatedAt
       FROM sync_entity_policies WHERE entity_type=?`,
      [type]
    )[0];
    if (!row) {
      return {
        entityType: type, enabled: false, outboundEnabled: false, inboundEnabled: false,
        dataScope: 'BRANCH', managedByHeadOffice: false, updatedAt: '',
      };
    }
    return {
      entityType: type,
      enabled: row.enabled === 1,
      outboundEnabled: row.outboundEnabled === 1,
      inboundEnabled: row.inboundEnabled === 1,
      dataScope: row.dataScope,
      managedByHeadOffice: row.managedByHeadOffice === 1,
      updatedAt: row.updatedAt,
    };
  }

  update(input: {
    entityType: string;
    enabled: boolean;
    outboundEnabled: boolean;
    inboundEnabled: boolean;
    dataScope: SyncDataScope;
  }): SyncEntityPolicy {
    const entityType = this.assertSupported(input.entityType);
    if (typeof input.enabled !== 'boolean' || typeof input.outboundEnabled !== 'boolean' ||
        typeof input.inboundEnabled !== 'boolean') {
      throw new TypeError('Synchronization policy flags must be booleans');
    }
    if (input.dataScope !== 'TENANT' && input.dataScope !== 'BRANCH') {
      throw new TypeError('Synchronization data scope must be TENANT or BRANCH');
    }
    const identity = SyncPolicyService.identity;
    if (!identity?.canManagePolicies) {
      throw new Error('Only the configured head-office device can change organization-wide sync policies.');
    }

    this.db.executeTransaction((transaction) => {
      const currentVersion = transaction.query<{ entityVersion: number }>(
        `SELECT entity_version AS entityVersion FROM sync_entity_versions
         WHERE tenant_id=? AND entity_type='sync_policy' AND entity_id=?`,
        [identity.tenantId, entityType]
      )[0]?.entityVersion ?? 0;
      const entityVersion = currentVersion + 1;
      transaction.run(
        `INSERT INTO sync_entity_policies
          (entity_type, enabled, outbound_enabled, inbound_enabled, data_scope,
           managed_by_head_office, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(entity_type) DO UPDATE SET
           enabled=excluded.enabled,
           outbound_enabled=excluded.outbound_enabled,
           inbound_enabled=excluded.inbound_enabled,
           data_scope=excluded.data_scope,
           managed_by_head_office=1,
           updated_at=CURRENT_TIMESTAMP`,
        [entityType, Number(input.enabled), Number(input.outboundEnabled), Number(input.inboundEnabled), input.dataScope]
      );
      transaction.run(
        `INSERT INTO sync_entity_versions
          (tenant_id, entity_type, entity_id, entity_version, source_branch_id, updated_at)
         VALUES (?, 'sync_policy', ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(tenant_id, entity_type, entity_id) DO UPDATE SET
           entity_version=excluded.entity_version, source_branch_id=excluded.source_branch_id,
           updated_at=CURRENT_TIMESTAMP`,
        [identity.tenantId, entityType, entityVersion, identity.branchId]
      );
      transaction.run('DELETE FROM sync_bootstrap_progress WHERE entity_type=?', [entityType]);
      this.outbox.enqueue({
        tenantId: identity.tenantId,
        branchId: identity.branchId,
        deviceId: identity.deviceId,
        entityType: 'sync_policy',
        entityId: entityType,
        operationType: 'UPSERT',
        entityVersion,
        schemaVersion: 1,
        dataScope: 'TENANT',
        payload: {
          policy: {
            entityType,
            enabled: input.enabled,
            outboundEnabled: input.outboundEnabled,
            inboundEnabled: input.inboundEnabled,
            dataScope: input.dataScope,
          },
        },
      });
      transaction.run(
        `INSERT INTO sync_audit_log (id, action, details)
         VALUES (?, 'POLICY_UPDATED', ?)`,
        [`spol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, JSON.stringify({
          entityType,
          enabled: input.enabled,
          outboundEnabled: input.outboundEnabled,
          inboundEnabled: input.inboundEnabled,
          dataScope: input.dataScope,
        })]
      );
    });
    return this.get(entityType);
  }

  canSend(entityType: string): boolean {
    if (!SUPPORTED_ENTITY_TYPES.has(entityType)) return false;
    const policy = this.get(entityType);
    return policy.enabled && policy.outboundEnabled &&
      (policy.managedByHeadOffice || SyncPolicyService.isPolicyAuthority());
  }

  canReceive(entityType: string): boolean {
    if (!SUPPORTED_ENTITY_TYPES.has(entityType)) return false;
    const policy = this.get(entityType);
    return policy.enabled && policy.inboundEnabled &&
      (policy.managedByHeadOffice || SyncPolicyService.isPolicyAuthority());
  }

  publishUnmanagedPolicies(): number {
    if (!SyncPolicyService.isPolicyAuthority()) return 0;
    let published = 0;
    for (const policy of this.list()) {
      if (policy.managedByHeadOffice) continue;
      this.update(policy);
      published++;
    }
    return published;
  }

  registerHandler(dispatcher: EventDispatcher): void {
    dispatcher.register('sync_policy', (event) => this.applyRemote(event));
  }

  recordRemote(transaction: DatabaseManager, event: SyncEvent): void {
    const identity = SyncPolicyService.identity;
    if (!identity || !SUPPORTED_ENTITY_TYPES.has(event.entityType) ||
        !this.canReceive(event.entityType) || event.tenantId !== identity.tenantId ||
        event.dataScope !== this.get(event.entityType).dataScope ||
        !REMOTE_BUSINESS_RECORD_TYPES.has(event.entityType)) {
      throw new Error('Remote business record is not authorized by the active synchronization policy');
    }
    const serialized = JSON.stringify(event.payload);
    if (new TextEncoder().encode(serialized).length > 1024 * 1024) {
      throw new Error('Remote business record exceeds the maximum snapshot size');
    }
    transaction.run(
      `INSERT INTO sync_remote_records
        (event_id, tenant_id, source_branch_id, entity_type, entity_id, entity_version, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_id) DO NOTHING`,
      [event.eventId, identity.tenantId, event.branchId, event.entityType, event.entityId, event.entityVersion, serialized]
    );
    transaction.run(
      `INSERT INTO sync_remote_entities
        (tenant_id, source_branch_id, entity_type, entity_id, entity_version, latest_event_id, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id, source_branch_id, entity_type, entity_id) DO UPDATE SET
         entity_version=excluded.entity_version, latest_event_id=excluded.latest_event_id,
         payload=excluded.payload, updated_at=CURRENT_TIMESTAMP
       WHERE excluded.entity_version > sync_remote_entities.entity_version`,
      [identity.tenantId, event.branchId, event.entityType, event.entityId, event.entityVersion, event.eventId, serialized]
    );
    this.inbox.markApplied(event.eventId);
  }

  private applyRemote(event: SyncEvent): void {
    const identity = SyncPolicyService.identity;
    if (!identity || event.tenantId !== identity.tenantId || event.dataScope !== 'TENANT' ||
        event.operationType !== 'UPSERT' || event.entityType !== 'sync_policy') {
      throw new Error('Incoming organization sync policy is invalid or unauthorized');
    }
    const envelope = event.payload as { policy?: unknown };
    if (!envelope || typeof envelope !== 'object' || !envelope.policy ||
        typeof envelope.policy !== 'object' || Array.isArray(envelope.policy)) {
      throw new Error('Incoming organization sync policy payload is invalid');
    }
    const policy = envelope.policy as Record<string, unknown>;
    const entityType = this.assertSupported(String(policy.entityType || ''));
    if (event.entityId !== entityType || typeof policy.enabled !== 'boolean' ||
        typeof policy.outboundEnabled !== 'boolean' || typeof policy.inboundEnabled !== 'boolean' ||
        (policy.dataScope !== 'TENANT' && policy.dataScope !== 'BRANCH')) {
      throw new Error('Incoming organization sync policy fields are invalid');
    }

    this.db.executeTransaction((transaction) => {
      const currentVersion = transaction.query<{ entityVersion: number }>(
        `SELECT entity_version AS entityVersion FROM sync_entity_versions
         WHERE tenant_id=? AND entity_type='sync_policy' AND entity_id=?`,
        [identity.tenantId, entityType]
      )[0]?.entityVersion ?? 0;
      if (event.entityVersion > currentVersion) {
        transaction.run(
          `INSERT INTO sync_entity_policies
            (entity_type, enabled, outbound_enabled, inbound_enabled, data_scope,
             managed_by_head_office, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
           ON CONFLICT(entity_type) DO UPDATE SET
             enabled=excluded.enabled, outbound_enabled=excluded.outbound_enabled,
             inbound_enabled=excluded.inbound_enabled, data_scope=excluded.data_scope,
             managed_by_head_office=1, updated_at=CURRENT_TIMESTAMP`,
          [entityType, Number(policy.enabled), Number(policy.outboundEnabled), Number(policy.inboundEnabled), policy.dataScope]
        );
        transaction.run(
          `INSERT INTO sync_entity_versions
            (tenant_id, entity_type, entity_id, entity_version, source_branch_id, updated_at)
           VALUES (?, 'sync_policy', ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(tenant_id, entity_type, entity_id) DO UPDATE SET
             entity_version=excluded.entity_version, source_branch_id=excluded.source_branch_id,
             updated_at=CURRENT_TIMESTAMP`,
          [identity.tenantId, entityType, event.entityVersion, event.branchId]
        );
        transaction.run('DELETE FROM sync_bootstrap_progress WHERE entity_type=?', [entityType]);
      }
      this.inbox.markApplied(event.eventId);
    });
  }

  private assertSupported(entityType: string): SupportedSyncEntity {
    if (!SUPPORTED_ENTITY_TYPES.has(entityType)) {
      throw new Error(`Synchronization policy is not implemented for entity type: ${entityType}`);
    }
    return entityType as SupportedSyncEntity;
  }
}
