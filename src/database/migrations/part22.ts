import type { Migration } from './support';

export const MIGRATION_PART_22: Migration[] = [
  {
    id: '132_user_login_pin_change_requests',
    description: 'Add manager-approved login PIN change requests.',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_login_pin_change_requests (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          pin_hash TEXT NOT NULL,
          requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
          reviewed_by TEXT,
          reviewed_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_user_login_pin_pending_request
          ON user_login_pin_change_requests(user_id)
          WHERE status = 'PENDING';
      `);
    },
  },
];
