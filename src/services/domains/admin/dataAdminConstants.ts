export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const CORE_PROTECTED_TABLES = [
  'users', 'roles', 'role_permissions', 'permissions', 'user_permissions',
  'system_settings', 'schema_migrations',
];

/**
 * Tables that must never leave the application through the general data export.
 * Authentication, session, audit and backup metadata are only available through
 * the dedicated encrypted full-backup flow.
 */
export const EXPORT_PROTECTED_TABLES = new Set([
  ...CORE_PROTECTED_TABLES,
  'user_2fa',
  'user_sessions',
  'login_history',
  'audit_logs',
  'backup_history',
  'sequence_counters',
]);

/**
 * Tables that must never be written to through the general Excel import.
 * Restoring authentication, session and audit data is only allowed through
 * the dedicated encrypted full-backup flow.
 */
export const IMPORT_PROTECTED_TABLES = new Set([
  ...CORE_PROTECTED_TABLES,
  'user_2fa',
  'user_sessions',
  'login_history',
  'audit_logs',
  'backup_history',
  'sequence_counters',
]);

const SENSITIVE_COLUMN_PATTERN =
  /(password|passwd|pin_?code|secret|token|api_?key|private_?key|recovery_?code|salt|credential)/i;

/** Column names whose values are redacted even inside otherwise exportable tables. */
export function isSensitiveExportColumn(column: string): boolean {
  return SENSITIVE_COLUMN_PATTERN.test(column);
}

export function assertExportableTable(table: string): void {
  if (!IDENTIFIER.test(table)) throw new Error(`اسم الجدول غير صالح: ${table}`);
  if (EXPORT_PROTECTED_TABLES.has(table)) {
    throw new Error(`الجدول «${table}» محمي ولا يمكن تصديره. استخدم النسخة الاحتياطية المشفرة عند الحاجة إلى نسخة كاملة.`);
  }
}

/** Kept selected by default during a full reset so the audit trail and numbering survive. */
export const RESET_KEEP_BY_DEFAULT = [
  'audit_logs', 'backup_history', 'sequence_counters', 'notification_preferences', 'dynamic_entity_types',
];
