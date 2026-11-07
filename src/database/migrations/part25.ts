import type { Migration } from '../migrationSupport';
import { columnExists } from '../migrationSupport';

export const MIGRATION_PART_25: Migration[] = [
  {
    id: '135_recoverable_login_pins',
    description: 'Store recoverable login PINs as database-key-encrypted ciphertext.',
    up: (db) => {
      if (!columnExists(db, 'users', 'pin_ciphertext')) {
        db.exec('ALTER TABLE users ADD COLUMN pin_ciphertext TEXT');
      }
      if (!columnExists(db, 'user_login_pin_change_requests', 'pin_ciphertext')) {
        db.exec('ALTER TABLE user_login_pin_change_requests ADD COLUMN pin_ciphertext TEXT');
      }
    },
  },
];
