import type { Migration } from './support';

/**
 * Platform staff two-factor authentication store. Mirrors `user_2fa` (which has
 * a hard FK to `users`), so staff accounts get their own table with identical
 * semantics. Written/read exclusively through the platform staff 2FA service.
 */
export const MIGRATION_PART_116: Migration = {
  id: '201_platform_staff_2fa',
  description: 'Create platform_staff_2fa for staff TOTP/HOTP secrets and hashed recovery codes.',
  up: (db) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_staff_2fa (
        user_id            TEXT PRIMARY KEY,
        secret             TEXT NOT NULL,
        algorithm          TEXT NOT NULL DEFAULT 'TOTP',
        period             INTEGER NOT NULL DEFAULT 30,
        counter            INTEGER NOT NULL DEFAULT 0,
        enabled            INTEGER NOT NULL DEFAULT 0,
        recovery_codes     TEXT NOT NULL DEFAULT '[]',
        hardware_token_id  TEXT,
        setup_date         TEXT,
        last_used_counter  INTEGER,
        created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  },
};
