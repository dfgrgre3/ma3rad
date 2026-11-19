/** Raised when the password was correct but a second factor is required. */
export class TwoFactorRequiredError extends Error {
  readonly code = 'TWO_FACTOR_REQUIRED';
  readonly username: string;

  constructor(username: string) {
    super('أدخل رمز التحقق الثنائي لإكمال تسجيل الدخول.');
    this.name = 'TwoFactorRequiredError';
    this.username = username;
  }

}

// Use sessionStorage instead of localStorage for session data (cleared on tab close)
export const SESSION_KEY = 'ceramisys_session_user_id';
export const SESSION_ID_KEY = 'ceramisys_session_id';

/** Window during which failed attempts are counted before the account is temporarily locked. */
export const LOGIN_LOCKOUT_WINDOW_MINUTES = 15;
export const SECURITY_KEY_LOGIN_GUARD_KEY = '__SECURITY_KEY_LOGIN__';

export interface LoginGuardStatus {
  /** Configured maximum failed attempts. 0 means lockout is disabled. */
  maxAttempts: number;
  /** Failed attempts counted inside the current window. */
  failedAttempts: number;
  /** Attempts left before lockout, or null when lockout is disabled. */
  remainingAttempts: number | null;
  isLocked: boolean;
  /** ISO timestamp when the lockout expires, or null when not locked. */
  lockedUntil: string | null;
  windowMinutes: number;
}
