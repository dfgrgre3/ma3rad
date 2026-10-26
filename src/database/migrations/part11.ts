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

export const MIGRATION_PART_11: Migration[] = [
{
    id: '042_reconcile_chart_account_balances',
    description: 'Rebuild cached chart account balances from posted journal lines',
    up: (db) => {
      db.run(`
        UPDATE chart_of_accounts
        SET balance = ROUND(COALESCE((
          SELECT SUM(l.debit - l.credit)
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.entry_id
          WHERE l.account_id = chart_of_accounts.id AND e.is_posted = 1
        ), 0), 2)
      `);
    },
  },

{
    id: '043_hash_user_pins',
    description: 'Hash existing plaintext user PINs before removing them from API responses',
    up: (db) => {
      const users = queryLedgerRows<{ id: string; pin_code: string | null }>(
        db,
        `SELECT id, pin_code FROM users WHERE pin_code IS NOT NULL AND pin_code <> ''`
      );
      for (const user of users) {
        if (/^\$2[aby]\$/.test(user.pin_code || '')) continue;
        db.run('UPDATE users SET pin_code = ? WHERE id = ?', [
          bcrypt.hashSync(user.pin_code || '', bcrypt.genSaltSync(10)),
          user.id,
        ]);
      }
    },
  },

{
    id: '044_remove_demo_business_identity',
    description: 'Remove sample showroom and legal identity from existing installations',
    up: (db) => {
      const demoValues: Record<string, string> = {
        showroomName: 'معرض الأندلس للسيراميك والبورسلين والتشطيبات',
        tagline: 'أكبر تشكيلة سيراميك وبورسلين ومواد تشطيب بأفضل الأسعار',
        phone: '01012345678',
        phone2: '01234567890',
        address: 'شارع المعارض الرئيسي - أمام مجمع البنوك',
        taxNumber: '123-456-789',
        commercialRecord: 'CR-998877',
        receiptHeader: 'معرض الأندلس للسيراميك والبورسلين\nأهلاً بكم ونتشرف بخدمتكم دائماً',
      };
      for (const [key, sample] of Object.entries(demoValues)) {
        db.run('UPDATE system_settings SET value = ? WHERE key = ? AND value = ?', ['', key, sample]);
      }
    },
  },

{
    id: '045_reconcile_invoice_gross_profit',
    description: 'Recalculate historical merchandise gross profit excluding tax and shipping',
    up: (db) => {
      db.run(`
        UPDATE sales_invoices
        SET gross_profit = ROUND(subtotal - discount_amount - total_cost, 2)
      `);
    },
  },

{
    id: '046_enhance_product_batches',
    description: 'Add received_date, supplier_id, cost_price, quantity_remaining_m2, created_by columns to product_batches; backfill remaining from original quantity',
    up: (db) => {
      // Add new columns (addColumn is idempotent)
      addColumn(db, 'product_batches', 'received_date', 'TEXT');
      addColumn(db, 'product_batches', 'supplier_id', 'TEXT');
      addColumn(db, 'product_batches', 'cost_price', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'product_batches', 'quantity_remaining_m2', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'product_batches', 'created_by', 'TEXT');
      // Backfill remaining = total received (conservative — all stock still on hand)
      db.run(`UPDATE product_batches SET quantity_remaining_m2 = quantity_m2 WHERE quantity_remaining_m2 = 0`);
    },
  }
];
