import type { Database } from 'sql.js';
import type { Migration } from './support';
import { addColumn, tableExists } from './support';

/**
 * Migration 247: industry-vertical deep modules.
 *
 * Adds persistence for five specialized workflows:
 *  - hospitality: room types, rooms (floor map + housekeeping status),
 *    reservations with nightly folio charges.
 *  - automotive workshop: repair/work orders, technical inspection
 *    checklists, parts requests and customer signature approvals.
 *  - education: classes, weekly timetable slots, enrollments and fee
 *    installments linked to customers.
 *  - professional services: time entries against clients/projects with an
 *    approval → invoice pipeline.
 *  - inventory expiry: generic expiry lots (any product, any warehouse)
 *    plus a per-product expiry-tracking flag used by POS to block sales of
 *    expired stock.
 */
export const MIGRATION_247_INDUSTRY_VERTICALS: Migration = {
  id: '247_industry_verticals',
  description: 'Add hospitality, workshop, education, time-billing and expiry tables',
  up: (db: Database) => {
    // ── Hospitality ────────────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS hotel_room_types (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        capacity INTEGER NOT NULL DEFAULT 2,
        base_rate REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS hotel_rooms (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        room_type_id TEXT,
        room_number TEXT NOT NULL,
        floor INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'AVAILABLE'
          CHECK(status IN ('AVAILABLE','OCCUPIED','RESERVED','CLEANING','MAINTENANCE','OUT_OF_SERVICE')),
        housekeeping_status TEXT NOT NULL DEFAULT 'CLEAN'
          CHECK(housekeeping_status IN ('CLEAN','DIRTY','INSPECTED')),
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_type_id) REFERENCES hotel_room_types(id) ON DELETE SET NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_rooms_branch_number
        ON hotel_rooms(branch_id, room_number);
      CREATE INDEX IF NOT EXISTS idx_hotel_rooms_status ON hotel_rooms(status);

      CREATE TABLE IF NOT EXISTS hotel_reservations (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        reservation_number TEXT NOT NULL,
        customer_id TEXT,
        room_id TEXT,
        check_in TEXT NOT NULL,
        check_out TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CONFIRMED'
          CHECK(status IN ('CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED','NO_SHOW')),
        guests_count INTEGER NOT NULL DEFAULT 1,
        total_amount REAL NOT NULL DEFAULT 0,
        notes TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (room_id) REFERENCES hotel_rooms(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hotel_resv_dates ON hotel_reservations(check_in, check_out);
      CREATE INDEX IF NOT EXISTS idx_hotel_resv_room ON hotel_reservations(room_id, status);

      CREATE TABLE IF NOT EXISTS hotel_folio_entries (
        id TEXT PRIMARY KEY,
        reservation_id TEXT NOT NULL,
        room_id TEXT,
        entry_date TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        entry_type TEXT NOT NULL DEFAULT 'CHARGE'
          CHECK(entry_type IN ('CHARGE','PAYMENT','ADJUSTMENT')),
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reservation_id) REFERENCES hotel_reservations(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_hotel_folio_resv ON hotel_folio_entries(reservation_id);

      CREATE TABLE IF NOT EXISTS hotel_housekeeping_tasks (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        task_type TEXT NOT NULL DEFAULT 'CLEANING'
          CHECK(task_type IN ('CLEANING','INSPECTION','MAINTENANCE')),
        status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK(status IN ('PENDING','IN_PROGRESS','DONE','CANCELLED')),
        assigned_to TEXT,
        scheduled_date TEXT,
        notes TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES hotel_rooms(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_hotel_hk_status ON hotel_housekeeping_tasks(status, scheduled_date);
    `);

    // ── Automotive workshop ────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS workshop_work_orders (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        order_number TEXT NOT NULL,
        customer_id TEXT,
        vehicle_plate TEXT NOT NULL,
        vehicle_make TEXT,
        vehicle_model TEXT,
        vehicle_year INTEGER,
        vin TEXT,
        odometer_km INTEGER,
        status TEXT NOT NULL DEFAULT 'RECEIVED'
          CHECK(status IN ('RECEIVED','INSPECTION','WAITING_APPROVAL','APPROVED','IN_PROGRESS','READY','DELIVERED','CANCELLED')),
        complaint TEXT,
        diagnosis TEXT,
        technician_id TEXT,
        promised_date TEXT,
        customer_signature TEXT,
        approved_at TEXT,
        approved_by TEXT,
        labor_total REAL NOT NULL DEFAULT 0,
        parts_total REAL NOT NULL DEFAULT 0,
        grand_total REAL NOT NULL DEFAULT 0,
        invoice_id TEXT,
        notes TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (technician_id) REFERENCES employees(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wo_status ON workshop_work_orders(status);
      CREATE INDEX IF NOT EXISTS idx_wo_customer ON workshop_work_orders(customer_id);

      CREATE TABLE IF NOT EXISTS workshop_inspection_items (
        id TEXT PRIMARY KEY,
        work_order_id TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'GENERAL',
        item_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OK'
          CHECK(status IN ('OK','NEEDS_REPAIR','NOT_CHECKED')),
        notes TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_order_id) REFERENCES workshop_work_orders(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_wo_insp_order ON workshop_inspection_items(work_order_id);

      CREATE TABLE IF NOT EXISTS workshop_work_order_parts (
        id TEXT PRIMARY KEY,
        work_order_id TEXT NOT NULL,
        product_id TEXT,
        part_name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'REQUESTED'
          CHECK(status IN ('REQUESTED','APPROVED','ISSUED','RETURNED')),
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_order_id) REFERENCES workshop_work_orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wo_parts_order ON workshop_work_order_parts(work_order_id);

      CREATE TABLE IF NOT EXISTS workshop_customer_approvals (
        id TEXT PRIMARY KEY,
        work_order_id TEXT NOT NULL,
        approved_total REAL NOT NULL DEFAULT 0,
        signature_data TEXT,
        approved_by_name TEXT,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_order_id) REFERENCES workshop_work_orders(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_wo_approvals_order ON workshop_customer_approvals(work_order_id);
    `);

    // ── Education ──────────────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS edu_classes (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        name TEXT NOT NULL,
        subject TEXT,
        teacher_id TEXT,
        capacity INTEGER NOT NULL DEFAULT 30,
        academic_year TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES employees(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS edu_class_schedules (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL,
        day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        room TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES edu_classes(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_edu_sched_class ON edu_class_schedules(class_id);
      CREATE INDEX IF NOT EXISTS idx_edu_sched_slot ON edu_class_schedules(day_of_week, start_time);

      CREATE TABLE IF NOT EXISTS edu_enrollments (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ENROLLED'
          CHECK(status IN ('ENROLLED','ACTIVE','COMPLETED','WITHDRAWN','SUSPENDED')),
        enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        FOREIGN KEY (class_id) REFERENCES edu_classes(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_edu_enroll_class ON edu_enrollments(class_id);
      CREATE INDEX IF NOT EXISTS idx_edu_enroll_student ON edu_enrollments(customer_id);

      CREATE TABLE IF NOT EXISTS edu_attendance (
        id TEXT PRIMARY KEY,
        enrollment_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        session_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PRESENT'
          CHECK(status IN ('PRESENT','ABSENT','LATE','EXCUSED')),
        notes TEXT,
        recorded_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(enrollment_id, session_date),
        FOREIGN KEY (enrollment_id) REFERENCES edu_enrollments(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_edu_att_date ON edu_attendance(class_id, session_date);

      CREATE TABLE IF NOT EXISTS edu_fee_installments (
        id TEXT PRIMARY KEY,
        enrollment_id TEXT NOT NULL,
        title TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK(status IN ('PENDING','PAID','PARTIAL','WAIVED','OVERDUE')),
        invoice_id TEXT,
        paid_amount REAL NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (enrollment_id) REFERENCES edu_enrollments(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_edu_fees_enroll ON edu_fee_installments(enrollment_id);
    `);

    // ── Professional services: time billing ────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        customer_id TEXT,
        project_id TEXT,
        employee_id TEXT,
        entry_date TEXT NOT NULL,
        description TEXT NOT NULL,
        minutes INTEGER NOT NULL DEFAULT 0 CHECK(minutes >= 0),
        hourly_rate REAL NOT NULL DEFAULT 0,
        billable INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'DRAFT'
          CHECK(status IN ('DRAFT','SUBMITTED','APPROVED','INVOICED','REJECTED')),
        invoice_id TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_time_entries_status ON time_entries(status);
      CREATE INDEX IF NOT EXISTS idx_time_entries_customer ON time_entries(customer_id);
      CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(entry_date);

      CREATE TABLE IF NOT EXISTS time_billing_batches (
        id TEXT PRIMARY KEY,
        batch_number TEXT NOT NULL,
        customer_id TEXT,
        project_id TEXT,
        period_start TEXT,
        period_end TEXT,
        total_amount REAL NOT NULL DEFAULT 0,
        invoice_id TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN'
          CHECK(status IN ('OPEN','INVOICED','CANCELLED')),
        notes TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_time_batches_status ON time_billing_batches(status);

      CREATE TABLE IF NOT EXISTS time_billing_batch_items (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        time_entry_id TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (batch_id) REFERENCES time_billing_batches(id) ON DELETE CASCADE,
        FOREIGN KEY (time_entry_id) REFERENCES time_entries(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_time_batch_items_batch ON time_billing_batch_items(batch_id);
    `);

    // ── Inventory expiry lots (generic, any product/warehouse) ─────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS product_expiry_lots (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        warehouse_id TEXT,
        lot_number TEXT,
        expiry_date TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0 CHECK(quantity >= 0),
        quantity_remaining REAL NOT NULL DEFAULT 0 CHECK(quantity_remaining >= 0),
        received_date TEXT,
        supplier_id TEXT,
        cost_price INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_expiry_product ON product_expiry_lots(product_id, expiry_date);
      CREATE INDEX IF NOT EXISTS idx_expiry_date ON product_expiry_lots(expiry_date);
    `);

    if (tableExists(db, 'products')) {
      addColumn(db, 'products', 'track_expiry', 'INTEGER NOT NULL DEFAULT 0');
      addColumn(db, 'products', 'expiry_alert_days', 'INTEGER NOT NULL DEFAULT 30');
    }
  },
};

/**
 * Migration 249: HSE (health, safety & environment) records for the
 * manufacturing module — incidents/injuries, hot-work permits, PPE
 * inspections and safety training log. All branch-scoped.
 */
export const MIGRATION_249_HSE_RECORDS: Migration = {
  id: '249_hse_records',
  description: 'Add HSE incidents, permits, inspections and training tables',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS hse_incidents (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        incident_date TEXT NOT NULL,
        incident_type TEXT NOT NULL DEFAULT 'INJURY'
          CHECK(incident_type IN ('INJURY','NEAR_MISS','PROPERTY_DAMAGE','ENVIRONMENTAL','ILLNESS','OTHER')),
        severity TEXT NOT NULL DEFAULT 'MINOR'
          CHECK(severity IN ('MINOR','MODERATE','SERIOUS','CRITICAL')),
        description TEXT NOT NULL,
        location TEXT,
        work_center_id TEXT,
        production_order_id TEXT,
        injured_employee_id TEXT,
        lost_time_hours REAL NOT NULL DEFAULT 0,
        corrective_action TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN'
          CHECK(status IN ('OPEN','INVESTIGATING','CLOSED')),
        reported_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_center_id) REFERENCES work_centers(id) ON DELETE SET NULL,
        FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE SET NULL,
        FOREIGN KEY (injured_employee_id) REFERENCES employees(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hse_incidents_branch_date ON hse_incidents(branch_id, incident_date);
      CREATE INDEX IF NOT EXISTS idx_hse_incidents_status ON hse_incidents(status);

      CREATE TABLE IF NOT EXISTS hse_permits (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        permit_number TEXT NOT NULL,
        permit_type TEXT NOT NULL DEFAULT 'HOT_WORK'
          CHECK(permit_type IN ('HOT_WORK','CONFINED_SPACE','HEIGHT','ELECTRICAL','EXCAVATION','OTHER')),
        title TEXT NOT NULL,
        location TEXT,
        work_center_id TEXT,
        valid_from TEXT NOT NULL,
        valid_to TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'REQUESTED'
          CHECK(status IN ('REQUESTED','APPROVED','ACTIVE','EXPIRED','CANCELLED','CLOSED')),
        requested_by TEXT,
        approved_by TEXT,
        approved_at TEXT,
        conditions TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_center_id) REFERENCES work_centers(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hse_permits_status ON hse_permits(status, valid_to);

      CREATE TABLE IF NOT EXISTS hse_inspections (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        inspection_date TEXT NOT NULL,
        area TEXT NOT NULL,
        inspection_type TEXT NOT NULL DEFAULT 'GENERAL'
          CHECK(inspection_type IN ('GENERAL','FIRE','ELECTRICAL','HOUSEKEEPING','PPE','MACHINERY','ENVIRONMENTAL','OTHER')),
        result TEXT NOT NULL DEFAULT 'PASS'
          CHECK(result IN ('PASS','FAIL','CONDITIONAL')),
        findings TEXT,
        corrective_action TEXT,
        inspector_id TEXT,
        work_center_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_center_id) REFERENCES work_centers(id) ON DELETE SET NULL,
        FOREIGN KEY (inspector_id) REFERENCES employees(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hse_inspections_date ON hse_inspections(branch_id, inspection_date);

      CREATE TABLE IF NOT EXISTS hse_trainings (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        employee_id TEXT NOT NULL,
        training_name TEXT NOT NULL,
        provider TEXT,
        training_date TEXT NOT NULL,
        expiry_date TEXT,
        certificate_ref TEXT,
        status TEXT NOT NULL DEFAULT 'COMPLETED'
          CHECK(status IN ('SCHEDULED','COMPLETED','EXPIRED','CANCELLED')),
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_hse_trainings_emp ON hse_trainings(employee_id);
      CREATE INDEX IF NOT EXISTS idx_hse_trainings_expiry ON hse_trainings(expiry_date);
    `);
  },
};

/**
 * Migration 250: packing manifest + pre-shipment QC for deliveries.
 *  - delivery_items gains product_batch_id so each packed line can point at
 *    the exact production/purchase lot shipped (lot traceability to customer).
 *  - deliveries.requires_shipment_qc gates dispatch on a passed QC check.
 *  - shipment_qc_checks records packaging/quantity verification results.
 */
export const MIGRATION_250_SHIPMENT_PACKING_QC: Migration = {
  id: '250_shipment_packing_qc',
  description: 'Add delivery packing items, batch links and pre-shipment QC checks',
  up: (db: Database) => {
    if (tableExists(db, 'delivery_items')) {
      addColumn(db, 'delivery_items', 'product_batch_id', 'TEXT');
      addColumn(db, 'delivery_items', 'lot_number', 'TEXT');
    }
    if (tableExists(db, 'deliveries')) {
      addColumn(db, 'deliveries', 'requires_shipment_qc', 'INTEGER NOT NULL DEFAULT 0');
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS shipment_qc_checks (
        id TEXT PRIMARY KEY,
        delivery_id TEXT NOT NULL,
        invoice_id TEXT,
        result TEXT NOT NULL DEFAULT 'PASS'
          CHECK(result IN ('PASS','FAIL','CONDITIONAL')),
        packaging_ok INTEGER NOT NULL DEFAULT 1,
        quantities_ok INTEGER NOT NULL DEFAULT 1,
        findings TEXT,
        checked_by TEXT,
        checked_at TEXT DEFAULT CURRENT_TIMESTAMP,
        branch_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_shipment_qc_delivery ON shipment_qc_checks(delivery_id, checked_at);
      CREATE INDEX IF NOT EXISTS idx_delivery_items_batch ON delivery_items(product_batch_id);
    `);
  },
};

/**
 * Migration 251: production lines (خطوط الإنتاج) — a grouping entity under
 * each branch/factory. Work centers attach to a line so multi-line plants
 * can schedule and report per line.
 */
export const MIGRATION_251_PRODUCTION_LINES: Migration = {
  id: '251_production_lines',
  description: 'Add production_lines table and work_centers.production_line_id',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS production_lines (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_production_lines_branch ON production_lines(branch_id, is_active);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_production_lines_code_branch
        ON production_lines(branch_id, code);
    `);
    addColumn(db, 'work_centers', 'production_line_id', 'TEXT');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_work_centers_line ON work_centers(production_line_id);`);
  },
};
