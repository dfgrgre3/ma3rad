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

export const MIGRATION_PART_02: Migration[] = [
{
    id: '008_cloud_sync_and_accounting',
    description: 'Add cloud/hybrid sync tables, chart of accounts, journal entries, and ceramic batch tracking',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chart_of_accounts (
          id TEXT PRIMARY KEY,
          code TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
          parent_code TEXT,
          balance REAL NOT NULL DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          notes TEXT
        );

        CREATE TABLE IF NOT EXISTS journal_entries (
          id TEXT PRIMARY KEY,
          entry_number TEXT UNIQUE NOT NULL,
          date TEXT NOT NULL,
          description TEXT NOT NULL,
          reference_type TEXT,
          reference_id TEXT,
          total_debit REAL NOT NULL DEFAULT 0,
          total_credit REAL NOT NULL DEFAULT 0,
          is_posted INTEGER DEFAULT 1,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS journal_entry_lines (
          id TEXT PRIMARY KEY,
          entry_id TEXT NOT NULL,
          account_id TEXT NOT NULL,
          debit REAL NOT NULL DEFAULT 0,
          credit REAL NOT NULL DEFAULT 0,
          description TEXT,
          FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
          FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        );

        -- 3. Ceramic Batches / Lots / Shades / Calibers
        CREATE TABLE IF NOT EXISTS product_batches (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          warehouse_id TEXT NOT NULL,
          batch_number TEXT NOT NULL,
          tone_shade TEXT NOT NULL,
          caliber TEXT DEFAULT '0',
          production_date TEXT,
          quantity_m2 REAL NOT NULL DEFAULT 0,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches(product_id, warehouse_id);
        CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);
        CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_entry_lines(account_id);
      `);

      // Seed standard Chart of Accounts
      const initialAccounts: Array<[string, string, string, string, string | null]> = [
        ['acc_1101', '1101', 'الصندوق والخزينة الرئيسية', 'ASSET', null],
        ['acc_1102', '1102', 'الحسابات البنكية', 'ASSET', null],
        ['acc_1103', '1103', 'العملاء والمدينون (الحسابات الآجلة)', 'ASSET', null],
        ['acc_1104', '1104', 'مخزون السيراميك والبورسلين والتشطيبات', 'ASSET', null],
        ['acc_1105', '1105', 'شيكات تحت التحصيل', 'ASSET', null],
        ['acc_2101', '2101', 'الموردون ومصانع السيراميك الدائنون', 'LIABILITY', null],
        ['acc_2102', '2102', 'ضريبة القيمة المضافة المستحقة', 'LIABILITY', null],
        ['acc_3101', '3101', 'رأس المال وحقوق الملكية', 'EQUITY', null],
        ['acc_3102', '3102', 'الأرباح المحتجزة / المرحلة', 'EQUITY', null],
        ['acc_4101', '4101', 'إيرادات مبيعات السيراميك والبورسلين', 'REVENUE', null],
        ['acc_4102', '4102', 'إيرادات خدمات النقل والتوصيل والمشال', 'REVENUE', null],
        ['acc_5101', '5101', 'تكلفة البضاعة المباعة (COGS)', 'EXPENSE', null],
        ['acc_5201', '5201', 'مصروفات تشغيلية وإدارية', 'EXPENSE', null],
        ['acc_5202', '5202', 'أجور ومرتبات العاملين', 'EXPENSE', null],
        ['acc_5203', '5203', 'إيجارات المعارض والمستودعات', 'EXPENSE', null],
        ['acc_5204', '5204', 'مصروفات صيانة ووقود سيارات التوصيل', 'EXPENSE', null],
      ];

      for (const [id, code, name, type, parent] of initialAccounts) {
        db.run(
          `INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
           VALUES (?, ?, ?, ?, ?, 0, 1)`,
          [id, code, name, type, parent]
        );
      }
    },
  },

{
    id: '009_project_links',
    description: 'Link sales invoices to projects for project revenue tracking',
    up: (db) => {
      addColumn(db, 'sales_invoices', 'project_id', 'TEXT');
    },
  },

{
    id: '010_employee_compat',
    description: 'Add legacy-friendly employee columns used by the HR screens and backfill them from canonical columns',
    up: (db) => {
      const added: Record<string, boolean> = {};
      added.name = addColumn(db, 'employees', 'name', 'TEXT');
      added.location = addColumn(db, 'employees', 'location', 'TEXT');
      added.role = addColumn(db, 'employees', 'role', 'TEXT');
      added.salary_type = addColumn(db, 'employees', 'salary_type', "TEXT DEFAULT 'MONTHLY'");
      added.status = addColumn(db, 'employees', 'status', "TEXT DEFAULT 'ACTIVE'");
      added.joined_date = addColumn(db, 'employees', 'joined_date', 'TEXT');

      if (added.name) db.run(`UPDATE employees SET name = full_name WHERE name IS NULL`);
      if (added.location) db.run(`UPDATE employees SET location = '' WHERE location IS NULL`);
      if (added.role) db.run(`UPDATE employees SET role = job_title WHERE role IS NULL`);
      if (added.status) db.run(`UPDATE employees SET status = CASE WHEN is_active = 1 THEN 'ACTIVE' ELSE 'SUSPENDED' END`);
      if (added.joined_date) db.run(`UPDATE employees SET joined_date = hired_at WHERE joined_date IS NULL`);

      db.exec('CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name)');
    },
  }
];
