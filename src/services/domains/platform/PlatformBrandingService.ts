import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import type {
  PlatformBrandingConfig,
  PlatformBrandingInput,
  PlatformBrandingVersion,
  PlatformUiProfile,
  PlatformTenantUiCustomization,
  PlatformTenantUiInput,
  PlatformTenantUiVersion,
} from './platformTypes';
import { nowIso, toNumber, safeJsonObject } from './platformUtils';

export class PlatformBrandingService {
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

  // ─── Platform Branding ────────────────────────────────────────────────────────

  public getPlatformBranding(): PlatformBrandingConfig {
    PlatformBrandingService.requirePlatformAccess('branding', 'platform.branding.view');

    const row = this.db.query<any>('SELECT * FROM platform_branding WHERE id = \'platform\'')[0];
    if (!row) {
      return this.getDefaultBranding();
    }
    return this.mapBranding(row);
  }

  public getTenantBranding(tenantId?: string | null): PlatformBrandingConfig {
    PlatformBrandingService.requirePlatformAccess('branding', 'platform.branding.view');

    if (tenantId) {
      const row = this.db.query<any>('SELECT * FROM platform_branding WHERE id = ?', [tenantId])[0];
      if (row) return this.mapBranding(row);
    }
    return this.getPlatformBranding();
  }

  public saveTenantBranding(input: PlatformBrandingInput): PlatformBrandingConfig {
    PlatformBrandingService.requirePlatformAccess('branding', 'platform.branding.update');

    const tenantId = input.tenantId ?? 'platform';
    let tenant = null;
    if (tenantId !== 'platform') {
      tenant = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [tenantId])[0];
      if (!tenant) throw new Error('العميل غير موجود.');
    }

    const now = nowIso();
    const existing = this.db.query<any>('SELECT * FROM platform_branding WHERE id = ?', [tenantId])[0];
    const version = (existing ? toNumber(existing.version, 0) : 0) + 1;

    // Save version history
    if (existing) {
      const versionId = `bv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_branding_versions (id, branding_id, version, config, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [versionId, tenantId, existing.version, JSON.stringify(this.mapBrandingToConfig(existing)), now]
      );
    }

    const config = {
      id: tenantId,
      tenantId: tenantId !== 'platform' ? tenantId : null,
      companyName: input.companyName ?? 'Ceramisys',
      logoUrl: input.logoUrl ?? null,
      logoDarkUrl: input.logoDarkUrl ?? null,
      faviconUrl: input.faviconUrl ?? null,
      primaryColor: input.primaryColor ?? '#2563eb',
      secondaryColor: input.secondaryColor ?? '#64748b',
      accentColor: input.accentColor ?? '#f59e0b',
      fontFamily: input.fontFamily ?? 'Inter',
      invoiceTemplate: { headerText: '', footerText: '', logoUrl: '', primaryColor: '#2563eb' },
      loginBackgroundUrl: input.loginBackgroundUrl ?? null,
      loginWelcomeTitle: input.loginWelcomeTitle ?? null,
      loginWelcomeSubtitle: input.loginWelcomeSubtitle ?? null,
      emailHeaderLogo: input.emailHeaderLogo ?? null,
      emailFooterText: input.emailFooterText ?? null,
      customSubdomain: input.customSubdomain ?? null,
      allowedCustomizations: {
        canChangeLogo: true,
        canChangeColors: true,
        canChangeInvoiceTemplate: true,
        canChangeLogin: true,
      },
      version,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    if (existing) {
      this.db.run(
        `UPDATE platform_branding SET version = ?, config = ?, updated_at = ? WHERE id = ?`,
        [version, JSON.stringify(config), now, tenantId]
      );
    } else {
      this.db.run(
        `INSERT INTO platform_branding (id, version, config, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [tenantId, version, JSON.stringify(config), now, now]
      );
    }

    this.audit('حفظ إعدادات العلامة التجارية', 'BRANDING', tenantId, { tenantId, version });

