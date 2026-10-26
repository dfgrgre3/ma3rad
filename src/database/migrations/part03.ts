import type { Database } from 'sql.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { paymentAccountCode, postLedgerEntry, queryLedgerRows } from '../ledger';
import { localDateString } from '../../utils/date';
import {
  DEFAULT_SETTINGS, DEFAULT_BRANCH_ID, EXTENDED_SETTINGS_KEYS,
  tableExists, columnExists, addColumn, backfillReturnLedgerEntries,
  type Migration,
} from '../migrationSupport';

export const MIGRATION_PART_03: Migration[] = [
{
    id: '011_sales_pipeline_completion',
    description: 'Complete the sales pipeline: link quotations/orders to invoices, track returned amounts and invoice payments',
    up: (db) => {
      addColumn(db, 'quotations', 'warehouse_id', 'TEXT');
      addColumn(db, 'quotations', 'converted_invoice_id', 'TEXT');
      addColumn(db, 'quotations', 'updated_at', 'TEXT');
      addColumn(db, 'quotation_items', 'discount_amount', 'REAL DEFAULT 0');
      addColumn(db, 'quotation_items', 'size', 'TEXT');
      addColumn(db, 'quotation_items', 'sku', 'TEXT');
      addColumn(db, 'orders', 'invoice_id', 'TEXT');
      addColumn(db, 'orders', 'quotation_id', 'TEXT');
      addColumn(db, 'orders', 'branch_id', 'TEXT');
      addColumn(db, 'orders', 'sales_rep_id', 'TEXT');
      addColumn(db, 'sales_invoices', 'returned_amount', 'REAL DEFAULT 0');
      addColumn(db, 'sales_returns', 'register_id', 'TEXT');
      addColumn(db, 'sales_returns', 'shift_id', 'TEXT');
      addColumn(db, 'customer_payments', 'invoice_id', 'TEXT');

      db.run(
        `UPDATE sales_invoices SET returned_amount = COALESCE((
           SELECT SUM(sr.total_amount) FROM sales_returns sr
           WHERE sr.original_invoice_id = sales_invoices.id
         ), 0)
         WHERE returned_amount IS NULL OR returned_amount = 0`
      );

      db.exec('CREATE INDEX IF NOT EXISTS idx_quote_invoice ON quotations(converted_invoice_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_order_invoice ON orders(invoice_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_customer_payments_invoice ON customer_payments(invoice_id)');
    },
  },

{
    id: 'seed_walkin_customer',
    description: 'Seed the default walk-in cash customer used by the POS screen',
    up: (db) => {
      db.run(
        `INSERT OR IGNORE INTO customers (
           id, code, name, phone, customer_type, credit_limit, current_balance, total_purchases, notes
         ) VALUES ('cust_cash', 'CASH-001', 'عميل نقدي (بيع مباشر)', '', 'RETAIL', 0, 0, 0, 'حساب افتراضي لفواتير البيع النقدي السريع من شاشة نقطة البيع')`
      );
    },
  },

{
    id: '011_user_permission_effect',
    description: 'Allow per-user permission overrides to grant OR deny a capability',
    up: (db) => {
      addColumn(db, 'user_permissions', 'effect', "TEXT NOT NULL DEFAULT 'GRANT'");
    },
  },

{
    id: '012_extended_branding_settings',
    description: 'Insert branding/appearance keys introduced with the admin control center',
    up: (db) => {
      for (const key of EXTENDED_SETTINGS_KEYS) {
        db.run('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)', [
          key,
          DEFAULT_SETTINGS[key],
        ]);
      }
    },
  },

{
    id: '013_sales_pages_completion',
    description: 'Order delivery tracking, status timeline, quotation follow-ups, and return refund methods',
    up: (db) => {
      addColumn(db, 'orders', 'delivery_notes', 'TEXT');
      addColumn(db, 'orders', 'delivered_at', 'TEXT');
      addColumn(db, 'order_items', 'invoiced_m2', 'REAL DEFAULT 0');
      addColumn(db, 'order_items', 'notes', 'TEXT');

      addColumn(db, 'quotations', 'follow_up_date', 'TEXT');
      addColumn(db, 'quotations', 'follow_up_notes', 'TEXT');
      addColumn(db, 'quotations', 'converted_order_id', 'TEXT');
      addColumn(db, 'quotations', 'contact_count', 'INTEGER DEFAULT 0');
      addColumn(db, 'quotations', 'last_contact_at', 'TEXT');

      addColumn(db, 'sales_returns', 'refund_method', "TEXT DEFAULT 'CASH'");

      db.exec(`
        CREATE TABLE IF NOT EXISTS order_status_history (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          from_status TEXT,
          to_status TEXT NOT NULL,
          note TEXT,
          created_by TEXT,
          created_by_name TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        );
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_quotations_followup ON quotations(follow_up_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_quotations_order ON quotations(converted_order_id)');
    },
  },

{
    id: '015_sales_invoice_status_columns',
    description: 'Add legacy sales invoice status columns required by the analytics and payment screens',
    up: (db) => {
      addColumn(db, 'sales_invoices', 'payment_status', "TEXT NOT NULL DEFAULT 'PAID'");
      addColumn(db, 'sales_invoices', 'invoice_status', "TEXT NOT NULL DEFAULT 'COMPLETED'");

      db.run(`UPDATE sales_invoices SET payment_status = 'PAID' WHERE payment_status IS NULL`);
      db.run(`UPDATE sales_invoices SET invoice_status = 'COMPLETED' WHERE invoice_status IS NULL`);
    },
  },

{
    id: '014_users_custom_roles',
    description: 'Drop the built-in-role CHECK constraint so custom roles can be assigned to users',
    disableForeignKeys: true,
    up: (db) => {
      db.exec('PRAGMA foreign_keys = OFF');
      try {
        db.exec('DROP TABLE IF EXISTS users_new');
        db.exec(`
          CREATE TABLE users_new (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL,
            phone TEXT,
            pin_code TEXT,
            branch_id TEXT REFERENCES branches(id),
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
        db.exec(`
          INSERT INTO users_new (id, username, password_hash, full_name, role, phone, pin_code, branch_id, is_active, created_at, updated_at)
          SELECT id, username, password_hash, full_name, role, phone, pin_code, branch_id, is_active, created_at, updated_at FROM users;
        `);
        db.exec('DROP TABLE users');
        db.exec('ALTER TABLE users_new RENAME TO users');
      } finally {
        db.exec('PRAGMA foreign_keys = ON');
      }
    },
  },

{
    id: '016_general_product_types',
    description: 'Allow general non-ceramic products in the product catalog',
    up: (db) => {
      addColumn(db, 'products', 'product_type', "TEXT NOT NULL DEFAULT 'CERAMIC'");
    },
  },

{
    id: '017_custom_product_units',
    description: 'Store custom labels for product units',
    up: (db) => {
      addColumn(db, 'products', 'custom_unit', "TEXT NOT NULL DEFAULT ''");
    },
  }
];
