import type { Database } from 'sql.js';
import type { Migration } from '../support';
import { addColumn, DEFAULT_BRANCH_ID, tableExists } from '../support';

export const MIGRATION_060_BRANCH_SCOPED_CASH_TRANSACTIONS: Migration = {
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
};

export const MIGRATION_061_BRANCH_SCOPED_LEDGER_ENTRIES: Migration = {
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
};

export const MIGRATION_062_BRANCH_SCOPED_HR_TRANSACTIONS: Migration = {
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
};

export const MIGRATION_063_MODULE_REGISTRY_LIFECYCLE: Migration = {
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
};

export const MIGRATION_064_COMPANIES_AND_BRANCH_OWNERSHIP: Migration = {
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
};

export const MIGRATION_065_DOCUMENTS_AND_CONTRACTS: Migration = {
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
};

export const MIGRATION_066_PROJECTS_AND_HR_MODULE_HARDENING: Migration = {
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
};
