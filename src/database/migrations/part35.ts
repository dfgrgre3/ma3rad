import type { Migration } from './support';
import { addColumn } from './support';

/**
 * 24/7 operations shift management.
 *
 * The existing cashier shifts (`cash_shifts`) stay untouched and keep their
 * financial drawer lifecycle. The tables below add the operational layer:
 * shift definitions (reusing `attendance_shifts`), concrete shift instances,
 * staff presence, handover/receiving records, incidents, and per-shift
 * production. Attendance periods are an append-only time log that is separate
 * from the one-row-per-employee-per-day `attendance` table.
 */
export const MIGRATION_PART_35: Migration[] = [
  {
    id: '148_operations_shift_management',
    description: 'Add 24/7 operations shift instances, handovers, presence periods, incidents, and per-shift production.',
    disableForeignKeys: true,
    up: (db) => {
      // Extend the existing shift definitions instead of duplicating them. The
      // attendance page keeps working with the same rows, while operations can
      // additionally describe the department/line and ordering.
      addColumn(db, 'attendance_shifts', 'department', 'TEXT');
      addColumn(db, 'attendance_shifts', 'location', 'TEXT');
      addColumn(db, 'attendance_shifts', 'shift_code', 'TEXT');
      addColumn(db, 'attendance_shifts', 'color', 'TEXT');
      addColumn(db, 'attendance_shifts', 'shift_order', 'INTEGER NOT NULL DEFAULT 0');
      addColumn(db, 'attendance_shifts', 'is_operations', 'INTEGER NOT NULL DEFAULT 1');

      // Optional link: one operations shift can own several cashier drawers.
      addColumn(db, 'cash_shifts', 'operation_shift_id', 'TEXT');
      addColumn(db, 'production_orders', 'operation_shift_id', 'TEXT');

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cash_shifts_operation_shift
          ON cash_shifts(operation_shift_id, status);
        CREATE INDEX IF NOT EXISTS idx_production_orders_operation_shift
          ON production_orders(operation_shift_id, status);

        CREATE TABLE IF NOT EXISTS operation_shifts (
          id TEXT PRIMARY KEY,
          shift_number TEXT NOT NULL UNIQUE,
          definition_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          business_date TEXT NOT NULL,
          scheduled_start TEXT NOT NULL,
          scheduled_end TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PLANNED'
            CHECK(status IN ('PLANNED', 'OPEN', 'HANDOVER_PENDING', 'CLOSED', 'MISSED', 'CANCELLED')),
          supervisor_id TEXT,
          opened_by TEXT,
          opened_at TEXT,
          closed_by TEXT,
          closed_at TEXT,
          opening_notes TEXT,
          closing_notes TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(definition_id, business_date),
          FOREIGN KEY (definition_id) REFERENCES attendance_shifts(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
          FOREIGN KEY (supervisor_id) REFERENCES employees(id) ON DELETE SET NULL,
          FOREIGN KEY (opened_by) REFERENCES users(id),
          FOREIGN KEY (closed_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_operation_shifts_branch_date
          ON operation_shifts(branch_id, business_date DESC, scheduled_start);
        CREATE INDEX IF NOT EXISTS idx_operation_shifts_status
          ON operation_shifts(branch_id, status, scheduled_start);

        CREATE TABLE IF NOT EXISTS operation_shift_assignments (
          id TEXT PRIMARY KEY,
          definition_id TEXT NOT NULL,
          employee_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'STAFF'
            CHECK(role IN ('SUPERVISOR', 'STAFF')),
          effective_from TEXT NOT NULL,
          effective_to TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(definition_id, employee_id, effective_from),
          FOREIGN KEY (definition_id) REFERENCES attendance_shifts(id) ON DELETE CASCADE,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_operation_shift_assignments_shift
          ON operation_shift_assignments(definition_id, effective_from, effective_to);

        CREATE TABLE IF NOT EXISTS operation_shift_staff (
          id TEXT PRIMARY KEY,
          operation_shift_id TEXT NOT NULL,
          employee_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'STAFF'
            CHECK(role IN ('SUPERVISOR', 'STAFF')),
          status TEXT NOT NULL DEFAULT 'PRESENT'
            CHECK(status IN ('PRESENT', 'LATE', 'ABSENT', 'LEAVE')),
          check_in_at TEXT,
          check_out_at TEXT,
          late_minutes INTEGER NOT NULL DEFAULT 0,
          overtime_minutes INTEGER NOT NULL DEFAULT 0,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(operation_shift_id, employee_id),
          FOREIGN KEY (operation_shift_id) REFERENCES operation_shifts(id) ON DELETE CASCADE,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_operation_shift_staff_shift
          ON operation_shift_staff(operation_shift_id, employee_id);

        CREATE TABLE IF NOT EXISTS operation_shift_handovers (
          id TEXT PRIMARY KEY,
          operation_shift_id TEXT NOT NULL UNIQUE,
          expected_cash REAL NOT NULL DEFAULT 0,
          actual_cash REAL NOT NULL DEFAULT 0,
          cash_difference REAL NOT NULL DEFAULT 0,
          cash_delivered REAL NOT NULL DEFAULT 0,
          pending_orders_json TEXT NOT NULL DEFAULT '[]',
          inventory_status TEXT,
          equipment_status TEXT,
          notes TEXT,
          next_staff_json TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK(status IN ('PENDING', 'RECEIVED', 'REJECTED')),
          submitted_by TEXT NOT NULL,
          submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          received_by TEXT,
          received_at TEXT,
          received_notes TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (operation_shift_id) REFERENCES operation_shifts(id) ON DELETE CASCADE,
          FOREIGN KEY (submitted_by) REFERENCES users(id),
          FOREIGN KEY (received_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_operation_shift_handovers_status
          ON operation_shift_handovers(status, submitted_at);

        CREATE TABLE IF NOT EXISTS operation_shift_incidents (
          id TEXT PRIMARY KEY,
          operation_shift_id TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'NOTE'
            CHECK(type IN ('BREAKDOWN', 'NOTE', 'SAFETY', 'QUALITY', 'OTHER')),
          severity TEXT NOT NULL DEFAULT 'MEDIUM'
            CHECK(severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
          title TEXT NOT NULL,
          description TEXT,
          started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          resolved_at TEXT,
          resolved_by TEXT,
          resolution_notes TEXT,
          reported_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (operation_shift_id) REFERENCES operation_shifts(id) ON DELETE CASCADE,
          FOREIGN KEY (resolved_by) REFERENCES users(id),
          FOREIGN KEY (reported_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_operation_shift_incidents_shift
          ON operation_shift_incidents(operation_shift_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS operation_shift_production (
          id TEXT PRIMARY KEY,
          operation_shift_id TEXT NOT NULL,
          production_order_id TEXT,
          product_id TEXT,
          work_center_id TEXT,
          target_qty REAL NOT NULL DEFAULT 0,
          produced_qty REAL NOT NULL DEFAULT 0,
          good_qty REAL NOT NULL DEFAULT 0,
          scrap_qty REAL NOT NULL DEFAULT 0,
          downtime_minutes INTEGER NOT NULL DEFAULT 0,
          downtime_reason TEXT,
          notes TEXT,
          recorded_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (operation_shift_id) REFERENCES operation_shifts(id) ON DELETE CASCADE,
          FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE SET NULL,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
          FOREIGN KEY (work_center_id) REFERENCES work_centers(id) ON DELETE SET NULL,
          FOREIGN KEY (recorded_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_operation_shift_production_shift
          ON operation_shift_production(operation_shift_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_operation_shift_production_order
          ON operation_shift_production(production_order_id);

        -- Independent time log: an employee may have many in/out periods per
        -- day (for example a double shift or a mid-shift replacement). The
        -- legacy attendance table remains the daily summary and is untouched.
        CREATE TABLE IF NOT EXISTS employee_attendance_periods (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          operation_shift_id TEXT,
          attendance_date TEXT NOT NULL,
          check_in_at TEXT NOT NULL,
          check_out_at TEXT,
          worked_minutes INTEGER NOT NULL DEFAULT 0,
          late_minutes INTEGER NOT NULL DEFAULT 0,
          overtime_minutes INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'OPEN'
            CHECK(status IN ('OPEN', 'CLOSED')),
          source TEXT NOT NULL DEFAULT 'MANUAL',
          notes TEXT,
          recorded_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
          FOREIGN KEY (operation_shift_id) REFERENCES operation_shifts(id) ON DELETE SET NULL,
          FOREIGN KEY (recorded_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_attendance_periods_employee_date
          ON employee_attendance_periods(employee_id, attendance_date, check_in_at);
        CREATE INDEX IF NOT EXISTS idx_attendance_periods_shift
          ON employee_attendance_periods(operation_shift_id, check_in_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_periods_open
          ON employee_attendance_periods(employee_id)
          WHERE check_out_at IS NULL;
      `);

      db.run(
        `INSERT OR IGNORE INTO system_settings (key, value) VALUES ('operationsWorkMode', 'CONTINUOUS')`
      );
    },
  },
];
