import type { Migration } from './support';
import { addColumn } from './support';

export const MIGRATION_PART_34: Migration[] = [
  {
    id: '146_hr_recruitment_lifecycle',
    description: 'Add recruitment approval, publication, resume, interview, and offer workflows',
    up: (db) => {
      addColumn(db, 'hr_job_postings', 'approval_status', "TEXT NOT NULL DEFAULT 'APPROVED' CHECK(approval_status IN ('PENDING', 'APPROVED', 'REJECTED'))");
      addColumn(db, 'hr_job_postings', 'approved_by', 'TEXT');
      addColumn(db, 'hr_job_postings', 'approved_at', 'TEXT');
      addColumn(db, 'hr_job_postings', 'is_published', 'INTEGER NOT NULL DEFAULT 1 CHECK(is_published IN (0, 1))');
      addColumn(db, 'hr_job_candidates', 'resume_storage_name', 'TEXT');
      addColumn(db, 'hr_job_candidates', 'resume_file_name', 'TEXT');
      addColumn(db, 'hr_job_candidates', 'resume_mime_type', 'TEXT');
      addColumn(db, 'hr_job_candidates', 'resume_file_size', 'INTEGER');
      addColumn(db, 'hr_job_candidates', 'resume_checksum', 'TEXT');
      db.exec(`
        CREATE TABLE IF NOT EXISTS hr_candidate_interviews (
          id TEXT PRIMARY KEY,
          candidate_id TEXT NOT NULL,
          scheduled_at TEXT NOT NULL,
          interviewer TEXT NOT NULL,
          location TEXT,
          status TEXT NOT NULL DEFAULT 'SCHEDULED'
            CHECK(status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
          score REAL CHECK(score IS NULL OR (score >= 0 AND score <= 100)),
          result TEXT CHECK(result IS NULL OR result IN ('PASS', 'FAIL', 'PENDING')),
          evaluation TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (candidate_id) REFERENCES hr_job_candidates(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_hr_candidate_interviews_candidate
          ON hr_candidate_interviews(candidate_id, scheduled_at DESC);

        CREATE TABLE IF NOT EXISTS hr_candidate_offers (
          id TEXT PRIMARY KEY,
          candidate_id TEXT NOT NULL UNIQUE,
          salary REAL NOT NULL CHECK(salary >= 0),
          salary_type TEXT NOT NULL CHECK(salary_type IN ('MONTHLY', 'DAILY')),
          offered_at TEXT NOT NULL,
          expires_at TEXT,
          status TEXT NOT NULL DEFAULT 'DRAFT'
            CHECK(status IN ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'WITHDRAWN')),
          terms TEXT,
          sent_at TEXT,
          responded_at TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (candidate_id) REFERENCES hr_job_candidates(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_hr_candidate_offers_status
          ON hr_candidate_offers(status, offered_at DESC);
      `);
      db.exec(`
        UPDATE hr_job_postings
        SET approval_status = 'APPROVED', is_published = CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END
      `);
    },
  },
];
