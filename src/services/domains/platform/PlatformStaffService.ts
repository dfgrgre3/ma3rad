import crypto from 'node:crypto';

import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import type {
  PlatformStaff,
  PlatformStaffInput,
  PlatformStaffRoleDefinition,
  PlatformStaffInvite,
  PlatformStaffInviteInput,
  PlatformStaffInviteCreated,
  PlatformStaffInviteStatus,
  PlatformTrustedDevice,
  PlatformStaffSession,
  PlatformStaffLogin,
  PlatformStaffDataScopeState,
  PlatformRoleMatrix,
  PlatformCentralSecurityIncident,
  PlatformSigningKey,
  PlatformCentralSecurityOverview,
} from './platformTypes';
import type { StaffServiceContext, StaffAuditOptions } from './PlatformStaffService/context';
import * as staffManagement from './PlatformStaffService/staffManagement';
import * as invites from './PlatformStaffService/invites';
import * as passwords from './PlatformStaffService/passwords';
import * as devices from './PlatformStaffService/devices';
import * as mfa from './PlatformStaffService/mfa';
import * as sessions from './PlatformStaffService/sessions';
import * as security from './PlatformStaffService/security';
import * as apiKeys from './PlatformStaffService/apiKeys';
import * as permissions from './PlatformStaffService/permissions';

export class PlatformStaffService {
  private db = DatabaseManager.getInstance();

  private readonly ctx: StaffServiceContext = {
    db: this.db,
    audit: (action, entityType, entityId, details, options) => this.audit(action, entityType, entityId, details, options),
    requirePlatformAccess: (modules, action) => PlatformStaffService.requirePlatformAccess(modules, action),
    assertOwnerRoleGrant: (role, options) => PlatformStaffService.assertOwnerRoleGrant(role, options),
    setting: (key, fallback) => this.setting(key, fallback),
    getPlatformStaff: (id) => this.getPlatformStaff(id),
    getStaffInvite: (id) => this.getStaffInvite(id),
    getStaffInviteByToken: (token) => this.getStaffInviteByToken(token),
    getStaffMfaEnforcement: () => this.getStaffMfaEnforcement(),
    listPlatformSecurityIncidents: () => this.listPlatformSecurityIncidents(),
    getStaffMfaCompliance: () => this.getStaffMfaCompliance(),
    listStaffLogins: (limit, failedOnly, staffId) => this.listStaffLogins(limit, failedOnly, staffId),
    listPlatformSigningKeys: () => this.listPlatformSigningKeys(),
    listStaffSessions: (staffId) => this.listStaffSessions(staffId),
  };

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

