import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centralAuditService } from './CentralAuditService';

test('sanitizes sensitive fields like passwords, secrets, and activation codes', () => {
  const rawData = {
    username: 'client_admin',
    temporaryPassword: 'SecretPassword123!',
    activationCode: 'ACT-9999-8888-7777',
    regularField: 'safeValue',
  };

  const sanitized = centralAuditService.sanitize(rawData) as Record<string, string>;
  assert.strictEqual(sanitized.username, 'client_admin');
  assert.strictEqual(sanitized.regularField, 'safeValue');
  assert.notStrictEqual(sanitized.temporaryPassword, 'SecretPassword123!');
  assert.ok(sanitized.temporaryPassword?.includes('****'));
  assert.ok(sanitized.activationCode?.includes('****'));
});

test('correctly infers severity levels based on action keywords', () => {
  assert.strictEqual(centralAuditService.inferSeverity('تعليق حساب عميل'), 'SECURITY');
  assert.strictEqual(centralAuditService.inferSeverity('إلغاء اشتراك عميل'), 'SECURITY');
  assert.strictEqual(centralAuditService.inferSeverity('تعديل باقة العميل'), 'WARNING');
  assert.strictEqual(centralAuditService.inferSeverity('فشل تفعيل الترخيص'), 'CRITICAL');
  assert.strictEqual(centralAuditService.inferSeverity('عرض قائمة الفواتير'), 'INFO');
});

test('supports explicit severity override', () => {
  assert.strictEqual(centralAuditService.inferSeverity('عرض قائمة الفواتير', 'CRITICAL'), 'CRITICAL');
});
