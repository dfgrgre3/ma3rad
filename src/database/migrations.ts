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
  {
    id: '063_module_registry_lifecycle',
    description: 'Add append-only module activation history and per-module settings',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS module_activation_log (
          id TEXT PRIMARY KEY,
          module_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('ACTIVATED', 'DEACTIVATED')),
          actor_id TEXT,
          actor_name TEXT,
          reason TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_module_activation_log_module
          ON module_activation_log(module_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS module_settings (
          module_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          updated_by TEXT,
          PRIMARY KEY (module_id, key)
        );
      `);
    },
  },
  {
    id: '064_companies_and_branch_ownership',
    description: 'Add legal-entity companies and attach existing branches to a default company',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS companies (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          legal_name TEXT,
          tax_number TEXT,
          commercial_record TEXT,
          currency TEXT,
          parent_company_id TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (parent_company_id) REFERENCES companies(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_companies_parent ON companies(parent_company_id);
      `);
      addColumn(db, 'branches', 'company_id', 'TEXT');
      db.exec(`
        INSERT OR IGNORE INTO companies
          (id, code, name, legal_name, tax_number, commercial_record, currency, is_active, created_at, updated_at)
        VALUES (
          'cmp_main',
          'MAIN',
          COALESCE(NULLIF((SELECT value FROM system_settings WHERE key = 'showroomName'), ''), 'Main Company'),
          COALESCE(NULLIF((SELECT value FROM system_settings WHERE key = 'showroomName'), ''), 'Main Company'),
          (SELECT value FROM system_settings WHERE key = 'taxNumber'),
          (SELECT value FROM system_settings WHERE key = 'commercialRecord'),
          COALESCE(NULLIF((SELECT value FROM system_settings WHERE key = 'currency'), ''), 'EGP'),
          1,
          datetime('now'),
          datetime('now')
        );
        UPDATE branches SET company_id = 'cmp_main' WHERE company_id IS NULL OR company_id = '';
        CREATE INDEX IF NOT EXISTS idx_branches_company ON branches(company_id);
      `);
    },
  },
  {
    id: '065_documents_and_contracts',
    description: 'Add centralized document management with immutable versions and contract lifecycle',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS enterprise_documents (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          branch_id TEXT,
          document_number TEXT NOT NULL,
          title TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'GENERAL',
          description TEXT,
          status TEXT NOT NULL DEFAULT 'DRAFT'
            CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
          confidentiality TEXT NOT NULL DEFAULT 'INTERNAL'
            CHECK (confidentiality IN ('INTERNAL', 'RESTRICTED', 'CONFIDENTIAL')),
          owner_user_id TEXT,
          current_version INTEGER NOT NULL DEFAULT 0 CHECK (current_version >= 0),
          expires_at TEXT,
          created_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (owner_user_id) REFERENCES users(id),
          FOREIGN KEY (created_by) REFERENCES users(id),
          UNIQUE (company_id, document_number)
        );

        CREATE INDEX IF NOT EXISTS idx_enterprise_documents_company_status
          ON enterprise_documents(company_id, status, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_enterprise_documents_expiry
          ON enterprise_documents(expires_at);
        CREATE INDEX IF NOT EXISTS idx_enterprise_documents_branch
          ON enterprise_documents(branch_id);

        CREATE TABLE IF NOT EXISTS enterprise_document_versions (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          version_number INTEGER NOT NULL CHECK (version_number > 0),
          file_name TEXT NOT NULL,
          mime_type TEXT,
          file_size INTEGER CHECK (file_size IS NULL OR file_size >= 0),
          checksum TEXT,
          storage_name TEXT,
          notes TEXT,
          created_by TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (document_id) REFERENCES enterprise_documents(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id),
          UNIQUE (document_id, version_number)
        );

        CREATE INDEX IF NOT EXISTS idx_enterprise_document_versions_document
          ON enterprise_document_versions(document_id, version_number DESC);

        CREATE TABLE IF NOT EXISTS enterprise_contracts (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          branch_id TEXT,
          contract_number TEXT NOT NULL,
          title TEXT NOT NULL,
          party_type TEXT NOT NULL DEFAULT 'OTHER'
            CHECK (party_type IN ('CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OTHER')),
          party_id TEXT,
          party_name TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          value REAL NOT NULL DEFAULT 0 CHECK (value >= 0),
          currency TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'DRAFT'
            CHECK (status IN ('DRAFT', 'ACTIVE', 'TERMINATED')),
          auto_renew INTEGER NOT NULL DEFAULT 0,
          renewal_notice_days INTEGER NOT NULL DEFAULT 30
            CHECK (renewal_notice_days >= 0 AND renewal_notice_days <= 3650),
          owner_user_id TEXT,
          document_id TEXT,
          notes TEXT,
          terminated_at TEXT,
          termination_reason TEXT,
          created_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (owner_user_id) REFERENCES users(id),
          FOREIGN KEY (document_id) REFERENCES enterprise_documents(id),
          FOREIGN KEY (created_by) REFERENCES users(id),
          UNIQUE (company_id, contract_number)
        );

        CREATE INDEX IF NOT EXISTS idx_enterprise_contracts_company_status
          ON enterprise_contracts(company_id, status, end_date);
        CREATE INDEX IF NOT EXISTS idx_enterprise_contracts_end_date
          ON enterprise_contracts(end_date);
        CREATE INDEX IF NOT EXISTS idx_enterprise_contracts_document
          ON enterprise_contracts(document_id);

        CREATE TABLE IF NOT EXISTS enterprise_document_events (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL CHECK (entity_type IN ('DOCUMENT', 'CONTRACT')),
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL,
          actor_id TEXT,
          actor_name TEXT,
          details TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_enterprise_document_events_entity
          ON enterprise_document_events(entity_type, entity_id, created_at DESC);
      `);
    },
  },
  {
    id: '066_projects_and_hr_module_hardening',
    description: 'Backfill project branches, index project scope, and register projects/HR in saved module selections',
    up: (db: Database) => {
      db.exec(`
        UPDATE projects
        SET branch_id = (
          SELECT id FROM branches
          WHERE is_main = 1 AND is_active = 1
          ORDER BY id LIMIT 1
        )
        WHERE branch_id IS NULL;

        CREATE INDEX IF NOT EXISTS idx_projects_branch ON projects(branch_id);
      `);

      // Projects and HR existed as always-visible screens before they became
      // registry modules. Preserve that behavior for installations that have
      // already saved an explicit module selection; administrators can still
      // deactivate them afterwards.
      const row = db.exec("SELECT value FROM system_settings WHERE key = 'enabledModules'")[0]?.values[0]?.[0];
      if (typeof row === 'string' && row.trim()) {
        try {
          const parsed: unknown = JSON.parse(row);
          if (Array.isArray(parsed)) {
            const modules = new Set(parsed.filter((id): id is string => typeof id === 'string'));
            for (const id of ['documents', 'projects', 'hr']) modules.add(id);
            if (modules.has('inventory')) modules.add('manufacturing');
            db.run("UPDATE system_settings SET value = ? WHERE key = 'enabledModules'", [JSON.stringify([...modules])]);
          }
        } catch {
          // A malformed saved selection falls back to profile defaults; leave it untouched.
        }
      }
    },
  },
  {
    id: '067_hr_leave_requests',
    description: 'Add employee leave requests with branch scope and approval lifecycle',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS employee_leave_requests (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          leave_type TEXT NOT NULL CHECK(leave_type IN ('ANNUAL', 'SICK', 'UNPAID', 'OTHER')),
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          days INTEGER NOT NULL,
          reason TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
          requested_by TEXT NOT NULL,
          decided_by TEXT,
          decided_at TEXT,
          decision_note TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES employees(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (requested_by) REFERENCES users(id),
          FOREIGN KEY (decided_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_employee_leave_employee_status
          ON employee_leave_requests(employee_id, status, start_date DESC);
        CREATE INDEX IF NOT EXISTS idx_employee_leave_branch_dates
          ON employee_leave_requests(branch_id, start_date, end_date);
      `);
    },
  },
  {
    id: '068_project_controls',
    description: 'Add project tasks, dependencies, time entries, budgets, risks, change requests and deliverables',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_tasks (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED')),
          priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
          assignee_name TEXT,
          start_date TEXT,
          due_date TEXT,
          completed_at TEXT,
          progress INTEGER NOT NULL DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_project_tasks_project_status
          ON project_tasks(project_id, status, sort_order);

        CREATE TABLE IF NOT EXISTS project_task_dependencies (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          depends_on_task_id TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id),
          FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE,
          FOREIGN KEY (depends_on_task_id) REFERENCES project_tasks(id) ON DELETE CASCADE,
          UNIQUE(task_id, depends_on_task_id)
        );

        CREATE INDEX IF NOT EXISTS idx_project_task_dependencies_task
          ON project_task_dependencies(task_id);

        CREATE TABLE IF NOT EXISTS project_time_entries (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          task_id TEXT,
          employee_name TEXT,
          entry_date TEXT NOT NULL,
          hours REAL NOT NULL CHECK(hours > 0 AND hours <= 24),
          description TEXT,
          billable INTEGER NOT NULL DEFAULT 1,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id),
          FOREIGN KEY (task_id) REFERENCES project_tasks(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_project_time_project_date
          ON project_time_entries(project_id, entry_date DESC);

        CREATE TABLE IF NOT EXISTS project_budget_lines (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          category TEXT NOT NULL,
          description TEXT,
          planned_amount REAL NOT NULL DEFAULT 0,
          actual_amount REAL NOT NULL DEFAULT 0,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id)
        );

        CREATE INDEX IF NOT EXISTS idx_project_budget_project
          ON project_budget_lines(project_id, category);

        CREATE TABLE IF NOT EXISTS project_risks (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
          probability TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(probability IN ('LOW', 'MEDIUM', 'HIGH')),
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'MITIGATED', 'ACCEPTED', 'CLOSED')),
          mitigation TEXT,
          owner_name TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_project_risks_project_status
          ON project_risks(project_id, status, severity);

        CREATE TABLE IF NOT EXISTS project_change_requests (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          cost_impact REAL NOT NULL DEFAULT 0,
          time_impact_days INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
          requested_by TEXT,
          decided_by TEXT,
          decided_at TEXT,
          decision_note TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id),
          FOREIGN KEY (requested_by) REFERENCES users(id),
          FOREIGN KEY (decided_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_project_changes_project_status
          ON project_change_requests(project_id, status, created_at DESC);

        CREATE TABLE IF NOT EXISTS project_deliverables (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          due_date TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'IN_PROGRESS', 'DELIVERED', 'ACCEPTED', 'REJECTED')),
          delivered_at TEXT,
          accepted_at TEXT,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id)
        );

        CREATE INDEX IF NOT EXISTS idx_project_deliverables_project_status
          ON project_deliverables(project_id, status, due_date);
      `);
    },
  },
  {
    id: '069_hr_employee_contracts',
    description: 'Add branch-scoped employee contracts with draft/active/terminated lifecycle and renewal tracking',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS employee_contracts (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          contract_number TEXT UNIQUE NOT NULL,
          contract_type TEXT NOT NULL DEFAULT 'PERMANENT'
            CHECK(contract_type IN ('PERMANENT', 'FIXED_TERM', 'PART_TIME', 'TEMPORARY')),
          start_date TEXT NOT NULL,
          end_date TEXT,
          job_title TEXT NOT NULL,
          salary REAL NOT NULL DEFAULT 0 CHECK(salary >= 0),
          currency TEXT NOT NULL DEFAULT 'EGP',
          status TEXT NOT NULL DEFAULT 'DRAFT'
            CHECK(status IN ('DRAFT', 'ACTIVE', 'TERMINATED')),
          signed_date TEXT,
          renewal_notice_days INTEGER NOT NULL DEFAULT 30
            CHECK(renewal_notice_days >= 0 AND renewal_notice_days <= 365),
          terminated_at TEXT,
          termination_reason TEXT,
          notes TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES employees(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_employee_contracts_employee_status
          ON employee_contracts(employee_id, status, start_date DESC);
        CREATE INDEX IF NOT EXISTS idx_employee_contracts_branch_status
          ON employee_contracts(branch_id, status, end_date);
      `);
    },
  },
  {
    id: '070_hr_employee_documents',
    description: 'Add branch-scoped employee document records with expiry and archive status',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS employee_documents (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          document_type TEXT NOT NULL DEFAULT 'OTHER'
            CHECK(document_type IN ('IDENTITY', 'CONTRACT', 'CERTIFICATE', 'MEDICAL', 'EDUCATION', 'OTHER')),
          title TEXT NOT NULL,
          document_number TEXT,
          issued_at TEXT,
          expires_at TEXT,
          status TEXT NOT NULL DEFAULT 'ACTIVE'
            CHECK(status IN ('ACTIVE', 'EXPIRED', 'ARCHIVED')),
          confidentiality TEXT NOT NULL DEFAULT 'INTERNAL'
            CHECK(confidentiality IN ('INTERNAL', 'RESTRICTED', 'CONFIDENTIAL')),
          notes TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES employees(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_status
          ON employee_documents(employee_id, status, expires_at);
        CREATE INDEX IF NOT EXISTS idx_employee_documents_branch_type
          ON employee_documents(branch_id, document_type, expires_at);
      `);
    },
  },
  {
    id: '071_manufacturing_core',
    description: 'Add manufacturing work centers, bills of materials, and production orders with material and operation tracking',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS work_centers (
          id TEXT PRIMARY KEY,
          code TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          cost_per_hour REAL NOT NULL DEFAULT 0 CHECK(cost_per_hour >= 0),
          capacity_per_day REAL NOT NULL DEFAULT 0 CHECK(capacity_per_day >= 0),
          branch_id TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (branch_id) REFERENCES branches(id)
        );

        CREATE INDEX IF NOT EXISTS idx_work_centers_branch_active
          ON work_centers(branch_id, is_active);

        CREATE TABLE IF NOT EXISTS bills_of_materials (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          name TEXT NOT NULL,
          version TEXT NOT NULL DEFAULT '1.0',
          status TEXT NOT NULL DEFAULT 'DRAFT'
            CHECK(status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
          notes TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_boms_product_status
          ON bills_of_materials(product_id, status);

        CREATE TABLE IF NOT EXISTS bom_items (
          id TEXT PRIMARY KEY,
          bom_id TEXT NOT NULL,
          component_product_id TEXT NOT NULL,
          quantity REAL NOT NULL CHECK(quantity > 0),
          unit TEXT NOT NULL DEFAULT 'PIECE',
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (bom_id) REFERENCES bills_of_materials(id) ON DELETE CASCADE,
          FOREIGN KEY (component_product_id) REFERENCES products(id)
        );

        CREATE INDEX IF NOT EXISTS idx_bom_items_bom
          ON bom_items(bom_id);

        CREATE TABLE IF NOT EXISTS production_orders (
          id TEXT PRIMARY KEY,
          order_number TEXT UNIQUE NOT NULL,
          product_id TEXT NOT NULL,
          bom_id TEXT NOT NULL,
          quantity REAL NOT NULL CHECK(quantity > 0),
          status TEXT NOT NULL DEFAULT 'PLANNED'
            CHECK(status IN ('PLANNED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
          priority TEXT NOT NULL DEFAULT 'MEDIUM'
            CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
          start_date TEXT,
          due_date TEXT,
          completed_at TEXT,
          branch_id TEXT NOT NULL,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id),
          FOREIGN KEY (bom_id) REFERENCES bills_of_materials(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_production_orders_branch_status
          ON production_orders(branch_id, status, created_at DESC);

        CREATE TABLE IF NOT EXISTS production_order_materials (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          planned_qty REAL NOT NULL CHECK(planned_qty >= 0),
          consumed_qty REAL NOT NULL DEFAULT 0 CHECK(consumed_qty >= 0),
          status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK(status IN ('PENDING', 'ISSUED', 'CONSUMED', 'SHORTAGE')),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES production_orders(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id)
        );

        CREATE INDEX IF NOT EXISTS idx_production_order_materials_order
          ON production_order_materials(order_id);

        CREATE TABLE IF NOT EXISTS production_order_operations (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          work_center_id TEXT NOT NULL,
          sequence INTEGER NOT NULL DEFAULT 0,
          planned_minutes REAL NOT NULL DEFAULT 0 CHECK(planned_minutes >= 0),
          actual_minutes REAL NOT NULL DEFAULT 0 CHECK(actual_minutes >= 0),
          status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK(status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED')),
          started_at TEXT,
          completed_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES production_orders(id) ON DELETE CASCADE,
          FOREIGN KEY (work_center_id) REFERENCES work_centers(id)
        );

        CREATE INDEX IF NOT EXISTS idx_production_order_operations_order
          ON production_order_operations(order_id, sequence);
      `);
    },
  },
  {
    id: '072_company_scope_columns',
    description: 'Add explicit company_id to core business tables and backfill it from branch ownership so legal-entity scope is no longer derived only from branches.',
    up: (db: Database) => {
      const tables = ['branches', 'warehouses', 'sales_invoices', 'purchase_invoices', 'customers', 'suppliers', 'products', 'employees'];
      for (const table of tables) {
        try {
          db.exec(`ALTER TABLE ${table} ADD COLUMN company_id TEXT;`);
        } catch {
          // Column already exists on upgraded databases.
        }
      }
      // Backfill company_id from the owning branch where a branch is known.
      // Warehouse-scoped tables resolve their company through warehouses -> branches.
      const warehouseScoped = ['sales_invoices', 'purchase_invoices'];
      for (const table of warehouseScoped) {
        try {
          db.exec(`
            UPDATE ${table}
            SET company_id = (
              SELECT b.company_id FROM warehouses w
              JOIN branches b ON b.id = w.branch_id
              WHERE w.id = ${table}.warehouse_id
            )
            WHERE company_id IS NULL AND warehouse_id IS NOT NULL;
          `);
        } catch {
          // Ignore backfill failures on older schemas.
        }
      }
      const branchScoped = ['customers', 'suppliers', 'products', 'employees', 'warehouses'];
      for (const table of branchScoped) {
        try {
          db.exec(`
            UPDATE ${table}
            SET company_id = (SELECT b.company_id FROM branches b WHERE b.id = ${table}.branch_id)
            WHERE company_id IS NULL AND branch_id IS NOT NULL;
          `);
        } catch {
          // Best-effort backfill; tables without branch_id are skipped.
        }
      }
      // Global (non-branch) entities keep NULL company_id so legacy rows remain
      // visible under company scoping until a service assigns an explicit one.
      try {
        db.exec(`
          INSERT OR IGNORE INTO companies (id, code, name, is_active, created_at, updated_at)
          VALUES ('cmp_main', 'MAIN', 'الشركة الرئيسية', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        `);
      } catch {
        // companies table may not exist on very old schemas; ignore.
      }
      try {
        db.exec(`UPDATE branches SET company_id = COALESCE(company_id, 'cmp_main') WHERE company_id IS NULL;`);
      } catch {
        // Ignore when branches has no company_id column.
      }
      for (const table of tables) {
        try {
          db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_company ON ${table}(company_id);`);
        } catch {
          // Ignore index creation failures on older schemas.
        }
      }
    },
  },
  {
    id: '073_manufacturing_warehouse',
    description: 'Add warehouse tracking to production orders for inventory posting',
    up: (db: Database) => {
      try { db.exec(`ALTER TABLE production_orders ADD COLUMN warehouse_id TEXT;`); } catch { /* exists */ }
      db.exec(`
        UPDATE production_orders
        SET warehouse_id = (
          SELECT id FROM warehouses
          WHERE branch_id = production_orders.branch_id
          ORDER BY is_default DESC, id ASC LIMIT 1
        )
        WHERE warehouse_id IS NULL;
        CREATE INDEX IF NOT EXISTS idx_production_orders_warehouse
          ON production_orders(warehouse_id);
      `);
    },
  },
  {
    id: '074_manufacturing_quality_checks',
    description: 'Add quality inspection records for manufacturing production orders',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS manufacturing_quality_checks (
          id TEXT PRIMARY KEY,
          production_order_id TEXT NOT NULL,
          inspection_type TEXT NOT NULL DEFAULT 'FINAL'
            CHECK(inspection_type IN ('INCOMING', 'IN_PROCESS', 'FINAL')),
          result TEXT NOT NULL DEFAULT 'PENDING'
            CHECK(result IN ('PASS', 'FAIL', 'PENDING', 'CONDITIONAL')),
          quantity_inspected REAL NOT NULL DEFAULT 0,
          quantity_accepted REAL NOT NULL DEFAULT 0,
          quantity_rejected REAL NOT NULL DEFAULT 0,
          notes TEXT,
          inspector_id TEXT,
          branch_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE,
          FOREIGN KEY (inspector_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mfg_quality_order
          ON manufacturing_quality_checks(production_order_id);
        CREATE INDEX IF NOT EXISTS idx_mfg_quality_branch
          ON manufacturing_quality_checks(branch_id);
      `);
    },
  },
  {
    id: '075_manufacturing_maintenance',
    description: 'Add equipment maintenance records for manufacturing work centers',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS manufacturing_maintenance (
          id TEXT PRIMARY KEY,
          work_center_id TEXT,
          equipment_name TEXT NOT NULL,
          maintenance_type TEXT NOT NULL DEFAULT 'PREVENTIVE'
            CHECK(maintenance_type IN ('PREVENTIVE', 'CORRECTIVE', 'PREDICTIVE')),
          status TEXT NOT NULL DEFAULT 'SCHEDULED'
            CHECK(status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
          scheduled_date TEXT,
          completed_date TEXT,
          cost REAL NOT NULL DEFAULT 0,
          notes TEXT,
          performed_by TEXT,
          branch_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (work_center_id) REFERENCES work_centers(id) ON DELETE SET NULL,
          FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mfg_maintenance_wc
          ON manufacturing_maintenance(work_center_id);
        CREATE INDEX IF NOT EXISTS idx_mfg_maintenance_branch
          ON manufacturing_maintenance(branch_id);
        CREATE INDEX IF NOT EXISTS idx_mfg_maintenance_status
          ON manufacturing_maintenance(status);
      `);
    },
  },
  {
    id: '076_company_organization_settings',
    description: 'Add organization-level configuration (fiscal year, time zone, locale, date format) to companies',
    up: (db: Database) => {
      for (const col of [
        'ALTER TABLE companies ADD COLUMN fiscal_year_start_month INTEGER DEFAULT 1;',
        'ALTER TABLE companies ADD COLUMN time_zone TEXT;',
        'ALTER TABLE companies ADD COLUMN locale TEXT DEFAULT \'ar\';',
        'ALTER TABLE companies ADD COLUMN date_format TEXT DEFAULT \'YYYY-MM-DD\';',
      ]) {
        try { db.exec(col); } catch { /* exists */ }
      }
      db.exec(`UPDATE companies SET fiscal_year_start_month = COALESCE(fiscal_year_start_month, 1), locale = COALESCE(locale, 'ar'), date_format = COALESCE(date_format, 'YYYY-MM-DD') WHERE fiscal_year_start_month IS NULL OR locale IS NULL OR date_format IS NULL;`);
    },
  },
  {
    id: '077_company_payroll_settings',
    description: 'Add jurisdiction-configurable payroll settings to companies',
    up: (db: Database) => {
      for (const col of [
        'ALTER TABLE companies ADD COLUMN payroll_tax_rate REAL DEFAULT 0;',
        'ALTER TABLE companies ADD COLUMN overtime_multiplier REAL DEFAULT 1.5;',
        'ALTER TABLE companies ADD COLUMN working_days_per_month INTEGER DEFAULT 26;',
      ]) {
        try { db.exec(col); } catch { /* exists */ }
      }
      db.exec(`UPDATE companies SET payroll_tax_rate = COALESCE(payroll_tax_rate, 0), overtime_multiplier = COALESCE(overtime_multiplier, 1.5), working_days_per_month = COALESCE(working_days_per_month, 26) WHERE payroll_tax_rate IS NULL OR overtime_multiplier IS NULL OR working_days_per_month IS NULL;`);
    },
  },
  {
    id: '078_quality_disposition',
    description: 'Add disposition tracking to quality checks (scrap/rework/return/accept)',
    up: (db: Database) => {
      try { db.exec(`ALTER TABLE manufacturing_quality_checks ADD COLUMN disposition TEXT DEFAULT 'NONE' CHECK(disposition IN ('NONE','ACCEPT','SCRAP','REWORK','RETURN'));`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE manufacturing_quality_checks ADD COLUMN disposition_qty REAL DEFAULT 0;`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE manufacturing_quality_checks ADD COLUMN disposition_at TEXT;`); } catch { /* exists */ }
      db.exec(`UPDATE manufacturing_quality_checks SET disposition = COALESCE(disposition, 'NONE'), disposition_qty = COALESCE(disposition_qty, 0) WHERE disposition IS NULL;`);
    },
  },
  {
    id: '079_service_cost_accounts',
    description: 'Add service cost and accrued service cost accounts so service lines post a balanced cost entry instead of inflating goods COGS.',
    up: (db: Database) => {
      db.run(
        `INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
         VALUES ('acc_5102', '5102', 'تكلفة الخدمات المباشرة', 'EXPENSE', NULL, 0, 1)`
      );
      db.run(
        `INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
         VALUES ('acc_2105', '2105', 'مستحقات تكلفة الخدمات', 'LIABILITY', NULL, 0, 1)`
      );
    },
  },
  {
    id: '080_uom_quantity_columns',
    description: 'Add generic unit-of-measure columns (uom, quantity) beside quantity_m2 and keep them populated with triggers so stock and document lines no longer assume square meters.',
    up: (db: Database) => {
      // `inventory_transactions` is an immutable ledger with its own update
      // guard, so its unit columns are not maintained by triggers here.
      const tables = [
        'sales_invoice_items',
        'purchase_invoice_items',
        'sales_return_items',
        'purchase_return_items',
        'warehouse_stock',
      ];
      for (const table of tables) {
        try {
          db.exec(`ALTER TABLE ${table} ADD COLUMN uom TEXT;`);
        } catch {
          // Column already exists on upgraded databases.
        }
        try {
          db.exec(`ALTER TABLE ${table} ADD COLUMN quantity REAL;`);
        } catch {
          // Column already exists on upgraded databases.
        }
        // Backfill from the product's configured base unit; legacy rows with an
        // unknown product stay on square meters because that is what they meant.
        db.exec(`
          UPDATE ${table}
          SET uom = COALESCE(
                (SELECT p.base_unit FROM products p WHERE p.id = ${table}.product_id),
                'M2'
              ),
              quantity = quantity_m2
          WHERE quantity IS NULL OR uom IS NULL;
        `);
        // New writes keep both representations in sync without touching every
        // service: quantity is always the amount in the product's base unit.
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_${table}_uom_after_insert
          AFTER INSERT ON ${table}
          WHEN NEW.quantity IS NULL OR NEW.uom IS NULL
          BEGIN
            UPDATE ${table}
            SET uom = COALESCE(NEW.uom, (SELECT p.base_unit FROM products p WHERE p.id = NEW.product_id), 'M2'),
                quantity = COALESCE(NEW.quantity, NEW.quantity_m2)
            WHERE id = NEW.id;
          END;
        `);
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_${table}_uom_after_update
          AFTER UPDATE OF quantity_m2, product_id ON ${table}
          BEGIN
            UPDATE ${table}
            SET uom = COALESCE((SELECT p.base_unit FROM products p WHERE p.id = NEW.product_id), 'M2'),
                quantity = NEW.quantity_m2
            WHERE id = NEW.id;
          END;
        `);
        try {
          db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_uom ON ${table}(uom);`);
        } catch {
          // Index creation is best-effort on older schemas.
        }
      }
    },
  },
  {
    id: '081_company_scope_backfill',
    description: 'Backfill company_id on every scoped table and default it on insert, so company isolation can be strict instead of tolerating NULL rows.',
    up: (db: Database) => {
      const branchDerived = ['warehouses', 'employees'];
      db.exec(`UPDATE branches SET company_id = 'cmp_main' WHERE company_id IS NULL;`);
      for (const table of branchDerived) {
        db.exec(`
          UPDATE ${table}
          SET company_id = COALESCE(
            (SELECT b.company_id FROM branches b WHERE b.id = ${table}.branch_id),
            'cmp_main'
          )
          WHERE company_id IS NULL;
        `);
      }
      for (const table of ['customers', 'suppliers', 'products']) {
        db.exec(`UPDATE ${table} SET company_id = 'cmp_main' WHERE company_id IS NULL;`);
      }
      for (const table of ['sales_invoices', 'purchase_invoices']) {
        db.exec(`
          UPDATE ${table}
          SET company_id = COALESCE(
            (SELECT b.company_id FROM branches b WHERE b.id = ${table}.branch_id),
            (SELECT b.company_id FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.id = ${table}.warehouse_id),
            'cmp_main'
          )
          WHERE company_id IS NULL;
        `);
      }

      // Runtime defaults: any insert that omits company_id inherits the branch
      // owner (or the main company) instead of creating an invisible row.
      for (const table of branchDerived) {
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_${table}_company_after_insert
          AFTER INSERT ON ${table}
          WHEN NEW.company_id IS NULL
          BEGIN
            UPDATE ${table}
            SET company_id = COALESCE(
              (SELECT b.company_id FROM branches b WHERE b.id = NEW.branch_id),
              'cmp_main'
            )
            WHERE id = NEW.id;
          END;
        `);
      }
      for (const table of ['customers', 'suppliers', 'products']) {
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_${table}_company_after_insert
          AFTER INSERT ON ${table}
          WHEN NEW.company_id IS NULL
          BEGIN
            UPDATE ${table} SET company_id = 'cmp_main' WHERE id = NEW.id;
          END;
        `);
      }
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_branches_company_after_insert
        AFTER INSERT ON branches
        WHEN NEW.company_id IS NULL
        BEGIN
          UPDATE branches SET company_id = 'cmp_main' WHERE id = NEW.id;
        END;
      `);
      for (const table of ['sales_invoices', 'purchase_invoices']) {
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_${table}_company_after_insert
          AFTER INSERT ON ${table}
          WHEN NEW.company_id IS NULL
          BEGIN
            UPDATE ${table}
            SET company_id = COALESCE(
              (SELECT b.company_id FROM branches b WHERE b.id = NEW.branch_id),
              (SELECT b.company_id FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.id = NEW.warehouse_id),
              'cmp_main'
            )
            WHERE id = NEW.id;
          END;
        `);
      }
    },
  },
  {
    id: '082_journal_company_scope',
    description: 'Attach journal entries to the legal entity that owns their branch so accounting reports can be company-scoped.',
    up: (db: Database) => {
      addColumn(db, 'journal_entries', 'company_id', 'TEXT');
      db.exec(`
        UPDATE journal_entries
        SET company_id = COALESCE(
          (SELECT b.company_id FROM branches b WHERE b.id = journal_entries.branch_id),
          'cmp_main'
        )
        WHERE company_id IS NULL;
        CREATE INDEX IF NOT EXISTS idx_journal_entries_company ON journal_entries(company_id);
        CREATE TRIGGER IF NOT EXISTS trg_journal_entries_company_after_insert
        AFTER INSERT ON journal_entries
        WHEN NEW.company_id IS NULL
        BEGIN
          UPDATE journal_entries
          SET company_id = COALESCE(
            (SELECT b.company_id FROM branches b WHERE b.id = NEW.branch_id),
            'cmp_main'
          )
          WHERE id = NEW.id;
        END;
      `);
    },
  },
  {
    id: '083_sales_invoice_payments',
    description: 'Split-payment support: per-method payment rows for sales invoices.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sales_invoice_payments (
          id TEXT PRIMARY KEY,
          invoice_id TEXT NOT NULL,
          method TEXT NOT NULL,
          amount REAL NOT NULL,
          reference TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_sip_invoice ON sales_invoice_payments(invoice_id);
      `);
    },
  },
  {
    id: '084_held_orders',
    description: 'Persist POS held (parked) orders in the database for crash recovery.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS held_orders (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_held_orders_created ON held_orders(created_at);
      `);
    },
  },
  {
    id: '086_promotions',
    description: 'Promotions: percent/amount/BOGO/bundle/coupon rules with date range and scope.',
    up: (db: Database) => {
      // The base schema already creates the `promotions` table (schema part-11),
      // so this migration must only ADD the promotion columns that post-date the
      // base schema instead of re-creating the table. `CREATE TABLE IF NOT EXISTS`
      // silently skips on an existing table and the follow-up index then failed
      // with "no such column: coupon_code".
      db.exec(`
        CREATE TABLE IF NOT EXISTS promotion_usage (
          id TEXT PRIMARY KEY,
          promotion_id TEXT NOT NULL,
          invoice_id TEXT,
          coupon_code TEXT,
          discount_amount REAL NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_promotion_usage_promotion ON promotion_usage(promotion_id);
      `);
      addColumn(db, 'promotions', 'coupon_code', 'TEXT');
      addColumn(db, 'promotions', 'type', 'TEXT');
      addColumn(db, 'promotions', 'value', 'REAL');
      addColumn(db, 'promotions', 'buy_qty', 'REAL');
      addColumn(db, 'promotions', 'get_qty', 'REAL');
      addColumn(db, 'promotions', 'min_qty', 'REAL');
      addColumn(db, 'promotions', 'min_amount', 'REAL');
      addColumn(db, 'promotions', 'product_ids', 'TEXT');
      addColumn(db, 'promotions', 'category_ids', 'TEXT');
      addColumn(db, 'promotions', 'start_date', 'TEXT');
      addColumn(db, 'promotions', 'end_date', 'TEXT');
      addColumn(db, 'promotions', 'priority', 'INTEGER NOT NULL DEFAULT 0');
      db.exec(`CREATE INDEX IF NOT EXISTS idx_promo_coupon ON promotions(coupon_code);`);
    },
  },
  {
    id: '087_sync_event_scope',
    description: 'Add tenant and branch scope to synchronization events.',
    up: (db: Database) => {
      addColumn(db, 'sync_outbox', 'data_scope', "TEXT NOT NULL DEFAULT 'BRANCH' CHECK(data_scope IN ('TENANT','BRANCH'))");
      addColumn(db, 'sync_inbox', 'data_scope', "TEXT NOT NULL DEFAULT 'BRANCH' CHECK(data_scope IN ('TENANT','BRANCH'))");
    },
  },
  {
    id: '088_sync_conflicts_and_versions',
    description: 'Persist entity versions and reviewable synchronization conflicts.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_entity_versions (
          tenant_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          entity_version INTEGER NOT NULL,
          source_branch_id TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tenant_id, entity_type, entity_id)
        );
        CREATE TABLE IF NOT EXISTS sync_conflicts (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL UNIQUE,
          tenant_id TEXT NOT NULL,
          source_branch_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          remote_version INTEGER NOT NULL,
          local_version INTEGER,
          remote_payload TEXT NOT NULL,
          local_payload TEXT,
          reason TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN'
            CHECK(status IN ('OPEN','RESOLVED_LOCAL','RESOLVED_REMOTE')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          resolved_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status_created
          ON sync_conflicts(status, created_at);
      `);
    },
  },
  {
    id: '089_sync_master_data_bootstrap',
    description: 'Track resumable initial publication of existing master data.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_bootstrap_progress (
          tenant_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          cursor_id TEXT,
          completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tenant_id, entity_type)
        );
      `);
    },
  },
  {
    id: '090_sync_entity_policies',
    description: 'Persist administrator-controlled synchronization policies for supported master data.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_entity_policies (
          entity_type TEXT PRIMARY KEY,
          enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
          outbound_enabled INTEGER NOT NULL DEFAULT 0 CHECK(outbound_enabled IN (0,1)),
          inbound_enabled INTEGER NOT NULL DEFAULT 0 CHECK(inbound_enabled IN (0,1)),
          data_scope TEXT NOT NULL DEFAULT 'BRANCH' CHECK(data_scope IN ('TENANT','BRANCH')),
          managed_by_head_office INTEGER NOT NULL DEFAULT 0 CHECK(managed_by_head_office IN (0,1)),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO sync_entity_policies
          (entity_type, enabled, outbound_enabled, inbound_enabled, data_scope, managed_by_head_office)
        VALUES
          ('category', 1, 1, 1, 'TENANT', 0),
          ('brand', 1, 1, 1, 'TENANT', 0),
          ('product', 1, 1, 1, 'TENANT', 0),
          ('customer', 1, 1, 1, 'TENANT', 0),
          ('supplier', 1, 1, 1, 'TENANT', 0);
      `);
    },
  },
  {
    id: '091_sync_remote_business_records',
    description: 'Store remote business document snapshots separately from local balances and inventory.',
    up: (db: Database) => {
      addColumn(db, 'sync_entity_policies', 'managed_by_head_office', 'INTEGER NOT NULL DEFAULT 0 CHECK(managed_by_head_office IN (0,1))');
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_remote_records (
          event_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          source_branch_id TEXT NOT NULL,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('sales_invoice','sales_return','purchase_invoice','purchase_return')),
          entity_id TEXT NOT NULL,
          entity_version INTEGER NOT NULL,
          payload TEXT NOT NULL,
          received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sync_remote_records_scope
          ON sync_remote_records(tenant_id, entity_type, source_branch_id, received_at);
        CREATE TABLE IF NOT EXISTS sync_remote_entities (
          tenant_id TEXT NOT NULL,
          source_branch_id TEXT NOT NULL,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('sales_invoice','sales_return','purchase_invoice','purchase_return')),
          entity_id TEXT NOT NULL,
          entity_version INTEGER NOT NULL,
          latest_event_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tenant_id, source_branch_id, entity_type, entity_id)
        );
        CREATE INDEX IF NOT EXISTS idx_sync_remote_entities_type
          ON sync_remote_entities(tenant_id, entity_type, source_branch_id, updated_at);
        INSERT OR IGNORE INTO sync_entity_policies
          (entity_type, enabled, outbound_enabled, inbound_enabled, data_scope, managed_by_head_office)
        VALUES
          ('sales_invoice', 0, 0, 0, 'TENANT', 0),
          ('sales_return', 0, 0, 0, 'TENANT', 0),
          ('purchase_invoice', 0, 0, 0, 'TENANT', 0),
          ('purchase_return', 0, 0, 0, 'TENANT', 0);
      `);
    },
  },
  {
    id: '092_sync_remote_purchase_reports',
    description: 'Store purchasing invoice report snapshots separately from local balances and inventory.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_remote_purchase_records (
          event_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          source_branch_id TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          entity_version INTEGER NOT NULL,
          payload TEXT NOT NULL,
          received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sync_remote_purchase_records_scope
          ON sync_remote_purchase_records(tenant_id, source_branch_id, received_at);
        CREATE TABLE IF NOT EXISTS sync_remote_purchase_entities (
          tenant_id TEXT NOT NULL,
          source_branch_id TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          entity_version INTEGER NOT NULL,
          latest_event_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tenant_id, source_branch_id, entity_id)
        );
        CREATE INDEX IF NOT EXISTS idx_sync_remote_purchase_entities_scope
          ON sync_remote_purchase_entities(tenant_id, source_branch_id, updated_at);
        INSERT OR IGNORE INTO sync_entity_policies
          (entity_type, enabled, outbound_enabled, inbound_enabled, data_scope, managed_by_head_office)
        VALUES
          ('purchase_invoice', 0, 0, 0, 'TENANT', 0),
          ('purchase_return', 0, 0, 0, 'TENANT', 0);
      `);
    },
  },
  {
    id: '093_sync_payment_business_records',
    description: 'Allow detailed payment snapshots in the business sync layer and seed their policies.',
    up: (db: Database) => {
      db.exec(`
        INSERT OR IGNORE INTO sync_entity_policies
          (entity_type, enabled, outbound_enabled, inbound_enabled, data_scope, managed_by_head_office)
        VALUES
          ('customer_payment', 0, 0, 0, 'TENANT', 0),
          ('supplier_payment', 0, 0, 0, 'TENANT', 0);
      `);

      const remoteRecordSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='sync_remote_records'")[0]?.values?.[0]?.[0] as string | undefined;
      if (remoteRecordSql && !remoteRecordSql.includes("'customer_payment'") && !remoteRecordSql.includes("'supplier_payment'")) {
        db.exec(`
          CREATE TABLE sync_remote_records__tmp (
            event_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            source_branch_id TEXT NOT NULL,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('sales_invoice','sales_return','purchase_invoice','purchase_return','customer_payment','supplier_payment')),
            entity_id TEXT NOT NULL,
            entity_version INTEGER NOT NULL,
            payload TEXT NOT NULL,
            received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO sync_remote_records__tmp
            (event_id, tenant_id, source_branch_id, entity_type, entity_id, entity_version, payload, received_at)
          SELECT event_id, tenant_id, source_branch_id, entity_type, entity_id, entity_version, payload, received_at
          FROM sync_remote_records;
          DROP TABLE sync_remote_records;
          ALTER TABLE sync_remote_records__tmp RENAME TO sync_remote_records;
          CREATE INDEX IF NOT EXISTS idx_sync_remote_records_scope
            ON sync_remote_records(tenant_id, entity_type, source_branch_id, received_at);
        `);
      }

      const remoteEntitiesSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='sync_remote_entities'")[0]?.values?.[0]?.[0] as string | undefined;
      if (remoteEntitiesSql && !remoteEntitiesSql.includes("'customer_payment'") && !remoteEntitiesSql.includes("'supplier_payment'")) {
        db.exec(`
          CREATE TABLE sync_remote_entities__tmp (
            tenant_id TEXT NOT NULL,
            source_branch_id TEXT NOT NULL,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('sales_invoice','sales_return','purchase_invoice','purchase_return','customer_payment','supplier_payment')),
            entity_id TEXT NOT NULL,
            entity_version INTEGER NOT NULL,
            latest_event_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tenant_id, source_branch_id, entity_type, entity_id)
          );
          INSERT INTO sync_remote_entities__tmp
            (tenant_id, source_branch_id, entity_type, entity_id, entity_version, latest_event_id, payload, updated_at)
          SELECT tenant_id, source_branch_id, entity_type, entity_id, entity_version, latest_event_id, payload, updated_at
          FROM sync_remote_entities;
          DROP TABLE sync_remote_entities;
          ALTER TABLE sync_remote_entities__tmp RENAME TO sync_remote_entities;
          CREATE INDEX IF NOT EXISTS idx_sync_remote_entities_type
            ON sync_remote_entities(tenant_id, entity_type, source_branch_id, updated_at);
        `);
      }
    },
  },
  {
    id: '094_sync_stock_transfer_business_records',
    description: 'Allow stock transfer snapshots in the business sync layer and seed their policies.',
    up: (db: Database) => {
      db.exec(`
        INSERT OR IGNORE INTO sync_entity_policies
          (entity_type, enabled, outbound_enabled, inbound_enabled, data_scope, managed_by_head_office)
        VALUES
          ('stock_transfer', 0, 0, 0, 'TENANT', 0);
      `);

      const remoteRecordSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='sync_remote_records'")[0]?.values?.[0]?.[0] as string | undefined;
      if (remoteRecordSql && !remoteRecordSql.includes("'stock_transfer'")) {
        db.exec(`
          CREATE TABLE sync_remote_records__tmp (
            event_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            source_branch_id TEXT NOT NULL,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('sales_invoice','sales_return','purchase_invoice','purchase_return','customer_payment','supplier_payment','stock_transfer')),
            entity_id TEXT NOT NULL,
            entity_version INTEGER NOT NULL,
            payload TEXT NOT NULL,
            received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO sync_remote_records__tmp
            (event_id, tenant_id, source_branch_id, entity_type, entity_id, entity_version, payload, received_at)
          SELECT event_id, tenant_id, source_branch_id, entity_type, entity_id, entity_version, payload, received_at
          FROM sync_remote_records;
          DROP TABLE sync_remote_records;
          ALTER TABLE sync_remote_records__tmp RENAME TO sync_remote_records;
          CREATE INDEX IF NOT EXISTS idx_sync_remote_records_scope
            ON sync_remote_records(tenant_id, entity_type, source_branch_id, received_at);
        `);
      }

      const remoteEntitiesSql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='sync_remote_entities'")[0]?.values?.[0]?.[0] as string | undefined;
      if (remoteEntitiesSql && !remoteEntitiesSql.includes("'stock_transfer'")) {
        db.exec(`
          CREATE TABLE sync_remote_entities__tmp (
            tenant_id TEXT NOT NULL,
            source_branch_id TEXT NOT NULL,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('sales_invoice','sales_return','purchase_invoice','purchase_return','customer_payment','supplier_payment','stock_transfer')),
            entity_id TEXT NOT NULL,
            entity_version INTEGER NOT NULL,
            latest_event_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tenant_id, source_branch_id, entity_type, entity_id)
          );
          INSERT INTO sync_remote_entities__tmp
            (tenant_id, source_branch_id, entity_type, entity_id, entity_version, latest_event_id, payload, updated_at)
          SELECT tenant_id, source_branch_id, entity_type, entity_id, entity_version, latest_event_id, payload, updated_at
          FROM sync_remote_entities;
          DROP TABLE sync_remote_entities;
          ALTER TABLE sync_remote_entities__tmp RENAME TO sync_remote_entities;
          CREATE INDEX IF NOT EXISTS idx_sync_remote_entities_type
            ON sync_remote_entities(tenant_id, entity_type, source_branch_id, updated_at);
        `);
      }
    },
  },
  {
    id: '095_sync_branch_device_verification',
    description: 'Track authorization, contact health and sync freshness for registered branches and devices.',
    up: (db: Database) => {
      const addIfMissing = (table: string, column: string, definition: string) => {
        const existing = db.exec(`PRAGMA table_info("${table}")`)[0]?.values ?? [];
        if (!existing.some((row) => String(row[1]) === column)) {
          db.exec(`ALTER TABLE "${table}" ADD COLUMN ${column} ${definition};`);
        }
      };

      addIfMissing('sync_branches', 'is_verified', 'INTEGER NOT NULL DEFAULT 0 CHECK(is_verified IN (0,1))');
      addIfMissing('sync_branches', 'verified_at', 'TEXT');
      addIfMissing('sync_branches', 'last_contact_at', 'TEXT');
      addIfMissing('sync_branches', 'last_sync_at', 'TEXT');
      addIfMissing('sync_branches', 'authorized_by', 'TEXT');

      addIfMissing('sync_devices', 'is_verified', 'INTEGER NOT NULL DEFAULT 0 CHECK(is_verified IN (0,1))');
      addIfMissing('sync_devices', 'verified_at', 'TEXT');
      addIfMissing('sync_devices', 'last_contact_at', 'TEXT');
      addIfMissing('sync_devices', 'last_sync_at', 'TEXT');
      addIfMissing('sync_devices', 'authorized_by', 'TEXT');
    },
  },
  {
    id: '096_branch_device_activation_onboarding',
    description: 'Add device type and single-use activation codes for branch onboarding and branch/device binding.',
    up: (db: Database) => {
      const addIfMissing = (table: string, column: string, definition: string) => {
        const existing = db.exec(`PRAGMA table_info("${table}")`)[0]?.values ?? [];
        if (!existing.some((row) => String(row[1]) === column)) {
          db.exec(`ALTER TABLE "${table}" ADD COLUMN ${column} ${definition};`);
        }
      };

      addIfMissing('sync_branches', 'device_type', 'TEXT');
      addIfMissing('sync_branches', 'activation_code', 'TEXT');
      addIfMissing('sync_branches', 'activated_device_id', 'TEXT');
      addIfMissing('sync_branches', 'activation_used_at', 'TEXT');

      addIfMissing('sync_devices', 'device_type', 'TEXT');
      addIfMissing('sync_devices', 'activation_code', 'TEXT');
      addIfMissing('sync_devices', 'activation_used_at', 'TEXT');

      const branchTableInfo = db.exec('PRAGMA table_info("sync_branches")')[0]?.values ?? [];
      if (branchTableInfo.length && !branchTableInfo.some((row) => String(row[1]) === 'activation_code')) {
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_branches_activation_code ON sync_branches(activation_code);');
      }
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

function setForeignKeysEnabled(db: Database, errorMessage: string): void {
  db.run('PRAGMA foreign_keys = ON');
  const enabled = Number(db.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0]) === 1;
  if (!enabled) {
    throw new Error(errorMessage);
  }
}

function createSchemaTables(db: Database): void {
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
}

function applyMigration(db: Database, migration: Migration, report: MigrationReport): boolean {
  if (migration.disableForeignKeys) {
    db.run('PRAGMA foreign_keys = OFF');
  }

  let applied = false;
  try {
    db.run('BEGIN TRANSACTION');
    migration.up(db);
    db.run('INSERT OR REPLACE INTO schema_migrations (id, description) VALUES (?, ?)', [
      migration.id,
      migration.description,
    ]);
    db.run('COMMIT');
    report.applied.push(migration.id);
    applied = true;
  } catch (error) {
    try { db.run('ROLLBACK'); } catch { /* transaction may already be closed */ }
    const message = error instanceof Error ? error.message : String(error);
    report.failed.push({ id: migration.id, error: message });
    console.error(`❌ Migration ${migration.id} failed:`, message);
  } finally {
    setForeignKeysEnabled(
      db,
      `SQLite foreign key enforcement was not restored after migration ${migration.id}.`
    );
  }
  return applied;
}

function applyPendingMigrations(db: Database, report: MigrationReport): void {
  const done = appliedIds(db);
  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) {
      report.skipped.push(migration.id);
      continue;
    }
    if (!applyMigration(db, migration, report)) {
      break;
    }
  }
}

function createSchemaIndexes(db: Database): void {
  db.run('BEGIN TRANSACTION');
  try {
    db.exec(SCHEMA_SQL);
    db.run('COMMIT');
  } catch (error) {
    try { db.run('ROLLBACK'); } catch { /* transaction may already be closed */ }
    throw error;
  }
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
  setForeignKeysEnabled(db, 'SQLite foreign key enforcement could not be enabled.');

  // 1. Create missing tables before migrations. Indexes are deferred because a
  //    legacy table may not have the columns referenced by a newer index yet.
  //    Executing the whole schema at once would roll back table creation too,
  //    leaving migrations unable to add those columns on the next launch.
  createSchemaTables(db);

  // 2. Apply the ordered migration list.
  applyPendingMigrations(db, report);

  // 3. Re-run the idempotent schema after column migrations so all indexes
  //    exist on both fresh and upgraded databases.
  if (report.failed.length === 0) {
    createSchemaIndexes(db);
  }

  if (report.applied.length > 0) {
    console.log(`✅ Applied ${report.applied.length} migration(s):`, report.applied.join(', '));
  }

  return report;
}
