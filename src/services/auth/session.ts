import type { User } from '../../types';

/**
 * Low-level authentication session state.
 *
 * This module intentionally has no service dependencies so that security,
 * licensing, and branch-scope helpers can read the current user without
 * importing `AuthService` (which would create a dependency cycle).
 */
let currentUser: User | null = null;

export const authSession = {
  getCurrentUser(): User | null {
    return currentUser;
  },

  /** Throws if no user is authenticated. Use at the top of every service method (brief §108). */
  requireAuth(): User {
    if (!currentUser) {
      throw new Error('يجب تسجيل الدخول لتنفيذ هذا الإجراء.');
    }
    return currentUser;
  },

  /** Sets or clears the in-memory session user. Cache invalidation stays in `AuthService`. */
  setCurrentUser(user: User | null): void {
    currentUser = user;
  },
};
