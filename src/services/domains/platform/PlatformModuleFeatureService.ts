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
import { nowIso, toNumber } from './platformUtils';

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
    const rows = this.db.query<any>('SELECT * FROM platform_modules WHERE is_enabled = 1 ORDER BY sort_order, name');
    return rows.map(this.mapModule);
  }

  public setModuleEnabled(id: string, enabled: boolean): void {
    PlatformModuleFeatureService.requirePlatformAccess('modules', 'platform.modules.update');

    const row = this.db.query<any>('SELECT * FROM platform_modules WHERE id = ?', [id])[0];
    if (!row) throw new Error('الوحدة غير موجودة.');

    const now = nowIso();
    this.db.run('UPDATE platform_modules SET is_enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, now, id]);

    this.audit(enabled ? 'تفعيل وحدة' : 'تعطيل وحدة', 'MODULE', id, {});
  }

  // ─── Feature Flags ────────────────────────────────────────────────────────────

  public listFeatureFlags(): PlatformFeatureFlag[] {
    PlatformModuleFeatureService.requirePlatformAccess('features', 'platform.features.view');
    const rows = this.db.query<any>('SELECT * FROM platform_feature_flags ORDER BY name');
    const overridesCount = new Map<string, number>();
    for (const row of this.db.query<any>('SELECT feature_id, COUNT(*) AS c FROM platform_feature_overrides GROUP BY feature_id')) {
      overridesCount.set(String(row.feature_id), toNumber(row.c, 0));
    }
    return rows.map((row) => ({ ...this.mapFeatureFlag(row), overridesCount: overridesCount.get(String(row.id)) ?? 0 }));
  }

  public listFeatureFlagsForRuntime(): PlatformFeatureFlag[] {
    PlatformModuleFeatureService.requirePlatformAccess('features', 'platform.features.view');
    const rows = this.db.query<any>('SELECT * FROM platform_feature_flags WHERE is_enabled = 1 ORDER BY name');
    return rows.map(this.mapFeatureFlag);
  }

  public listFeatureOverrides(featureId: string): PlatformFeatureOverride[] {
    PlatformModuleFeatureService.requirePlatformAccess('features', 'platform.features.view');
    const rows = this.db.query<any>(
      `SELECT o.*, t.name AS tenant_name, p.name AS plan_name
       FROM platform_feature_overrides o
       LEFT JOIN platform_tenants t ON o.target_type = 'TENANT' AND t.id = o.target_id
       LEFT JOIN platform_plans p ON o.target_type = 'PLAN' AND p.id = o.target_id
       WHERE o.feature_id = ? ORDER BY o.created_at DESC`,
      [featureId]
    );
    return rows.map(this.mapFeatureOverride);
  }

  public setFeatureOverride(input: {
    featureId: string;
    targetType?: 'TENANT' | 'PLAN' | 'STAGING_GROUP';
    targetId?: string | null;
    tenantId?: string | null;
    isEnabled?: boolean;
    enabled?: boolean;
    customRolloutPercent?: number | null;
    rolloutPercentage?: number;
  }): PlatformFeatureOverride {
    PlatformModuleFeatureService.requirePlatformAccess('features', 'platform.features.update');

    const feature = this.db.query<any>('SELECT * FROM platform_feature_flags WHERE id = ?', [input.featureId])[0];
    if (!feature) throw new Error('الميزة غير موجودة.');

    const targetType = input.targetType ?? (input.tenantId ? 'TENANT' : 'TENANT');
    const targetId = input.targetId ?? input.tenantId ?? null;
    if (!targetId) throw new Error('الهدف المحدد مطلوب.');
    if (targetType === 'TENANT') {
      const tenant = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [targetId])[0];
      if (!tenant) throw new Error('العميل غير موجود.');
    }

    const isEnabled = input.isEnabled ?? input.enabled ?? true;
    const customRollout = input.customRolloutPercent ?? input.rolloutPercentage ?? null;
    const now = nowIso();

    const existing = this.db.query<any>(
      'SELECT * FROM platform_feature_overrides WHERE feature_id = ? AND target_type = ? AND target_id = ?',
      [input.featureId, targetType, targetId]
    )[0];

    if (existing) {
      this.db.run(
        `UPDATE platform_feature_overrides SET is_enabled = ?, custom_rollout_percent = ?, updated_at = ? WHERE id = ?`,
        [isEnabled ? 1 : 0, customRollout, now, existing.id]
      );
      this.audit('تحديث تجاوز ميزة', 'FEATURE_OVERRIDE', existing.id, { featureId: input.featureId, targetType, targetId });
    } else {
      const id = `fo_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_feature_overrides (id, feature_id, target_type, target_id, is_enabled, custom_rollout_percent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.featureId, targetType, targetId, isEnabled ? 1 : 0, customRollout, now, now]
      );
      this.audit('إنشاء تجاوز ميزة', 'FEATURE_OVERRIDE', id, { featureId: input.featureId, targetType, targetId });
    }

    const updated = this.db.query<any>(
      `SELECT o.*, t.name AS tenant_name, p.name AS plan_name
       FROM platform_feature_overrides o
       LEFT JOIN platform_tenants t ON o.target_type = 'TENANT' AND t.id = o.target_id
       LEFT JOIN platform_plans p ON o.target_type = 'PLAN' AND p.id = o.target_id
       WHERE o.feature_id = ? AND o.target_type = ? AND o.target_id = ?`,
      [input.featureId, targetType, targetId]
    )[0];
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
    id?: string;
    key?: string;
    code?: string;
    name: string;
    description?: string;
    category?: string;
    isEnabled?: boolean;
    isActive?: boolean;
    defaultEnabled?: boolean;
    rolloutPercent?: number;
    rolloutPercentage?: number;
    isStagingOnly?: boolean;
    minPlanTier?: string | null;
  }): PlatformFeatureFlag {
    PlatformModuleFeatureService.requirePlatformAccess('features', 'platform.features.create');

    const code = (input.code ?? input.key ?? '').trim();
    if (!code) throw new Error('رمز الميزة مطلوب.');
    const isEnabled = input.isEnabled ?? input.isActive ?? input.defaultEnabled ?? true;
    const rolloutPercent = toNumber(input.rolloutPercent ?? input.rolloutPercentage, 100);
    const now = nowIso();

    const existing = input.id
      ? this.db.query<any>('SELECT * FROM platform_feature_flags WHERE id = ?', [input.id])[0]
      : this.db.query<any>('SELECT * FROM platform_feature_flags WHERE code = ?', [code])[0];

    if (existing) {
      this.db.run(
        `UPDATE platform_feature_flags SET code = ?, name = ?, description = ?, category = ?, is_enabled = ?, rollout_percent = ?, is_staging_only = ?, min_plan_tier = ?, updated_at = ?
         WHERE id = ?`,
        [code, input.name, input.description ?? null, input.category ?? null, isEnabled ? 1 : 0, rolloutPercent, input.isStagingOnly ? 1 : 0, input.minPlanTier ?? null, now, existing.id]
      );
      this.audit('تحديث علم ميزة', 'FEATURE_FLAG', existing.id, { code });
    } else {
      const id = `ff_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_feature_flags (id, code, name, description, category, is_enabled, rollout_percent, is_staging_only, min_plan_tier, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, code, input.name, input.description ?? null, input.category ?? null, isEnabled ? 1 : 0, rolloutPercent, input.isStagingOnly ? 1 : 0, input.minPlanTier ?? null, now, now]
      );
      this.audit('إنشاء علم ميزة', 'FEATURE_FLAG', id, { code });
    }

    const flagId = existing?.id ?? this.db.query<any>('SELECT id FROM platform_feature_flags WHERE code = ?', [code])[0]?.id;
    const updated = this.db.query<any>('SELECT * FROM platform_feature_flags WHERE id = ?', [flagId])[0];
    return this.mapFeatureFlag(updated);
  }

  public setFeatureEnabled(id: string, enabled: boolean): void {
    PlatformModuleFeatureService.requirePlatformAccess('features', 'platform.features.update');

    const row = this.db.query<any>('SELECT * FROM platform_feature_flags WHERE id = ?', [id])[0];
    if (!row) throw new Error('علم الميزة غير موجود.');

    const now = nowIso();
    this.db.run('UPDATE platform_feature_flags SET is_enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, now, id]);

    this.audit(enabled ? 'تفعيل علم ميزة' : 'تعطيل علم ميزة', 'FEATURE_FLAG', id, {});
  }

  // ─── Release Management ───────────────────────────────────────────────────────

  private releaseTargetsSummary(releaseId: string): Record<string, number> {
    const row = this.db.query<any>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success,
              SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN status = 'SKIPPED' THEN 1 ELSE 0 END) AS skipped
       FROM platform_release_targets WHERE release_id = ?`,
      [releaseId]
    )[0];
    return {
      total: toNumber(row?.total, 0),
      pending: toNumber(row?.pending, 0),
      success: toNumber(row?.success, 0),
      failed: toNumber(row?.failed, 0),
      skipped: toNumber(row?.skipped, 0),
    };
  }

  public listReleases(): PlatformRelease[] {
    PlatformModuleFeatureService.requirePlatformAccess('releases', 'platform.releases.view');
    const rows = this.db.query<any>('SELECT * FROM platform_releases ORDER BY created_at DESC');
    return rows.map((row) => ({
      ...this.mapRelease(row),
      targetsSummary: this.releaseTargetsSummary(String(row.id)),
    }));
  }

  public listReleaseTargets(releaseId: string): PlatformReleaseTarget[] {
    PlatformModuleFeatureService.requirePlatformAccess('releases', 'platform.releases.view');
    const rows = this.db.query<any>(
      `SELECT rt.*, t.name AS tenant_name
       FROM platform_release_targets rt
       LEFT JOIN platform_tenants t ON t.id = rt.tenant_id
       WHERE rt.release_id = ? ORDER BY rt.created_at`,
      [releaseId]
    );
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
        id, releaseId, tenantId, tenantName: tenant.name ?? null, status: 'PENDING', createdAt: now, updatedAt: now,
      });
    }

    this.audit('تعيين أهداف الإصدار', 'RELEASE', releaseId, { targetCount: targets.length });

    return targets;
  }

  public updateReleaseTargetStatus(releaseId: string, tenantId: string, status: PlatformReleaseTarget['status'], error?: string): void {
    PlatformModuleFeatureService.requirePlatformAccess('releases', 'platform.releases.update');

    const now = nowIso();
    this.db.run(
      `UPDATE platform_release_targets SET status = ?, error = ?, applied_at = ?, updated_at = ? WHERE release_id = ? AND tenant_id = ?`,
      [status, error ?? null, status === 'SUCCESS' ? now : null, now, releaseId, tenantId]
    );

    this.audit('تحديث حالة هدف الإصدار', 'RELEASE_TARGET', null, { releaseId, tenantId, status });
  }

  public disableRelease(id: string): PlatformRelease {
    PlatformModuleFeatureService.requirePlatformAccess('releases', 'platform.releases.update');

    const row = this.db.query<any>('SELECT * FROM platform_releases WHERE id = ?', [id])[0];
    if (!row) throw new Error('الإصدار غير موجود.');

    const now = nowIso();
    this.db.run(`UPDATE platform_releases SET status = 'DEPRECATED', updated_at = ? WHERE id = ?`, [now, id]);

    this.audit('تعطيل إصدار', 'RELEASE', id, {});

    const updated = this.db.query<any>('SELECT * FROM platform_releases WHERE id = ?', [id])[0];
    return { ...this.mapRelease(updated), targetsSummary: this.releaseTargetsSummary(id) };
  }

  public rollbackRelease(releaseId: string, safeRollbackVersion: string): PlatformRelease {
    PlatformModuleFeatureService.requirePlatformAccess('releases', 'platform.releases.update');

    const release = this.db.query<any>('SELECT * FROM platform_releases WHERE id = ?', [releaseId])[0];
    if (!release) throw new Error('الإصدار غير موجود.');

    const now = nowIso();
    this.db.run('UPDATE platform_releases SET rollback_version = ?, updated_at = ? WHERE id = ?', [safeRollbackVersion, now, releaseId]);

    this.audit('استرجاع إصدار', 'RELEASE', releaseId, { safeRollbackVersion });

    const updated = this.db.query<any>('SELECT * FROM platform_releases WHERE id = ?', [releaseId])[0];
    return { ...this.mapRelease(updated), targetsSummary: this.releaseTargetsSummary(releaseId) };
  }

  public upsertRelease(input: {
    id?: string;
    version: string;
    channel?: string;
    status?: string | null;
    isMandatory?: boolean | null;
    minVersion?: string | null;
    rolloutGroup?: string | null;
    notes?: string | null;
    releasedAt?: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
    checksumSha256?: string | null;
    packageSignature?: string | null;
    changelog?: string | null;
    rollbackVersion?: string | null;
    stagingGroup?: string | null;
    // Legacy aliases kept for backward compatibility
    name?: string;
    description?: string;
    releaseDate?: string;
    isActive?: boolean;
    minClientVersion?: string;
    maxClientVersion?: string;
    artifactUrl?: string;
    artifactHash?: string;
  }): PlatformRelease {
    PlatformModuleFeatureService.requirePlatformAccess('releases', 'platform.releases.create');

    const now = nowIso();
    const existing = input.id
      ? this.db.query<any>('SELECT * FROM platform_releases WHERE id = ?', [input.id])[0]
      : this.db.query<any>('SELECT * FROM platform_releases WHERE version = ?', [input.version])[0];

    const values = [
      input.version,
      input.channel ?? existing?.channel ?? 'STABLE',
      input.status ?? existing?.status ?? 'PUBLISHED',
      input.isMandatory != null ? (input.isMandatory ? 1 : 0) : (existing?.is_mandatory ?? 0),
      input.minVersion ?? existing?.min_version ?? null,
      input.rolloutGroup ?? existing?.rollout_group ?? 'ALL',
      input.notes ?? existing?.notes ?? null,
      input.releasedAt ?? existing?.released_at ?? null,
      input.fileUrl ?? existing?.file_url ?? null,
      input.fileName ?? existing?.file_name ?? null,
      input.fileSize ?? existing?.file_size ?? null,
      input.checksumSha256 ?? existing?.checksum_sha256 ?? null,
      input.packageSignature ?? existing?.package_signature ?? null,
      input.changelog ?? existing?.changelog ?? null,
      input.rollbackVersion ?? existing?.rollback_version ?? null,
      input.stagingGroup ?? existing?.staging_group ?? 'PRODUCTION',
    ];

    if (existing) {
      this.db.run(
        `UPDATE platform_releases SET version = ?, channel = ?, status = ?, is_mandatory = ?, min_version = ?, rollout_group = ?, notes = ?, released_at = ?,
           file_url = ?, file_name = ?, file_size = ?, checksum_sha256 = ?, package_signature = ?, changelog = ?, rollback_version = ?, staging_group = ?, updated_at = ?
         WHERE id = ?`,
        [...values, now, existing.id]
      );
      this.audit('تحديث إصدار', 'RELEASE', existing.id, { version: input.version });
    } else {
      const id = `rel_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_releases (id, version, channel, status, is_mandatory, min_version, rollout_group, notes, released_at,
           file_url, file_name, file_size, checksum_sha256, package_signature, changelog, rollback_version, staging_group, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, ...values, now, now]
      );
      this.audit('إنشاء إصدار', 'RELEASE', id, { version: input.version });
    }

    const releaseId = existing?.id ?? this.db.query<any>('SELECT id FROM platform_releases WHERE version = ?', [input.version])[0]?.id;
    const updated = this.db.query<any>('SELECT * FROM platform_releases WHERE id = ?', [releaseId])[0];
    return { ...this.mapRelease(updated), targetsSummary: this.releaseTargetsSummary(releaseId) };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private mapModule(row: any): PlatformModule {
    return {
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      description: row.description ?? null,
      category: row.category ?? null,
      isEnabled: Boolean(row.is_enabled),
      isActive: Boolean(row.is_enabled),
      minPlanCode: row.min_plan_code ?? null,
      sortOrder: toNumber(row.sort_order, 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapFeatureFlag(row: any): PlatformFeatureFlag {
    return {
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      description: row.description ?? null,
      category: row.category ?? null,
      isEnabled: Boolean(row.is_enabled),
      rolloutPercent: toNumber(row.rollout_percent, 100),
      isStagingOnly: Boolean(row.is_staging_only),
      minPlanTier: row.min_plan_tier ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapFeatureOverride(row: any): PlatformFeatureOverride {
    return {
      id: String(row.id),
      featureId: String(row.feature_id),
      targetType: (row.target_type as PlatformFeatureOverride['targetType']) ?? 'TENANT',
      targetId: String(row.target_id),
      targetName: row.tenant_name ?? row.plan_name ?? null,
      isEnabled: Boolean(row.is_enabled),
      customRolloutPercent: row.custom_rollout_percent != null ? toNumber(row.custom_rollout_percent, 100) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapRelease(row: any): PlatformRelease {
    return {
      id: String(row.id),
      version: String(row.version),
      channel: row.channel ?? 'STABLE',
      status: row.status ?? null,
      isMandatory: row.is_mandatory != null ? Boolean(row.is_mandatory) : null,
      minVersion: row.min_version ?? null,
      rolloutGroup: row.rollout_group ?? null,
      notes: row.notes ?? null,
      releasedAt: row.released_at ?? null,
      fileUrl: row.file_url ?? null,
      fileName: row.file_name ?? null,
      fileSize: row.file_size != null ? toNumber(row.file_size, 0) : null,
      checksumSha256: row.checksum_sha256 ?? null,
      packageSignature: row.package_signature ?? null,
      changelog: row.changelog ?? null,
      rollbackVersion: row.rollback_version ?? null,
      stagingGroup: row.staging_group ?? null,
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
