import { NavigationService } from '../services/domains/config/NavigationService';
import { PermissionService } from '../services/domains/auth/PermissionService';
import type { User } from '../types';

/**
 * Chooses the screen a user lands on after sign-in.
 *
 * Goal: a new cashier should start selling immediately instead of having to
 * find the POS inside a large ERP menu, while managers keep their dashboard.
 * The persisted location still wins for non-cashier roles so reloads keep
 * the user where they were.
 */
export function resolveUserLandingPath(
  user: User,
  persistedLocation?: string | null
): string {
  const accessiblePaths = NavigationService
    .getAccessibleGroups(user)
    .flatMap((group) => group.items.map((item) => item.to));
  const accessible = (path: string) => accessiblePaths.includes(path);
  const role = String(user.role ?? '').toUpperCase();

  const persisted = normalizeAppLocation(persistedLocation);
  if (persisted && role !== 'CASHIER' && isUserAllowedPath(user, persisted, accessiblePaths)) {
    return persistedLocation!;
  }

  const preferred = ROLE_HOME_CANDIDATES[role] ?? DEFAULT_HOME_CANDIDATES;
  for (const path of preferred) {
    if (accessible(path) && isUserAllowedPath(user, path, accessiblePaths)) return path;
  }

  return NavigationService.getFirstAccessiblePath(user) ?? '/dashboard';
}

const DEFAULT_HOME_CANDIDATES = ['/dashboard'];

const ROLE_HOME_CANDIDATES: Record<string, string[]> = {
  CASHIER: ['/pos', '/dashboard'],
  SALES: ['/pos', '/sales', '/dashboard'],
  WAREHOUSE: ['/inventory/hub', '/inventory', '/dashboard'],
  ACCOUNTANT: ['/finance', '/dashboard'],
  MANAGER: ['/dashboard'],
  ADMIN: ['/dashboard'],
  SUPER_ADMIN: ['/dashboard'],
};

function normalizeAppLocation(location: string | null | undefined): string | null {
  if (typeof location !== 'string') return null;
  const path = location.split(/[?#]/, 1)[0];
  if (!path.startsWith('/') || path.startsWith('//') || path === '/') return null;
  return path;
}

function isUserAllowedPath(user: User, path: string, accessiblePaths: string[]): boolean {
  const owner = accessiblePaths
    .filter((candidate) => candidate !== '/' && (path === candidate || path.startsWith(`${candidate}/`)))
    .sort((a, b) => b.length - a.length)[0];
  if (!owner) return false;
  const required = NavigationService.getRequiredPermissionGroups(path);
  if (!required) return true;
  return required.all.every((permission) => PermissionService.can(user, permission, path))
    && (!required.any.length || required.any.some((permission) => PermissionService.can(user, permission, path)));
}
