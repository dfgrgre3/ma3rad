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

export const MIGRATION_PART_04: Migration[] = [
{
    id: '018_product_tone',
    description: 'Store the ceramic tone code on products',
    up: (db) => {
      addColumn(db, 'products', 'tone', "TEXT NOT NULL DEFAULT ''");
    },
  },

{
    id: '019_customer_payment_groups',
    description: 'Group multiple invoice allocations recorded as one customer payment',
    up: (db) => {
      addColumn(db, 'customer_payments', 'payment_group_id', 'TEXT');
      db.exec('CREATE INDEX IF NOT EXISTS idx_customer_payments_group ON customer_payments(payment_group_id)');
    },
  },

{
    id: '020_customer_invoice_due_dates',
    description: 'Add configurable customer payment terms and sales invoice due dates',
    up: (db) => {
      addColumn(db, 'customers', 'payment_terms_days', 'INTEGER NOT NULL DEFAULT 0');
      addColumn(db, 'sales_invoices', 'due_date', 'TEXT');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_inv_due_remaining ON sales_invoices(due_date, remaining_amount)');
    },
  },

{
    id: '021_receivable_custom_fields',
    description: 'Allow extra structured fields on other receivables',
    up: (db) => {
      addColumn(db, 'receivables', 'custom_fields_json', "TEXT NOT NULL DEFAULT '{}'");
    },
  },

{
    id: '022_supplier_active_status',
    description: 'Support archiving and reactivating suppliers',
    up: (db) => {
      addColumn(db, 'suppliers', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
    },
  },

{
    id: '023_fixed_asset_depreciation_accounts',
    description: 'Add standard accumulated depreciation and depreciation expense accounts',
    up: (db) => {
      const accounts: Array<[string, string, string, string]> = [
        ['acc_1602', '1602', 'Accumulated depreciation', 'ASSET'],
        ['acc_5205', '5205', 'Depreciation expense', 'EXPENSE'],
      ];
      for (const [id, code, name, type] of accounts) {
        db.run(
          'INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active) VALUES (?, ?, ?, ?, NULL, 0, 1)',
          [id, code, name, type]
        );
      }
    },
  }
];
