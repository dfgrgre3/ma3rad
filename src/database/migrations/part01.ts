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

export const MIGRATION_PART_01: Migration[] = [
{
    id: '001_seed_default_branch',
    description: 'Create the main branch row so branch_id has something to point at',
    up: (db) => {
      db.run(
        `INSERT OR IGNORE INTO branches (id, code, name, phone, address, is_main, is_active)
         VALUES (?, ?, ?, ?, ?, 1, 1)`,
        [
          DEFAULT_BRANCH_ID,
          'BR-01',
          'الفرع الرئيسي',
          DEFAULT_SETTINGS.phone,
          DEFAULT_SETTINGS.address,
        ]
      );
    },
  },

{
    id: '002_branch_id_columns',
    description: 'Add branch_id to the pre-branches tables and attach existing rows to the main branch',
    up: (db) => {
      const targets = [
        'warehouses',
        'cash_registers',
        'sales_invoices',
        'purchase_invoices',
        'expenses',
        'customers',
        'users',
      ];

      for (const table of targets) {
        const added = addColumn(db, table, 'branch_id', 'TEXT REFERENCES branches(id)');
        if (added) {
          // Existing rows predate branches; they all belong to the main branch.
          db.run(`UPDATE ${table} SET branch_id = ? WHERE branch_id IS NULL`, [DEFAULT_BRANCH_ID]);
        }
      }

      db.exec('CREATE INDEX IF NOT EXISTS idx_warehouses_branch ON warehouses(branch_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_inv_branch ON sales_invoices(branch_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_pur_inv_branch ON purchase_invoices(branch_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch_id)');
    },
  },

{
    id: '003_sales_pipeline_columns',
    description: 'Link invoices to sales reps, orders and projects for commissions and project P&L',
    up: (db) => {
      addColumn(db, 'sales_invoices', 'sales_rep_id', 'TEXT REFERENCES employees(id)');
      addColumn(db, 'sales_invoices', 'order_id', 'TEXT REFERENCES orders(id)');
      addColumn(db, 'sales_invoices', 'project_id', 'TEXT REFERENCES projects(id)');
      addColumn(db, 'quotations', 'sales_rep_id', 'TEXT REFERENCES employees(id)');
      addColumn(db, 'quotations', 'lead_id', 'TEXT REFERENCES leads(id)');
      addColumn(db, 'quotations', 'project_id', 'TEXT REFERENCES projects(id)');
      addColumn(db, 'customer_payments', 'project_id', 'TEXT REFERENCES projects(id)');
      addColumn(db, 'customers', 'assigned_rep_id', 'TEXT REFERENCES employees(id)');
      addColumn(db, 'customers', 'price_list_id', 'TEXT REFERENCES price_lists(id)');

      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_inv_rep ON sales_invoices(sales_rep_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_inv_project ON sales_invoices(project_id)');
    },
  },

{
    id: '004_seed_system_roles',
    description: 'Seed the six built-in roles referenced by users.role',
    up: (db) => {
      const roles: Array<[string, string, string]> = [
        ['ADMIN', 'مدير النظام', 'صلاحية كاملة على كل وحدات النظام'],
        ['MANAGER', 'مدير', 'إدارة المبيعات والمخازن والتقارير والموافقات'],
        ['ACCOUNTANT', 'محاسب', 'الخزينة والمصروفات والديون والتقارير المالية'],
        ['SALES', 'مبيعات', 'العملاء وعروض الأسعار والفواتير'],
        ['CASHIER', 'كاشير', 'نقطة البيع والتحصيل وإغلاق الوردية'],
        ['WAREHOUSE', 'مستودع', 'المخزون والتحويلات والجرد والتوصيل'],
      ];
      for (const [code, name, description] of roles) {
        db.run(
          `INSERT OR IGNORE INTO roles (id, code, name, description, is_system)
           VALUES (?, ?, ?, ?, 1)`,
          [`role_${code.toLowerCase()}`, code, name, description]
        );
      }
    },
  },

{
    id: '005_backfill_system_settings',
    description: 'Insert any DEFAULT_SETTINGS key the database does not have yet',
    up: (db) => {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        db.run('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
      }
    },
  },

{
    id: '005b_add_price_lists_is_default',
    description: 'Add is_default column to price_lists table for legacy databases',
    up: (db) => {
      addColumn(db, 'price_lists', 'is_default', 'INTEGER DEFAULT 0');
    },
  },

{
    id: '006_seed_default_price_list',
    description: 'Seed the default retail price list so products always resolve a price',
    up: (db) => {
      // Ensure is_default column exists before inserting (for legacy databases)
      addColumn(db, 'price_lists', 'is_default', 'INTEGER DEFAULT 0');

      db.run(
        `INSERT OR IGNORE INTO price_lists (id, code, name, customer_type, currency, is_default, is_active)
         VALUES (?, ?, ?, ?, ?, 1, 1)`,
        ['pl_retail', 'PL-RETAIL', 'قائمة أسعار التجزئة', 'RETAIL', DEFAULT_SETTINGS.currency]
      );
      db.run(
        `INSERT OR IGNORE INTO price_lists (id, code, name, customer_type, currency, is_default, is_active)
         VALUES (?, ?, ?, ?, ?, 0, 1)`,
        ['pl_wholesale', 'PL-WHOLESALE', 'قائمة أسعار الجملة', 'WHOLESALE', DEFAULT_SETTINGS.currency]
      );
      db.run(
        `INSERT OR IGNORE INTO price_lists (id, code, name, customer_type, currency, is_default, is_active)
         VALUES (?, ?, ?, ?, ?, 0, 1)`,
        ['pl_contractor', 'PL-CONTRACTOR', 'قائمة أسعار المقاولين', 'CONTRACTOR', DEFAULT_SETTINGS.currency]
      );
    },
  },

{
    id: '007_performance_indexes',
    description: 'Add composite indexes for frequent ledger, invoice, payment and notification lookups',
    up: (db) => {
      addColumn(db, 'sales_invoices', 'payment_status', "TEXT NOT NULL DEFAULT 'PAID'");
      addColumn(db, 'sales_invoices', 'invoice_status', "TEXT NOT NULL DEFAULT 'COMPLETED'");
      db.run(`UPDATE sales_invoices SET payment_status = 'PAID' WHERE payment_status IS NULL`);
      db.run(`UPDATE sales_invoices SET invoice_status = 'COMPLETED' WHERE invoice_status IS NULL`);

      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_inv_tx_prod_wh_date ON inventory_transactions(product_id, warehouse_id, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_sales_inv_customer_date ON sales_invoices(customer_id, date)',
        'CREATE INDEX IF NOT EXISTS idx_sales_inv_date_status ON sales_invoices(date, payment_status, invoice_status)',
        'CREATE INDEX IF NOT EXISTS idx_sales_items_product ON sales_invoice_items(product_id, invoice_id)',
        'CREATE INDEX IF NOT EXISTS idx_purchase_inv_supplier_date ON purchase_invoices(supplier_id, date)',
        'CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_date ON customer_payments(customer_id, date)',
        'CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_date ON supplier_payments(supplier_id, date)',
        'CREATE INDEX IF NOT EXISTS idx_notifications_user_read_date ON notifications(user_id, is_read, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_audit_module_date ON audit_logs(module, created_at)',
      ];
      for (const sql of indexes) db.exec(sql);
    },
  }
];
