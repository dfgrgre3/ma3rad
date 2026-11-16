import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import {
  PlatformModule,
  PlatformFeatureFlag,
  PlatformFeatureOverride,
  PlatformRelease,
  PlatformReleaseTarget,
} from './platformTypes';
import { nowIso, toNumber, safeJsonArray } from './platformUtils';

export class PlatformModuleFeatureService {
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

  // ─── Module Management ────────────────────────────────────────────────────────

  public listModules(): PlatformModule[] {
    PlatformModuleFeatureService.requirePlatformAccess('modules', 'platform.modules.view');
    const rows = this.db.query<any>('SELECT * FROM platform_modules ORDER BY sort_order, name');
    return rows.map(this.mapModule);
  }

  public listModulesForRuntime(): PlatformModule[] {
    PlatformModuleFeatureService.requirePlatformAccess('modules', 'platform.modules.view');
    const rows = this.db.query<any>('SELECT * FROM platform_modules WHERE is_active = 1 ORDER BY sort_order, name');
    return rows.map(this.mapModule);
  }

  public setModuleEnabled(id: string, enabled: boolean): void {
    PlatformModuleFeatureService.requirePlatformAccess('modules', 'platform.modules.update');

    const row = this.db.query<any>('SELECT * FROM platform_modules WHERE id = ?', [id])[0];
    if (!row) throw new Error('الوحدة غير موجودة.');

    const now = nowIso();
    this.db.run('UPDATE platform_modules SET is_active = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, now, id]);

    this.audit(enabled ? 'تفعيل وحدة' : 'تعطيل وحدة', 'MODULE', id, {});
  }

  // ─── Feature Flags ────────────────────────────────────────────────────────────

  public listFeatureFlags(): PlatformFeatureFlag[] {
    PlatformModuleFeatureService.requirePlatformAccess('features', 'platform.features.view');
    const rows = this.db.query<any>('SELECT * FROM platform_feature_flags ORDER BY name');
    return rows.map(this.mapFeatureFlag);
  }

  public listFeatureFlagsForRuntime(): PlatformFeatureFlag[] {
    PlatformModuleFeatureService.requirePlatformAccess('features', 'platform.features.view');
    const rows = this.db.query<any>('SELECT * FROM platform_feature_flags WHERE is_active = 1 ORDER BY name');
    return rows.map(this.mapFeatureFlag);
  }

  public listFeatureOverrides(featureId: string): PlatformFeatureOverride[] {
    PlatformModuleFeatureService.requirePlatformAccess('features', 'platform.features.view');
    const rows = this.db.query<any>('SELECT * FROM platform_feature_overrides WHERE feature_id = ? ORDER BY created_at DESC', [featureId]);
    return rows.map(this.mapFeatureOverride);
  }

  public setFeatureOverride(input: {
    featureId: string;
    tenantId?: string | null;
    enabled: boolean;
    rolloutPercentage?: number;
    variant?: string;
    metadata?: Record<string, unknown>;
  }): PlatformFeatureOverride {
    PlatformModuleFeatureService.requirePlatformAccess('features', 'platform.features.update');

    const feature = this.db.query<any>('SELECT * FROM platform_feature_flags WHERE id = ?', [input.featureId])[0];
    if (!feature) throw new Error('الميزة غير موجودة.');

    if (input.tenantId) {
      const tenant = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [input.tenantId])[0];
      if (!tenant) throw new Error('العميل غير موجود.');
    }

    const existing = this.db.query<any>(
      'SELECT * FROM platform_feature_overrides WHERE feature_id = ? AND (tenant_id = ? OR (tenant_id IS NULL AND ? IS NULL))',
      [input.featureId, input.tenantId ?? null, input.tenantId ?? null]
    )[0];

    const now = nowIso();

    if (existing) {
      this.db.run(
        `UPDATE platform_feature_overrides SET enabled = ?, rollout_percentage = ?, variant = ?, metadata = ?, updated_at = ?
         WHERE id = ?`,
        [input.enabled ? 1 : 0, input.rolloutPercentage ?? 100, input.variant ?? null, input.metadata ? JSON.stringify(input.metadata) : null, now, existing.id]
      );
      this.audit('تحديث تجاوز ميزة', 'FEATURE_OVERRIDE', existing.id, { featureId: input.featureId, tenantId: input.tenantId });
    } else {
      const id = `fo_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_feature_overrides (id, feature_id, tenant_id, enabled, rollout_percentage, variant, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.featureId, input.tenantId ?? null, input.enabled ? 1 : 0, input.rolloutPercentage ?? 100, input.variant ?? null, input.metadata ? JSON.stringify(input.metadata) : null, now, now]
      );
      this.audit('إنشاء تجاوز ميزة', 'FEATURE_OVERRIDE', id, { featureId: input.featureId, tenantId: input.tenantId });
    }

    const updated = this.db.query<any>('SELECT * FROM platform_feature_overrides WHERE feature_id = ? AND (tenant_id = ? OR (tenant_id IS NULL AND ? IS NULL))', [input.featureId, input.tenantId ?? null, input.tenantId ?? null])[0];
    return this.mapFeatureOverride(updated);
  }

  public removeFeatureOverride(id: string): void {
    PlatformModuleFeatureService.requirePlatformAccess('features', 'platform.features.delete');

    const row = this.db.query<any>('SELECT * FROM platform_feature_overrides WHERE id = ?', [id])[0];
    if (!row) throw new Error('التجاوز غير موجود.');

    this.db.run('DELETE FROM platform_feature_overrides WHERE id = ?', [id]);
    this.audit('إزالة تجاوز ميزة', 'FEATURE_OVERRIDE', id, {});
  }

  public upsertFeatureFlag(input: {
    key: string;
    name: string;
    description?: string;
    defaultEnabled?: boolean;
    isActive?: boolean;
    rolloutPercentage?: number;
    variant?: string;
    targetPlans?: string[];
    metadata?: Record<string, unknown>;
  }): PlatformFeatureFlag {
    PlatformModuleFeatureService.requirePlatformAccess('features', 'platform.features.create');

    const existing = this.db.query<any>('SELECT * FROM platform_feature_flags WHERE key = ?', [input.key])[0];
    const now = nowIso();

    if (existing) {
      this.db.run(
        `UPDATE platform_feature_flags SET name = ?, description = ?, default_enabled = ?, is_active = ?, rollout_percentage = ?, variant = ?, target_plans = ?, metadata = ?, updated_at = ?
         WHERE id = ?`,
        [input.name, input.description ?? null, input.defaultEnabled ? 1 : 0, input.isActive ? 1 : 0, input.rolloutPercentage ?? 100, input.variant ?? null, input.targetPlans ?? [], input.metadata ? JSON.stringify(input.metadata) : null, now, existing.id]
      );
      this.audit('تحديث علم ميزة', 'FEATURE_FLAG', existing.id, { key: input.key });
    } else {
      const id = `ff_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_feature_flags (id, key, name, description, default_enabled, is_active, rollout_percentage, variant, target_plans, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.key, input.name, input.description ?? null, input.defaultEnabled ? 1 : 0, input.isActive ? 1 : 0, input.rolloutPercentage ?? 100, input.variant ?? null, input.targetPlans ?? [], input.metadata ? JSON.stringify(input.metadata) : null, now, now]
      );
      this.audit('إنشاء علم ميزة', 'FEATURE_FLAG', id, { key: input.key });
    }

