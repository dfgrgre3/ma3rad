import type { Migration } from './support';
import { addColumn, tableExists } from './support';

export const MIGRATION_PART_48: Migration[] = [
  {
    id: '160_operations_workforce_scheduling',
    description: 'Add minimum staffing, rest requirements, and manager-approved shift swaps.',
    up: (db) => {
      if (tableExists(db, 'attendance_shifts')) {
        addColumn(db, 'attendance_shifts', 'minimum_staff_count', 'INTEGER NOT NULL DEFAULT 0');
        addColumn(db, 'attendance_shifts', 'required_rest_minutes', 'INTEGER NOT NULL DEFAULT 480');
      }

      if (tableExists(db, 'operation_shifts') && tableExists(db, 'employees') && tableExists(db, 'users')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS operation_shift_swap_requests (
            id TEXT PRIMARY KEY,
            requester_employee_id TEXT NOT NULL,
            target_employee_id TEXT NOT NULL,
            requester_shift_id TEXT NOT NULL,
            target_shift_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING'
              CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
            requested_by TEXT NOT NULL,
            requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            decided_by TEXT,
            decided_at TEXT,
            decision_notes TEXT,
            FOREIGN KEY (requester_employee_id) REFERENCES employees(id) ON DELETE CASCADE,
            FOREIGN KEY (target_employee_id) REFERENCES employees(id) ON DELETE CASCADE,
            FOREIGN KEY (requester_shift_id) REFERENCES operation_shifts(id) ON DELETE CASCADE,
            FOREIGN KEY (target_shift_id) REFERENCES operation_shifts(id) ON DELETE CASCADE,
            FOREIGN KEY (requested_by) REFERENCES users(id),
            FOREIGN KEY (decided_by) REFERENCES users(id)
          );
          CREATE INDEX IF NOT EXISTS idx_operation_shift_swap_status
            ON operation_shift_swap_requests(status, requested_at DESC);
          CREATE INDEX IF NOT EXISTS idx_operation_shift_swap_shifts
            ON operation_shift_swap_requests(requester_shift_id, target_shift_id);
        `);
      }
    },
  },
];