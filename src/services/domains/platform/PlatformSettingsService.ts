import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import {
  PlatformSettingsMap,
  PlatformPolicySettings,
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

  public getPlatformPolicies(): PlatformPolicySettings {
    PlatformSettingsService.requirePlatformAccess('policies', 'platform.policies.view');

    const defaults: PlatformPolicySettings = {
      passwordMinLength: 8,
      passwordRequireUppercase: true,
      passwordRequireLowercase: true,
      passwordRequireNumbers: true,
      passwordRequireSymbols: true,
      passwordMaxAgeDays: 90,
      passwordHistoryCount: 5,
      sessionTimeoutMinutes: 480,
      maxConcurrentSessions: 5,
      mfaEnforcement: 'optional',
      lockoutFailedAttempts: 5,
      lockoutDurationMinutes: 15,
      requireEmailVerification: true,
      allowPasswordReset: true,
      auditRetentionDays: 365,
      dataRetentionDays: 2555,
      backupRetentionDays: 90,
      apiRateLimitPerMinute: 100,
      webhookRetryAttempts: 3,
      webhookTimeoutSeconds: 30,
    };

    const rows = this.db.query<any>('SELECT key, value FROM platform_settings WHERE key LIKE \'policy.%\'');
    for (const row of rows) {
      const key = row.key.replace('policy.', '');
      (defaults as any)[key] = this.parseValue(row.value);
    }

    return defaults;
  }

  public savePlatformPolicies(input: {
    passwordMinLength?: number;
    passwordRequireUppercase?: boolean;
    passwordRequireLowercase?: boolean;
    passwordRequireNumbers?: boolean;
    passwordRequireSymbols?: boolean;
    passwordMaxAgeDays?: number;
    passwordHistoryCount?: number;
    sessionTimeoutMinutes?: number;
    maxConcurrentSessions?: number;
    mfaEnforcement?: 'off' | 'optional' | 'required';
    lockoutFailedAttempts?: number;
    lockoutDurationMinutes?: number;
    requireEmailVerification?: boolean;
    allowPasswordReset?: boolean;
    auditRetentionDays?: number;
    dataRetentionDays?: number;
    backupRetentionDays?: number;
    apiRateLimitPerMinute?: number;
    webhookRetryAttempts?: number;
    webhookTimeoutSeconds?: number;
  }): PlatformPolicySettings {
    PlatformSettingsService.requirePlatformAccess('policies', 'platform.policies.update');

    const now = nowIso();
    const oldPolicies = this.getPlatformPolicies();

    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        const settingKey = `policy.${key}`;
        const existing = this.db.query<any>('SELECT 1 FROM platform_settings WHERE key = ?', [settingKey])[0];
        const stringValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
        if (existing) {
          this.db.run('UPDATE platform_settings SET value = ?, updated_at = ? WHERE key = ?', [stringValue, now, settingKey]);
        } else {
          this.db.run('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)', [settingKey, stringValue, now]);
        }
      }
    }

    this.audit('حفظ سياسات المنصة', 'PLATFORM_POLICIES', null, { oldValues: oldPolicies, newValues: input });

    return this.getPlatformPolicies();
  }

  // ─── Encryption Keys ──────────────────────────────────────────────────────────

  public rotatePlatformEncryptionKeys(): { rotatedAt: string; status: string; newKeyFingerprint: string } {
    PlatformSettingsService.requirePlatformAccess('security', 'platform.security.keys');

    const now = nowIso();
    const fingerprint = `sha256:${require('crypto').randomBytes(32).toString('hex')}`;

    this.db.run('INSERT INTO platform_encryption_keys (id, fingerprint, status, created_at) VALUES (?, ?, ?, ?)', [`ek_${uuidv4().replace(/-/g, '').slice(0, 12)}`, fingerprint, 'ACTIVE', now]);
    this.db.run('UPDATE platform_encryption_keys SET status = \'ROTATED\' WHERE fingerprint <> ? AND status = \'ACTIVE\'', [fingerprint]);

    this.audit('تدوير مفاتيح التشفير', 'ENCRYPTION_KEYS', null, { fingerprint });

    return { rotatedAt: now, status: 'ROTATED', newKeyFingerprint: fingerprint };
  }

  // ─── Tenant Activity ──────────────────────────────────────────────────────────

  public getTenantActivity(tenantId: string): PlatformTenantActivityConfig | null {
    PlatformSettingsService.requirePlatformAccess('tenants', 'platform.tenants.view');

    const rows = this.db.query<any>('SELECT * FROM platform_tenant_activity WHERE tenant_id = ? ORDER BY version DESC LIMIT 1', [tenantId]);
    const row = rows[0];
    if (!row) return null;

    return {
      tenantId: String(row.tenant_id),
      version: toNumber(row.version, 1),
      config: row.config ? JSON.parse(row.config) : {},
      createdAt: String(row.created_at),
      createdBy: String(row.created_by),
    };
  }

  public saveTenantActivity(input: PlatformTenantActivityInput): PlatformTenantActivityConfig {
    PlatformSettingsService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const tenant = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [input.tenantId])[0];
    if (!tenant) throw new Error('العميل غير موجود.')

    const existing = this.getTenantActivity(input.tenantId);
    const version = (existing?.version ?? 0) + 1;
    const now = nowIso();
    const user = AuthService.getCurrentUser()!;

    // Save new version
    const id = `ta_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO platform_tenant_activity (id, tenant_id, version, config, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.tenantId, version, JSON.stringify(input.config), user.id, now]
    );

    this.audit('حفظ نشاط عميل', 'TENANT_ACTIVITY', id, { tenantId: input.tenantId, version });

    return this.getTenantActivity(input.tenantId)!;
  }

  public listTenantActivityVersions(tenantId: string): PlatformTenantActivityVersion[] {
    PlatformSettingsService.requirePlatformAccess('tenants', 'platform.tenants.view');

    const rows = this.db.query<any>('SELECT * FROM platform_tenant_activity WHERE tenant_id = ? ORDER BY version DESC', [tenantId]);
    return rows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      version: toNumber(row.version, 1),
      config: row.config ? JSON.parse(row.config) : {},
      createdAt: String(row.created_at),
      createdBy: String(row.created_by),
    }));
  }

  public rollbackTenantActivity(tenantId: string, targetVersion: number): PlatformTenantActivityConfig {
    PlatformSettingsService.requirePlatformAccess('tenants', 'platform.tenants.update');

    const target = this.db.query<any>('SELECT * FROM platform_tenant_activity WHERE tenant_id = ? AND version = ?', [tenantId, targetVersion])[0];
    if (!target) throw new Error('الإصدار الهدف غير موجود.')

    const now = nowIso();
    const user = AuthService.getCurrentUser()!;
    const newVersion = (this.getTenantActivity(tenantId)?.version ?? 0) + 1;

    const id = `ta_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO platform_tenant_activity (id, tenant_id, version, config, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, tenantId, newVersion, target.config, user.id, now]
    );

    this.audit('استرجاع نشاط عميل', 'TENANT_ACTIVITY', id, { tenantId, targetVersion, newVersion });

    return this.getTenantActivity(tenantId)!;
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