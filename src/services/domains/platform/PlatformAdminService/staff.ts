// Staff management delegations → PlatformStaffService (staff CRUD, invites,
// MFA, sessions, security incidents and signing keys).
import { platformStaffService } from '../PlatformStaffService';
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
  PlatformCentralSecurityIncident,
  PlatformSigningKey,
  PlatformCentralSecurityOverview,
  PlatformStaffDataScopeState,
  PlatformRoleMatrix,
} from '../platformTypes';

export interface StaffApi {
  // Staff Management - Delegate to PlatformStaffService
  listApiKeys(tenantId?: string): any[];
  createApiKey(input: { tenantId: string; name: string; scopes?: string[]; expiresAt?: string }): any;
  revokeApiKey(id: string): void;
  rotateApiKey(id: string): any;
  validateApiKey(plainTextKey: string): any;
  listPlatformStaffRoles(): PlatformStaffRoleDefinition[];
  listPlatformStaff(search?: string, role?: string, includeDeleted?: boolean): PlatformStaff[];
  getPlatformStaff(id: string): PlatformStaff | null;
  createPlatformStaff(input: PlatformStaffInput): PlatformStaff;
  updatePlatformStaff(id: string, input: Partial<PlatformStaffInput>): PlatformStaff;
  setPlatformStaffActive(id: string, isActive: boolean): PlatformStaff;
  deletePlatformStaff(id: string): void;
  createStaffInvite(input: PlatformStaffInviteInput): PlatformStaffInviteCreated;
  listStaffInvites(status?: 'all' | PlatformStaffInviteStatus): PlatformStaffInvite[];
  revokeStaffInvite(id: string): void;
  getStaffInviteByToken(token: string): PlatformStaffInvite;
  acceptStaffInvite(token: string, fullName: string, password: string): PlatformStaff;
  resetPlatformStaffPassword(id: string, newPassword: string): void;
  forcePlatformStaffPasswordChange(id: string, flag?: boolean): void;
  changeOwnStaffPassword(currentPassword: string, newPassword: string, fullName?: string): void;
  listTrustedDevices(staffId?: string): PlatformTrustedDevice[];
  revokeTrustedDevice(id: string): void;
  getOwnStaffMfaStatus(): { enabled: boolean; enforcement: 'off' | 'optional' | 'required' };
  revokeStaffSessionsForStaff(staffId: string): void;
  trustCurrentStaffDevice(deviceName?: string): void;
  getStaffMfaEnforcement(): 'off' | 'optional' | 'required';
  setStaffMfaEnforcement(policy: 'off' | 'optional' | 'required'): void;
  getStaffMfaCompliance(): any;
  startMfaEnrollmentForStaffSelf(): Promise<any>;
  confirmMfaForStaffSelf(code: string): Promise<void>;
  disableMfaForStaffSelf(code: string): Promise<void>;
  resetStaffMfa(id: string): void;
  transferStaffPermissions(fromStaffId: string, toStaffId: string, note?: string): PlatformStaff;
  getStaffDataScope(id: string): PlatformStaffDataScopeState;
  setStaffDataScope(id: string, scope: 'ALL' | 'LIMITED', tenantIds?: string[]): void;
  getRolePermissionMatrix(): PlatformRoleMatrix;
  setRolePermissions(role: string, permissionCodes: string[]): void;
  getPlatformSecurityOverview(): PlatformCentralSecurityOverview;
  listStaffSessions(staffId?: string): PlatformStaffSession[];
  revokeStaffSession(sessionId: string): void;
  revokeAllOtherStaffSessions(): void;
  listStaffLogins(limit?: number, failedOnly?: boolean, staffId?: string): PlatformStaffLogin[];
  recordStaffLoginAttempt(input: {
    staffId?: string;
    username?: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    failureReason?: string;
    mfaUsed?: boolean;
  }): void;
  listPlatformSecurityIncidents(): PlatformCentralSecurityIncident[];
  recordSecurityIncident(input: {
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    description?: string;
    tenantId?: string;
    staffId?: string;
    deviceId?: string;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }): PlatformCentralSecurityIncident;
  respondToSecurityIncident(id: string, action: string, resolve?: boolean): PlatformCentralSecurityIncident;
  listPlatformSigningKeys(): PlatformSigningKey[];
  rotatePlatformSigningKey(keyAlias: string): Promise<PlatformSigningKey>;
}

