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

export interface TwoFactorRow {
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
