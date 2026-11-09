import type { Migration } from './support';
import { columnExists } from './support';

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
  {
    id: '136_customer_active_status',
    description: 'Track active and inactive customers for POS selection and customer management.',
    up: (db) => {
      if (!columnExists(db, 'customers', 'is_active')) {
        db.exec('ALTER TABLE customers ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_customers_status_type_name
          ON customers(company_id, is_active, customer_type, name)
      `);
    },
  },
];
