import type { Migration } from './support';

export const MIGRATION_PART_55: Migration[] = [
  {
    id: '166_facility_hr_employee_linkage',
    description: 'Link facility assets and work orders to employees (not only users), so tasks and assets can be assigned to workers without a system login account.',
    up: (db) => {
      // --- Assets: link to employee (responsible person) ---
      db.exec(`
        ALTER TABLE facility_assets ADD COLUMN responsible_employee_id TEXT;
        CREATE INDEX IF NOT EXISTS idx_facility_assets_responsible_employee ON facility_assets(responsible_employee_id);
      `);

      // --- Work orders: link to employee (requester and assignee) ---
      db.exec(`
        ALTER TABLE facility_work_orders ADD COLUMN requested_employee_id TEXT;
        ALTER TABLE facility_work_orders ADD COLUMN assigned_employee_id TEXT;
        CREATE INDEX IF NOT EXISTS idx_facility_work_orders_requested_employee ON facility_work_orders(requested_employee_id);
        CREATE INDEX IF NOT EXISTS idx_facility_work_orders_assigned_employee ON facility_work_orders(assigned_employee_id);
      `);

      // --- Maintenance schedules: link to employee (assignee) ---
      db.exec(`
        ALTER TABLE facility_maintenance_schedules ADD COLUMN assigned_employee_id TEXT;
        CREATE INDEX IF NOT EXISTS idx_facility_maintenance_schedules_assigned_employee ON facility_maintenance_schedules(assigned_employee_id);
      `);

      // Backfill: if assigned_to references a user who is also an employee, populate assigned_employee_id
      db.run(`
        UPDATE facility_work_orders
        SET assigned_employee_id = (
          SELECT e.id FROM employees e WHERE e.user_id = facility_work_orders.assigned_to LIMIT 1
        )
        WHERE assigned_to IS NOT NULL
          AND assigned_employee_id IS NULL;
      `);

      // Backfill: if responsible_user_id references a user who is also an employee, populate responsible_employee_id
      db.run(`
        UPDATE facility_assets
        SET responsible_employee_id = (
          SELECT e.id FROM employees e WHERE e.user_id = facility_assets.responsible_user_id LIMIT 1
        )
        WHERE responsible_user_id IS NOT NULL
          AND responsible_employee_id IS NULL;
      `);
    },
  },
];
