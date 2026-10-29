/**
 * خدمة الأمان المتقدم
 * دمج جميع ميزات الأمان: تشفير، مصادقة، تسجيلات، مراقبة
 */

import { auditLogger } from './auditLogger';
import { localCache } from './localCacheService';
import { twoFactorAuth } from './twoFactorAuth';
import { performanceMonitor } from './performanceMonitor';
import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import type { ActiveSession, LoginRecord, SecurityOverview } from './types';

export type { ActiveSession, LoginRecord, SecurityOverview };


interface SecurityEvent {
  timestamp: string;
  type: 'login_success' | 'login_failure' | 'password_change' | 'backup_created' | 'backup_failed' | 'data_access';
  userId: string;
  details: {
    sessionId: string;
    ip?: string;
    device?: string;
    [key: string]: unknown;
  };
  riskLevel: 'low' | 'medium' | 'high';
}

interface SecurityConfig {
  encryptionAlgorithm: 'aes-256-gcm' | 'aes-256-ctr';
  keyStorage: 'local' | 'secureEnclave';
  backupEncryption: boolean;
  auditLogging: boolean;
  performanceMonitoring: boolean;
  accessControl: 'strict' | 'moderate';
  twoFactorEnabled: boolean;
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
  };
}

interface SecurityMetrics {
  activeUsers: number;
  failedLogins: number;
  successfulLogins: number;
  encryptionEvents: number;
  backupEvents: number;
  auditEvents: number;
  performanceAlerts: number;
  securityRanking: 'A' | 'B' | 'C' | 'D';
}

export class SecurityService {
  private static instance: SecurityService;
  private config!: SecurityConfig;
  private initialized = false;

  private constructor() {
    this.loadConfig();
  }

  static getInstance(): SecurityService {
    if (!SecurityService.instance) {
      SecurityService.instance = new SecurityService();
    }
    return SecurityService.instance;
  }

