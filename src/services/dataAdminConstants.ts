export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const CORE_PROTECTED_TABLES = [
  'users', 'roles', 'role_permissions', 'permissions', 'user_permissions',
  'system_settings', 'schema_migrations',
];

/** Kept selected by default during a full reset so the audit trail and numbering survive. */
export const RESET_KEEP_BY_DEFAULT = [
  'audit_logs', 'backup_history', 'sequence_counters', 'notification_preferences', 'dynamic_entity_types',
];
