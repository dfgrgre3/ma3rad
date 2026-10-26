export const SCHEMA_PART_14 = String.raw`
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  request_number TEXT UNIQUE NOT NULL,
  request_type TEXT NOT NULL CHECK(request_type IN ('DISCOUNT', 'PRICE_CHANGE', 'SALES_RETURN', 'PURCHASE_RETURN', 'STOCK_ADJUSTMENT', 'PURCHASE_ORDER', 'EXPENSE', 'CREDIT_LIMIT', 'LEAVE', 'OTHER')),
  reference_type TEXT,
  reference_id TEXT,
  branch_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  requested_value REAL,
  current_value REAL,
  payload TEXT,
  priority TEXT DEFAULT 'NORMAL' CHECK(priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED')),
  requested_by TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  decision_notes TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (decided_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approvals_type ON approval_requests(request_type);

-- 31. AUTH: ROLES, SESSIONS, LOGIN HISTORY
-- users.role stays as the coarse label; roles/role_permissions let an admin
-- define custom roles without a code change.
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_code TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  PRIMARY KEY (role_code, permission_code),
  FOREIGN KEY (role_code) REFERENCES roles(code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_label TEXT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  end_reason TEXT CHECK(end_reason IN ('LOGOUT', 'EXPIRED', 'REVOKED', 'CRASH')),
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id, is_active);

CREATE TABLE IF NOT EXISTS login_history (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username_attempted TEXT NOT NULL,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  device_label TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_login_hist_user ON login_history(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_login_hist_created ON login_history(created_at);

-- 32. EMPLOYEES
-- The canonical employees table is defined earlier (with full_name, job_title,
-- hired_at, is_active). The legacy duplicate that used to live here was removed;
-- migration 010_employee_compat adds the compatibility columns the HR screens read.

-- 33. PAYROLL TRANSACTIONS (سُلف، مكافآت، خصومات، صرف رواتب)
CREATE TABLE IF NOT EXISTS payroll_transactions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('ADVANCE', 'BONUS', 'DEDUCTION', 'SALARY_PAYOUT')),
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll_transactions(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_date ON payroll_transactions(date);
CREATE INDEX IF NOT EXISTS idx_payroll_type ON payroll_transactions(type);

-- 34. ATTENDANCE
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PRESENT' CHECK(status IN ('PRESENT', 'LATE', 'ABSENT', 'LEAVE')),
  notes TEXT,
  recorded_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);

-- 35. CHEQUES (post-dated / received / issued cheques)
CREATE TABLE IF NOT EXISTS cheques (
  id TEXT PRIMARY KEY,
  cheque_number TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(type IN ('RECEIVED', 'ISSUED')),
  party_type TEXT NOT NULL DEFAULT 'OTHER' CHECK(party_type IN ('CUSTOMER', 'SUPPLIER', 'OTHER')),
  party_id TEXT,
  party_name TEXT NOT NULL,
  bank_name TEXT,
  amount REAL NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'CANCELLED', 'RE_PRESENTED')),
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cheques_due ON cheques(due_date);
CREATE INDEX IF NOT EXISTS idx_cheques_status ON cheques(status, type);

-- 36. FIXED ASSETS & DEPRECIATION
`;
