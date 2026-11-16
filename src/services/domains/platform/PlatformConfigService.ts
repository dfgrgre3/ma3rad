import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import {
  PlatformConfigTemplate,
  PlatformTenantConfig,
  PlatformTenantConfigInput,
  PlatformTenantConfigVersion,
  PlatformConfigRollout,
  PlatformConfigRolloutInput,
  PlatformConfigAck,
  RolloutTargetType,
  RolloutStatus,
} from './platformTypes';
import { nowIso, toNumber, safeJsonArray, safeJsonObject } from './platformUtils';

export class PlatformConfigService {
  private db = DatabaseManager.getInstance();

  private static requirePlatformAccess(modules: string | string[], action?: string) {
    const user = AuthService.getCurrentUser();
    if (!user || !user.isActive) {
      throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    }

    if (user.role === 'SUPER_ADMIN') {
      return user;
    }

    const allowedRoles = new Set(['PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER']);
    if (!allowedRoles.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لمستخدمي المنصة المصرح لهم فقط.');
    }

    const permissionsOverride = PlatformStaffAuthService.getCurrentPermissionsOverride();
    const required = Array.isArray(modules) ? modules : [modules];
    const permitted = required.some((moduleKey) => {
      if (action && action.startsWith('platform.')) {
        return PlatformAuthorizationService.canAccessPermission(user.role, action, permissionsOverride);
      }
      return PlatformAuthorizationService.canAccessModule(user.role, moduleKey, permissionsOverride)
        && (!action || PlatformAuthorizationService.canAccessModule(user.role, action, permissionsOverride));
    });

    if (!permitted) {
      throw new Error('لا تملك صلاحية تنفيذ هذه العملية.');
    }

    return user;
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string | null,
    details?: unknown,
    options?: {
      severity?: import('./platformTypes').AuditSeverity;
      status?: import('./platformTypes').AuditStatus;
      actorType?: import('./platformTypes').AuditActorType;
      tenantId?: string | null;
      deviceId?: string | null;
      deviceName?: string | null;
      ipAddress?: string | null;
      oldValues?: unknown;
      newValues?: unknown;
      errorMessage?: string | null;
    }
  ): void {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    centralAuditService.log(actor, {
      action,
      entityType,
      entityId,
      details,
      severity: options?.severity,
      status: options?.status,
      actorType: options?.actorType,
      tenantId: options?.tenantId,
      deviceId: options?.deviceId,
      deviceName: options?.deviceName,
      ipAddress: options?.ipAddress,
      oldValues: options?.oldValues,
      newValues: options?.newValues,
      errorMessage: options?.errorMessage,
    });
  }

  // ─── Config Templates ─────────────────────────────────────────────────────────

  public listConfigTemplates(): PlatformConfigTemplate[] {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.templates');
    const rows = this.db.query<any>('SELECT * FROM platform_config_templates ORDER BY name');
    return rows.map(this.mapTemplate);
  }

  public getConfigTemplate(id: string): PlatformConfigTemplate | null {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.templates');
    const row = this.db.query<any>('SELECT * FROM platform_config_templates WHERE id = ?', [id])[0];
    return row ? this.mapTemplate(row) : null;
  }

  public createConfigTemplate(input: {
    code: string;
    name: string;
    businessType?: string;
    planId?: string;
    configPayload: Record<string, unknown>;
    isDefault?: boolean;
  }): PlatformConfigTemplate {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.templates');

    const id = `ct_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    if (input.isDefault) {
      this.db.run('UPDATE platform_config_templates SET is_default = 0');
    }

    this.db.run(
      `INSERT INTO platform_config_templates (id, code, name, business_type, plan_id, config_payload, version, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [id, input.code, input.name, input.businessType ?? null, input.planId ?? null, JSON.stringify(input.configPayload), input.isDefault ? 1 : 0, now, now]
    );

    this.audit('إنشاء قالب إعدادات', 'CONFIG_TEMPLATE', id, { name: input.name });

    const row = this.db.query<any>('SELECT * FROM platform_config_templates WHERE id = ?', [id])[0];
    return this.mapTemplate(row);
  }

  // ─── Tenant Config ────────────────────────────────────────────────────────────

  public getTenantConfig(tenantId: string): PlatformTenantConfig {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.tenant');

    const row = this.db.query<any>('SELECT * FROM platform_tenant_config WHERE tenant_id = ?', [tenantId])[0];
    if (!row) {
      return { id: `tc_${uuidv4().replace(/-/g, '').slice(0, 12)}`, tenantId, templateId: undefined, configPayload: {}, version: 0, status: 'DRAFT', createdAt: nowIso(), updatedAt: nowIso() };
    }
    return this.mapTenantConfig(row);
  }

  public saveTenantConfig(input: PlatformTenantConfigInput): PlatformTenantConfig {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.tenant');

    const tenant = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [input.tenantId])[0];
    if (!tenant) throw new Error('العميل غير موجود.')

