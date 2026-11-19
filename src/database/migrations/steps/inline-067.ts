import type { Database } from 'sql.js';
import type { Migration } from '../support';

export const MIGRATION_067_HR_LEAVE_REQUESTS: Migration = {
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
};

export const MIGRATION_068_PROJECT_CONTROLS: Migration = {
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
};

export const MIGRATION_069_HR_EMPLOYEE_CONTRACTS: Migration = {
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
};

export const MIGRATION_070_HR_EMPLOYEE_DOCUMENTS: Migration = {
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
};

export const MIGRATION_071_MANUFACTURING_CORE: Migration = {
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
};

export const MIGRATION_072_COMPANY_SCOPE_COLUMNS: Migration = {
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
};

export const MIGRATION_073_MANUFACTURING_WAREHOUSE: Migration = {
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
};