export function createStaffApi(): StaffApi {
  return {
    // Staff Management - Delegate to PlatformStaffService
    listApiKeys(tenantId?: string) {
      return platformStaffService.listApiKeys ? platformStaffService.listApiKeys(tenantId) : [];
    },

    createApiKey(input: { tenantId: string; name: string; scopes?: string[]; expiresAt?: string }) {
      return platformStaffService.createApiKey ? platformStaffService.createApiKey(input) : null;
    },

    revokeApiKey(id: string) {
      if (platformStaffService.revokeApiKey) platformStaffService.revokeApiKey(id);
    },

    rotateApiKey(id: string) {
      return platformStaffService.rotateApiKey ? platformStaffService.rotateApiKey(id) : null;
    },

    validateApiKey(plainTextKey: string) {
      return platformStaffService.validateApiKey ? platformStaffService.validateApiKey(plainTextKey) : null;
    },

    listPlatformStaffRoles() {
      return platformStaffService.listPlatformStaffRoles();
    },

    listPlatformStaff(search = '', role = '', includeDeleted = false) {
      return platformStaffService.listPlatformStaff(search, role, includeDeleted);
    },

    getPlatformStaff(id: string) {
      return platformStaffService.getPlatformStaff(id);
    },

    createPlatformStaff(input: PlatformStaffInput) {
      return platformStaffService.createPlatformStaff(input);
    },

    updatePlatformStaff(id: string, input: Partial<PlatformStaffInput>) {
      return platformStaffService.updatePlatformStaff(id, input);
    },

    setPlatformStaffActive(id: string, isActive: boolean) {
      return platformStaffService.setPlatformStaffActive(id, isActive);
    },

    deletePlatformStaff(id: string) {
      platformStaffService.deletePlatformStaff(id);
    },

    createStaffInvite(input: PlatformStaffInviteInput) {
      return platformStaffService.createStaffInvite(input);
    },

    listStaffInvites(status: 'all' | PlatformStaffInviteStatus = 'all') {
      return platformStaffService.listStaffInvites(status);
    },

    revokeStaffInvite(id: string) {
      platformStaffService.revokeStaffInvite(id);
    },

    getStaffInviteByToken(token: string) {
      return platformStaffService.getStaffInviteByToken(token);
    },

    acceptStaffInvite(token: string, fullName: string, password: string) {
      return platformStaffService.acceptStaffInvite(token, fullName, password);
    },

    resetPlatformStaffPassword(id: string, newPassword: string) {
      platformStaffService.resetPlatformStaffPassword(id, newPassword);
    },

    forcePlatformStaffPasswordChange(id: string, flag = true) {
      platformStaffService.forcePlatformStaffPasswordChange(id, flag);
    },

    changeOwnStaffPassword(currentPassword: string, newPassword: string, fullName?: string) {
      platformStaffService.changeOwnStaffPassword(currentPassword, newPassword, fullName);
    },

    listTrustedDevices(staffId?: string) {
      return platformStaffService.listTrustedDevices(staffId);
    },

    revokeTrustedDevice(id: string) {
      platformStaffService.revokeTrustedDevice(id);
    },

    getOwnStaffMfaStatus() {
      return platformStaffService.getOwnStaffMfaStatus();
    },

    revokeStaffSessionsForStaff(staffId: string) {
      if (platformStaffService.revokeStaffSessionsForStaff) platformStaffService.revokeStaffSessionsForStaff(staffId);
    },

    trustCurrentStaffDevice(deviceName?: string) {
      platformStaffService.trustCurrentStaffDevice(deviceName);
    },

    getStaffMfaEnforcement() {
      return platformStaffService.getStaffMfaEnforcement();
    },

    setStaffMfaEnforcement(policy: 'off' | 'optional' | 'required') {
      platformStaffService.setStaffMfaEnforcement(policy);
    },

    getStaffMfaCompliance() {
      return platformStaffService.getStaffMfaCompliance();
    },

    async startMfaEnrollmentForStaffSelf() {
      return platformStaffService.startMfaEnrollmentForStaffSelf();
    },

    async confirmMfaForStaffSelf(code: string) {
      return platformStaffService.confirmMfaForStaffSelf(code);
    },

    async disableMfaForStaffSelf(code: string) {
      return platformStaffService.disableMfaForStaffSelf(code);
    },

    resetStaffMfa(id: string) {
      platformStaffService.resetStaffMfa(id);
    },

    transferStaffPermissions(fromStaffId: string, toStaffId: string, note?: string) {
      return platformStaffService.transferStaffPermissions(fromStaffId, toStaffId, note);
    },

    getStaffDataScope(id: string) {
      return platformStaffService.getStaffDataScope(id);
    },

    setStaffDataScope(id: string, scope: 'ALL' | 'LIMITED', tenantIds: string[] = []) {
      platformStaffService.setStaffDataScope(id, scope, tenantIds);
    },

    getRolePermissionMatrix() {
      return platformStaffService.getRolePermissionMatrix();
    },

    setRolePermissions(role: string, permissionCodes: string[]) {
      platformStaffService.setRolePermissions(role, permissionCodes);
    },

    getPlatformSecurityOverview() {
      const overview = platformStaffService.getPlatformSecurityOverview ? platformStaffService.getPlatformSecurityOverview() : null;
      if (overview) return overview;
      return {
        securityScore: 0,
        twoFactorEnforcement: { enabled: false, compliantStaffCount: 0, totalStaffCount: 0 },
        activeStaffSessionsCount: 0,
        failedLogins24hCount: 0,
        activeIncidentsCount: 0,
        signingKeysCount: 0,
        trustedDevicesCount: 0,
        sessions: [],
        recentLogins: [],
        incidents: [],
        signingKeys: [],
      };
    },

    listStaffSessions(staffId?: string) {
      return platformStaffService.listStaffSessions(staffId);
    },

    revokeStaffSession(sessionId: string) {
      platformStaffService.revokeStaffSession(sessionId);
    },

    revokeAllOtherStaffSessions() {
      platformStaffService.revokeAllOtherStaffSessions();
    },

    listStaffLogins(limit = 100, failedOnly = false, staffId?: string) {
      return platformStaffService.listStaffLogins(limit, failedOnly, staffId);
    },

    recordStaffLoginAttempt(input: {
      staffId?: string;
      username?: string;
      ipAddress?: string;
      userAgent?: string;
      success: boolean;
      failureReason?: string;
      mfaUsed?: boolean;
    }) {
      platformStaffService.recordStaffLoginAttempt(input);
    },

    listPlatformSecurityIncidents() {
      return platformStaffService.listPlatformSecurityIncidents();
    },

    recordSecurityIncident(input: {
      type: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      title: string;
      description?: string;
      tenantId?: string;
      staffId?: string;
      deviceId?: string;
      ipAddress?: string;
      metadata?: Record<string, unknown>;
    }) {
      return platformStaffService.recordSecurityIncident(input);
    },

    respondToSecurityIncident(id: string, action: string, resolve = false) {
      return platformStaffService.respondToSecurityIncident(id, action, resolve);
    },

    listPlatformSigningKeys() {
      return platformStaffService.listPlatformSigningKeys();
    },

    rotatePlatformSigningKey(keyAlias: string) {
      return platformStaffService.rotatePlatformSigningKey(keyAlias);
    },
  };
}
