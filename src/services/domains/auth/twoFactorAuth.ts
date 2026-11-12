/**
 * Local two-factor authentication service using standard TOTP/HOTP algorithms.
 * User secrets and settings are stored in user_2fa; recovery codes are bcrypt hashes.
 */

import bcrypt from 'bcryptjs';
import {
  DEFAULT_DIGITS,
  DEFAULT_PERIOD,
  base32Encode,
  generateHOTP,
  generateRandomBytes,
  generateTOTP,
  safeEqual,
} from './twoFactorCrypto';
import { TwoFactorAuthRepository } from './twoFactorAuthRepository';
import type { TwoFactorConfig, TwoFactorRow, TwoFactorSetup } from './twoFactorTypes';

export { base32Decode, base32Encode, generateHOTP, generateTOTP } from './twoFactorCrypto';
export type { TwoFactorConfig, TwoFactorSetup } from './twoFactorTypes';

const TOTP_DRIFT_STEPS = 1;

class TwoFactorAuthService {
  private static instance: TwoFactorAuthService;
  private readonly repository = new TwoFactorAuthRepository();

  static getInstance(): TwoFactorAuthService {
    if (!TwoFactorAuthService.instance) {
      TwoFactorAuthService.instance = new TwoFactorAuthService();
    }
    return TwoFactorAuthService.instance;
  }

  private getRow(userId: string): TwoFactorRow | null {
    return this.repository.findByUserId(userId);
  }

  /** True when the user has an enabled second factor. Never throws. */
  isEnabled(userId: string): boolean {
    const row = this.getRow(userId);
    return !!row && Number(row.enabled) === 1;
  }

  async generateRecoveryCodes(count: number = 10): Promise<string[]> {
    const codes: string[] = [];
    for (let i = 0; i < count; i += 1) {
      codes.push(this.randomRecoveryCode());
    }
    return codes;
  }

  private randomRecoveryCode(): string {
    const value = Array.from(generateRandomBytes(5))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    return `${value.slice(0, 5)}-${value.slice(5, 10)}`;
  }

  private generateSecret(): string {
    return base32Encode(generateRandomBytes(20));
  }

  /** Create a pending secret and one-time recovery codes for a user. */
  async setup2FA(userId: string, algorithm: 'TOTP' | 'HOTP' = 'TOTP'): Promise<TwoFactorSetup> {
    const secret = this.generateSecret();
    const recoveryCodes = await this.generateRecoveryCodes(10);
    const hashedCodes = await Promise.all(recoveryCodes.map((code) => bcrypt.hash(code, 10)));
    const period = algorithm === 'TOTP' ? DEFAULT_PERIOD : 0;
    const setupDate = new Date().toISOString();

    this.repository.savePendingSetup({
      userId,
      secret,
      algorithm,
      period,
      recoveryCodes: hashedCodes,
      setupDate,
    });

    const label = encodeURIComponent(`CeramiSys:${userId}`);
    const qrCodeImage = algorithm === 'TOTP'
      ? `otpauth://totp/${label}?secret=${secret}&issuer=CeramiSys&period=${DEFAULT_PERIOD}&digits=${DEFAULT_DIGITS}`
      : `otpauth://hotp/${label}?secret=${secret}&issuer=CeramiSys&digits=${DEFAULT_DIGITS}`;

    return { secret, qrCodeImage, recoveryCodes, isVerified: false };
  }

  /**
   * Verify a TOTP/HOTP or recovery code for a user.
   * TOTP replay protection stores the last accepted counter.
   */
  async verify2FA(userId: string, code: string, type: 'totp' | 'hotp' | 'recovery' = 'totp'): Promise<boolean> {
    return this.verify2FASync(userId, code, type);
  }

  /** Synchronous variant for the (synchronous) login path. */
  verify2FASync(userId: string, code: string, type: 'totp' | 'hotp' | 'recovery' = 'totp'): boolean {
    const row = this.getRow(userId);
    if (!row) return false;
    const normalized = String(code ?? '').replace(/\s+/g, '');

    if (type === 'recovery') {
      return this.consumeRecoveryCode(row, normalized);
    }

    if (type === 'hotp') {
      const expected = generateHOTP(row.secret, Number(row.counter) || 0);
      if (!safeEqual(expected, normalized)) return false;
      this.repository.advanceHotpCounter(userId, new Date().toISOString());
      return true;
    }

    const period = Number(row.period) || DEFAULT_PERIOD;
    const currentCounter = Math.floor(Date.now() / 1000 / period);
    for (let drift = -TOTP_DRIFT_STEPS; drift <= TOTP_DRIFT_STEPS; drift += 1) {
      const counter = currentCounter + drift;
      const expected = generateTOTP(row.secret, counter * period, period);
      if (safeEqual(expected, normalized)) {
        if (row.lastUsedCounter != null && counter <= Number(row.lastUsedCounter)) return false;
        this.repository.setLastUsedCounter(userId, counter, new Date().toISOString());
        return true;
      }
    }
    return false;
  }

