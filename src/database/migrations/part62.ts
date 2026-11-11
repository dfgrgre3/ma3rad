import type { Migration } from './support';

export const MIGRATION_PART_62: Migration[] = [
  {
    id: '173_facility_utility_management',
    description: 'Add utility management: meters, consumption readings, bills, contracts, and branch-to-branch consumption/cost comparisons.',
    up: (db) => {
      // --- Utility meter definitions ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_utility_meters (
          id TEXT PRIMARY KEY,
          location_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          meter_code TEXT NOT NULL UNIQUE,
          meter_name TEXT NOT NULL,
          utility_type TEXT NOT NULL CHECK(utility_type IN ('ELECTRICITY', 'WATER', 'GAS', 'INTERNET', 'HVAC', 'GENERATOR', 'ELEVATOR', 'FIRE_SUPPRESSION', 'WASTE', 'OTHER')),
          unit_of_measure TEXT NOT NULL DEFAULT 'kWh' CHECK(unit_of_measure IN ('kWh', 'm3', 'liter', 'GB', 'hour', 'unit', 'OTHER')),
          tariff_per_unit REAL NOT NULL DEFAULT 0 CHECK(tariff_per_unit >= 0),
          fixed_monthly_fee REAL NOT NULL DEFAULT 0 CHECK(fixed_monthly_fee >= 0),
          installation_date TEXT,
          last_reading_date TEXT,
          last_reading_value REAL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE CASCADE,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_utility_meters_location ON facility_utility_meters(location_id, utility_type);
        CREATE INDEX IF NOT EXISTS idx_utility_meters_branch ON facility_utility_meters(branch_id, is_active);
        CREATE INDEX IF NOT EXISTS idx_utility_meters_code ON facility_utility_meters(meter_code);
      `);

      // --- Utility consumption readings ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_utility_readings (
          id TEXT PRIMARY KEY,
          meter_id TEXT NOT NULL,
          reading_date TEXT NOT NULL,
          reading_value REAL NOT NULL DEFAULT 0 CHECK(reading_value >= 0),
          previous_value REAL DEFAULT 0,
          consumption REAL NOT NULL DEFAULT 0 CHECK(consumption >= 0),
          cost REAL NOT NULL DEFAULT 0 CHECK(cost >= 0),
          is_estimated INTEGER NOT NULL DEFAULT 0 CHECK(is_estimated IN (0, 1)),
          recorded_by TEXT NOT NULL,
          recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          notes TEXT,
          FOREIGN KEY (meter_id) REFERENCES facility_utility_meters(id) ON DELETE CASCADE,
          FOREIGN KEY (recorded_by) REFERENCES users(id),
          UNIQUE(meter_id, reading_date)
        );
        CREATE INDEX IF NOT EXISTS idx_utility_readings_meter ON facility_utility_readings(meter_id, reading_date);
        CREATE INDEX IF NOT EXISTS idx_utility_readings_date ON facility_utility_readings(reading_date);
      `);

      // --- Utility bills ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_utility_bills (
          id TEXT PRIMARY KEY,
          meter_id TEXT NOT NULL,
          bill_number TEXT NOT NULL,
          billing_period_start TEXT NOT NULL,
          billing_period_end TEXT NOT NULL,
          bill_date TEXT NOT NULL,
          due_date TEXT NOT NULL,
          amount_due REAL NOT NULL DEFAULT 0 CHECK(amount_due >= 0),
          amount_paid REAL NOT NULL DEFAULT 0 CHECK(amount_paid >= 0),
          consumption REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED')),
          payment_date TEXT,
          payment_reference TEXT,
          payment_proof TEXT,
          expense_id TEXT,
          contract_id TEXT,
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (meter_id) REFERENCES facility_utility_meters(id) ON DELETE CASCADE,
          FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL,
          FOREIGN KEY (contract_id) REFERENCES facility_contracts(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id),
          UNIQUE(meter_id, billing_period_start, billing_period_end)
        );
        CREATE INDEX IF NOT EXISTS idx_utility_bills_meter ON facility_utility_bills(meter_id, billing_period_start);
        CREATE INDEX IF NOT EXISTS idx_utility_bills_status ON facility_utility_bills(status, due_date);
        CREATE INDEX IF NOT EXISTS idx_utility_bills_branch ON facility_utility_bills(meter_id, due_date);
      `);

      // --- Utility contracts (service providers for utilities) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_utility_contracts (
          id TEXT PRIMARY KEY,
          meter_id TEXT NOT NULL,
          supplier_id TEXT NOT NULL,
          contract_number TEXT NOT NULL,
          title TEXT NOT NULL,
          starts_at TEXT NOT NULL,
          ends_at TEXT,
          auto_renew INTEGER NOT NULL DEFAULT 0 CHECK(auto_renew IN (0, 1)),
          renewal_notice_days INTEGER NOT NULL DEFAULT 30 CHECK(renewal_notice_days >= 0),
          sla_response_time_hours INTEGER NOT NULL DEFAULT 24 CHECK(sla_response_time_hours >= 0),
          sla_resolution_time_hours INTEGER NOT NULL DEFAULT 48 CHECK(sla_resolution_time_hours >= 0),
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'EXPIRED', 'CANCELLED', 'TERMINATED')),
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (meter_id) REFERENCES facility_utility_meters(id) ON DELETE CASCADE,
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
          FOREIGN KEY (created_by) REFERENCES users(id),
          UNIQUE(meter_id, contract_number)
        );
        CREATE INDEX IF NOT EXISTS idx_utility_contracts_meter ON facility_utility_contracts(meter_id, status);
        CREATE INDEX IF NOT EXISTS idx_utility_contracts_dates ON facility_utility_contracts(ends_at, status);
      `);

      // --- Utility outages and interruptions ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_utility_outages (
          id TEXT PRIMARY KEY,
          meter_id TEXT NOT NULL,
          outage_type TEXT NOT NULL CHECK(outage_type IN ('PLANNED', 'UNPLANNED', 'EMERGENCY')),
          outage_start TEXT NOT NULL,
          outage_end TEXT,
          duration_minutes INTEGER DEFAULT 0 CHECK(duration_minutes >= 0),
          affected_areas TEXT,
          cause TEXT,
          reported_by TEXT NOT NULL,
          reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          resolved_by TEXT,
          resolved_at TEXT,
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
          notes TEXT,
          FOREIGN KEY (meter_id) REFERENCES facility_utility_meters(id) ON DELETE CASCADE,
          FOREIGN KEY (reported_by) REFERENCES users(id),
          FOREIGN KEY (resolved_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_utility_outages_meter ON facility_utility_outages(meter_id, outage_start);
        CREATE INDEX IF NOT EXISTS idx_utility_outages_status ON facility_utility_outages(status, outage_start);
      `);
    },
  },
];
