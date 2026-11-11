import type { Migration } from './support';

export const MIGRATION_PART_64: Migration[] = [
  {
    id: '175_facility_predictive_maintenance',
    description: 'Add predictive maintenance planning: asset health monitoring, condition-based maintenance triggers, failure prediction models, and remaining useful life tracking.',
    up: (db) => {
      // --- Asset health monitoring records ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_asset_health (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          location_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          health_check_date TEXT NOT NULL,
          health_score INTEGER NOT NULL DEFAULT 100 CHECK(health_score >= 0 AND health_score <= 100),
          health_status TEXT NOT NULL CHECK(health_status IN ('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'CRITICAL')),
          vibration_level REAL,
          temperature_level REAL,
          pressure_level REAL,
          noise_level REAL,
          oil_quality TEXT,
          leak_detected INTEGER NOT NULL DEFAULT 0 CHECK(leak_detected IN (0, 1)),
          abnormal_heat INTEGER NOT NULL DEFAULT 0 CHECK(abnormal_heat IN (0, 1)),
          unusual_vibration INTEGER NOT NULL DEFAULT 0 CHECK(unusual_vibration IN (0, 1)),
          notes TEXT,
          checked_by TEXT NOT NULL,
          checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (asset_id) REFERENCES facility_assets(id) ON DELETE CASCADE,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE CASCADE,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (checked_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_asset_health_asset ON facility_asset_health(asset_id, health_check_date);
        CREATE INDEX IF NOT EXISTS idx_asset_health_status ON facility_asset_health(health_status, health_check_date);
      `);

      // --- Condition-based maintenance triggers ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_condition_triggers (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          trigger_code TEXT NOT NULL UNIQUE,
          trigger_name TEXT NOT NULL,
          trigger_type TEXT NOT NULL CHECK(trigger_type IN ('VIBRATION', 'TEMPERATURE', 'PRESSURE', 'NOISE', 'OIL_QUALITY', 'LEAK', 'HEAT', 'HOURS', 'CYCLES', 'OTHER')),
          threshold_value REAL NOT NULL,
          comparison_operator TEXT NOT NULL CHECK(comparison_operator IN ('GT', 'LT', 'EQ', 'GTE', 'LTE')),
          severity TEXT NOT NULL CHECK(severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          auto_create_work_order INTEGER NOT NULL DEFAULT 0 CHECK(auto_create_work_order IN (0, 1)),
          notification_emails TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (asset_id) REFERENCES facility_assets(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_condition_triggers_asset ON facility_condition_triggers(asset_id, is_active);
        CREATE INDEX IF NOT EXISTS idx_condition_triggers_type ON facility_condition_triggers(trigger_type, is_active);
      `);

      // --- Condition trigger activations (when a threshold is breached) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_condition_activations (
          id TEXT PRIMARY KEY,
          trigger_id TEXT NOT NULL,
          asset_id TEXT NOT NULL,
          activation_date TEXT NOT NULL,
          measured_value REAL NOT NULL,
          threshold_value REAL NOT NULL,
          severity TEXT NOT NULL CHECK(severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
          work_order_id TEXT,
          acknowledged INTEGER NOT NULL DEFAULT 0 CHECK(acknowledged IN (0, 1)),
          acknowledged_by TEXT,
          acknowledged_at TEXT,
          resolution_notes TEXT,
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'FALSE_POSITIVE')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (trigger_id) REFERENCES facility_condition_triggers(id) ON DELETE CASCADE,
          FOREIGN KEY (asset_id) REFERENCES facility_assets(id) ON DELETE CASCADE,
          FOREIGN KEY (work_order_id) REFERENCES facility_work_orders(id) ON DELETE SET NULL,
          FOREIGN KEY (acknowledged_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_condition_activations_trigger ON facility_condition_activations(trigger_id, activation_date);
        CREATE INDEX IF NOT EXISTS idx_condition_activations_status ON facility_condition_activations(status, activation_date);
      `);

      // --- Failure prediction models ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_failure_predictions (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          prediction_date TEXT NOT NULL,
          model_name TEXT NOT NULL,
          model_version TEXT,
          failure_probability REAL NOT NULL DEFAULT 0 CHECK(failure_probability >= 0 AND failure_probability <= 1),
          predicted_failure_date TEXT,
          confidence_level REAL DEFAULT 0 CHECK(confidence_level >= 0 AND confidence_level <= 1),
          contributing_factors TEXT,
          recommended_action TEXT,
          predicted_remaining_useful_life_days INTEGER CHECK(predicted_remaining_useful_life_days >= 0),
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'VALIDATED', 'INVALIDATED', 'EXPIRED')),
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (asset_id) REFERENCES facility_assets(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_failure_predictions_asset ON facility_failure_predictions(asset_id, prediction_date);
        CREATE INDEX IF NOT EXISTS idx_failure_predictions_status ON facility_failure_predictions(status, predicted_failure_date);
      `);

      // --- Remaining Useful Life (RUL) tracking ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_rul_tracking (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          tracking_date TEXT NOT NULL,
          current_rul_days INTEGER NOT NULL DEFAULT 0 CHECK(current_rul_days >= 0),
          predicted_rul_days INTEGER NOT NULL DEFAULT 0 CHECK(predicted_rul_days >= 0),
          deterioration_rate REAL DEFAULT 0,
          maintenance_impact_days INTEGER DEFAULT 0 CHECK(maintenance_impact_days >= 0),
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (asset_id) REFERENCES facility_assets(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_rul_tracking_asset ON facility_rul_tracking(asset_id, tracking_date);
      `);
    },
  },
];