  verifyLoginCodeSync(userId: string, code: string): boolean {
    const normalized = String(code ?? '').replace(/\s+/g, '');
    if (/^[a-f\d]{5}-?[a-f\d]{5}$/i.test(normalized)) {
      return this.verify2FASync(userId, normalized.toLowerCase(), 'recovery');
    }
    const row = this.getRow(userId);
    if (!row) return false;
    return this.verify2FASync(userId, normalized, row.algorithm === 'HOTP' ? 'hotp' : 'totp');
  }

  /** Accept a recovery code once, then remove its hash. */
  private consumeRecoveryCode(row: TwoFactorRow, code: string): boolean {
    if (!code) return false;
    let codes: string[] = [];
    try {
      codes = JSON.parse(row.recoveryCodes || '[]');
    } catch {
      return false;
    }
    const index = codes.findIndex((hash) => {
      try {
        return bcrypt.compareSync(code, hash);
      } catch {
        return false;
      }
    });
    if (index < 0) return false;

    codes.splice(index, 1);
    this.repository.setRecoveryCodes(row.userId, codes, new Date().toISOString());
    return true;
  }

  async disable2FA(userId: string, code: string): Promise<void> {
    if (!this.verifyLoginCodeSync(userId, code)) {
      throw new Error('رمز التحقق الثنائي غير صحيح.');
    }
    this.repository.disable(userId, new Date().toISOString());
  }

  /**
   * Enable 2FA only after proving control of the pending authenticator secret.
   */
  async enable2FA(userId: string, algorithm: 'TOTP' | 'HOTP' = 'TOTP', code?: string): Promise<void> {
    const row = this.getRow(userId);
    if (!row) throw new Error('ابدأ إعداد التحقق الثنائي قبل تأكيده.');
    if (Number(row.enabled) === 1) throw new Error('التحقق الثنائي مفعّل بالفعل.');
    if (row.algorithm !== algorithm) throw new Error('نوع تطبيق المصادقة لا يطابق الإعداد المعلّق.');
    const type = algorithm === 'HOTP' ? 'hotp' : 'totp';
    if (!code || !this.verify2FASync(userId, code, type)) {
      throw new Error('رمز التحقق الثنائي غير صحيح.');
    }

    const now = new Date().toISOString();
    this.repository.enable(userId, algorithm, algorithm === 'TOTP' ? DEFAULT_PERIOD : 0, now);
  }

  async getStatus(userId: string): Promise<{ enabled: boolean; setupDate?: string; algorithm: TwoFactorConfig['algorithm'] }> {
    const row = this.getRow(userId);
    return {
      enabled: !!row && Number(row.enabled) === 1,
      setupDate: row?.setupDate ?? undefined,
      algorithm: (row?.algorithm as TwoFactorConfig['algorithm']) || 'TOTP',
    };
  }

  /** Produce the TOTP value for an explicit counter (diagnostics/tests). */
  generateTestCode(userId: string, counter: number): string {
    const row = this.getRow(userId);
    if (!row) return '';
    const period = Number(row.period) || DEFAULT_PERIOD;
    return generateTOTP(row.secret, counter * period, period);
  }

  /** Convenience for callers that need the current valid code. */
  generateCurrentCode(userId: string): string {
    const row = this.getRow(userId);
    if (!row) return '';
    if (row.algorithm === 'HOTP') return generateHOTP(row.secret, Number(row.counter) || 0);
    return generateTOTP(row.secret);
  }

  async enableHardwareToken(userId: string, deviceId: string): Promise<void> {
    this.repository.setHardwareToken(userId, deviceId, new Date().toISOString());
  }

  async disableHardwareToken(userId: string): Promise<void> {
    this.repository.setHardwareToken(userId, null, new Date().toISOString());
  }
}

export const twoFactorAuth = TwoFactorAuthService.getInstance();
