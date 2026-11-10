import type { Migration } from './support';
import { tableExists } from './support';

export const MIGRATION_PART_41: Migration[] = [
  {
    id: '153_hr_performance_management',
    description: 'Add performance cycles, goals, KPIs, evaluations and improvement plans.',
    disableForeignKeys: true,
    up: (db) => {
      if (!tableExists(db, 'performance_cycles')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS performance_cycles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            period_type TEXT NOT NULL CHECK(period_type IN ('MONTHLY','QUARTERLY','ANNUAL','CUSTOM')),
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','OPEN','CLOSED')),
            created_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'performance_kpis')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS performance_kpis (
            id TEXT PRIMARY KEY,
            job_title TEXT,
            department_id TEXT,
            name TEXT NOT NULL,
            description TEXT,
            default_weight REAL NOT NULL DEFAULT 1,
            unit TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'performance_goals')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS performance_goals (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            cycle_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            weight REAL NOT NULL DEFAULT 1,
            target_value REAL,
            actual_value REAL,
            status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'performance_evaluations')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS performance_evaluations (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            cycle_id TEXT NOT NULL,
            evaluator_id TEXT,
            evaluator_type TEXT NOT NULL DEFAULT 'MANAGER' CHECK(evaluator_type IN ('SELF','MANAGER','DEPARTMENT','HR','PEER')),
            score REAL NOT NULL DEFAULT 0,
            rating TEXT NOT NULL DEFAULT 'SATISFACTORY',
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','APPROVED')),
            submitted_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'performance_evaluation_items')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS performance_evaluation_items (
            id TEXT PRIMARY KEY,
            evaluation_id TEXT NOT NULL,
            kpi_id TEXT,
            goal_id TEXT,
            score REAL NOT NULL DEFAULT 0,
            weight REAL NOT NULL DEFAULT 1,
            comments TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'performance_pips')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS performance_pips (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            reason TEXT NOT NULL,
            goals TEXT,
            status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED','CANCELLED')),
            review_date TEXT,
            outcome TEXT,
            created_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'performance_rewards')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS performance_rewards (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            evaluation_id TEXT,
            reward_type TEXT NOT NULL CHECK(reward_type IN ('BONUS','PROMOTION','RECOGNITION')),
            amount REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','PAID','CANCELLED')),
            notes TEXT,
            created_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
    },
  },
];
