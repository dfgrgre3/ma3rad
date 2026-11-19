import { AuthServiceAccountSecurity } from './AuthService/accountSecurity';

// Public API is unchanged: AuthService is the concrete class at the end of the
// responsibility chain AuthServiceCore → AuthServiceSession → AuthServiceLogin
// → AuthServicePins → AuthServiceUserAdmin → AuthServiceAccountSecurity, so all
// static and instance methods remain available on AuthService exactly as before.
export class AuthService extends AuthServiceAccountSecurity {}

export {
  LOGIN_LOCKOUT_WINDOW_MINUTES,
  SECURITY_KEY_LOGIN_GUARD_KEY,
  TwoFactorRequiredError,
} from './AuthService/shared';
export type { LoginGuardStatus } from './AuthService/shared';
