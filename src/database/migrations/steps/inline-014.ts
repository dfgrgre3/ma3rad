import type { Database } from 'sql.js';
import type { Migration } from '../support';
import { addColumn, columnExists, DEFAULT_BRANCH_ID, tableExists } from '../support';

export const MIGRATION_014_PAYROLL_NOTIFICATION_SETTINGS: Migration = {
    id: '014_payroll_notification_settings',
    description: 'Add payroll notification settings per branch for due/overdue alerts',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS payroll_notification_settings (
          branch_id TEXT PRIMARY KEY,
          enabled INTEGER NOT NULL DEFAULT 1,
          due_horizon_days INTEGER NOT NULL DEFAULT 7 CHECK(due_horizon_days >= 1 AND due_horizon_days <= 30),
          overdue_horizon_days INTEGER NOT NULL DEFAULT 0 CHECK(overdue_horizon_days >= 0 AND overdue_horizon_days <= 30),
          notify_due INTEGER NOT NULL DEFAULT 1,
          notify_overdue INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_by TEXT,
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_payroll_notification_settings_branch ON payroll_notification_settings(branch_id);
      `);
    },
};

export const MIGRATION_050_CASH_SHIFT_AUTO_CLOSE: Migration = {
    id: '050_cash_shift_auto_close',
    description: 'Track automatically closed cashier shifts',
    up: (db: Database) => {
      addColumn(db, 'cash_shifts', 'auto_closed', 'INTEGER NOT NULL DEFAULT 0');
    },
};

export const MIGRATION_051_CHEQUES_REPRESENTED_STATUS: Migration = {
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
};

export const MIGRATION_052_PURCHASE_INVOICE_DUE_DATES: Migration = {
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
};

export const MIGRATION_053_SALES_BATCH_RETURN_TRACEABILITY: Migration = {
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
};

export const MIGRATION_054_SALES_FINANCIAL_RECONCILIATIONS: Migration = {
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
};

export const MIGRATION_055_REMOVE_UNMODIFIED_SAMPLE_RECORDS: Migration = {
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
};

export const MIGRATION_056_SUPPLIER_PAYMENT_IDEMPOTENCY: Migration = {
    id: '056_supplier_payment_idempotency',
    description: 'Prevent duplicate supplier payments when a request is retried',
    up: (db: Database) => {
      addColumn(db, 'supplier_payments', 'idempotency_key', 'TEXT');
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_payments_idempotency
        ON supplier_payments(idempotency_key) WHERE idempotency_key IS NOT NULL`);
    },
};

export const MIGRATION_057_EXPLICIT_USER_BRANCH_SCOPE: Migration = {
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
};

export const MIGRATION_058_BRANCH_SCOPED_APPROVALS_AND_ACTION_PERMISSIONS: Migration = {
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
};

export const MIGRATION_059_INVOICE_CREATED_AT_LIST_INDEXES: Migration = {
    id: '059_invoice_created_at_list_indexes',
    description: 'Index invoice creation timestamps used by newest-first invoice lists',
    up: (db: Database) => {
      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_invoices_created_at ON sales_invoices(created_at DESC)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_purchase_invoices_created_at ON purchase_invoices(created_at DESC)');
    },
};
