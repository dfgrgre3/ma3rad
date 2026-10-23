import { useCallback } from 'react';
import { AuthService } from '../services/AuthService';
import { PermissionService } from '../services/PermissionService';
import type { User } from '../types';

/**
 * Returns a stable `can(code)` checker bound to the current user (or an
 * explicit one). Use it for conditional rendering of buttons and fields.
 */
export function usePermission(user?: User | null) {
  const subject = user ?? AuthService.getCurrentUser();
  return useCallback(
    (code: string) => PermissionService.can(subject, code),
    // PermissionService caches per user; role changes invalidate the cache.
    [subject?.id, subject?.role]
  );
}

export function useAnyPermission(user?: User | null) {
  const subject = user ?? AuthService.getCurrentUser();
  return useCallback(
    (codes: string[]) => PermissionService.canAny(subject, codes),
    [subject?.id, subject?.role]
  );
}
