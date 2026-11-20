import type { Database } from 'sql.js';
import type { Migration } from './support';

/**
 * Migration 254: ceramics service workflow.
 *
 * Adds persistence for the ceramics service operations:
 *  - ceramic_service_orders: قص / تركيب / توصيل orders raised against a
 *    customer site, optionally linked to the sales invoice that billed them.
 *  - ceramic_commissions: engineer/designer commissions (عمولات) computed
 *    as a percent of a sale or a fixed amount, tracked to payment.
 */
export const MIGRATION_254_CERAMIC_SERVICE_WORKFLOW: Migration = {
  id: '254_ceramic_service_workflow',
  description: 'Add ceramic_service_orders and ceramic_commissions tables',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ceramic_service_orders (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        order_number TEXT NOT NULL,
        customer_id TEXT,
        customer_name TEXT,
        site_address TEXT,
        service_type TEXT NOT NULL DEFAULT 'INSTALLATION'
          CHECK(service_type IN ('CUTTING','INSTALLATION','DELIVERY','CUTTING_INSTALLATION')),
        status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK(status IN ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED')),
        area_m2 REAL NOT NULL DEFAULT 0,
        boxes_count REAL NOT NULL DEFAULT 0,
        unit_price REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0,
        scheduled_date TEXT,
        notes TEXT,
        invoice_id TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ceramic_service_orders_branch ON ceramic_service_orders(branch_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_ceramic_service_orders_status ON ceramic_service_orders(status);
      CREATE INDEX IF NOT EXISTS idx_ceramic_service_orders_customer ON ceramic_service_orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_ceramic_service_orders_invoice ON ceramic_service_orders(invoice_id);

      CREATE TABLE IF NOT EXISTS ceramic_commissions (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        commission_number TEXT NOT NULL,
        partner_name TEXT NOT NULL,
        partner_phone TEXT,
        customer_id TEXT,
        customer_name TEXT,
        sale_reference TEXT,
        base_amount REAL NOT NULL DEFAULT 0,
        percent REAL,
        amount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK(status IN ('PENDING','PAID','CANCELLED')),
        notes TEXT,
        paid_at TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ceramic_commissions_branch ON ceramic_commissions(branch_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_ceramic_commissions_status ON ceramic_commissions(status);
      CREATE INDEX IF NOT EXISTS idx_ceramic_commissions_customer ON ceramic_commissions(customer_id);
    `);
  },
};

/**
 * Migration 255: construction site management — subcontractors per project
 * and daily site reports (تقرير يومي للموقع) with structured item lines
 * for materials, labor, equipment and executed work.
 *
 * Money columns follow the project-domain convention: INTEGER piastres
 * (value * 100) like project_estimate_contracts / project_payment_certificates.
 */
export const MIGRATION_255_SITE_MANAGEMENT: Migration = {
  id: '255_site_management',
  description: 'Add project subcontractors and site daily reports tables',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_subcontractors (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        specialty TEXT,
        contract_value INTEGER NOT NULL DEFAULT 0 CHECK(contract_value >= 0),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','COMPLETED')),
        notes TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(created_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_project_subcontractors_project ON project_subcontractors(project_id, status);

      CREATE TABLE IF NOT EXISTS project_site_daily_reports (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        report_date TEXT NOT NULL,
        weather TEXT,
        workers_count INTEGER NOT NULL DEFAULT 0 CHECK(workers_count >= 0),
        supervisor_name TEXT,
        summary TEXT,
        status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('DRAFT','SUBMITTED','APPROVED')),
        approved_by TEXT,
        approved_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(created_by) REFERENCES users(id),
        FOREIGN KEY(approved_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_site_reports_project_date ON project_site_daily_reports(project_id, report_date DESC);

      CREATE TABLE IF NOT EXISTS project_site_report_items (
        id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL,
        item_type TEXT NOT NULL CHECK(item_type IN ('MATERIAL','LABOR','EQUIPMENT','WORK')),
        product_id TEXT,
        description TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0 CHECK(quantity >= 0),
        unit TEXT,
        unit_cost INTEGER NOT NULL DEFAULT 0 CHECK(unit_cost >= 0),
        amount INTEGER NOT NULL DEFAULT 0 CHECK(amount >= 0),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(report_id) REFERENCES project_site_daily_reports(id) ON DELETE CASCADE,
        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_site_report_items_report ON project_site_report_items(report_id, sort_order);
    `);
  },
};
