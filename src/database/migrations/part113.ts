import type { Migration } from './support';

export const MIGRATION_PART_113: Migration = {
  id: '163_platform_staff_auth_credentials',
  description: 'Add password_hash and auth columns to platform_staff table to support real authentication.',
  up: (db) => {
    // Check if password_hash column already exists on platform_staff
    const columns = db.exec("PRAGMA table_info('platform_staff')")[0]?.values || [];
    const hasPasswordHash = columns.some((col) => col[1] === 'password_hash');

    if (!hasPasswordHash) {
      db.run(`ALTER TABLE platform_staff ADD COLUMN password_hash TEXT`);
      db.run(`ALTER TABLE platform_staff ADD COLUMN salt TEXT`);
      db.run(`ALTER TABLE platform_staff ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0`);
      db.run(`ALTER TABLE platform_staff ADD COLUMN locked_until TEXT`);
    }
  },
};
