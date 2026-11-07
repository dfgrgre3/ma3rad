/**
 * نظام التحقق ثنائي العوامل المحلي (2FA)
 * يعمل دون اتصال بالإنترنت باستخدام TOTP/HOTP القياسي (RFC 6238 / RFC 4226).
 *
 * التصميم:
 * - سر كل مستخدم وإعداداته تُخزَّن في جدول user_2fa (وليس في localStorage).
 * - رموز الاسترداد تُخزَّن كتجزئات bcrypt فقط.
 * - التحقق متزامن كي يعمل داخل مسار تسجيل الدخول، بينما إنشاء إعداد 2FA لا يحجب الواجهة.
 */

import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../database/db';

export interface TwoFactorSetup {
  secret: string;
  /** otpauth:// URI can be rendered as a QR code by the UI. */
  qrCodeImage?: string;
  recoveryCodes: string[];
  isVerified: boolean;
}

export interface TwoFactorConfig {
  enabled: boolean;
  setupDate?: string;
  algorithm: 'TOTP' | 'HOTP';
  period?: number;
  hotpCounter?: number;
  hardwareTokenId?: string;
  secret?: string;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_PERIOD = 30;
const DEFAULT_DIGITS = 6;
const TOTP_DRIFT_STEPS = 1;

function rotl(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function sha1(message: Uint8Array): Uint8Array {
  const bitLength = message.length * 8;
  const totalLength = Math.ceil((message.length + 1 + 8) / 64) * 64;
  const buffer = new Uint8Array(totalLength);
  buffer.set(message);
  buffer[message.length] = 0x80;

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  view.setUint32(totalLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(totalLength - 4, bitLength >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < totalLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      words[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i += 1) {
      words[i] = rotl(words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i += 1) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + words[i]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const digest = new Uint8Array(20);
  const out = new DataView(digest.buffer);
  out.setUint32(0, h0, false);
  out.setUint32(4, h1, false);
  out.setUint32(8, h2, false);
  out.setUint32(12, h3, false);
  out.setUint32(16, h4, false);
  return digest;
}

function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  let normalizedKey = key;
  if (normalizedKey.length > 64) normalizedKey = sha1(normalizedKey);

  const inner = new Uint8Array(64 + message.length);
  const outer = new Uint8Array(64 + 20);
  for (let i = 0; i < 64; i += 1) {
    const byte = i < normalizedKey.length ? normalizedKey[i] : 0;
    inner[i] = byte ^ 0x36;
    outer[i] = byte ^ 0x5c;
  }
  inner.set(message, 64);
  outer.set(sha1(inner), 64);
  return sha1(outer);
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }

  return Uint8Array.from(bytes);
}

export function base32Encode(data: Uint8Array): string {
  let result = '';
  let buffer = 0;
  let bits = 0;

  for (const byte of data) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) {
    result += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  return result;
}

/** Generate a TOTP value for a base32 secret at an absolute Unix time (seconds). */
export function generateTOTP(
  secret: string,
  timeSeconds: number = Math.floor(Date.now() / 1000),
  period: number = DEFAULT_PERIOD,
  digits: number = DEFAULT_DIGITS
): string {
  const counter = Math.floor(timeSeconds / period);
  const message = new Uint8Array(8);
  const view = new DataView(message.buffer);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);

  const digest = hmacSha1(base32Decode(secret), message);
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Generate an HOTP value for a base32 secret and counter (RFC 4226). */
export function generateHOTP(
  secret: string,
  counter: number,
  digits: number = DEFAULT_DIGITS
): string {
  const message = new Uint8Array(8);
  const view = new DataView(message.buffer);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);

  const digest = hmacSha1(base32Decode(secret), message);
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface TwoFactorRow {
  userId: string;
  secret: string;
  algorithm: 'TOTP' | 'HOTP';
  period: number;
  counter: number;
  enabled: number;
  recoveryCodes: string;
  setupDate: string | null;
  lastUsedCounter: number | null;
}

class TwoFactorAuthService {
  private static instance: TwoFactorAuthService;

  static getInstance(): TwoFactorAuthService {
    if (!TwoFactorAuthService.instance) {
      TwoFactorAuthService.instance = new TwoFactorAuthService();
    }
    return TwoFactorAuthService.instance;
  }

  private db(): DatabaseManager {
    return DatabaseManager.getInstance();
  }

  private getRow(userId: string): TwoFactorRow | null {
    try {
      const rows = this.db().query<any>(
        `SELECT user_id AS userId, secret, algorithm, period, counter, enabled,
                recovery_codes AS recoveryCodes, setup_date AS setupDate,
                last_used_counter AS lastUsedCounter
         FROM user_2fa WHERE user_id = ?`,
        [userId]
      );
      return rows.length > 0 ? rows[0] as TwoFactorRow : null;
    } catch {
      return null;
    }
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
    const bytes = new Uint8Array(5);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    const value = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${value.slice(0, 5)}-${value.slice(5, 10)}`;
  }

  private generateSecret(): string {
    const bytes = new Uint8Array(20);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    return base32Encode(bytes);
  }

  /** Create a pending secret and one-time recovery codes for a user. */
  async setup2FA(userId: string, algorithm: 'TOTP' | 'HOTP' = 'TOTP'): Promise<TwoFactorSetup> {
    const secret = this.generateSecret();
    const recoveryCodes = await this.generateRecoveryCodes(10);
    const hashedCodes = await Promise.all(recoveryCodes.map((code) => bcrypt.hash(code, 10)));
    const period = algorithm === 'TOTP' ? DEFAULT_PERIOD : 0;
    const setupDate = new Date().toISOString();

    this.db().run(
      `INSERT INTO user_2fa
         (user_id, secret, algorithm, period, counter, enabled, recovery_codes, setup_date, last_used_counter, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, NULL, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         secret = excluded.secret,
         algorithm = excluded.algorithm,
         period = excluded.period,
         counter = 0,
         enabled = 0,
         recovery_codes = excluded.recovery_codes,
         setup_date = excluded.setup_date,
         last_used_counter = NULL,
         updated_at = excluded.updated_at`,
      [userId, secret, algorithm, period, JSON.stringify(hashedCodes), setupDate, setupDate, setupDate]
    );

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
      this.db().run(
        `UPDATE user_2fa SET counter = counter + 1, last_used_counter = counter, updated_at = ? WHERE user_id = ?`,
        [new Date().toISOString(), userId]
      );
      return true;
    }

    const period = Number(row.period) || DEFAULT_PERIOD;
    const currentCounter = Math.floor(Date.now() / 1000 / period);
    for (let drift = -TOTP_DRIFT_STEPS; drift <= TOTP_DRIFT_STEPS; drift += 1) {
      const counter = currentCounter + drift;
      const expected = generateTOTP(row.secret, counter * period, period);
      if (safeEqual(expected, normalized)) {
        // Reject a code that belongs to a counter already accepted.
        if (row.lastUsedCounter != null && counter <= Number(row.lastUsedCounter)) return false;
        this.db().run(
          `UPDATE user_2fa SET last_used_counter = ?, updated_at = ? WHERE user_id = ?`,
          [counter, new Date().toISOString(), userId]
        );
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
    this.db().run(
      `UPDATE user_2fa SET recovery_codes = ?, updated_at = ? WHERE user_id = ?`,
      [JSON.stringify(codes), new Date().toISOString(), row.userId]
    );
    return true;
  }

  async disable2FA(userId: string, code: string): Promise<void> {
    if (!this.verifyLoginCodeSync(userId, code)) {
      throw new Error('رمز التحقق الثنائي غير صحيح.');
    }
    this.db().run(`UPDATE user_2fa SET enabled = 0, updated_at = ? WHERE user_id = ?`, [
      new Date().toISOString(),
      userId,
    ]);
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
    this.db().run(
      `UPDATE user_2fa SET enabled = 1, algorithm = ?, period = ?, setup_date = COALESCE(setup_date, ?), updated_at = ? WHERE user_id = ?`,
      [algorithm, algorithm === 'TOTP' ? DEFAULT_PERIOD : 0, now, now, userId]
    );
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
    return generateTOTP(row.secret, counter * (Number(row.period) || DEFAULT_PERIOD), Number(row.period) || DEFAULT_PERIOD);
  }

  /** Convenience for callers that need the current valid code. */
  generateCurrentCode(userId: string): string {
    const row = this.getRow(userId);
    if (!row) return '';
    if (row.algorithm === 'HOTP') return generateHOTP(row.secret, Number(row.counter) || 0);
    return generateTOTP(row.secret);
  }

  async enableHardwareToken(userId: string, deviceId: string): Promise<void> {
    this.db().run(
      `UPDATE user_2fa SET hardware_token_id = ?, updated_at = ? WHERE user_id = ?`,
      [deviceId, new Date().toISOString(), userId]
    );
  }

  async disableHardwareToken(userId: string): Promise<void> {
    this.db().run(
      `UPDATE user_2fa SET hardware_token_id = NULL, updated_at = ? WHERE user_id = ?`,
      [new Date().toISOString(), userId]
    );
  }
}

export const twoFactorAuth = TwoFactorAuthService.getInstance();
