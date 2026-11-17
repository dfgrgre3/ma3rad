import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import {
  PlatformSettingsMap,
  PlatformPolicyDocument,
  PlatformPolicyRetention,
  PlatformTenantActivityConfig,
  PlatformTenantActivityInput,
  PlatformTenantActivityVersion,
} from './platformTypes';
import { nowIso, toNumber, safeJsonArray, safeJsonObject } from './platformUtils';

export class PlatformSettingsService {
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

  // ─── Platform Settings ────────────────────────────────────────────────────────

  public getSettings(): PlatformSettingsMap {
    PlatformSettingsService.requirePlatformAccess('settings', 'platform.settings.view');

    const rows = this.db.query<any>('SELECT key, value FROM platform_settings');
    const settings: PlatformSettingsMap = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  public getSetting(key: string, fallback = ''): string {
    PlatformSettingsService.requirePlatformAccess('settings', 'platform.settings.view');
    const row = this.db.query<{ value: string }>('SELECT value FROM platform_settings WHERE key = ?', [key])[0];
    return row?.value ?? fallback;
  }

  public updateSettings(input: Partial<PlatformSettingsMap>): PlatformSettingsMap {
    PlatformSettingsService.requirePlatformAccess('settings', 'platform.settings.update');

    const now = nowIso();
    const oldSettings = this.getSettings();

    for (const [key, value] of Object.entries(input)) {
      const existing = this.db.query<any>('SELECT 1 FROM platform_settings WHERE key = ?', [key])[0];
      if (existing) {
        this.db.run('UPDATE platform_settings SET value = ?, updated_at = ? WHERE key = ?', [value, now, key]);
      } else {
        this.db.run('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)', [key, value, now]);
      }
    }

    this.audit('تحديث إعدادات المنصة', 'PLATFORM_SETTINGS', null, { keys: Object.keys(input), oldValues: oldSettings, newValues: input });

    return this.getSettings();
  }

  // ─── Platform Policies ────────────────────────────────────────────────────────

  private defaultPolicyRetention(): PlatformPolicyRetention {
    return {
      auditRetentionDays: 365,
      backupRetentionDays: 90,
      syncLogRetentionDays: 30,
      softDeleteGraceDays: 30,
    };
  }

  public getPlatformPolicies(): PlatformPolicyDocument {
    PlatformSettingsService.requirePlatformAccess('policies', 'platform.policies.view');

    const rows = this.db.query<any>(
      `SELECT key, value FROM platform_settings WHERE key IN ('policy.terms', 'policy.privacy', 'policy.retention', 'policy.updated_at')`
    );
    const map = new Map(rows.map((row) => [String(row.key), String(row.value)]));

    let retention = this.defaultPolicyRetention();
    const retentionRaw = map.get('policy.retention');
    if (retentionRaw) {
      try {
        retention = { ...retention, ...(JSON.parse(retentionRaw) as Partial<PlatformPolicyRetention>) };
      } catch {
        // keep defaults
      }
    }

    return {
      terms: map.get('policy.terms') ?? '',
      privacy: map.get('policy.privacy') ?? '',
      retention,
      updatedAt: map.get('policy.updated_at') ?? nowIso(),
    };
  }

  public savePlatformPolicies(input: {
    terms?: string;
    privacy?: string;
    retention?: Partial<PlatformPolicyRetention>;
  }): PlatformPolicyDocument {
    PlatformSettingsService.requirePlatformAccess('policies', 'platform.policies.update');

    const now = nowIso();
    const oldPolicies = this.getPlatformPolicies();

    const upsert = (key: string, value: string) => {
      const existing = this.db.query<any>('SELECT 1 FROM platform_settings WHERE key = ?', [key])[0];
      if (existing) {
        this.db.run('UPDATE platform_settings SET value = ?, updated_at = ? WHERE key = ?', [value, now, key]);
      } else {
        this.db.run('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)', [key, value, now]);
      }
    };

    if (input.terms !== undefined) upsert('policy.terms', input.terms);
    if (input.privacy !== undefined) upsert('policy.privacy', input.privacy);
    if (input.retention !== undefined) {
      upsert('policy.retention', JSON.stringify({ ...oldPolicies.retention, ...input.retention }));
    }
    upsert('policy.updated_at', now);

    this.audit('حفظ سياسات المنصة', 'PLATFORM_POLICIES', null, { oldValues: oldPolicies, newValues: input });

    return this.getPlatformPolicies();
  }

  // ─── Encryption Keys ──────────────────────────────────────────────────────────

  public rotatePlatformEncryptionKeys(): { rotatedAt: string; status: string; newKeyFingerprint: string } {
    PlatformSettingsService.requirePlatformAccess('security', 'platform.security.keys');

    const now = nowIso();
    const fingerprint = `sha256:${randomBytes(32).toString('hex')}`;

    this.db.run('INSERT INTO platform_encryption_keys (id, fingerprint, status, created_at) VALUES (?, ?, ?, ?)', [`ek_${uuidv4().replace(/-/g, '').slice(0, 12)}`, fingerprint, 'ACTIVE', now]);
    this.db.run('UPDATE platform_encryption_keys SET status = \'ROTATED\' WHERE fingerprint <> ? AND status = \'ACTIVE\'', [fingerprint]);

    this.audit('تدوير مفاتيح التشفير', 'ENCRYPTION_KEYS', null, { fingerprint });

    return { rotatedAt: now, status: 'ROTATED', newKeyFingerprint: fingerprint };
  }

  // ─── Tenant Activity ──────────────────────────────────────────────────────────

  private parseJsonArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string' && value) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private parseJsonObject(value: unknown): Record<string, string> {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, string>;
    if (typeof value === 'string' && value) {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  private mapTenantActivity(row: any): PlatformTenantActivityConfig {
    return {
      tenantId: String(row.tenant_id),
      activityId: String(row.activity_id ?? ''),
      familyId: row.family_id ?? null,
      profileId: row.profile_id != null ? String(row.profile_id) : null,
      enabledModules: this.parseJsonArray(row.enabled_modules),
      customTerminology: this.parseJsonObject(row.custom_terminology),
      navigationOverrides: row.navigation_overrides ?? null,
      featuresEnabled: this.parseJsonArray(row.features_enabled),
      customAttributes: row.custom_attributes ?? null,
      version: toNumber(row.version, 1),
      createdAt: String(row.created_at),
      updatedAt: row.updated_at != null ? String(row.updated_at) : undefined,
    };
  }

  public getTenantActivity(tenantId: string): PlatformTenantActivityConfig | null {
    PlatformSettingsService.requirePlatformAccess('tenants', 'platform.tenants.view');

    const rows = this.db.query<any>('SELECT * FROM platform_tenant_activities WHERE tenant_id = ?', [tenantId]);
    const row = rows[0];
    if (!row) return null;

    return this.mapTenantActivity(row);
  }

  public saveTenantActivity(input: PlatformTenantActivityInput): PlatformTenantActivityConfig {
    PlatformSettingsService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const tenant = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [input.tenantId])[0];
    if (!tenant) throw new Error('العميل غير موجود.')

    const existing = this.getTenantActivity(input.tenantId);
    const version = (existing?.version ?? 0) + 1;
    const now = nowIso();
    const user = AuthService.getCurrentUser()!;

    const enabledModules = input.enabledModules ?? existing?.enabledModules ?? [];
    const customTerminology = input.customTerminology ?? existing?.customTerminology ?? {};
    const activityId = input.activityId || existing?.activityId || '';
    const profileId = input.profileId ?? existing?.profileId ?? null;
    const familyId = existing?.familyId ?? null;

    const snapshot = {
      activityId,
      profileId,
      enabledModules,
      customTerminology,
      navigationOverrides: existing?.navigationOverrides ?? [],
      featuresEnabled: existing?.featuresEnabled ?? [],
      customAttributes: existing?.customAttributes ?? [],
    };

    if (existing) {
      this.db.run(
        `UPDATE platform_tenant_activities
         SET activity_id = ?, family_id = ?, profile_id = ?, enabled_modules = ?, custom_terminology = ?, version = ?, updated_at = ?
         WHERE tenant_id = ?`,
        [activityId, familyId, profileId, JSON.stringify(enabledModules), JSON.stringify(customTerminology), version, now, input.tenantId]
      );
    } else {
      const id = `ta_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_tenant_activities (id, tenant_id, activity_id, family_id, profile_id, enabled_modules, custom_terminology, navigation_overrides, features_enabled, custom_attributes, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', ?, ?, ?)`,
        [id, input.tenantId, activityId, familyId, profileId, JSON.stringify(enabledModules), JSON.stringify(customTerminology), version, now, now]
      );
    }

    const versionId = `tav_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO platform_tenant_activity_versions (id, tenant_id, version, activity_id, profile_id, config_snapshot, change_summary, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [versionId, input.tenantId, version, activityId, profileId, JSON.stringify(snapshot), input.changeSummary ?? null, user.id, now]
    );

    this.audit('حفظ نشاط عميل', 'TENANT_ACTIVITY', versionId, { tenantId: input.tenantId, version });

    return this.getTenantActivity(input.tenantId)!;
  }

  public listTenantActivityVersions(tenantId: string): PlatformTenantActivityVersion[] {
    PlatformSettingsService.requirePlatformAccess('tenants', 'platform.tenants.view');

    const rows = this.db.query<any>('SELECT * FROM platform_tenant_activity_versions WHERE tenant_id = ? ORDER BY version DESC', [tenantId]);
    return rows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      version: toNumber(row.version, 1),
      activityId: String(row.activity_id ?? ''),
      profileId: row.profile_id != null ? String(row.profile_id) : null,
      config: row.config_snapshot ? JSON.parse(row.config_snapshot) : {},
      changeSummary: row.change_summary ?? null,
      createdBy: row.created_by ?? null,
      createdAt: String(row.created_at),
    }));
  }

  public rollbackTenantActivity(tenantId: string, targetVersion: number): PlatformTenantActivityConfig {
    PlatformSettingsService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const target = this.db.query<any>('SELECT * FROM platform_tenant_activity_versions WHERE tenant_id = ? AND version = ?', [tenantId, targetVersion])[0];
    if (!target) throw new Error('الإصدار الهدف غير موجود.')

    let snapshot: Record<string, any> = {};
    try {
      snapshot = target.config_snapshot ? JSON.parse(target.config_snapshot) : {};
    } catch {
      snapshot = {};
    }

    return this.saveTenantActivity({
      tenantId,
      activityId: String(snapshot.activityId ?? target.activity_id ?? ''),
      profileId: snapshot.profileId ?? (target.profile_id != null ? String(target.profile_id) : undefined),
      enabledModules: Array.isArray(snapshot.enabledModules) ? snapshot.enabledModules.map(String) : undefined,
      customTerminology: snapshot.customTerminology && typeof snapshot.customTerminology === 'object' ? snapshot.customTerminology : undefined,
      changeSummary: `استرجاع إلى الإصدار #${targetVersion}`,
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private parseValue(value: string): unknown {
    if (value === 'true') return true;
    if (value === 'false') return false;
    const num = Number(value);
    if (!isNaN(num)) return num;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}

export const platformSettingsService = new PlatformSettingsService();