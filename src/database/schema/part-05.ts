export const SCHEMA_PART_05 = String.raw`
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT UNIQUE NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  manager_id TEXT,
  is_main INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  opened_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active);

-- 19. HR: DEPARTMENTS, EMPLOYEES, ATTENDANCE, LEAVES
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  branch_id TEXT,
  manager_id TEXT,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  user_id TEXT,
  full_name TEXT NOT NULL,
  national_id TEXT,
  phone TEXT NOT NULL,
  phone2 TEXT,
  email TEXT,
  address TEXT,
  branch_id TEXT,
  department_id TEXT,
  job_title TEXT NOT NULL,
  employment_type TEXT DEFAULT 'FULL_TIME' CHECK(employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY')),
  hired_at TEXT NOT NULL,
  terminated_at TEXT,
  base_salary REAL DEFAULT 0,
  is_sales_rep INTEGER DEFAULT 0,
  commission_percentage REAL DEFAULT 0,
  monthly_target REAL DEFAULT 0,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_rep ON employees(is_sales_rep);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);

CREATE TABLE IF NOT EXISTS employee_attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  worked_minutes INTEGER DEFAULT 0,
  late_minutes INTEGER DEFAULT 0,
  overtime_minutes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'PRESENT' CHECK(status IN ('PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HOLIDAY', 'WEEKEND')),
  notes TEXT,
  recorded_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON employee_attendance(employee_id, date);

CREATE TABLE IF NOT EXISTS employee_leaves (
  id TEXT PRIMARY KEY,
  request_number TEXT UNIQUE NOT NULL,
  employee_id TEXT NOT NULL,
  leave_type TEXT NOT NULL CHECK(leave_type IN ('ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY', 'MATERNITY', 'OTHER')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days_count REAL NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  decided_by TEXT,
  decided_at TEXT,
  decision_notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (decided_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_leaves_status ON employee_leaves(status);

-- 20. COMMISSIONS
CREATE TABLE IF NOT EXISTS commissions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('SALES_INVOICE', 'COLLECTION', 'PROJECT', 'MANUAL')),
  source_id TEXT,
  period_month TEXT NOT NULL,
  base_amount REAL NOT NULL DEFAULT 0,
  percentage REAL NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'PAID', 'CANCELLED')),
  paid_at TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_commissions_emp ON commissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_commissions_period ON commissions(period_month);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);

-- 21. SALES ORDERS
-- An order is a commitment before the invoice: it reserves stock and can be
-- fulfilled partially. Distinct from sales_invoices, which are the financial record.
`;
