import type { Migration } from './support';
import { tableExists } from './support';

export const MIGRATION_PART_42: Migration[] = [
  {
    id: '154_hr_training_development',
    description: 'Add training courses, enrollments, trainers, skills, job skills and employee skills.',
    disableForeignKeys: true,
    up: (db) => {
      if (!tableExists(db, 'training_trainers')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS training_trainers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            specialty TEXT,
            contact TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'training_courses')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS training_courses (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            trainer_id TEXT,
            start_date TEXT,
            end_date TEXT,
            cost REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','ONGOING','COMPLETED','CANCELLED')),
            created_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'training_enrollments')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS training_enrollments (
            id TEXT PRIMARY KEY,
            course_id TEXT NOT NULL,
            employee_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'ENROLLED' CHECK(status IN ('ENROLLED','ATTENDED','COMPLETED','FAILED','CANCELLED')),
            attendance_percent REAL NOT NULL DEFAULT 0,
            score REAL,
            certificate_expiry TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_training_enrollments_course ON training_enrollments(course_id);
          CREATE INDEX IF NOT EXISTS idx_training_enrollments_employee ON training_enrollments(employee_id);
        `);
      }
      if (!tableExists(db, 'skills')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'job_skills')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS job_skills (
            id TEXT PRIMARY KEY,
            job_title TEXT NOT NULL,
            skill_id TEXT NOT NULL,
            required_level INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_job_skills_job ON job_skills(job_title);
        `);
      }
      if (!tableExists(db, 'employee_skills')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS employee_skills (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            skill_id TEXT NOT NULL,
            level INTEGER NOT NULL DEFAULT 1,
            certified_at TEXT,
            expiry TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_employee_skills_employee ON employee_skills(employee_id);
        `);
      }
    },
  },
];
