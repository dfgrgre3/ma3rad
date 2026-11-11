import type { Migration } from './support';

export const MIGRATION_PART_57: Migration[] = [
  {
    id: '168_hr_workforce_planning',
    description: 'Add workforce planning: headcount plans per department/branch/period, recruitment budget, actual vs planned comparison, and shortage/surplus alerts.',
    up: (db) => {
      // --- Headcount plan per department, branch, and period ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS hr_workforce_plans (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          department_id TEXT NOT NULL,
          period_month TEXT NOT NULL CHECK(period_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
          planned_headcount INTEGER NOT NULL DEFAULT 0 CHECK(planned_headcount >= 0),
          approved_recruitment_budget REAL NOT NULL DEFAULT 0 CHECK(approved_recruitment_budget >= 0),
          expected_employee_cost REAL NOT NULL DEFAULT 0 CHECK(expected_employee_cost >= 0),
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'APPROVED', 'CLOSED')),
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(branch_id, department_id, period_month),
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (department_id) REFERENCES departments(id)
        );
        CREATE INDEX IF NOT EXISTS idx_workforce_plans_period ON hr_workforce_plans(period_month, status);
        CREATE INDEX IF NOT EXISTS idx_workforce_plans_branch_dept ON hr_workforce_plans(branch_id, department_id);
      `);

      // --- Job-level headcount plan (required number per job title within department) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS hr_workforce_plan_jobs (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          job_title TEXT NOT NULL,
          employment_type TEXT NOT NULL DEFAULT 'FULL_TIME' CHECK(employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP')),
          planned_openings INTEGER NOT NULL DEFAULT 0 CHECK(planned_openings >= 0),
          estimated_monthly_salary REAL NOT NULL DEFAULT 0 CHECK(estimated_monthly_salary >= 0),
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (plan_id) REFERENCES hr_workforce_plans(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_workforce_plan_jobs_plan ON hr_workforce_plan_jobs(plan_id);
      `);

      // --- Hiring requisition requests from department managers ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS hr_hiring_requisitions (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          department_id TEXT NOT NULL,
          requisition_number TEXT NOT NULL UNIQUE,
          job_title TEXT NOT NULL,
          employment_type TEXT NOT NULL DEFAULT 'FULL_TIME' CHECK(employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP')),
          openings INTEGER NOT NULL DEFAULT 1 CHECK(openings >= 1),
          estimated_monthly_salary REAL NOT NULL DEFAULT 0 CHECK(estimated_monthly_salary >= 0),
          justification TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CLOSED')),
          requested_by TEXT NOT NULL,
          requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          decided_by TEXT,
          decided_at TEXT,
          decision_note TEXT,
          linked_plan_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (department_id) REFERENCES departments(id),
          FOREIGN KEY (requested_by) REFERENCES employees(id),
          FOREIGN KEY (decided_by) REFERENCES users(id),
          FOREIGN KEY (linked_plan_id) REFERENCES hr_workforce_plans(id)
        );
        CREATE INDEX IF NOT EXISTS idx_hiring_requisitions_status ON hr_hiring_requisitions(status, requested_at DESC);
        CREATE INDEX IF NOT EXISTS idx_hiring_requisitions_department ON hr_hiring_requisitions(department_id, status);
        CREATE INDEX IF NOT EXISTS idx_hiring_requisitions_plan ON hr_hiring_requisitions(linked_plan_id);
      `);

      // --- Actual vs planned headcount snapshots (computed per period) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS hr_headcount_snapshots (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          department_id TEXT NOT NULL,
          period_month TEXT NOT NULL CHECK(period_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
          planned_headcount INTEGER NOT NULL DEFAULT 0,
          actual_headcount INTEGER NOT NULL DEFAULT 0,
          shortage INTEGER NOT NULL DEFAULT 0,
          surplus INTEGER NOT NULL DEFAULT 0,
          snapshot_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT NOT NULL,
          UNIQUE(branch_id, department_id, period_month),
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (department_id) REFERENCES departments(id)
        );
        CREATE INDEX IF NOT EXISTS idx_headcount_snapshots_period ON hr_headcount_snapshots(period_month);
      `);
    },
  },
];
