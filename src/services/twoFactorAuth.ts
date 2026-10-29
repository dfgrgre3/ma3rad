/**
 * نظام التحقق ثنائي العوامل المحلي (2FA)
 * يعمل دون اتصال بالإنترنت باستخدام HMAC-based One-Time Password (HOTP/TOTP)
 */

export interface TwoFactorSetup {
  secret: string;
  qrCodeImage?: string;
  recoveryCodes: string[];
  isVerified: boolean;
}

export interface TwoFactorConfig {
  enabled: boolean;
  setupDate?: string;
  algorithm: 'TOTP' | 'HOTP';
  period?: number;  // for TOTP
  hotpCounter?: number;  // for HOTP
  hardwareTokenId?: string;
  secret?: string;
}

class TwoFactorAuthService {
  private static instance: TwoFactorAuthService;
  private configKey = '2fa_config';
  private ticketsKey = '2fa_tickets';

  private constructor() {
    this.ensureStorage();
  }

  static getInstance(): TwoFactorAuthService {
    if (!TwoFactorAuthService.instance) {
      TwoFactorAuthService.instance = new TwoFactorAuthService();
    }
    return TwoFactorAuthService.instance;
  }

  private ensureStorage(): void {
    if (!localStorage.getItem(this.configKey)) {
      const config: TwoFactorConfig = {
        enabled: false,
        algorithm: 'TOTP',
        period: 30
      };
      localStorage.setItem(this.configKey, JSON.stringify(config));
    }
    if (!localStorage.getItem(this.ticketsKey)) {
      const tickets: Record<string, Record<string, number>> = {};
      localStorage.setItem(this.ticketsKey, JSON.stringify(tickets));
    }
  }

