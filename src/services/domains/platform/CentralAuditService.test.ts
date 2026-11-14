import { describe, it, expect } from 'vitest';
import { centralAuditService } from './CentralAuditService';

describe('CentralAuditService - Tamper-evident & Sanitization Engine', () => {
  it('sanitizes sensitive fields like passwords, secrets, and activation codes', () => {
    const rawData = {
      username: 'client_admin',
      temporaryPassword: 'SecretPassword123!',
      activationCode: 'ACT-9999-8888-7777',
      regularField: 'safeValue',
    };

    const sanitized = centralAuditService.sanitize(rawData) as Record<string, string>;
    expect(sanitized.username).toBe('client_admin');
    expect(sanitized.regularField).toBe('safeValue');
    expect(sanitized.temporaryPassword).not.toBe('SecretPassword123!');
    expect(sanitized.temporaryPassword).toContain('****');
    expect(sanitized.activationCode).toContain('****');
  });

  it('correctly infers severity levels based on action keywords', () => {
    expect(centralAuditService.inferSeverity('تعليق حساب عميل')).toBe('SECURITY');
    expect(centralAuditService.inferSeverity('إلغاء اشتراك عميل')).toBe('SECURITY');
    expect(centralAuditService.inferSeverity('تعديل باقة العميل')).toBe('WARNING');
    expect(centralAuditService.inferSeverity('فشل تفعيل الترخيص')).toBe('CRITICAL');
    expect(centralAuditService.inferSeverity('عرض قائمة الفواتير')).toBe('INFO');
  });

  it('supports explicit severity override', () => {
    expect(centralAuditService.inferSeverity('عرض قائمة الفواتير', 'CRITICAL')).toBe('CRITICAL');
  });
});