  private static assertOwnerRoleGrant(role: string, options: { creating?: boolean } = {}): void {
    if (String(role) !== 'SUPER_ADMIN') return;

    const actor = AuthService.getCurrentUser();
    if (!actor || actor.role !== 'SUPER_ADMIN') {
      throw new Error('منح دور مالك المنصة متاح لمالك المنصة فقط.');
    }

    if (options.creating) {
      const db = DatabaseManager.getInstance();
      const existing = db.query<any>(
        `SELECT id, full_name FROM platform_staff
         WHERE role = 'SUPER_ADMIN'
           AND (deleted_at IS NULL OR deleted_at = '')
           AND password_hash IS NOT NULL AND password_hash <> ''
         LIMIT 1`
      )[0];
      if (existing) {
        throw new Error('يوجد حساب مالك منصة بالفعل. لا يمكن إنشاء حساب ثانٍ بدور مالك المنصة.');
      }
    }
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string | null,
    details?: unknown,
    options?: StaffAuditOptions
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

  // ─── Staff Roles ──────────────────────────────────────────────────────────────

  public listPlatformStaffRoles(): PlatformStaffRoleDefinition[] {
    return staffManagement.listPlatformStaffRoles(this.ctx);
  }

  // ─── Staff Management ─────────────────────────────────────────────────────────

  public listPlatformStaff(search = '', role = '', includeDeleted = false): PlatformStaff[] {
    return staffManagement.listPlatformStaff(this.ctx, search, role, includeDeleted);
  }

  public getPlatformStaff(id: string): PlatformStaff | null {
    return staffManagement.getPlatformStaff(this.ctx, id);
  }

  public createPlatformStaff(input: PlatformStaffInput): PlatformStaff {
    return staffManagement.createPlatformStaff(this.ctx, input);
  }

  public updatePlatformStaff(id: string, input: Partial<PlatformStaffInput>): PlatformStaff {
    return staffManagement.updatePlatformStaff(this.ctx, id, input);
  }

  public setPlatformStaffActive(id: string, isActive: boolean): PlatformStaff {
    return staffManagement.setPlatformStaffActive(this.ctx, id, isActive);
  }

  public deletePlatformStaff(id: string): void {
    return staffManagement.deletePlatformStaff(this.ctx, id);
  }

  // ─── Staff Invites ────────────────────────────────────────────────────────────

  public createStaffInvite(input: PlatformStaffInviteInput): PlatformStaffInviteCreated {
    return invites.createStaffInvite(this.ctx, input);
  }

  public listStaffInvites(status: 'all' | PlatformStaffInviteStatus = 'all'): PlatformStaffInvite[] {
    return invites.listStaffInvites(this.ctx, status);
  }

  public revokeStaffInvite(id: string): void {
    return invites.revokeStaffInvite(this.ctx, id);
  }

  public getStaffInviteByToken(token: string): PlatformStaffInvite {
    return invites.getStaffInviteByToken(this.ctx, token);
  }

  public acceptStaffInvite(token: string, fullName: string, password: string): PlatformStaff {
    return invites.acceptStaffInvite(this.ctx, token, fullName, password);
  }

  public getStaffInvite(id: string): PlatformStaffInvite | null {
    return invites.getStaffInvite(this.ctx, id);
  }

  // ─── Password Management ──────────────────────────────────────────────────────

  public resetPlatformStaffPassword(id: string, newPassword: string): void {
    return passwords.resetPlatformStaffPassword(this.ctx, id, newPassword);
  }

  public forcePlatformStaffPasswordChange(id: string, flag = true): void {
    return passwords.forcePlatformStaffPasswordChange(this.ctx, id, flag);
  }

  public changeOwnStaffPassword(currentPassword: string, newPassword: string, fullName?: string): void {
    return passwords.changeOwnStaffPassword(this.ctx, currentPassword, newPassword, fullName);
  }

  // ─── Trusted Devices ──────────────────────────────────────────────────────────

  public listTrustedDevices(staffId?: string): PlatformTrustedDevice[] {
    return devices.listTrustedDevices(this.ctx, staffId);
  }

  public revokeTrustedDevice(id: string): void {
    return devices.revokeTrustedDevice(this.ctx, id);
  }

  public trustCurrentStaffDevice(deviceName?: string): void {
    return devices.trustCurrentStaffDevice(this.ctx, deviceName);
  }

  // ─── MFA Management ───────────────────────────────────────────────────────────

  public getOwnStaffMfaStatus(): { enabled: boolean; enforcement: 'off' | 'optional' | 'required' } {
    return mfa.getOwnStaffMfaStatus(this.ctx);
  }

  public getStaffMfaEnforcement(): 'off' | 'optional' | 'required' {
    return mfa.getStaffMfaEnforcement(this.ctx);
  }

  public setStaffMfaEnforcement(policy: 'off' | 'optional' | 'required'): void {
    return mfa.setStaffMfaEnforcement(this.ctx, policy);
  }

  public getStaffMfaCompliance(): {
    total: number;
    enabled: number;
    requiredButDisabled: number;
    byRole: Record<string, { total: number; enabled: number }>;
  } {
    return mfa.getStaffMfaCompliance(this.ctx);
  }

  public async startMfaEnrollmentForStaffSelf(): Promise<{ secret: string; uri: string; backupCodes: string[] }> {
    return mfa.startMfaEnrollmentForStaffSelf(this.ctx);
  }

  public async confirmMfaForStaffSelf(code: string): Promise<void> {
    return mfa.confirmMfaForStaffSelf(this.ctx, code);
  }

  public async disableMfaForStaffSelf(code: string): Promise<void> {
    return mfa.disableMfaForStaffSelf(this.ctx, code);
  }

  public resetStaffMfa(id: string): void {
    return mfa.resetStaffMfa(this.ctx, id);
  }

  // ─── Session Management ───────────────────────────────────────────────────────

  public listStaffSessions(staffId?: string): PlatformStaffSession[] {
    return sessions.listStaffSessions(this.ctx, staffId);
  }

  public revokeStaffSession(sessionId: string): void {
    return sessions.revokeStaffSession(this.ctx, sessionId);
  }

  public revokeAllOtherStaffSessions(): void {
    return sessions.revokeAllOtherStaffSessions(this.ctx);
  }

  // ─── Session Management (Extended) ────────────────────────────────────────────

  public revokeStaffSessionsForStaff(staffId: string): void {
    return sessions.revokeStaffSessionsForStaff(this.ctx, staffId);
  }

  public revokeStaffSessionsForStaff(staffId: string): void {
    return sessions.revokeStaffSessionsForStaff(this.ctx, staffId);
  }

  // ─── Login Tracking ───────────────────────────────────────────────────────────

  public listStaffLogins(limit = 100, failedOnly = false, staffId?: string): PlatformStaffLogin[] {
    return sessions.listStaffLogins(this.ctx, limit, failedOnly, staffId);
  }

  public recordStaffLoginAttempt(input: {
    staffId?: string;
    username?: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    failureReason?: string;
    mfaUsed?: boolean;
  }): void {
    return sessions.recordStaffLoginAttempt(this.ctx, input);
  }

  // ─── Security Incidents ───────────────────────────────────────────────────────

  public listPlatformSecurityIncidents(): PlatformCentralSecurityIncident[] {
    return security.listPlatformSecurityIncidents(this.ctx);
  }

  public recordSecurityIncident(input: {
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    description?: string;
    tenantId?: string;
    staffId?: string;
    deviceId?: string;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }): PlatformCentralSecurityIncident {
    return security.recordSecurityIncident(this.ctx, input);
  }

  public respondToSecurityIncident(id: string, action: string, resolve = false): PlatformCentralSecurityIncident {
    return security.respondToSecurityIncident(this.ctx, id, action, resolve);
  }

  public getSecurityIncident(id: string): PlatformCentralSecurityIncident | null {
    return security.getSecurityIncident(this.ctx, id);
  }

  // ─── Signing Keys ─────────────────────────────────────────────────────────────

  public listPlatformSigningKeys(): PlatformSigningKey[] {
    return security.listPlatformSigningKeys(this.ctx);
  }

  public async rotatePlatformSigningKey(keyAlias: string): Promise<PlatformSigningKey> {
    return security.rotatePlatformSigningKey(this.ctx, keyAlias);
  }

  // ─── Data Scope ───────────────────────────────────────────────────────────────

  public getStaffDataScope(id: string): PlatformStaffDataScopeState {
    return permissions.getStaffDataScope(this.ctx, id);
  }

  public setStaffDataScope(id: string, scope: 'ALL' | 'LIMITED', tenantIds: string[] = []): void {
    return permissions.setStaffDataScope(this.ctx, id, scope, tenantIds);
  }

  // ─── Role Permissions ─────────────────────────────────────────────────────────

  public getRolePermissionMatrix(): PlatformRoleMatrix {
    return permissions.getRolePermissionMatrix(this.ctx);
  }

  public setRolePermissions(role: string, permissionCodes: string[]): void {
    return permissions.setRolePermissions(this.ctx, role, permissionCodes);
  }

  // ─── Permissions Transfer ─────────────────────────────────────────────────────

  public transferStaffPermissions(fromStaffId: string, toStaffId: string, note?: string): PlatformStaff {
    return permissions.transferStaffPermissions(this.ctx, fromStaffId, toStaffId, note);
  }

  // ─── API Key Management ───────────────────────────────────────────────────────

  public listApiKeys(tenantId?: string): any[] {
    return apiKeys.listApiKeys(this.ctx, tenantId);
  }

  public createApiKey(input: { tenantId: string; name: string; scopes?: string[]; expiresAt?: string }): any {
    return apiKeys.createApiKey(this.ctx, input);
  }

  public revokeApiKey(id: string): void {
    return apiKeys.revokeApiKey(this.ctx, id);
  }

  public rotateApiKey(id: string): any {
    return apiKeys.rotateApiKey(this.ctx, id);
  }

  public validateApiKey(plainTextKey: string): any {
    return apiKeys.validateApiKey(this.ctx, plainTextKey);
  }

  // ─── Security Overview ────────────────────────────────────────────────────────

  public getPlatformSecurityOverview(): PlatformCentralSecurityOverview {
    return security.getPlatformSecurityOverview(this.ctx);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private setting(key: string, fallback = ''): string {
    const row = this.db.query<{ value: string }>('SELECT value FROM platform_settings WHERE key = ?', [key])[0];
    return row?.value ?? fallback;
  }

  private generateTotp(secret: string): string {
    const time = Math.floor(Date.now() / 30000);

    // Base32 decode (RFC 4648)
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    const keyBytes: number[] = [];

    for (const char of secret.toUpperCase().replace(/=+$/, '')) {
      const idx = base32Chars.indexOf(char);
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        keyBytes.push((value >> bits) & 0xff);
      }
    }

    const hmac = crypto.createHmac('sha1', Buffer.from(keyBytes));
    const timeBuffer = Buffer.allocUnsafe(8);
    timeBuffer.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
    hmac.update(timeBuffer);
    const hash = hmac.digest();
    const offset = hash[hash.length - 1] & 0xf;
    const code = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16) | ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
    return String(code % 1000000).padStart(6, '0');
  }
}

export const platformStaffService = new PlatformStaffService();