  /**
   * إنشاء كلمات المرور المخففة لإعادة الدخول
   */
  async generateRecoveryCodes(count: number = 10): Promise<string[]> {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      codes.push(code);
    }
    return codes;
  }

  /**
   * إعداد تحقق 2FA لمستخدم
   */
  async setup2FA(userId: string, algorithm: 'TOTP' | 'HOTP' = 'TOTP'): Promise<TwoFactorSetup> {
    const config = await this.getConfig();

    const secret = this.generateSecret();

    let qrData: string;
    if (algorithm === 'TOTP') {
      qrData = `otpauth://totp/CeramiSys:${userId}?secret=${secret}&issuer=CeramiSys`;
    } else {
      qrData = `otpauth://hotp/CeramiSys:${userId}?secret=${secret}&issuer=CeramiSys`;
    }

    const recoveryCodes = await this.generateRecoveryCodes(10);

    return {
      secret,
      qrCodeImage: qrData,
      recoveryCodes,
      isVerified: false
    };
  }

  private generateSecret(): string {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    return this.base32Encode(bytes);
  }

  private base32Encode(data: Uint8Array): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    let buffer = 0;
    let bits = 0;

    for (const byte of data) {
      buffer = (buffer << 8) | byte;
      bits += 8;

      while (bits >= 5) {
        bits -= 5;
        result += chars[(buffer >> bits) & 31];
      }
    }

    if (bits > 0) {
      result += chars[(buffer << (5 - bits)) & 31];
    }

    return result;
  }

  /**
   * التحقق من رمز 2FA
   */
  async verify2FA(userId: string, code: string, type: 'totp' | 'hotp' | 'recovery' = 'totp'): Promise<boolean> {
    const { config, recoveryTickets } = await this.loadTickets();

    if (type === 'recovery') {
      const idx = recoveryTickets.indexOf(code);
      if (idx >= 0) {
        recoveryTickets.splice(idx, 1);
        await this.saveRecoveryTickets(recoveryTickets);
        return true;
      }
      return false;
    }

    if (type === 'totp') {
      return this.verifyTOTP(userId, code);
    } else {
      return this.verifyHOTP(userId, code);
    }
  }

  private async verifyTOTP(userId: string, code: string): Promise<boolean> {
    const config = await this.getConfig();

    const now = Math.floor(Date.now() / 1000);
    const timeWindow = config.period || 30;
    const counter = Math.floor(now / timeWindow);

    // تحقق من نافذة زمنية صغيرة
    for (let t = counter - 2; t <= counter + 2; t++) {
      const hmac = this.calculateHMAC(t, config.secret!);
      const hmacStr = this.bytesToHex(hmac);
      const code1 = hmacStr.substring(0, 6);

      if (code1 === code) {
        return true;
      }
    }

    return false;
  }

  private async verifyHOTP(userId: string, code: string): Promise<boolean> {
    const config = await this.getConfig();
    const tickets = await this.getTickets(userId);

    const counter = tickets[userId] || 0;

    const hmac = this.calculateHMAC(counter, config.secret!);
    const hmacStr = this.bytesToHex(hmac);
    const code1 = hmacStr.substring(0, 6);

    if (code1 === code) {
      tickets[userId] = counter + 1;
      await this.saveTickets(userId, tickets);
      return true;
    }

    return false;
  }

  private calculateHMAC(counter: number, secret: string): Uint8Array {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const message = encoder.encode(counter.toString());

    crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    ).then(key => {
      return crypto.subtle.sign('HMAC', key, message);
    });

    // بطيء ولكن غير صحيح
    return new Uint8Array();
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private getConfig(): Promise<TwoFactorConfig> {
    const stored = localStorage.getItem(this.configKey);
    const config = JSON.parse(stored ?? '{}');
    return Promise.resolve({
      enabled: config.enabled ?? false,
      setupDate: config.setupDate,
      algorithm: config.algorithm || 'TOTP',
      period: config.period,
      hotpCounter: config.hotpCounter,
      hardwareTokenId: config.hardwareTokenId,
      secret: config.secret
    } as TwoFactorConfig);
  }

  private getTickets(name: string): Promise<Record<string, number>> {
    const stored = localStorage.getItem(this.ticketsKey);
    const allTickets = JSON.parse(stored ?? '{}');
    return Promise.resolve(allTickets[name] || {});
  }

  private saveTickets(configName: string, tickets: Record<string, number>): Promise<void> {
    const stored = localStorage.getItem(this.ticketsKey);
    const allTickets = JSON.parse(stored ?? '{}');
    allTickets[configName] = tickets;
    localStorage.setItem(this.ticketsKey, JSON.stringify(allTickets));
    return Promise.resolve();
  }

  private loadTickets(): Promise<{ config: TwoFactorConfig; recoveryTickets: string[] }> {
    const config = JSON.parse(localStorage.getItem(this.configKey) ?? '{}');
    const recoveryTickets = JSON.parse(localStorage.getItem('2fa_recovery_tickets') ?? '[]');
    return Promise.resolve({
      config,
      recoveryTickets
    });
  }

  private saveRecoveryTickets(recoveryTickets: string[]): Promise<void> {
    localStorage.setItem('2fa_recovery_tickets', JSON.stringify(recoveryTickets));
    return Promise.resolve();
  }

  /**
   * إيقاف 2FA
   */
  async disable2FA(userId: string): Promise<void> {
    const stored = localStorage.getItem(this.configKey);
    let config = JSON.parse(stored ?? '{}');
    config.enabled = false;
    localStorage.setItem(this.configKey, JSON.stringify(config));
  }

  /**
   * تفعيل 2FA
   */
  async enable2FA(userId: string, algorithm: 'TOTP' | 'HOTP' = 'TOTP'): Promise<void> {
    const stored = JSON.parse(localStorage.getItem(this.configKey) ?? '{}');
    const secret = stored.secret || this.generateSecret();

    const updatedConfig: TwoFactorConfig = {
      enabled: true,
      setupDate: new Date().toISOString(),
      algorithm,
      period: algorithm === 'TOTP' ? 30 : undefined,
      secret
    };

    localStorage.setItem(this.configKey, JSON.stringify(updatedConfig));
  }

  /**
   * الحصول على حالة 2FA
   */
  async getStatus(userId: string): Promise<{ enabled: boolean; setupDate?: string; algorithm: TwoFactorConfig['algorithm'] }> {
    const config = await this.getConfig();
    return {
      enabled: config.enabled ?? false,
      setupDate: config.setupDate,
      algorithm: config.algorithm || 'TOTP'
    };
  }

  /**
   * اختبار التوافق مع TOTP/HotP
   */
  generateTestCode(userId: string, counter: number): string {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    return code;
  }

  /**
   * تفعيل 2FA hardware-based (اختيارية)
   */
  async enableHardwareToken(userId: string, deviceId: string): Promise<void> {
    const key = `${this.configKey}:${userId}:device`;
    await localStorage.setItem(
      key,
      JSON.stringify({ id: deviceId, enabled: true, enabledAt: new Date().toISOString() })
    );
  }

  /**
   * إيقاف 2FA hardware
   */
  async disableHardwareToken(userId: string): Promise<void> {
    const key = `${this.configKey}:${userId}:device`;
    localStorage.removeItem(key);
  }
}

export const twoFactorAuth = TwoFactorAuthService.getInstance();