    const updated = this.db.query<any>('SELECT * FROM platform_feature_flags WHERE key = ?', [input.key])[0];
    return this.mapFeatureFlag(updated);
  }

  public setFeatureEnabled(id: string, enabled: boolean): void {
    PlatformModuleFeatureService.requirePlatformAccess('features', 'platform.features.update');

    const row = this.db.query<any>('SELECT * FROM platform_feature_flags WHERE id = ?', [id])[0];
    if (!row) throw new Error('علم الميزة غير موجود.');

    const now = nowIso();
    this.db.run('UPDATE platform_feature_flags SET is_active = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, now, id]);

    this.audit(enabled ? 'تفعيل علم ميزة' : 'تعطيل علم ميزة', 'FEATURE_FLAG', id, {});
  }

  // ─── Release Management ───────────────────────────────────────────────────────

  public listReleases(): PlatformRelease[] {
    PlatformModuleFeatureService.requirePlatformAccess('releases', 'platform.releases.view');
    const rows = this.db.query<any>('SELECT * FROM platform_releases ORDER BY created_at DESC');
    return rows.map(this.mapRelease);
  }

  public listReleaseTargets(releaseId: string): PlatformReleaseTarget[] {
    PlatformModuleFeatureService.requirePlatformAccess('releases', 'platform.releases.view');
    const rows = this.db.query<any>('SELECT * FROM platform_release_targets WHERE release_id = ? ORDER BY created_at', [releaseId]);
    return rows.map(this.mapReleaseTarget);
  }

  public setReleaseTargets(releaseId: string, tenantIds: string[]): PlatformReleaseTarget[] {
    PlatformModuleFeatureService.requirePlatformAccess('releases', 'platform.releases.update');

    const release = this.db.query<any>('SELECT * FROM platform_releases WHERE id = ?', [releaseId])[0];
    if (!release) throw new Error('الإصدار غير موجود.');

    const now = nowIso();
    this.db.run('DELETE FROM platform_release_targets WHERE release_id = ?', [releaseId]);

    const targets: PlatformReleaseTarget[] = [];
    for (const tenantId of tenantIds) {
      const tenant = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [tenantId])[0];
      if (!tenant) continue;

      const id = `rt_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_release_targets (id, release_id, tenant_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'PENDING', ?, ?)`,
        [id, releaseId, tenantId, now, now]
      );
      targets.push({
        id, releaseId, tenantId, status: 'PENDING', createdAt: now, updatedAt: now,
      });
    }

    this.audit('تعيين أهداف الإصدار', 'RELEASE', releaseId, { targetCount: targets.length });

    return targets;
  }

  public updateReleaseTargetStatus(releaseId: string, tenantId: string, status: PlatformReleaseTarget['status'], error?: string): void {
    PlatformModuleFeatureService.requirePlatformAccess('releases', 'platform.releases.update');

    const now = nowIso();
    this.db.run(
      `UPDATE platform_release_targets SET status = ?, error = ?, updated_at = ? WHERE release_id = ? AND tenant_id = ?`,
      [status, error ?? null, now, releaseId, tenantId]
    );

    this.audit('تحديث حالة هدف الإصدار', 'RELEASE_TARGET', null, { releaseId, tenantId, status });
  }

  public disableRelease(id: string): PlatformRelease {
    PlatformModuleFeatureService.requirePlatformAccess('releases', 'platform.releases.update');

    const row = this.db.query<any>('SELECT * FROM platform_releases WHERE id = ?', [id])[0];
    if (!row) throw new Error('الإصدار غير موجود.');

    const now = nowIso();
    this.db.run('UPDATE platform_releases SET is_active = 0, updated_at = ? WHERE id = ?', [now, id]);

    this.audit('تعطيل إصدار', 'RELEASE', id, {});

    const updated = this.db.query<any>('SELECT * FROM platform_releases WHERE id = ?', [id])[0];
    return this.mapRelease(updated);
  }

  public rollbackRelease(releaseId: string, safeRollbackVersion: string): PlatformRelease {
    PlatformModuleFeatureService.requirePlatformAccess('releases', 'platform.releases.update');

    const release = this.db.query<any>('SELECT * FROM platform_releases WHERE id = ?', [releaseId])[0];
    if (!release) throw new Error('الإصدار غير موجود.');

    const now = nowIso();
    this.db.run('UPDATE platform_releases SET rolled_back_to = ?, updated_at = ? WHERE id = ?', [safeRollbackVersion, now, releaseId]);

    this.audit('استرجاع إصدار', 'RELEASE', releaseId, { safeRollbackVersion });

    const updated = this.db.query<any>('SELECT * FROM platform_releases WHERE id = ?', [releaseId])[0];
    return this.mapRelease(updated);
  }

  public upsertRelease(input: {
    version: string;
    name?: string;
    description?: string;
    channel?: string;
    releaseDate?: string;
    isActive?: boolean;
    minClientVersion?: string;
    maxClientVersion?: string;
    artifactUrl?: string;
    artifactHash?: string;
    changelog?: string;
  }): PlatformRelease {
    PlatformModuleFeatureService.requirePlatformAccess('releases', 'platform.releases.create');

    const existing = this.db.query<any>('SELECT * FROM platform_releases WHERE version = ?', [input.version])[0];
    const now = nowIso();

    if (existing) {
      this.db.run(
        `UPDATE platform_releases SET name = ?, description = ?, channel = ?, release_date = ?, is_active = ?, min_client_version = ?, max_client_version = ?, artifact_url = ?, artifact_hash = ?, changelog = ?, updated_at = ?
         WHERE id = ?`,
        [input.name ?? null, input.description ?? null, input.channel ?? 'stable', input.releaseDate ?? null, input.isActive ? 1 : 0, input.minClientVersion ?? null, input.maxClientVersion ?? null, input.artifactUrl ?? null, input.artifactHash ?? null, input.changelog ?? null, now, existing.id]
      );
      this.audit('تحديث إصدار', 'RELEASE', existing.id, { version: input.version });
    } else {
      const id = `rel_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_releases (id, version, name, description, channel, release_date, is_active, min_client_version, max_client_version, artifact_url, artifact_hash, changelog, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.version, input.name ?? null, input.description ?? null, input.channel ?? 'stable', input.releaseDate ?? null, input.isActive ? 1 : 0, input.minClientVersion ?? null, input.maxClientVersion ?? null, input.artifactUrl ?? null, input.artifactHash ?? null, input.changelog ?? null, now, now]
      );
      this.audit('إنشاء إصدار', 'RELEASE', id, { version: input.version });
    }

    const updated = this.db.query<any>('SELECT * FROM platform_releases WHERE version = ?', [input.version])[0];
    return this.mapRelease(updated);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private mapModule(row: any): PlatformModule {
    return {
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      description: row.description ?? null,
      category: row.category ?? null,
      isEnabled: Boolean(row.is_active),
      isActive: Boolean(row.is_active),
      minPlanCode: row.min_plan_code ?? null,
      sortOrder: toNumber(row.sort_order, 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapFeatureFlag(row: any): PlatformFeatureFlag {
    return {
      id: String(row.id),
      key: String(row.key),
      name: String(row.name),
      description: row.description ?? null,
      defaultEnabled: Boolean(row.default_enabled),
      isActive: Boolean(row.is_active),
      rolloutPercentage: toNumber(row.rollout_percentage, 100),
      variant: row.variant ?? null,
      targetPlans: row.target_plans ? JSON.parse(row.target_plans) : [],
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapFeatureOverride(row: any): PlatformFeatureOverride {
    return {
      id: String(row.id),
      featureId: String(row.feature_id),
      tenantId: row.tenant_id ?? null,
      enabled: Boolean(row.enabled),
      rolloutPercentage: toNumber(row.rollout_percentage, 100),
      variant: row.variant ?? null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapRelease(row: any): PlatformRelease {
    return {
      id: String(row.id),
      version: String(row.version),
      name: row.name ?? null,
      description: row.description ?? null,
      channel: row.channel ?? 'STABLE',
      releaseDate: row.release_date ?? null,
      isActive: Boolean(row.is_active),
      minClientVersion: row.min_client_version ?? null,
      maxClientVersion: row.max_client_version ?? null,
      artifactUrl: row.artifact_url ?? null,
      artifactHash: row.artifact_hash ?? null,
      changelog: row.changelog ?? null,
      rolledBackTo: row.rolled_back_to ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapReleaseTarget(row: any): PlatformReleaseTarget {
    return {
      id: String(row.id),
      releaseId: String(row.release_id),
      tenantId: String(row.tenant_id),
      tenantName: row.tenant_name ?? null,
      deviceId: row.device_id ?? null,
      clientVersion: row.client_version ?? null,
      attemptCount: toNumber(row.attempt_count ?? 0),
      status: row.status,
      appliedAt: row.applied_at ?? null,
      error: row.error ?? null,
      deployedAt: row.deployed_at ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}

export const platformModuleFeatureService = new PlatformModuleFeatureService();