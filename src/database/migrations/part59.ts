import type { Migration } from './support';

export const MIGRATION_PART_59: Migration[] = [
  {
    id: '170_hr_attendance_devices',
    description: 'Add biometric and attendance device integration: registered devices (fingerprint, face, card, QR, mobile), raw device records, and import processing logs.',
    up: (db) => {
      // --- Registered attendance devices ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS hr_attendance_devices (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          device_name TEXT NOT NULL,
          device_type TEXT NOT NULL CHECK(device_type IN ('FINGERPRINT', 'FACE_RECOGNITION', 'CARD', 'QR_CODE', 'MOBILE_APP', 'OTHER')),
          device_code TEXT NOT NULL UNIQUE,
          ip_address TEXT,
          port INTEGER,
          location_lat TEXT,
          location_lng TEXT,
          geo_fence_radius_meters INTEGER DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          last_sync_at TEXT,
          sync_status TEXT NOT NULL DEFAULT 'IDLE' CHECK(sync_status IN ('IDLE', 'SYNCING', 'ERROR')),
          last_error TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_attendance_devices_branch ON hr_attendance_devices(branch_id, is_active);
        CREATE INDEX IF NOT EXISTS idx_attendance_devices_code ON hr_attendance_devices(device_code);
      `);

      // --- Raw device records (unprocessed, append-only) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS hr_attendance_device_records (
          id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL,
          employee_id TEXT,
          employee_code TEXT,
          device_timestamp TEXT NOT NULL,
          device_event_type TEXT NOT NULL CHECK(device_event_type IN ('CHECK_IN', 'CHECK_OUT', 'BREAK_START', 'BREAK_END', 'UNKNOWN')),
          raw_data TEXT,
          latitude TEXT,
          longitude TEXT,
          accuracy_meters REAL,
          processed INTEGER NOT NULL DEFAULT 0 CHECK(processed IN (0, 1)),
          processing_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(processing_status IN ('PENDING', 'PROCESSED', 'SKIPPED', 'ERROR')),
          processing_error TEXT,
          imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          processed_at TEXT,
          processed_by TEXT,
          FOREIGN KEY (device_id) REFERENCES hr_attendance_devices(id) ON DELETE CASCADE,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
          FOREIGN KEY (processed_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_device_records_device ON hr_attendance_device_records(device_id, device_timestamp);
        CREATE INDEX IF NOT EXISTS idx_device_records_employee ON hr_attendance_device_records(employee_id, device_timestamp);
        CREATE INDEX IF NOT EXISTS idx_device_records_processing ON hr_attendance_device_records(processing_status, imported_at);
      `);

      // --- Import processing logs ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS hr_attendance_import_logs (
          id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL,
          import_started_at TEXT NOT NULL,
          import_completed_at TEXT,
          records_found INTEGER NOT NULL DEFAULT 0,
          records_new INTEGER NOT NULL DEFAULT 0,
          records_duplicate INTEGER NOT NULL DEFAULT 0,
          records_processed INTEGER NOT NULL DEFAULT 0,
          records_skipped INTEGER NOT NULL DEFAULT 0,
          records_error INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'RUNNING' CHECK(status IN ('RUNNING', 'COMPLETED', 'ERROR')),
          error_message TEXT,
          imported_by TEXT NOT NULL,
          FOREIGN KEY (device_id) REFERENCES hr_attendance_devices(id) ON DELETE CASCADE,
          FOREIGN KEY (imported_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_import_logs_device ON hr_attendance_import_logs(device_id, import_started_at);
      `);

      // --- Mobile app attendance sessions (geo-location based) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS hr_mobile_attendance_sessions (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          session_type TEXT NOT NULL CHECK(session_type IN ('CHECK_IN', 'CHECK_OUT')),
          recorded_at TEXT NOT NULL,
          latitude TEXT NOT NULL,
          longitude TEXT NOT NULL,
          accuracy_meters REAL,
          device_info TEXT,
          ip_address TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'VERIFIED', 'REJECTED')),
          verified_by TEXT,
          verified_at TEXT,
          rejection_reason TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (verified_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_mobile_sessions_employee ON hr_mobile_attendance_sessions(employee_id, recorded_at);
        CREATE INDEX IF NOT EXISTS idx_mobile_sessions_branch ON hr_mobile_attendance_sessions(branch_id, recorded_at);
      `);
    },
  },
];
