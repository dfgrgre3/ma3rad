import type { Migration } from './support';

export const MIGRATION_PART_15: Migration[] = [
  {
    id: '112_hr_recruitment',
    description: 'Add branch-scoped HR job postings and candidate pipeline',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS hr_job_postings (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          department TEXT NOT NULL,
          location TEXT,
          employment_type TEXT NOT NULL
            CHECK(employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP')),
          openings INTEGER NOT NULL DEFAULT 1 CHECK(openings > 0),
          description TEXT,
          requirements TEXT,
          status TEXT NOT NULL DEFAULT 'OPEN'
            CHECK(status IN ('OPEN', 'ON_HOLD', 'CLOSED')),
          branch_id TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_hr_job_postings_branch_status
          ON hr_job_postings(branch_id, status, created_at DESC);

        CREATE TABLE IF NOT EXISTS hr_job_candidates (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          full_name TEXT NOT NULL,
          phone TEXT,
          email TEXT,
          source TEXT,
          status TEXT NOT NULL DEFAULT 'NEW'
            CHECK(status IN ('NEW', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED')),
          employee_id TEXT UNIQUE,
          hired_at TEXT,
          applied_at TEXT NOT NULL,
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (job_id) REFERENCES hr_job_postings(id),
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_hr_job_candidates_branch_status
          ON hr_job_candidates(branch_id, status, applied_at DESC);
        CREATE INDEX IF NOT EXISTS idx_hr_job_candidates_job
          ON hr_job_candidates(job_id, status, applied_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_job_candidates_job_email
          ON hr_job_candidates(job_id, lower(email))
          WHERE email IS NOT NULL AND email <> '';
      `);
    },
  },
];
