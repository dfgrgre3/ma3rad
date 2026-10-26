import type { Database } from 'sql.js';
import { SCHEMA_SQL } from './schema';
import type { Migration } from './migrationSupport';
import { MIGRATION_PART_01 } from './migrations/part01';
import { MIGRATION_PART_02 } from './migrations/part02';
import { MIGRATION_PART_03 } from './migrations/part03';
import { MIGRATION_PART_04 } from './migrations/part04';
import { MIGRATION_PART_05 } from './migrations/part05';
import { MIGRATION_PART_06 } from './migrations/part06';
import { MIGRATION_PART_07 } from './migrations/part07';
import { MIGRATION_PART_08 } from './migrations/part08';
import { MIGRATION_PART_09 } from './migrations/part09';
import { MIGRATION_PART_10 } from './migrations/part10';
import { MIGRATION_PART_11 } from './migrations/part11';
import { MIGRATION_PART_12 } from './migrations/part12';
import { MIGRATION_PART_13 } from './migrations/part13';
import { MIGRATION_ENTERPRISE } from './migrations/enterprise';
import { addColumn, columnExists, DEFAULT_BRANCH_ID, tableExists } from './migrationSupport';

export { DEFAULT_SETTINGS, DEFAULT_BRANCH_ID } from './migrationSupport';
export type { Migration } from './migrationSupport';