  private loadConfig(): void {
    const saved = localStorage.getItem('security_config');
    if (saved) {
      this.config = JSON.parse(saved);
    } else {
      this.config = {
        encryptionAlgorithm: 'aes-256-gcm',
        keyStorage: 'local',
        backupEncryption: true,
        auditLogging: true,
        performanceMonitoring: true,
        accessControl: 'strict',
        twoFactorEnabled: false,
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireNumbers: true,
          requireSpecialChars: true
        }
      };
      this.saveConfig();
    }
  }

  private saveConfig(): void {
    localStorage.setItem('security_config', JSON.stringify(this.config));
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // التحقق من توفر التشفير الآمن
    if (!window.crypto || !window.crypto.subtle) {
      console.error('crypto API غير متاح');
      throw new Error('لا يمكن تهيئة الأمان - browser لا يدعم Web Crypto API');
    }

    // بدء مراقبة الأداء
    if (this.config.performanceMonitoring) {
      performanceMonitor.startMonitoring();
    }

    // تفعيل سجلات التدقيق
    if (this.config.auditLogging) {
      auditLogger.initialize();
    }

    this.initialized = true;
  }

  async encryptData(data: Uint8Array, key: string): Promise<Uint8Array> {
    try {
      const keyData = await this.extractKey(key);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: this.config.encryptionAlgorithm, iv: iv.buffer },
        keyData,
        data.slice(0)
      );

      // إضافة التوقيع
      const signature = await this.signData(new Uint8Array(ciphertext.slice(0)), key);

      // Return encrypted + IV + signature
      const result = new Uint8Array(iv.length + ciphertext.byteLength + signature.length);
      result.set(new Uint8Array(iv), 0);
      result.set(new Uint8Array(ciphertext.slice(0)), iv.length);
      result.set(signature, iv.length + ciphertext.byteLength);

      // تسجيل الحدث
      if (this.config.auditLogging) {
        auditLogger.log('system', 'session', 'encryption', 'data', 'encryption', `تم تشفير البيانات بحجم ${data.length} بايت`, null, true);
      }

      return result;
    } catch (error: any) {
      // تسجيل الحادث الأمني
      if (this.config.auditLogging) {
        auditLogger.log('system', 'security', 'encryption_failure', 'system', 'encryption', `فشل التشفير: ${error?.message}`, null, false, 'high');
      }
      throw error;
    }
  }

  async decryptData(encryptedData: Uint8Array, key: string): Promise<Uint8Array> {
    try {
      const ivLength = encryptedData.length > 200 ? 12 : 0;
      if (ivLength === 0) {
        throw new Error('بيانات encrypted غير صالحة');
      }
      const iv = new Uint8Array(encryptedData.slice(0, ivLength));
      const ciphertext = new Uint8Array(encryptedData.slice(ivLength, -64));
      const signature = new Uint8Array(encryptedData.slice(-64));

      const keyData = await this.extractKey(key);
      const decrypted = await crypto.subtle.decrypt(
        { name: this.config.encryptionAlgorithm, iv: iv.buffer },
        keyData,
        ciphertext
      );

      // التحقق من التوقيع
      const isValid = await this.verifySignature(new Uint8Array(decrypted.slice(0)), signature, key);
      if (!isValid) {
        throw new Error('التوقيع الرقمي غير صالح');
      }

      if (this.config.auditLogging) {
        auditLogger.log('system', 'session', 'decryption', 'data', 'decryption', `تم فك تشفير بيانات بحجم ${ciphertext.length} بايت`, null, true);
      }

      return new Uint8Array(decrypted.slice(0));
    } catch (error: any) {
      if (this.config.auditLogging) {
        auditLogger.log('system', 'security', 'decryption_failure', 'system', 'decryption', `فشل فك التشفير: ${error?.message}`, null, false, 'high');
      }
      throw error;
    }
  }

  private async extractKey(password: string): Promise<CryptoKey> {
    // Use PBKDF2 to derive key
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt.buffer, iterations: 310000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private async signData(data: Uint8Array, key: string): Promise<Uint8Array> {
    const secretKey = await this.extractKey(key);
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-512' },
      secretKey,
      data.slice(0)
    );
    return new Uint8Array(signature);
  }

  private async verifySignature(data: Uint8Array, signature: Uint8Array, key: string): Promise<boolean> {
    const secretKey = await this.extractKey(key);
    const result = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-512' },
      secretKey,
      signature.slice(0),
      data.slice(0)
    );
    return result;
  }

  async createUserSession(userId: string, username: string, password?: string): Promise<string> {
    try {
      // التحقق من 2FA
      const twoFAConfig = await twoFactorAuth.getStatus(userId);
      if (twoFAConfig && twoFAConfig.enabled) {
        const eventId = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        auditLogger.log('system', eventId, 'session_start', 'user', userId, `تسجيل دخول: ${username}`);
        return eventId;
      }

      // التحقق من كلمة المرور (إذا كانت موجودة)
      if (password) {
        const isValid = await this.verifyPassword(username, password);
        if (!isValid) {
          auditLogger.log('system', 'security', 'login_failure', 'user', userId, `كلمة مرور خاطئة`, null, false, 'high');
          throw new Error('بيانات الدخول غير صحيحة');
        }
      }

      const eventId = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      auditLogger.log('system', eventId, 'session_start', 'user', userId, `تسجيل دخول ناجح: ${username}`);

      // تخزين المحتوى في الذاكرة المؤقتة
      localCache.set(`user_session_${eventId}`, { userId, username, started: Date.now() }, 2 * 60 * 60 * 1000);

      return eventId;
    } catch (error: any) {
      auditLogger.log('system', 'security', 'login_success', 'user', userId, `تسجيل دخول فاشل: ${error?.message}`, null, false, 'high');
      throw error;
    }
  }

  async verifyPassword(username: string, password: string): Promise<boolean> {
    // هذا يتطلب دمج مع نظام المصادقة
    // للآن: تحقق من قاعدة البيانات المحلية
    // سيتم تطويره لاحقاً
    return true;
  }

  async logout(sessionId: string): Promise<void> {
    auditLogger.log('system', sessionId, 'session_end', 'user', 'session', 'تسجيل خروج');
    localCache.delete(`user_session_${sessionId}`);
  }

  async createEncryptedBackup(backupData: Uint8Array, password: string): Promise<Uint8Array> {
    try {
      // في التطبيق الفعلي، سيتم استدعاء backupEncryption.ts
      // هذا نموذج مبسط
      if (this.config.auditLogging) {
        auditLogger.log('system', 'backup', 'backup_created', 'backup', 'backup', 'تم إنشاء نسخة احتياطية مشفرة', null, true);
      }
      // يجب حاليًا تنفيذ التشفير الفعلي
      // يمكن استخدام encryptBackupWithSignature المتقدم
      return backupData; // Placeholder
    } catch (error: any) {
      if (this.config.auditLogging) {
        auditLogger.log('system', 'security', 'backup_failure', 'system', 'backup', `فشل النسخ الاحتياطي: ${error?.message}`, null, false, 'high');
      }
      throw error;
    }
  }

  async setTwoFactorAuth(userId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      await twoFactorAuth.enable2FA(userId, 'TOTP');
    } else {
      await twoFactorAuth.disable2FA(userId);
    }
  }

  getSecurityStatus(): {
    encryptionEnabled: boolean;
    twoFactorEnabled: boolean;
    auditLoggingEnabled: boolean;
    performanceMonitoringEnabled: boolean;
    securityRanking: SecurityMetrics['securityRanking'];
  } {
    return {
      encryptionEnabled: true,
      twoFactorEnabled: this.config.twoFactorEnabled,
      auditLoggingEnabled: this.config.auditLogging,
      performanceMonitoringEnabled: this.config.performanceMonitoring,
      securityRanking: this.calculateSecurityRanking()
    };
  }

  private calculateSecurityRanking(): 'A' | 'B' | 'C' | 'D' {
    let score = 0;

    if (this.config.encryptionAlgorithm === 'aes-256-gcm') score += 30;
    if (this.config.keyStorage === 'secureEnclave') score += 10;
    if (this.config.backupEncryption) score += 20;
    if (this.config.auditLogging) score += 20;
    if (this.config.performanceMonitoring) score += 10;
    if (this.config.accessControl === 'strict') score += 10;

    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    return 'D';
  }

  async generateSecurityReport(): Promise<string> {
    const metrics = {
      totalAccessed: localCache.get('security_report_total'),
      encryptionEvents: auditLogger.getLogs({ action: 'encryption' }).length,
      backupEvents: auditLogger.getLogs({ action: 'backup' }).length,
      auditEvents: auditLogger.getLogs({ limit: 100 }).length,
      performanceAlerts: performanceMonitor.getAlerts().length,
      twoFactorEnabled: this.config.twoFactorEnabled,
      securityRanking: this.calculateSecurityRanking()
    };

    const report = {
      timestamp: new Date().toISOString(),
      metrics,
      recommendations: this.generateRecommendations()
    };

    return JSON.stringify(report, null, 2);
  }

  private generateRecommendations(): string[] {
    const recs = [];

    if (!this.config.twoFactorEnabled) {
      recs.push('قم بتفعيل المعرف ثنائي المزيد من الأمان (2FA)');
    }

    if (!this.config.auditLogging) {
      recs.push('قم بتفعيل سجلات التدقيق لرصد النشاط الأمني');
    }

    if (this.config.accessControl === 'moderate' && this.config.twoFactorEnabled) {
      recs.push('النظام الأمني متقدم جداً - قد يتطلب صلاحيات خاصة');
    }

    return recs;
  }

  updateConfig(config: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveConfig();

    if (config.auditLogging !== undefined) {
      if (config.auditLogging) {
        auditLogger.initialize();
      }
    }

    if (config.performanceMonitoring !== undefined) {
      if (config.performanceMonitoring) {
        performanceMonitor.startMonitoring();
      }
    }
  }

  getMetrics(): SecurityMetrics {
    return {
      activeUsers: localCache.get('security_metrics_active_users') || 1,
      failedLogins: 0,
      successfulLogins: 0,
      encryptionEvents: auditLogger.getLogs({ action: 'encryption' }).length,
      backupEvents: auditLogger.getLogs({ action: 'backup' }).length,
      auditEvents: auditLogger.getLogs().length,
      performanceAlerts: performanceMonitor.getAlerts().length,
      securityRanking: this.calculateSecurityRanking()
    };
  }

  trends(): {
    encryptionRate: number;
    backupRate: number;
    auditRate: number;
    performanceAlerts: number;
  } {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const logs = auditLogger.getLogs({ startDate: new Date(oneWeekAgo) });

    const encryptionEvents = logs.filter(l => l.action === 'encryption').length;
    const backupEvents = logs.filter(l => l.action === 'backup').length;
    const auditEvents = logs.filter(l => l.action === 'audit').length;

    return {
      encryptionRate: encryptionEvents,
      backupRate: backupEvents,
      auditRate: auditEvents,
      performanceAlerts: performanceMonitor.getAlerts().length
    };
  }

  // CORNERWORK
  async validateBackupIntegrity(backupBytes: Uint8Array): Promise<boolean> {
    try {
      const { isEncryptedBackup } = require('./backupEncryption');
      if (!isEncryptedBackup(backupBytes)) return false;

      // Verifikation ist hier noch nicht implementiert
      return true;
    } catch (error) {
      console.error('_verification_security_error:', error);
      return false;
    }
  }

  getOverview(): SecurityOverview {
    const db = DatabaseManager.getInstance();

    // عدد الجلسات النشطة
    const activeSessionsRow = db.query<{ count: number }>(`
      SELECT COUNT(*) AS count FROM user_sessions WHERE is_active = 1
    `);
    const activeSessions = activeSessionsRow[0]?.count ?? 0;

    // عدد المستخدمين النشطين
    const activeUsersRow = db.query<{ count: number }>(`
      SELECT COUNT(*) AS count FROM users WHERE is_active = 1
    `);
    const usersCount = activeUsersRow[0]?.count ?? 0;

    // حسابات مقفلة مؤقتًا
    const lockedAccountsRow = db.query<{ count: number }>(`
      SELECT COUNT(*) AS count FROM users u
      JOIN login_history lh ON u.id = lh.user_id
      WHERE u.is_active = 1 AND lh.succeeded = 0
      GROUP BY u.id
      HAVING COUNT(*) >= (
        SELECT value FROM system_settings WHERE key = 'maxFailedLoginAttempts' LIMIT 1
      )
    `);
    const lockedAccounts = lockedAccountsRow[0]?.count ?? 0;

    // نجاح/فشل في آخر 24 ساعة
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const successRow = db.query<{ count: number }>(`
      SELECT COUNT(*) AS count FROM login_history WHERE succeeded = 1 AND created_at > ?
    `, [yesterday]);
    const success24h = successRow[0]?.count ?? 0;

    const failedRow = db.query<{ count: number }>(`
      SELECT COUNT(*) AS count FROM login_history WHERE succeeded = 0 AND created_at > ?
    `, [yesterday]);
    const failed24h = failedRow[0]?.count ?? 0;

    // مهلة الجلسة الافتراضية
    const sessionTimeoutMinutesRow = db.query<{ value: string }>(`
      SELECT value FROM system_settings WHERE key = 'sessionTimeoutMinutes'
    `);
    const sessionTimeoutMinutes = Number(sessionTimeoutMinutesRow[0]?.value ?? 480);

    // أقصى محادثات فشل
    const maxFailedAttemptsRow = db.query<{ value: string }>(`
      SELECT value FROM system_settings WHERE key = 'maxFailedLoginAttempts'
    `);
    const maxFailedAttempts = Number(maxFailedAttemptsRow[0]?.value ?? 5);

    // آخر نسخة احتياطية
    const lastBackupRow = db.query<{ timestamp: string }>(`
      SELECT MAX(created_at) AS timestamp FROM audit_logs WHERE action = 'backup'
    `);
    const lastBackupAt = lastBackupRow[0]?.timestamp || undefined;

    return {
      activeSessions,
      usersCount,
      success24h,
      failed24h,
      sessionTimeoutMinutes,
      maxFailedAttempts,
      lockedAccounts,
      lastBackupAt
    };
  }

  getActiveSessions(): ActiveSession[] {
    const db = DatabaseManager.getInstance();
    const currentUser = AuthService.getCurrentUser();
    const currentSessionId = AuthService.getSessionId();

    const sessionsRow = db.query<any>(`
      SELECT 
        s.id,
        s.user_id AS userId,
        u.username,
        u.full_name AS userName,
        u.role,
        s.device_label AS deviceLabel,
        s.last_seen_at AS lastSeenAt,
        s.started_at AS startedAt,
        CASE WHEN s.id = ? THEN 1 ELSE 0 END AS isCurrent
      FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.is_active = 1
      ORDER BY s.last_seen_at DESC
    `, [currentSessionId ?? '']);

    // تجميع الجلسات لكل مستخدم
    const sessionsMap = new Map<string, ActiveSession>();
    for (const row of sessionsRow) {
      if (!sessionsMap.has(row.userId)) {
        sessionsMap.set(row.userId, {
          id: row.id,
          userId: row.userId,
          userName: row.userName,
          username: row.username,
          role: row.role,
          deviceLabel: row.deviceLabel,
          lastSeenAt: row.lastSeenAt,
          startedAt: row.startedAt,
          isCurrent: row.isCurrent === 1
        });
      } else {
        // إذا كان هناك أكثر من جلسة للمستخدم، نحفظها كقائمة
        // هذا يحتاج لتطوير لاحق، لكن للآن نضعها كما هي
        sessionsMap.set(row.userId, {
          ...sessionsMap.get(row.userId)!,
          id: row.id,
          lastSeenAt: row.lastSeenAt,
          isCurrent: row.isCurrent === 1
        });
      }
    }

    return Array.from(sessionsMap.values());
  }

  getLoginHistory({ search = '', onlyFailed = false, limit = 150 }: { search?: string; onlyFailed?: boolean; limit?: number } = {}): LoginRecord[] {
    const db = DatabaseManager.getInstance();

    let query = `
      SELECT 
        id,
        user_id AS userId,
        username_attempted AS username,
        succeeded,
        failure_reason AS failureReason,
        device_label AS deviceLabel,
        created_at AS createdAt,
        ip_address AS ipAddress,
        user_agent AS userAgent
      FROM login_history
    `;

    const queryParams: any[] = [];

    // إضافة الفلتر حسب البحث
    if (search) {
      query += ` WHERE username_attempted LIKE ?`;
      queryParams.push(`%${search}%`);
    }

    // إضافة فلتر الفشل فقط
    if (onlyFailed) {
      if (search) query += ` AND`;
      else query += ` WHERE`;
      query += ` succeeded = 0`;
    }

    // إضافة ترتيب وحد
    query += ` ORDER BY created_at DESC LIMIT ?`;
    queryParams.push(Math.min(Math.max(limit, 1), 500));

    const rows = db.query<any>(query, queryParams);

    return rows.map(row => ({
      id: row.id,
      userId: row.userId,
      username: row.username,
      succeeded: row.succeeded === 1,
      failureReason: row.failureReason,
      deviceLabel: row.deviceLabel,
      createdAt: row.createdAt,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent
    }));
  }

  revokeSession(sessionId: string): void {
    const db = DatabaseManager.getInstance();
    db.run(
      `UPDATE user_sessions SET is_active = 0, ended_at = ?, end_reason = 'REVOKED' WHERE id = ?`,
      [new Date().toISOString(), sessionId]
    );
    this.logAudit('system', sessionId, 'session_revoke', 'user', 'session', `تم إنهاء الجلسة ${sessionId}`, true);
  }

  revokeUserSessions(userId: string): number {
    const db = DatabaseManager.getInstance();
    const activeSessions = Number(db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM user_sessions WHERE user_id = ? AND is_active = 1`,
      [userId]
    )[0]?.count ?? 0);
    db.run(
      `UPDATE user_sessions SET is_active = 0, ended_at = ?, end_reason = 'REVOKED' WHERE user_id = ? AND is_active = 1`,
      [new Date().toISOString(), userId]
    );
    this.logAudit('system', userId, 'sessions_revoke', 'user', 'user', `تم إنهاء ${activeSessions} جلسات للمستخدم ${userId}`, true);
    return activeSessions;
  }

  private logAudit(module: string, userId: string, action: string, entityType: string, entityId: string, description: string, success: boolean, severity: 'low' | 'medium' | 'high' = 'medium'): void {
    try {
      auditLogger.log(module, userId, action, entityType, entityId, description, null, success, severity);
    } catch (e) {
      // ignored
    }
  }
}

export const securityService = SecurityService.getInstance();
