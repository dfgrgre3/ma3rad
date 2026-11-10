import type { Migration } from './support';

export const MIGRATION_PART_50: Migration[] = [
  {
    id: '162_hr_employee_self_service',
    description: 'Add employee self-service requests and grant portal permissions to seeded roles.',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS hr_self_service_requests (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          request_type TEXT NOT NULL DEFAULT 'OTHER'
            CHECK(request_type IN ('SALARY_CERTIFICATE', 'EMPLOYMENT_CERTIFICATE', 'DOCUMENT_COPY', 'LETTER', 'OTHER')),
          subject TEXT NOT NULL,
          details TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK(status IN ('PENDING', 'IN_REVIEW', 'RESOLVED', 'REJECTED')),
          submitted_by TEXT NOT NULL,
          resolved_by TEXT,
          resolved_at TEXT,
          resolution TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES employees(id),
          FOREIGN KEY (submitted_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_hr_self_service_requests_employee
          ON hr_self_service_requests(employee_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_hr_self_service_requests_status
          ON hr_self_service_requests(status, created_at DESC);
      `);

      // The self-service catalog entries: safe for both fresh and existing
      // databases (PermissionService.seed uses INSERT OR IGNORE as well).
      db.exec(`
        INSERT OR IGNORE INTO permissions (id, code, name, module, description)
          VALUES ('perm_hr.selfservice.view', 'hr.selfservice.view', 'بوابة الموظف الذاتية', 'HR', '');
        INSERT OR IGNORE INTO permissions (id, code, name, module, description)
          VALUES ('perm_hr.selfservice.request', 'hr.selfservice.request', 'تقديم طلبات من بوابة الموظف', 'HR', '');
      `);

      // Existing databases already carry the RBAC seeding marker, so
      // seedRoleDefaults would not pick the new codes up. Grant them once to
      // every role that could already view HR leave data (all built-in roles).
      db.exec(`
        INSERT OR IGNORE INTO role_permissions (role_code, permission_code)
          SELECT role_code, 'hr.selfservice.view' FROM role_permissions WHERE permission_code = 'hr.leave.view';
        INSERT OR IGNORE INTO role_permissions (role_code, permission_code)
          SELECT role_code, 'hr.selfservice.request' FROM role_permissions WHERE permission_code = 'hr.leave.request';
      `);
    },
  },
];