export const MIGRATIONS: Migration[] = [
  MIGRATION_PART_01,
  MIGRATION_PART_02,
  MIGRATION_PART_03,
  MIGRATION_PART_04,
  MIGRATION_PART_05,
  MIGRATION_PART_06,
  MIGRATION_PART_07,
  MIGRATION_PART_08,
  MIGRATION_PART_09,
  MIGRATION_PART_10,
  MIGRATION_PART_11,
  MIGRATION_PART_12,
  MIGRATION_PART_13,
  MIGRATION_ENTERPRISE,
  {
    id: '050_cash_shift_auto_close',
    description: 'Track automatically closed cashier shifts',
    up: (db: Database) => {
      addColumn(db, 'cash_shifts', 'auto_closed', 'INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    id: '051_cheques_represented_status',
    description: 'Allow re-presented cheques in the cheque status lifecycle',
    disableForeignKeys: true,
    up: (db: Database) => {
      const columns = [
        'id', 'cheque_number', 'type', 'party_type', 'party_id', 'party_name', 'bank_name',
        'amount', 'due_date', 'status', 'notes', 'created_by', 'created_at', 'updated_at',
        'bank_account_id', 'deposited_at', 'cleared_at', 'bounced_at', 'bounce_reason',
        'bounce_fee', 'journal_entry_id', 'clearing_entry_id', 'bounce_entry_id',
      ].filter((column) => columnExists(db, 'cheques', column));
      db.exec(`
        CREATE TABLE cheques_status_update (
          id TEXT PRIMARY KEY,
          cheque_number TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(type IN ('RECEIVED', 'ISSUED')),
          party_type TEXT NOT NULL DEFAULT 'OTHER' CHECK(party_type IN ('CUSTOMER', 'SUPPLIER', 'OTHER')),
          party_id TEXT,
          party_name TEXT NOT NULL,
          bank_name TEXT,
          amount REAL NOT NULL DEFAULT 0,
          due_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK(status IN ('PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'CANCELLED', 'RE_PRESENTED')),
          notes TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          bank_account_id TEXT,
          deposited_at TEXT,
          cleared_at TEXT,
          bounced_at TEXT,
          bounce_reason TEXT,
          bounce_fee REAL DEFAULT 0,
          journal_entry_id TEXT,
          clearing_entry_id TEXT,
          bounce_entry_id TEXT
        )
      `);
      db.exec(`INSERT INTO cheques_status_update (${columns.join(', ')})
        SELECT ${columns.join(', ')} FROM cheques`);
      db.exec('DROP TABLE cheques');
      db.exec('ALTER TABLE cheques_status_update RENAME TO cheques');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cheques_due ON cheques(due_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cheques_status ON cheques(status, type)');
    },
  },
  {
    id: '052_purchase_invoice_due_dates',
    description: 'Track supplier invoice due dates for cash flow forecasts',
    up: (db: Database) => {
      addColumn(db, 'purchase_invoices', 'due_date', 'TEXT');
      db.run(`
        UPDATE purchase_invoices
        SET due_date = date(date, '+' || COALESCE(
          (SELECT payment_terms_days FROM suppliers WHERE suppliers.id = purchase_invoices.supplier_id), 0
        ) || ' days')
        WHERE due_date IS NULL
      `);
    },
  },
  {
    id: '053_sales_batch_return_traceability',
    description: 'Track batch consumption per sale line and batch restoration per return line',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sales_invoice_batch_allocations (
          id TEXT PRIMARY KEY,
          invoice_item_id TEXT NOT NULL,
          batch_id TEXT NOT NULL,
          quantity_m2 REAL NOT NULL CHECK(quantity_m2 > 0),
          returned_m2 REAL NOT NULL DEFAULT 0 CHECK(returned_m2 >= 0),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (invoice_item_id) REFERENCES sales_invoice_items(id) ON DELETE CASCADE,
          FOREIGN KEY (batch_id) REFERENCES product_batches(id)
        );
        CREATE INDEX IF NOT EXISTS idx_sale_batch_alloc_item ON sales_invoice_batch_allocations(invoice_item_id);
        CREATE TABLE IF NOT EXISTS sales_return_batch_allocations (
          id TEXT PRIMARY KEY,
          return_item_id TEXT NOT NULL,
          sale_allocation_id TEXT,
          batch_id TEXT NOT NULL,
          quantity_m2 REAL NOT NULL CHECK(quantity_m2 > 0),
          is_pending INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (return_item_id) REFERENCES sales_return_items(id) ON DELETE CASCADE,
          FOREIGN KEY (sale_allocation_id) REFERENCES sales_invoice_batch_allocations(id),
          FOREIGN KEY (batch_id) REFERENCES product_batches(id)
        );
        CREATE INDEX IF NOT EXISTS idx_return_batch_alloc_item ON sales_return_batch_allocations(return_item_id);
      `);
    },
  },
  {
    id: '054_sales_financial_reconciliations',
    description: 'Store reviewed sales financial reconciliation snapshots',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sales_financial_reconciliations (
          id TEXT PRIMARY KEY,
          date_from TEXT NOT NULL,
          date_to TEXT NOT NULL,
          checks_json TEXT NOT NULL,
          notes TEXT NOT NULL,
          closed_by TEXT NOT NULL,
          closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sales_financial_reconciliations_period
          ON sales_financial_reconciliations(date_from, date_to, closed_at);
      `);
    },
  },
  {
    id: '055_remove_unmodified_sample_records',
    description: 'Remove unused example bank, cost center, gateway, warehouse locations, and walk-in phone',
    up: (db: Database) => {
      const deleteSeedIfUnused = (
        table: string,
        id: string,
        values: Record<string, string | number>,
        references: Array<[string, string]>
      ) => {
        if (!tableExists(db, table)) return;
        const fields = Object.keys(values);
        const matches = db.exec(
          `SELECT 1 FROM ${table} WHERE id = ? AND ${fields.map((field) => `${field} = ?`).join(' AND ')}`,
          [id, ...fields.map((field) => values[field])]
        )[0]?.values.length;
        if (!matches) return;

        const isReferenced = references.some(([referenceTable, column]) => {
          if (!tableExists(db, referenceTable) || !columnExists(db, referenceTable, column)) return false;
          return Boolean(db.exec(
            `SELECT 1 FROM ${referenceTable} WHERE ${column} = ? LIMIT 1`,
            [id]
          )[0]?.values.length);
        });
        if (!isReferenced) db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
      };

      deleteSeedIfUnused('payment_gateways', 'gw_pos_main', {
        name: 'ماكينة نقاط البيع POS (فيزا / ماستركارد)',
        provider_code: 'POS_TERMINAL',
        gl_account_id: 'acc_1106',
        commission_rate: 1.5,
        fixed_fee: 2,
        settlement_period_days: 1,
        is_active: 1,
        config_json: '{}',
      }, [['payment_gateway_settlements', 'gateway_id']]);
      deleteSeedIfUnused('payment_gateways', 'gw_fawry', {
        name: 'فوري للدفع الإلكتروني',
        provider_code: 'FAWRY',
        gl_account_id: 'acc_1106',
        commission_rate: 2,
        fixed_fee: 1,
        settlement_period_days: 2,
        is_active: 1,
        config_json: '{}',
      }, [['payment_gateway_settlements', 'gateway_id']]);

      deleteSeedIfUnused('bank_accounts', 'bank_default', {
        account_name: 'البنك الأهلي المصري - الحساب الرئيسي',
        bank_name: 'البنك الأهلي المصري',
        account_number: '10002938481',
        iban: 'EG12000200010002938481001',
        swift_code: 'NBEGEGCX',
        gl_account_id: 'acc_1102',
        current_balance: 0,
        is_active: 1,
      }, [
        ['bank_reconciliations', 'bank_account_id'],
        ['cheques', 'bank_account_id'],
        ['payment_gateway_settlements', 'bank_account_id'],
      ]);

      const costCenterReferences: Array<[string, string]> = [
        ['budgets', 'cost_center_id'],
        ['journal_entries', 'cost_center_id'],
        ['journal_entry_lines', 'cost_center_id'],
        ['expenses', 'cost_center_id'],
        ['sales_invoices', 'cost_center_id'],
        ['purchase_invoices', 'cost_center_id'],
      ];
      const costCenters: Array<[string, string, string, string]> = [
        ['cc_hq', 'CC-HQ', 'الإدارة العامة والمصروفات المشتركة', 'المقر الرئيسي والإدارة'],
        ['cc_sh1', 'CC-SH1', 'صالة العرض الرئيسية', 'معرض المبيعات الرئيسي'],
        ['cc_wh1', 'CC-WH1', 'المستودع المركزي واللوجستيات', 'المخازن المركزية وعمليات الشحن'],
        ['cc_proj', 'CC-PROJ', 'إدارة المشاريع والمقاولات', 'المشاريع الكبرى والتوريدات الحكومية والخاصة'],
      ];
      for (const [id, code, name, description] of costCenters) {
        deleteSeedIfUnused('cost_centers', id, {
          code,
          name,
          description,
          is_active: 1,
        }, costCenterReferences);
      }

      const locationSeeds: Array<[string, string, string, string, string, string, number, string]> = [
        ['loc_01', 'A', '01', '01', '01', '-A-01-01-01', 500, 'منطقة البورسلين الرئيسية'],
        ['loc_02', 'A', '01', '02', '01', '-A-01-02-01', 500, 'منطقة أرضيات فرز أول'],
        ['loc_03', 'B', '02', '01', '01', '-B-02-01-01', 350, 'حائط حمامات ومطابخ'],
        ['loc_04', 'Q', '00', '00', '00', '-Q-QUARANTINE', 200, 'منطقة الحجر والتفتيش'],
      ];
      for (const [id, zone, aisle, shelf, bin, barcodeSuffix, capacity, notes] of locationSeeds) {
        const location = db.exec(
          `SELECT l.warehouse_id, w.code
           FROM warehouse_locations l JOIN warehouses w ON w.id = l.warehouse_id
           WHERE l.id = ? AND l.zone = ? AND l.aisle = ? AND l.shelf = ? AND l.bin = ?
             AND l.barcode = w.code || ? AND l.max_capacity_m2 = ? AND l.notes = ?`,
          [id, zone, aisle, shelf, bin, barcodeSuffix, capacity, notes]
        )[0]?.values[0];
        if (!location) continue;
        deleteSeedIfUnused('warehouse_locations', id, {
          warehouse_id: String(location[0]),
          zone,
          aisle,
          shelf,
          bin,
          barcode: `${String(location[1])}${barcodeSuffix}`,
          max_capacity_m2: capacity,
          notes,
        }, [['product_location_stock', 'location_id']]);
      }

      if (tableExists(db, 'customers')) {
        db.run(
          `UPDATE customers SET phone = ''
           WHERE id = 'cust_cash' AND code = 'CASH-001'
             AND name = 'عميل نقدي (بيع مباشر)' AND phone = '01000000000'
             AND customer_type = 'RETAIL' AND credit_limit = 0
             AND current_balance = 0 AND total_purchases = 0
             AND notes = 'حساب افتراضي لفواتير البيع النقدي السريع من شاشة نقطة البيع'`
        );
      }
    },
  },
  {
    id: '056_supplier_payment_idempotency',
    description: 'Prevent duplicate supplier payments when a request is retried',
    up: (db: Database) => {
      addColumn(db, 'supplier_payments', 'idempotency_key', 'TEXT');
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_payments_idempotency
        ON supplier_payments(idempotency_key) WHERE idempotency_key IS NOT NULL`);
    },
  },
  {
    id: '057_explicit_user_branch_scope',
    description: 'Define assigned-branch and central access scopes for local users',
    up: (db: Database) => {
      addColumn(db, 'users', 'branch_scope', "TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK(branch_scope IN ('ASSIGNED', 'ALL'))");
      db.run("UPDATE users SET branch_scope = 'ALL' WHERE role = 'ADMIN'");
      if (columnExists(db, 'warehouses', 'branch_id')) {
        db.run(`
          UPDATE warehouses
          SET branch_id = COALESCE(
            (SELECT bw.branch_id FROM branch_warehouses bw
             WHERE bw.warehouse_id = warehouses.id
             ORDER BY bw.is_primary DESC, bw.branch_id ASC LIMIT 1),
            ?
          )
          WHERE branch_id IS NULL
        `, [DEFAULT_BRANCH_ID]);
      }

      if (tableExists(db, 'users_branches') && columnExists(db, 'users', 'branch_id')) {
        db.run(`
          INSERT OR IGNORE INTO users_branches (user_id, branch_id)
          SELECT u.id, b.id
          FROM users u
          JOIN branches b ON b.id = u.branch_id
          WHERE u.role <> 'ADMIN'
        `);
      }

      db.run(`
        INSERT OR IGNORE INTO users_branches (user_id, branch_id)
        SELECT u.id, b.id
        FROM users u
        JOIN branches b ON b.id = ?
        WHERE u.role <> 'ADMIN'
          AND NOT EXISTS (SELECT 1 FROM users_branches ub WHERE ub.user_id = u.id)
      `, [DEFAULT_BRANCH_ID]);
      db.exec('CREATE INDEX IF NOT EXISTS idx_users_branches_branch_user ON users_branches(branch_id, user_id)');
    },
  },
  {
    id: '058_branch_scoped_approvals_and_action_permissions',
    description: 'Scope approval requests to branches and split high-impact action permissions',
    up: (db: Database) => {
      addColumn(db, 'approval_requests', 'branch_id', 'TEXT');
      addColumn(db, 'purchase_requests', 'branch_id', 'TEXT');
      if (
        tableExists(db, 'approval_requests') &&
        tableExists(db, 'sales_invoices') &&
        tableExists(db, 'purchase_invoices') &&
        tableExists(db, 'users_branches') &&
        tableExists(db, 'inventory_transactions') &&
        tableExists(db, 'warehouses')
      ) {
        db.run(`
          UPDATE approval_requests AS a
          SET branch_id = COALESCE(
            (SELECT si.branch_id FROM sales_invoices si
             WHERE a.reference_type IN ('SALES_INVOICE', 'INVOICE') AND si.id = a.reference_id),
            (SELECT pi.branch_id FROM purchase_invoices pi
             WHERE a.reference_type IN ('PURCHASE_INVOICE', 'PURCHASE') AND pi.id = a.reference_id),
            (SELECT w.branch_id FROM inventory_transactions it
             JOIN warehouses w ON w.id = it.warehouse_id
             WHERE a.reference_type IN ('INVENTORY_TRANSACTION', 'STOCK_ADJUSTMENT') AND it.id = a.reference_id),
            (SELECT branch_id FROM users_branches ub
             WHERE ub.user_id = a.requested_by
               AND (SELECT COUNT(*) FROM users_branches owned WHERE owned.user_id = a.requested_by) = 1)
          )
          WHERE a.branch_id IS NULL
        `);
      }
      if (
        tableExists(db, 'purchase_requests') &&
        tableExists(db, 'warehouses') &&
        tableExists(db, 'users_branches')
      ) {
        db.run(`
          UPDATE purchase_requests AS pr
          SET branch_id = COALESCE(
            (SELECT w.branch_id FROM warehouses w WHERE w.id = pr.warehouse_id),
            (SELECT branch_id FROM users_branches ub
             WHERE ub.user_id = pr.requested_by
               AND (SELECT COUNT(*) FROM users_branches owned WHERE owned.user_id = pr.requested_by) = 1)
          )
          WHERE pr.branch_id IS NULL
        `);
      }

      const permissionUpgrades: Array<[string, string]> = [
        ['approvals.view', 'approvals.create'],
        ['approvals.approve', 'approvals.reject'],
        ['approvals.approve', 'approvals.cancel'],
        ['cashier.shift', 'cashier.shift.open'],
        ['cashier.shift', 'cashier.shift.close'],
        ['finance.approve', 'finance.close'],
        ['purchases.approve', 'purchases.reject'],
        ['purchases.approve', 'purchases.cancel_request'],
        ['customers.payment', 'customers.payment.reverse'],
        ['cashier.expense', 'cashier.expense.update'],
        ['cashier.expense', 'cashier.expense.delete'],
      ];
      for (const [legacyPermission, permission] of permissionUpgrades) {
        db.run(`
          INSERT OR IGNORE INTO role_permissions (role_code, permission_code)
          SELECT role_code, ? FROM role_permissions WHERE permission_code = ?
        `, [permission, legacyPermission]);
      }
    },
  },
  {
    id: '059_invoice_created_at_list_indexes',
    description: 'Index invoice creation timestamps used by newest-first invoice lists',
    up: (db: Database) => {
      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_invoices_created_at ON sales_invoices(created_at DESC)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_purchase_invoices_created_at ON purchase_invoices(created_at DESC)');
    },
  },
  {
    id: '060_branch_scoped_cash_transactions',
    description: 'Attach cash transactions to branches and create branch registers',
    up: (db: Database) => {
      addColumn(db, 'cash_shifts', 'branch_id', 'TEXT REFERENCES branches(id)');
      addColumn(db, 'expenses', 'branch_id', 'TEXT REFERENCES branches(id)');
      addColumn(db, 'customer_payments', 'branch_id', 'TEXT REFERENCES branches(id)');
      addColumn(db, 'supplier_payments', 'branch_id', 'TEXT REFERENCES branches(id)');
      addColumn(db, 'installment_plans', 'branch_id', 'TEXT REFERENCES branches(id)');

      db.run('UPDATE cash_registers SET branch_id = ? WHERE branch_id IS NULL', [DEFAULT_BRANCH_ID]);
      db.run(`
        UPDATE cash_shifts
        SET branch_id = COALESCE(
          (SELECT branch_id FROM cash_registers WHERE id = cash_shifts.register_id),
          ?
        )
        WHERE branch_id IS NULL
      `, [DEFAULT_BRANCH_ID]);
      db.run(`
        UPDATE expenses
        SET branch_id = COALESCE(
          (SELECT branch_id FROM cash_registers WHERE id = expenses.register_id),
          ?
        )
        WHERE branch_id IS NULL
      `, [DEFAULT_BRANCH_ID]);
      db.run(`
        UPDATE customer_payments
        SET branch_id = COALESCE(
          (SELECT branch_id FROM sales_invoices WHERE id = customer_payments.invoice_id),
          (SELECT branch_id FROM cash_registers WHERE id = customer_payments.register_id),
          ?
        )
        WHERE branch_id IS NULL
      `, [DEFAULT_BRANCH_ID]);
      db.run(`
        UPDATE supplier_payments
        SET branch_id = COALESCE(
          (SELECT branch_id FROM cash_registers WHERE id = supplier_payments.register_id),
          ${tableExists(db, 'supplier_payment_allocations')
            ? `(SELECT pi.branch_id FROM supplier_payment_allocations spa
                JOIN purchase_invoices pi ON pi.id = spa.purchase_invoice_id
                WHERE spa.payment_id = supplier_payments.id
                ORDER BY pi.created_at DESC, pi.id LIMIT 1),`
            : ''}
          ?
        )
        WHERE branch_id IS NULL
      `, [DEFAULT_BRANCH_ID]);
      db.run(`
        UPDATE installment_plans
        SET branch_id = COALESCE(
          (SELECT branch_id FROM sales_invoices WHERE id = installment_plans.invoice_id),
          (SELECT branch_id FROM customers WHERE id = installment_plans.customer_id),
          ?
        )
        WHERE branch_id IS NULL
      `, [DEFAULT_BRANCH_ID]);

      db.exec('CREATE INDEX IF NOT EXISTS idx_cash_shifts_branch_status ON cash_shifts(branch_id, status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_expenses_branch_date ON expenses(branch_id, date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_customer_payments_branch_date ON customer_payments(branch_id, date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_supplier_payments_branch_date ON supplier_payments(branch_id, date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_installment_plans_branch_status ON installment_plans(branch_id, status)');

      const hasRegisters = Number(db.exec('SELECT COUNT(*) FROM cash_registers')[0]?.values[0]?.[0] ?? 0) > 0;
      if (hasRegisters) {
        const branches = db.exec(`
          SELECT b.id, b.code, b.is_main FROM branches b
          WHERE b.is_active = 1
            AND NOT EXISTS (SELECT 1 FROM cash_registers cr WHERE cr.branch_id = b.id)
          ORDER BY b.id
        `)[0]?.values ?? [];
        for (const [branchIdValue, branchCodeValue] of branches) {
          const branchId = String(branchIdValue);
          const branchCode = String(branchCodeValue);
          const isMain = Number(branches.find((row) => String(row[0]) === branchId)?.[2]) === 1;
          if (!hasRegisters && isMain) continue;
          db.run(`
            INSERT INTO cash_registers (id, name, current_balance, is_default, is_active, branch_id)
            VALUES (?, ?, 0, 1, 1, ?)
          `, [`cr_${branchId}`, `الخزينة الرئيسية - ${branchCode}`, branchId]);
        }
      }
    },
  },
  {
    id: '061_branch_scoped_ledger_entries',
    description: 'Attach ledger entries to source branches without guessing unlinked history',
    up: (db: Database) => {
      addColumn(db, 'journal_entries', 'branch_id', 'TEXT REFERENCES branches(id)');
      db.run(`
        UPDATE journal_entries AS e
        SET branch_id = COALESCE(
          (SELECT branch_id FROM sales_invoices WHERE id = substr(e.reference_id, 1,
            CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
            AND e.reference_type IN ('SALES_INVOICE', 'SALES_VOID')),
          (SELECT branch_id FROM purchase_invoices WHERE id = substr(e.reference_id, 1,
            CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
            AND e.reference_type IN ('PURCHASE_INVOICE', 'PURCHASE_VOID')),
          (SELECT branch_id FROM expenses WHERE id = substr(e.reference_id, 1,
            CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
            AND e.reference_type IN ('EXPENSE', 'EXPENSE_EDIT')),
          (SELECT branch_id FROM customer_payments WHERE id = substr(e.reference_id, 1,
            CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
            AND e.reference_type IN ('CUSTOMER_PAYMENT', 'CUSTOMER_PAYMENT_VOID')),
          (SELECT branch_id FROM customer_payments WHERE payment_group_id = substr(e.reference_id, 1,
            CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
            AND e.reference_type IN ('CUSTOMER_PAYMENT_GROUP', 'CUSTOMER_PAYMENT_GROUP_VOID')
            ORDER BY date, id LIMIT 1),
          (SELECT branch_id FROM supplier_payments WHERE id = substr(e.reference_id, 1,
            CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
            AND e.reference_type IN ('SUPPLIER_PAYMENT', 'SUPPLIER_PAYMENT_VOID')),
          (SELECT si.branch_id FROM sales_returns sr JOIN sales_invoices si ON si.id = sr.original_invoice_id
            WHERE sr.id = substr(e.reference_id, 1,
              CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
              AND e.reference_type = 'SALES_RETURN'),
          (SELECT pi.branch_id FROM purchase_returns pr JOIN purchase_invoices pi ON pi.id = pr.original_purchase_id
            WHERE pr.id = substr(e.reference_id, 1,
              CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
              AND e.reference_type = 'PURCHASE_RETURN'),
          (SELECT COALESCE(w.branch_id, (
              SELECT bw.branch_id FROM branch_warehouses bw
              WHERE bw.warehouse_id = t.warehouse_id
              ORDER BY bw.is_primary DESC, bw.branch_id LIMIT 1
            ))
            FROM inventory_transactions t
            LEFT JOIN warehouses w ON w.id = t.warehouse_id
            WHERE t.id = substr(e.reference_id, 1,
              CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
              AND e.reference_type IN ('INVENTORY_ADJUSTMENT', 'INVENTORY_WRITE_OFF', 'TRANSFER_LOSS')),
          (SELECT prior.branch_id FROM journal_entries prior
            WHERE prior.reference_id = substr(e.reference_id, 1,
              CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
              AND prior.branch_id IS NOT NULL
            ORDER BY prior.created_at DESC LIMIT 1)
        )
        WHERE e.branch_id IS NULL
      `);
      db.run(`
        UPDATE journal_entries AS e
        SET branch_id = (
          SELECT prior.branch_id FROM journal_entries prior
          WHERE prior.reference_id = substr(e.reference_id, 1,
            CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
            AND prior.branch_id IS NOT NULL
          ORDER BY prior.created_at DESC LIMIT 1
        )
        WHERE e.branch_id IS NULL
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_date ON journal_entries(branch_id, date)');
    },
  },
  {
    id: '062_branch_scoped_hr_transactions',
    description: 'Assign employees, payroll transactions and commissions to branches',
    up: (db: Database) => {
      addColumn(db, 'commissions', 'branch_id', 'TEXT REFERENCES branches(id)');
      addColumn(db, 'payroll_transactions', 'branch_id', 'TEXT REFERENCES branches(id)');
      db.run('UPDATE employees SET branch_id = ? WHERE branch_id IS NULL', [DEFAULT_BRANCH_ID]);
      db.run(`
        UPDATE commissions
        SET branch_id = COALESCE(
          (SELECT branch_id FROM sales_invoices WHERE id = commissions.source_id
            AND commissions.source_type = 'SALES_INVOICE'),
          (SELECT branch_id FROM employees WHERE id = commissions.employee_id)
        )
        WHERE branch_id IS NULL
      `);
      db.run(`
        UPDATE payroll_transactions
        SET branch_id = (SELECT branch_id FROM employees WHERE id = payroll_transactions.employee_id)
        WHERE branch_id IS NULL
      `);
      db.run(`
        UPDATE journal_entries AS e
        SET branch_id = COALESCE(
          (SELECT branch_id FROM commissions
            WHERE id = substr(e.reference_id, 1,
              CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
              AND e.reference_type IN ('COMMISSION_APPROVAL', 'COMMISSION_PAYMENT', 'COMMISSION_CANCELLATION')),
          (SELECT branch_id FROM payroll_transactions
            WHERE id = substr(e.reference_id, 1,
              CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
              AND e.reference_type IN ('PAYROLL_TRANSACTION', 'PAYROLL_REVERSAL')),
          (SELECT branch_id FROM employees
            WHERE id = substr(e.reference_id, 1,
              CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
              AND e.reference_type IN ('PAYROLL_SALARY_ACCRUAL', 'PAYROLL_ADVANCE_APPLICATION')),
          (SELECT prior.branch_id FROM journal_entries prior
            WHERE prior.reference_id = substr(e.reference_id, 1,
              CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
              AND prior.branch_id IS NOT NULL
            ORDER BY prior.created_at DESC LIMIT 1)
        )
        WHERE e.branch_id IS NULL
      `);
      db.run(`
        UPDATE journal_entries AS e
        SET branch_id = (
          SELECT prior.branch_id FROM journal_entries prior
          WHERE prior.reference_id = substr(e.reference_id, 1,
            CASE WHEN instr(e.reference_id, ':') > 0 THEN instr(e.reference_id, ':') - 1 ELSE length(e.reference_id) END)
            AND prior.branch_id IS NOT NULL
          ORDER BY prior.created_at DESC LIMIT 1
        )
        WHERE e.branch_id IS NULL
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_commissions_branch_period ON commissions(branch_id, period_month)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_payroll_transactions_branch_date ON payroll_transactions(branch_id, date)');
    },
  },
].flat();

export interface MigrationReport {
  applied: string[];
  skipped: string[];
  failed: Array<{ id: string; error: string }>;
}

function appliedIds(db: Database): Set<string> {
  const res = db.exec('SELECT id FROM schema_migrations');
  return new Set((res[0]?.values ?? []).map((row) => String(row[0])));
}

/**
 * Brings any database — brand new or years old — up to the current schema.
 * Call on every startup, before any service issues a query.
 *
 * A migration that throws is left unrecorded. Later migrations depend on earlier
 * schema and data invariants, so stop immediately and retry on the next launch.
 */
export function runMigrations(db: Database): MigrationReport {
  const report: MigrationReport = { applied: [], skipped: [], failed: [] };

  // PRAGMA foreign_keys is connection-scoped and SQLite ignores changes made
  // inside a transaction, so configure it before executing schema/migrations.
  db.run('PRAGMA foreign_keys = ON');
  const foreignKeysEnabled = Number(db.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0]) === 1;
  if (!foreignKeysEnabled) {
    throw new Error('SQLite foreign key enforcement could not be enabled.');
  }

  // 1. Create missing tables before migrations. Indexes are deferred because a
  //    legacy table may not have the columns referenced by a newer index yet.
  //    Executing the whole schema at once would roll back table creation too,
  //    leaving migrations unable to add those columns on the next launch.
  const schemaWithoutIndexes = SCHEMA_SQL.replace(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?;\s*/gi,
    ''
  );
  db.run('BEGIN TRANSACTION');
  try {
    db.exec(schemaWithoutIndexes);
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }

  // 2. Apply the ordered migration list.
  const done = appliedIds(db);

  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) {
      report.skipped.push(migration.id);
      continue;
    }
    if (migration.disableForeignKeys) {
      db.run('PRAGMA foreign_keys = OFF');
    }
    try {
      db.run('BEGIN TRANSACTION');
      migration.up(db);
      db.run('INSERT OR REPLACE INTO schema_migrations (id, description) VALUES (?, ?)', [
        migration.id,
        migration.description,
      ]);
      db.run('COMMIT');
      report.applied.push(migration.id);
    } catch (error) {
      try { db.run('ROLLBACK'); } catch { /* transaction may already be closed */ }
      const message = error instanceof Error ? error.message : String(error);
      report.failed.push({ id: migration.id, error: message });
      console.error(`❌ Migration ${migration.id} failed:`, message);
      break;
    } finally {
      db.run('PRAGMA foreign_keys = ON');
      const enabled = Number(db.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0]) === 1;
      if (!enabled) {
        throw new Error(`SQLite foreign key enforcement was not restored after migration ${migration.id}.`);
      }
    }
  }

  // 3. Re-run the idempotent schema after column migrations so all indexes
  //    exist on both fresh and upgraded databases.
  if (report.failed.length === 0) {
    db.run('BEGIN TRANSACTION');
    try {
      db.exec(SCHEMA_SQL);
      db.run('COMMIT');
    } catch (error) {
      try { db.run('ROLLBACK'); } catch { /* transaction may already be closed */ }
      throw error;
    }
  }

  if (report.applied.length > 0) {
    console.log(`✅ Applied ${report.applied.length} migration(s):`, report.applied.join(', '));
  }

  return report;
}