    if (input.templateId) {
      const template = this.getConfigTemplate(input.templateId);
      if (!template) throw new Error('القالب غير موجود.')
    }

    const now = nowIso();
    const existing = this.db.query<any>('SELECT * FROM platform_tenant_config WHERE tenant_id = ?', [input.tenantId])[0];
    const version = (existing ? toNumber(existing.version, 0) : 0) + 1;

    // Save version history
    if (existing) {
      const versionId = `tcv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_tenant_config_versions (id, tenant_id, version, config_payload, signature, change_summary, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [versionId, input.tenantId, existing.version, JSON.stringify(existing.config_payload), existing.signature ?? null, 'Auto version', AuthService.getCurrentUser()?.id ?? 'system', now]
      );
    }

    const configPayload = input.configPayload ?? {};

    if (existing) {
      this.db.run(
        `UPDATE platform_tenant_config SET version = ?, template_id = ?, config_payload = ?, status = ?, updated_at = ? WHERE tenant_id = ?`,
        [version, input.templateId ?? null, JSON.stringify(configPayload), input.status ?? 'DRAFT', now, input.tenantId]
      );
    } else {
      const id = `tc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_tenant_config (id, tenant_id, version, template_id, config_payload, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.tenantId, version, input.templateId ?? null, JSON.stringify(configPayload), input.status ?? 'DRAFT', now, now]
      );
    }

    this.audit('حفظ إعدادات عميل', 'TENANT_CONFIG', input.tenantId, { version });

    return this.getTenantConfig(input.tenantId);
  }

  public listTenantConfigVersions(tenantId: string): PlatformTenantConfigVersion[] {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.tenant');

    const rows = this.db.query<any>('SELECT * FROM platform_tenant_config_versions WHERE tenant_id = ? ORDER BY version DESC', [tenantId]);
    return rows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      version: toNumber(row.version, 1),
      configPayload: row.config_payload ? JSON.parse(row.config_payload) : {},
      signature: row.signature ?? undefined,
      changeSummary: row.change_summary ?? undefined,
      createdBy: row.created_by ?? undefined,
      createdAt: String(row.created_at),
    }));
  }

  public rollbackTenantConfig(tenantId: string, targetVersion: number): PlatformTenantConfig {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.tenant');

    const target = this.db.query<any>('SELECT * FROM platform_tenant_config_versions WHERE tenant_id = ? AND version = ?', [tenantId, targetVersion])[0];
    if (!target) throw new Error('الإصدار الهدف غير موجود.')

    const now = nowIso();
    const current = this.db.query<any>('SELECT * FROM platform_tenant_config WHERE tenant_id = ?', [tenantId])[0];
    const newVersion = (current ? toNumber(current.version, 0) : 0) + 1;

    if (current) {
      const versionId = `tcv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_tenant_config_versions (id, tenant_id, version, config_payload, signature, change_summary, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [versionId, tenantId, current.version, JSON.stringify(current.config_payload), current.signature ?? null, 'Rollback version', AuthService.getCurrentUser()?.id ?? 'system', now]
      );
    }

    this.db.run(
      `UPDATE platform_tenant_config SET version = ?, config_payload = ?, updated_at = ? WHERE tenant_id = ?`,
      [newVersion, target.config_payload, now, tenantId]
    );

    this.audit('استرجاع إعدادات عميل', 'TENANT_CONFIG', tenantId, { targetVersion, newVersion });

    return this.getTenantConfig(tenantId);
  }

  // ─── Config Rollouts ──────────────────────────────────────────────────────────

  public createConfigRollout(input: PlatformConfigRolloutInput): PlatformConfigRollout {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.rollout');

    const template = this.getConfigTemplate(input.templateId);
    if (!template) throw new Error('القالب غير موجود.');

    const now = nowIso();
    const id = `cr_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

    this.db.run(
      `INSERT INTO platform_config_rollouts (id, title, target_type, target_filter, config_snapshot, signature, status, total_tenants, received_count, applied_count, failed_count, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', 0, 0, 0, 0, ?, ?, ?)`,
      [id, input.name, input.targetType, JSON.stringify(input.targetIds ?? {}), JSON.stringify(template.defaultValues), AuthService.getCurrentUser()?.id ?? 'system', AuthService.getCurrentUser()?.id ?? 'system', now, now]
    );

    this.audit('إنشاء طرح إعدادات', 'CONFIG_ROLLOUT', id, { targetType: input.targetType });

    const row = this.db.query<any>('SELECT * FROM platform_config_rollouts WHERE id = ?', [id])[0];
    return this.mapRollout(row);
  }

  public listConfigRollouts(): PlatformConfigRollout[] {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.rollout');
    const rows = this.db.query<any>('SELECT * FROM platform_config_rollouts ORDER BY created_at DESC');
    return rows.map(this.mapRollout);
  }

  public getConfigRollout(id: string): PlatformConfigRollout | null {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.rollout');
    const row = this.db.query<any>('SELECT * FROM platform_config_rollouts WHERE id = ?', [id])[0];
    return row ? this.mapRollout(row) : null;
  }

  public startConfigRollout(id: string): PlatformConfigRollout {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.rollout');

    const rollout = this.getConfigRollout(id);
    if (!rollout) throw new Error('الطرح غير موجود.')

    const now = nowIso();
    this.db.run('UPDATE platform_config_rollouts SET status = \'IN_PROGRESS\', updated_at = ? WHERE id = ?', [now, id]);

    this.audit('بدء طرح إعدادات', 'CONFIG_ROLLOUT', id, {});

    const updated = this.getConfigRollout(id)!;
    return updated;
  }

  public completeConfigRollout(id: string): PlatformConfigRollout {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.rollout');

    const rollout = this.getConfigRollout(id);
    if (!rollout) throw new Error('الطرح غير موجود.')

    const now = nowIso();
    this.db.run('UPDATE platform_config_rollouts SET status = \'COMPLETED\', completed_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);

    this.audit('اكتمال طرح إعدادات', 'CONFIG_ROLLOUT', id, {});

    const updated = this.getConfigRollout(id)!;
    return updated;
  }

  public cancelConfigRollout(id: string): PlatformConfigRollout {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.rollout');

    const rollout = this.getConfigRollout(id);
    if (!rollout) throw new Error('الطرح غير موجود.')

    const now = nowIso();
    this.db.run('UPDATE platform_config_rollouts SET status = \'CANCELLED\', updated_at = ? WHERE id = ?', [now, id]);

    this.audit('إلغاء طرح إعدادات', 'CONFIG_ROLLOUT', id, {});

    const updated = this.getConfigRollout(id)!;
    return updated;
  }

  // ─── Config Acknowledgments ───────────────────────────────────────────────────

  public listConfigAcks(tenantId?: string): PlatformConfigAck[] {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.acks');

    const where = tenantId ? 'WHERE tenant_id = ?' : '';
    const params = tenantId ? [tenantId] : [];

    const rows = this.db.query<any>(`SELECT * FROM platform_config_acks ${where} ORDER BY created_at DESC`, params);
    return rows.map(this.mapAck);
  }

  public acknowledgeConfig(input: { tenantId: string; rolloutId: string; version: number; deviceId?: string; status: 'RECEIVED' | 'APPLIED' | 'FAILED'; errorMessage?: string }): PlatformConfigAck {
    PlatformConfigService.requirePlatformAccess('config', 'platform.config.acks');

    const id = `ca_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_config_acks (id, tenant_id, device_id, rollout_id, version, status, error_message, acknowledged_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.tenantId, input.deviceId ?? null, input.rolloutId, input.version, input.status, input.errorMessage ?? null, now, now]
    );

    this.audit('إقرار إعدادات', 'CONFIG_ACK', id, { tenantId: input.tenantId, rolloutId: input.rolloutId });

    const row = this.db.query<any>('SELECT * FROM platform_config_acks WHERE id = ?', [id])[0];
    return this.mapAck(row);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private mapTemplate(row: any): PlatformConfigTemplate {
    return {
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      description: row.description ?? null,
      schema: row.schema ? JSON.parse(row.schema) : {},
      defaultValues: row.default_values ? JSON.parse(row.default_values) : {},
      category: row.category ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapTenantConfig(row: any): PlatformTenantConfig {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      templateId: row.template_id ?? undefined,
      configPayload: row.config_payload ? JSON.parse(row.config_payload) : {},
      signature: row.signature ?? undefined,
      version: toNumber(row.version, 1),
      status: row.status,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapRollout(row: any): PlatformConfigRollout {
    return {
      id: String(row.id),
      title: String(row.title),
      targetType: row.target_type,
      targetFilter: row.target_filter ? JSON.parse(row.target_filter) : {},
      configSnapshot: row.config_snapshot ? JSON.parse(row.config_snapshot) : {},
      signature: String(row.signature),
      status: row.status,
      totalTenants: toNumber(row.total_tenants, 0),
      receivedCount: toNumber(row.received_count, 0),
      appliedCount: toNumber(row.applied_count, 0),
      failedCount: toNumber(row.failed_count, 0),
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      completedAt: row.completed_at ?? undefined,
    };
  }

  private mapAck(row: any): PlatformConfigAck {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      deviceId: row.device_id ?? undefined,
      rolloutId: row.rollout_id ?? undefined,
      version: toNumber(row.version, 1),
      status: row.status,
      errorMessage: row.error_message ?? undefined,
      acknowledgedAt: String(row.acknowledged_at),
    };
  }
}

export const platformConfigService = new PlatformConfigService();