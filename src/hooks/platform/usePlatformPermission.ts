import { PlatformAuthorizationService } from '../../services/domains/platform/PlatformAuthorizationService';
import { PlatformStaffAuthService } from '../../services/domains/platform/PlatformStaffAuthService';
import { AuthService } from '../../services/domains/auth/AuthService';

/**
 * Canonical check for a granular platform permission code.
 * SUPER_ADMIN always passes. Otherwise the role's seeded/edited matrix (or a
 * per-staff override list) must contain the code (or the '*' wildcard).
 */
export function canPlatformPermission(code: string): boolean {
  const user = AuthService.getCurrentUser();
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  const permissionsOverride = PlatformStaffAuthService.getCurrentPermissionsOverride();
  return PlatformAuthorizationService.canAccessPermission(user.role, code, permissionsOverride);
}

/**
 * Backward-compatible module/action gate. When `action` is a granular code
 * (starts with 'platform.') it is enforced exactly; otherwise the legacy
 * module-level rules apply.
 */
export function canPlatform(moduleKey: string, action?: string): boolean {
  const user = AuthService.getCurrentUser();
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  const permissionsOverride = PlatformStaffAuthService.getCurrentPermissionsOverride();
  if (action && action.startsWith('platform.')) {
    return PlatformAuthorizationService.canAccessPermission(user.role, action, permissionsOverride)
      && PlatformAuthorizationService.canAccessModule(user.role, moduleKey, permissionsOverride);
  }
  return PlatformAuthorizationService.canAccessModule(user.role, moduleKey, permissionsOverride)
    && (!action || PlatformAuthorizationService.canAccessModule(user.role, action, permissionsOverride));
}