    return this.getTenantBranding(tenantId === 'platform' ? null : tenantId);
  }

  public listTenantBrandingVersions(tenantId?: string | null): PlatformBrandingVersion[] {
    PlatformBrandingService.requirePlatformAccess('branding', 'platform.branding.view');

    const id = tenantId ?? 'platform';
    const rows = this.db.query<any>('SELECT * FROM platform_branding_versions WHERE branding_id = ? ORDER BY version DESC', [id]);
    return rows.map((row) => ({
      id: String(row.id),
      tenantId: id === 'platform' ? null : id,
      version: toNumber(row.version, 1),
      brandingSnapshot: row.config ? JSON.parse(row.config) : this.getDefaultBranding(),
      changeSummary: row.change_summary ?? null,
      createdBy: row.created_by ?? null,
      createdAt: String(row.created_at),
    }));
  }

  public rollbackTenantBranding(tenantId: string | null | undefined, targetVersion: number): PlatformBrandingConfig {
    PlatformBrandingService.requirePlatformAccess('branding', 'platform.branding.update');

    const id = tenantId ?? 'platform';
    const target = this.db.query<any>('SELECT * FROM platform_branding_versions WHERE branding_id = ? AND version = ?', [id, targetVersion])[0];
    if (!target) throw new Error('الإصدار الهدف غير موجود.')

    const now = nowIso();
    const current = this.db.query<any>('SELECT * FROM platform_branding WHERE id = ?', [id])[0];
    const newVersion = (current ? toNumber(current.version, 0) : 0) + 1;

    // Save current as version before rollback
    if (current) {
      const versionId = `bv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_branding_versions (id, branding_id, version, config, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [versionId, id, current.version, JSON.stringify(this.mapBrandingToConfig(current)), now]
      );
    }

    this.db.run(
      `UPDATE platform_branding SET version = ?, config = ?, updated_at = ? WHERE id = ?`,
      [newVersion, target.config, now, id]
    );

    this.audit('استرجاع إعدادات العلامة التجارية', 'BRANDING', id, { targetVersion, newVersion });

    return this.getTenantBranding(id === 'platform' ? null : id);
  }

  // ─── UI Profiles ──────────────────────────────────────────────────────────────

  public listUiProfiles(): PlatformUiProfile[] {
    PlatformBrandingService.requirePlatformAccess('ui', 'platform.ui.profiles');
    const rows = this.db.query<any>('SELECT * FROM platform_ui_profiles ORDER BY name');
    return rows.map(this.mapUiProfile);
  }

  public createUiProfile(input: { name: string; description?: string; config: Record<string, unknown>; isDefault?: boolean }): PlatformUiProfile {
    PlatformBrandingService.requirePlatformAccess('ui', 'platform.ui.profiles');

    const id = `uip_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    if (input.isDefault) {
      this.db.run('UPDATE platform_ui_profiles SET is_default = 0');
    }

    this.db.run(
      `INSERT INTO platform_ui_profiles (id, name, description, config, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.name.trim(), input.description?.trim() ?? null, JSON.stringify(input.config), input.isDefault ? 1 : 0, now, now]
    );

    this.audit('إنشاء ملف واجهة', 'UI_PROFILE', id, { name: input.name });

    const row = this.db.query<any>('SELECT * FROM platform_ui_profiles WHERE id = ?', [id])[0];
    return this.mapUiProfile(row);
  }

  // ─── Tenant UI Customization ──────────────────────────────────────────────────

  public getTenantUiCustomization(tenantId: string): PlatformTenantUiCustomization {
    PlatformBrandingService.requirePlatformAccess('ui', 'platform.ui.customization');

    const row = this.db.query<any>('SELECT * FROM platform_tenant_ui WHERE tenant_id = ?', [tenantId])[0];
    if (!row) {
      return {
        id: `tui_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        tenantId,
        profileId: undefined,
        hiddenPages: [],
        hiddenActions: [],
        customLabels: {},
        navOrder: [],
        formFieldRules: {},
        version: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    }
    return this.mapTenantUi(row);
  }

  public saveTenantUiCustomization(input: PlatformTenantUiInput): PlatformTenantUiCustomization {
    PlatformBrandingService.requirePlatformAccess('ui', 'platform.ui.customization');

    const tenant = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [input.tenantId])[0];
    if (!tenant) throw new Error('العميل غير موجود.')

    const now = nowIso();
    const existing = this.db.query<any>('SELECT * FROM platform_tenant_ui WHERE tenant_id = ?', [input.tenantId])[0];
    const version = (existing ? toNumber(existing.version, 0) : 0) + 1;

    // Save version history
    if (existing) {
      const versionId = `tuv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_tenant_ui_versions (id, tenant_id, version, profile_id, overrides, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [versionId, input.tenantId, existing.version, existing.profile_id, JSON.stringify(existing.overrides), now]
      );
    }

    const customization = {
      hiddenPages: input.hiddenPages ?? [],
      hiddenActions: input.hiddenActions ?? [],
      customLabels: input.customLabels ?? {},
      navOrder: input.navOrder ?? [],
      formFieldRules: input.formFieldRules ?? {},
    };

    if (existing) {
      this.db.run(
        `UPDATE platform_tenant_ui SET version = ?, profile_id = ?, overrides = ?, updated_at = ? WHERE tenant_id = ?`,
        [version, input.profileId ?? null, JSON.stringify(customization), now, input.tenantId]
      );
    } else {
      const id = `tui_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_tenant_ui (id, tenant_id, version, profile_id, overrides, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, input.tenantId, version, input.profileId ?? null, JSON.stringify(customization), now, now]
      );
    }

    this.audit('حفظ تخصيص واجهة عميل', 'TENANT_UI', input.tenantId, { version });

    return this.getTenantUiCustomization(input.tenantId);
  }

  public listTenantUiVersions(tenantId: string): PlatformTenantUiVersion[] {
    PlatformBrandingService.requirePlatformAccess('ui', 'platform.ui.customization');

    const rows = this.db.query<any>('SELECT * FROM platform_tenant_ui_versions WHERE tenant_id = ? ORDER BY version DESC', [tenantId]);
    return rows.map((row) => {
      const overrides = row.overrides ? JSON.parse(row.overrides) : {};
      return {
        id: String(row.id),
        tenantId: String(row.tenant_id),
        version: toNumber(row.version, 1),
        configSnapshot: {
          id: String(row.id),
          tenantId: String(row.tenant_id),
          profileId: row.profile_id ?? undefined,
          hiddenPages: overrides.hiddenPages ?? [],
          hiddenActions: overrides.hiddenActions ?? [],
          customLabels: overrides.customLabels ?? {},
          navOrder: overrides.navOrder ?? [],
          formFieldRules: overrides.formFieldRules ?? {},
          version: toNumber(row.version, 1),
          createdAt: String(row.created_at),
          updatedAt: String(row.created_at),
        },
        changeSummary: row.change_summary ?? null,
        createdBy: row.created_by ?? undefined,
        createdAt: String(row.created_at),
      };
    });
  }

  public rollbackTenantUi(tenantId: string, targetVersion: number): PlatformTenantUiCustomization {
    PlatformBrandingService.requirePlatformAccess('ui', 'platform.ui.customization');

    const target = this.db.query<any>('SELECT * FROM platform_tenant_ui_versions WHERE tenant_id = ? AND version = ?', [tenantId, targetVersion])[0];
    if (!target) throw new Error('الإصدار الهدف غير موجود.')

    const now = nowIso();
    const current = this.db.query<any>('SELECT * FROM platform_tenant_ui WHERE tenant_id = ?', [tenantId])[0];
    const newVersion = (current ? toNumber(current.version, 0) : 0) + 1;

    if (current) {
      const versionId = `tuv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_tenant_ui_versions (id, tenant_id, version, profile_id, overrides, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [versionId, tenantId, current.version, current.profile_id, JSON.stringify(current.overrides), now]
      );
    }

    this.db.run(
      `UPDATE platform_tenant_ui SET version = ?, profile_id = ?, overrides = ?, updated_at = ? WHERE tenant_id = ?`,
      [newVersion, target.profile_id, target.overrides, now, tenantId]
    );

    this.audit('استرجاع تخصيص واجهة عميل', 'TENANT_UI', tenantId, { targetVersion, newVersion });

    return this.getTenantUiCustomization(tenantId);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private getDefaultBranding(): PlatformBrandingConfig {
    return {
      id: 'platform',
      tenantId: null,
      companyName: 'Ceramisys',
      logoUrl: undefined,
      logoDarkUrl: undefined,
      faviconUrl: undefined,
      primaryColor: '#2563eb',
      secondaryColor: '#64748b',
      accentColor: '#f59e0b',
      fontFamily: 'Inter',
      invoiceTemplate: 'classic',
      loginBackgroundUrl: undefined,
      loginWelcomeTitle: undefined,
      loginWelcomeSubtitle: undefined,
      emailHeaderLogo: undefined,
      emailFooterText: undefined,
      customSubdomain: undefined,
      allowedCustomizations: {
        canChangeLogo: true,
        canChangeColors: true,
        canChangeInvoiceTemplate: true,
        canChangeLogin: true,
      },
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  private mapBranding(row: any): PlatformBrandingConfig {
    const config = row.config ? JSON.parse(row.config) : {};
    return {
      id: String(row.id),
      tenantId: config.tenantId ?? null,
      companyName: config.companyName ?? 'Ceramisys',
      logoUrl: config.logoUrl ?? null,
      logoDarkUrl: config.logoDarkUrl ?? null,
      faviconUrl: config.faviconUrl ?? null,
      primaryColor: config.primaryColor ?? '#2563eb',
      secondaryColor: config.secondaryColor ?? '#64748b',
      accentColor: config.accentColor ?? '#f59e0b',
      fontFamily: config.fontFamily ?? 'Inter',
      invoiceTemplate: config.invoiceTemplate ?? 'classic',
      loginBackgroundUrl: config.loginBackgroundUrl ?? null,
      loginWelcomeTitle: config.loginWelcomeTitle ?? null,
      loginWelcomeSubtitle: config.loginWelcomeSubtitle ?? null,
      emailHeaderLogo: config.emailHeaderLogo ?? null,
      emailFooterText: config.emailFooterText ?? null,
      customSubdomain: config.customSubdomain ?? null,
      allowedCustomizations: config.allowedCustomizations ?? {
        canChangeLogo: true,
        canChangeColors: true,
        canChangeInvoiceTemplate: true,
        canChangeLogin: true,
      },
      version: toNumber(row.version, 1),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapBrandingToConfig(row: any): Record<string, unknown> {
    return row.config ? JSON.parse(row.config) : {};
  }

  private mapUiProfile(row: any): PlatformUiProfile {
    const config = row.config ? JSON.parse(row.config) : {};
    return {
      id: String(row.id),
      code: String(row.code ?? row.name),
      name: String(row.name),
      businessType: row.business_type ?? null,
      hiddenPages: config.hiddenPages ?? [],
      hiddenActions: config.hiddenActions ?? [],
      customLabels: config.customLabels ?? {},
      navOrder: config.navOrder ?? [],
      formFieldRules: config.formFieldRules ?? {},
      isDefault: Boolean(row.is_default),
      createdAt: String(row.created_at),
    };
  }

  private mapTenantUi(row: any): PlatformTenantUiCustomization {
    const overrides = row.overrides ? JSON.parse(row.overrides) : {};
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      profileId: row.profile_id ?? null,
      hiddenPages: overrides.hiddenPages ?? [],
      hiddenActions: overrides.hiddenActions ?? [],
      customLabels: overrides.customLabels ?? {},
      navOrder: overrides.navOrder ?? [],
      formFieldRules: overrides.formFieldRules ?? {},
      version: toNumber(row.version, 1),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}

export const platformBrandingService = new PlatformBrandingService();