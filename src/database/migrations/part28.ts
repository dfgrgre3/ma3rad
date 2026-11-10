import type { Migration } from './support';
import { tableExists } from './support';

export const MIGRATION_PART_28: Migration[] = [
  {
    id: '140_attendance_timekeeping',
    description: 'Unify attendance storage and add shift scheduling, punches, breaks, approvals, and audit history.',
    disableForeignKeys: true,
    up: (db) => {
      db.exec(`
        CREATE TABLE attendance_unified (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PRESENT'
            CHECK(status IN ('PRESENT', 'LATE', 'ABSENT', 'LEAVE', 'HOLIDAY', 'WEEKEND')),
          check_in_at TEXT,
          check_out_at TEXT,
          worked_minutes INTEGER NOT NULL DEFAULT 0,
          late_minutes INTEGER NOT NULL DEFAULT 0,
          early_leave_minutes INTEGER NOT NULL DEFAULT 0,
          overtime_minutes INTEGER NOT NULL DEFAULT 0,
          break_minutes INTEGER NOT NULL DEFAULT 0,
          overtime_approved INTEGER NOT NULL DEFAULT 0,
          overtime_approved_by TEXT,
          overtime_approved_at TEXT,
          source TEXT NOT NULL DEFAULT 'MANUAL',
          notes TEXT,
          recorded_by TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(employee_id, date),
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
          FOREIGN KEY (recorded_by) REFERENCES users(id),
          FOREIGN KEY (overtime_approved_by) REFERENCES users(id)
        );
        INSERT INTO attendance_unified (
          id, employee_id, date, status, late_minutes, overtime_minutes,
          overtime_approved, source, notes, recorded_by, created_at
        )
        SELECT id, employee_id, date, status, COALESCE(late_minutes, 0), COALESCE(overtime_minutes, 0),
               CASE WHEN COALESCE(overtime_minutes, 0) > 0 THEN 1 ELSE 0 END,
               'LEGACY', notes, recorded_by, COALESCE(created_at, CURRENT_TIMESTAMP)
        FROM attendance;
      `);

      if (tableExists(db, 'employee_attendance')) {
        db.exec(`
        INSERT OR IGNORE INTO attendance_unified (
          id, employee_id, date, status, check_in_at, check_out_at, worked_minutes,
          late_minutes, early_leave_minutes, overtime_minutes, break_minutes,
          overtime_approved, source, notes, recorded_by, created_at
        )
        SELECT id, employee_id, date, status,
               CASE WHEN check_in IS NULL THEN NULL
                    WHEN length(check_in) <= 8 THEN date || 'T' || check_in
                    ELSE replace(check_in, ' ', 'T') END,
               CASE WHEN check_out IS NULL THEN NULL
                    WHEN length(check_out) <= 8 THEN date || 'T' || check_out
                    ELSE replace(check_out, ' ', 'T') END,
               COALESCE(worked_minutes, 0), COALESCE(late_minutes, 0), 0,
               COALESCE(overtime_minutes, 0), 0,
               CASE WHEN COALESCE(overtime_minutes, 0) > 0 THEN 1 ELSE 0 END,
               'LEGACY', notes, recorded_by, COALESCE(created_at, CURRENT_TIMESTAMP)
        FROM employee_attendance;

        UPDATE attendance_unified
        SET check_in_at = COALESCE(check_in_at, (
          SELECT CASE WHEN length(old.check_in) <= 8 THEN old.date || 'T' || old.check_in
                      ELSE replace(old.check_in, ' ', 'T') END
          FROM employee_attendance old
          WHERE old.employee_id = attendance_unified.employee_id AND old.date = attendance_unified.date
        )),
        check_out_at = COALESCE(check_out_at, (
          SELECT CASE WHEN length(old.check_out) <= 8 THEN old.date || 'T' || old.check_out
                      ELSE replace(old.check_out, ' ', 'T') END
          FROM employee_attendance old
              WHERE old.employee_id = attendance_unified.employee_id AND old.date = attendance_unified.date
            )),
            worked_minutes = CASE WHEN worked_minutes = 0 THEN COALESCE((
              SELECT old.worked_minutes FROM employee_attendance old
              WHERE old.employee_id = attendance_unified.employee_id AND old.date = attendance_unified.date
            ), 0) ELSE worked_minutes END,
            late_minutes = MAX(late_minutes, COALESCE((
              SELECT old.late_minutes FROM employee_attendance old
              WHERE old.employee_id = attendance_unified.employee_id AND old.date = attendance_unified.date
            ), 0)),
            overtime_approved = CASE WHEN COALESCE((
              SELECT old.overtime_minutes FROM employee_attendance old
              WHERE old.employee_id = attendance_unified.employee_id AND old.date = attendance_unified.date
            ), 0) > overtime_minutes THEN 1 ELSE overtime_approved END,
            overtime_minutes = MAX(overtime_minutes, COALESCE((
              SELECT old.overtime_minutes FROM employee_attendance old
              WHERE old.employee_id = attendance_unified.employee_id AND old.date = attendance_unified.date
            ), 0))
        WHERE EXISTS (
          SELECT 1 FROM employee_attendance old
          WHERE old.employee_id = attendance_unified.employee_id AND old.date = attendance_unified.date
        );
        DROP TABLE employee_attendance;
      `);
      }

      db.exec(`
        DROP TABLE attendance;
        ALTER TABLE attendance_unified RENAME TO attendance;

        CREATE INDEX idx_attendance_date ON attendance(date);
        CREATE INDEX idx_attendance_employee ON attendance(employee_id);
        CREATE INDEX idx_attendance_emp_date ON attendance(employee_id, date);
        CREATE TABLE attendance_shifts (
          id TEXT PRIMARY KEY,
          branch_id TEXT NOT NULL,
          name TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          break_minutes INTEGER NOT NULL DEFAULT 0,
          grace_minutes INTEGER NOT NULL DEFAULT 0,
          overtime_after_minutes INTEGER NOT NULL DEFAULT 0,
          workdays_json TEXT NOT NULL DEFAULT '[0,1,2,3,4]',
          is_active INTEGER NOT NULL DEFAULT 1,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(branch_id, name),
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE TABLE employee_shift_assignments (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          shift_id TEXT NOT NULL,
          effective_from TEXT NOT NULL,
          effective_to TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
          FOREIGN KEY (shift_id) REFERENCES attendance_shifts(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX idx_employee_shift_dates
          ON employee_shift_assignments(employee_id, effective_from, effective_to);
        CREATE TABLE attendance_holidays (
          id TEXT PRIMARY KEY,
          branch_id TEXT NOT NULL,
          date TEXT NOT NULL,
          name TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(branch_id, date),
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE TABLE attendance_breaks (
          id TEXT PRIMARY KEY,
          attendance_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX idx_attendance_breaks_entry ON attendance_breaks(attendance_id, started_at);
        CREATE TABLE attendance_correction_requests (
          id TEXT PRIMARY KEY,
          attendance_id TEXT,
          employee_id TEXT NOT NULL,
          attendance_date TEXT NOT NULL,
          before_json TEXT,
          proposed_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
          requested_by TEXT NOT NULL,
          requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          decided_by TEXT,
          decided_at TEXT,
          decision_notes TEXT,
          FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE SET NULL,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
          FOREIGN KEY (requested_by) REFERENCES users(id),
          FOREIGN KEY (decided_by) REFERENCES users(id)
        );
        CREATE UNIQUE INDEX idx_attendance_pending_correction
          ON attendance_correction_requests(employee_id, attendance_date) WHERE status = 'PENDING';
        CREATE TABLE attendance_audit_log (
          id TEXT PRIMARY KEY,
          attendance_id TEXT,
          employee_id TEXT NOT NULL,
          attendance_date TEXT NOT NULL,
          action TEXT NOT NULL,
          before_json TEXT,
          after_json TEXT,
          actor_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE SET NULL,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
          FOREIGN KEY (actor_id) REFERENCES users(id)
        );
        CREATE INDEX idx_attendance_audit_date ON attendance_audit_log(employee_id, attendance_date);
      `);
    },
  },
];
