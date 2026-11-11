import type { Migration } from './support';

export const MIGRATION_PART_61: Migration[] = [
  {
    id: '172_facility_safety_risk_management',
    description: 'Add comprehensive safety and risk management: risk register, risk assessments, mitigation plans, inspections, accidents, CAPA, PPE, fire equipment, evacuation drills, and safety training.',
    up: (db) => {
      // --- Risk Register ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_risk_register (
          id TEXT PRIMARY KEY,
          location_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          asset_id TEXT,
          risk_code TEXT NOT NULL UNIQUE,
          risk_title TEXT NOT NULL,
          risk_category TEXT NOT NULL CHECK(risk_category IN ('SAFETY', 'HEALTH', 'ENVIRONMENT', 'SECURITY', 'EQUIPMENT', 'FIRE', 'ERGONOMICS', 'ELECTRICAL', 'OTHER')),
          hazard_description TEXT NOT NULL,
          risk_type TEXT NOT NULL CHECK(risk_type IN ('PHYSICAL', 'CHEMICAL', 'BIOLOGICAL', 'ERGONOMIC', 'PSYCHOSOCIAL', 'OTHER')),
          probability TEXT NOT NULL CHECK(probability IN ('RARE', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'ALMOST_CERTAIN')),
          impact TEXT NOT NULL CHECK(impact IN ('INSIGNIFICANT', 'MINOR', 'MODERATE', 'MAJOR', 'CATASTROPHIC')),
          risk_score INTEGER NOT NULL DEFAULT 0 CHECK(risk_score >= 0 AND risk_score <= 25),
          risk_level TEXT NOT NULL CHECK(risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
          existing_controls TEXT,
          mitigation_plan TEXT,
          responsible_employee_id TEXT,
          responsible_employee_name TEXT,
          target_date TEXT,
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'MITIGATED', 'ACCEPTED', 'CLOSED', 'REVIEWED')),
          review_date TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE CASCADE,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (asset_id) REFERENCES facility_assets(id) ON DELETE SET NULL,
          FOREIGN KEY (responsible_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_risk_register_branch ON facility_risk_register(branch_id, status);
        CREATE INDEX IF NOT EXISTS idx_facility_risk_register_level ON facility_risk_register(risk_level, status);
        CREATE INDEX IF NOT EXISTS idx_facility_risk_register_location ON facility_risk_register(location_id, risk_level);
      `);

      // --- Inspection Checklists (customizable templates) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_inspection_checklists (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          checklist_code TEXT NOT NULL UNIQUE,
          checklist_name TEXT NOT NULL,
          category TEXT NOT NULL CHECK(category IN ('SAFETY', 'FIRE', 'ELECTRICAL', 'EQUIPMENT', 'CLEANING', 'GENERAL')),
          applicable_location_types TEXT NOT NULL DEFAULT 'ALL' CHECK(applicable_location_types IN ('ALL', 'BUILDING', 'FLOOR', 'ROOM', 'OFFICE', 'WAREHOUSE', 'FACTORY', 'SHOWROOM', 'PRODUCTION_AREA')),
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_inspection_checklists_category ON facility_inspection_checklists(category, is_active);
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_inspection_checklist_items (
          id TEXT PRIMARY KEY,
          checklist_id TEXT NOT NULL,
          item_code TEXT NOT NULL,
          item_name TEXT NOT NULL,
          item_description TEXT,
          is_critical INTEGER NOT NULL DEFAULT 0 CHECK(is_critical IN (0, 1)),
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (checklist_id) REFERENCES facility_inspection_checklists(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_facility_inspection_items_checklist ON facility_inspection_checklist_items(checklist_id, sort_order);
      `);

      // --- Inspection Records (instances of checklists executed) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_inspection_records (
          id TEXT PRIMARY KEY,
          checklist_id TEXT NOT NULL,
          location_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          asset_id TEXT,
          inspection_date TEXT NOT NULL,
          inspector_id TEXT NOT NULL,
          inspector_name TEXT NOT NULL,
          overall_result TEXT NOT NULL CHECK(overall_result IN ('PASS', 'OBSERVATION', 'FAIL', 'CLOSED')),
          total_items INTEGER NOT NULL DEFAULT 0,
          passed_items INTEGER NOT NULL DEFAULT 0,
          failed_items INTEGER NOT NULL DEFAULT 0,
          observations TEXT,
          next_inspection_date TEXT,
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (checklist_id) REFERENCES facility_inspection_checklists(id),
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE CASCADE,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (asset_id) REFERENCES facility_assets(id) ON DELETE SET NULL,
          FOREIGN KEY (inspector_id) REFERENCES employees(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_facility_inspection_records_location ON facility_inspection_records(location_id, inspection_date);
        CREATE INDEX IF NOT EXISTS idx_facility_inspection_records_result ON facility_inspection_records(overall_result, status);
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_inspection_record_items (
          id TEXT PRIMARY KEY,
          inspection_record_id TEXT NOT NULL,
          checklist_item_id TEXT NOT NULL,
          item_name TEXT NOT NULL,
          result TEXT NOT NULL CHECK(result IN ('PASS', 'FAIL', 'N_A')),
          observation TEXT,
          corrective_action TEXT,
          due_date TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (inspection_record_id) REFERENCES facility_inspection_records(id) ON DELETE CASCADE,
          FOREIGN KEY (checklist_item_id) REFERENCES facility_inspection_checklist_items(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_inspection_record_items_record ON facility_inspection_record_items(inspection_record_id, result);
      `);

      // --- Accidents / Incidents ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_accidents (
          id TEXT PRIMARY KEY,
          location_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          asset_id TEXT,
          accident_code TEXT NOT NULL UNIQUE,
          accident_date TEXT NOT NULL,
          accident_type TEXT NOT NULL CHECK(accident_type IN ('INJURY', 'NEAR_MISS', 'PROPERTY_DAMAGE', 'FIRE', 'SPILL', 'OTHER')),
          severity TEXT NOT NULL CHECK(severity IN ('MINOR', 'MODERATE', 'SERIOUS', 'CRITICAL', 'FATAL')),
          injured_employee_id TEXT,
          injured_employee_name TEXT,
          description TEXT NOT NULL,
          immediate_action TEXT,
          investigation_required INTEGER NOT NULL DEFAULT 0 CHECK(investigation_required IN (0, 1)),
          investigation_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(investigation_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'NOT_REQUIRED')),
          root_cause TEXT,
          corrective_action TEXT,
          preventive_action TEXT,
          days_lost INTEGER NOT NULL DEFAULT 0 CHECK(days_lost >= 0),
          reported_by TEXT NOT NULL,
          reported_by_name TEXT NOT NULL,
          reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          closed_at TEXT,
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'INVESTIGATING', 'CLOSED')),
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE CASCADE,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (asset_id) REFERENCES facility_assets(id) ON DELETE SET NULL,
          FOREIGN KEY (injured_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
          FOREIGN KEY (reported_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_accidents_branch ON facility_accidents(branch_id, accident_date);
        CREATE INDEX IF NOT EXISTS idx_facility_accidents_severity ON facility_accidents(severity, status);
        CREATE INDEX IF NOT EXISTS idx_facility_accidents_type ON facility_accidents(accident_type, status);
      `);

      // --- CAPA (Corrective and Preventive Actions) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_capa (
          id TEXT PRIMARY KEY,
          capa_code TEXT NOT NULL UNIQUE,
          source_type TEXT NOT NULL CHECK(source_type IN ('ACCIDENT', 'INSPECTION', 'RISK', 'AUDIT', 'OTHER')),
          source_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          action_type TEXT NOT NULL CHECK(action_type IN ('CORRECTIVE', 'PREVENTIVE')),
          priority TEXT NOT NULL CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
          assigned_employee_id TEXT,
          assigned_employee_name TEXT,
          due_date TEXT,
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CLOSED')),
          effectiveness_check INTEGER NOT NULL DEFAULT 0 CHECK(effectiveness_check IN (0, 1)),
          effectiveness_notes TEXT,
          completed_at TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (assigned_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_capa_source ON facility_capa(source_type, source_id);
        CREATE INDEX IF NOT EXISTS idx_facility_capa_status ON facility_capa(status, due_date);
        CREATE INDEX IF NOT EXISTS idx_facility_capa_priority ON facility_capa(priority, status);
      `);

      // --- Fire Equipment (extinguishers, alarms, etc.) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_fire_equipment (
          id TEXT PRIMARY KEY,
          location_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          asset_id TEXT,
          equipment_code TEXT NOT NULL UNIQUE,
          equipment_name TEXT NOT NULL,
          equipment_type TEXT NOT NULL CHECK(equipment_type IN ('FIRE_EXTINGUISHER', 'FIRE_ALARM', 'SMOKE_DETECTOR', 'EMERGENCY_EXIT', 'EXIT_SIGN', 'FIRE_HOSE', 'SPRINKLER', 'OTHER')),
          installation_date TEXT,
          last_inspection_date TEXT,
          next_inspection_date TEXT,
          inspection_frequency_months INTEGER NOT NULL DEFAULT 6 CHECK(inspection_frequency_months >= 1),
          last_service_date TEXT,
          next_service_date TEXT,
          service_frequency_months INTEGER NOT NULL DEFAULT 12 CHECK(service_frequency_months >= 1),
          expiry_date TEXT,
          manufacturer TEXT,
          model TEXT,
          serial_number TEXT,
          capacity_rating TEXT,
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'MAINTENANCE', 'EXPIRED', 'OUT_OF_SERVICE', 'RETIRED')),
          location_description TEXT,
          responsible_employee_id TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE CASCADE,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (asset_id) REFERENCES facility_assets(id) ON DELETE SET NULL,
          FOREIGN KEY (responsible_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_fire_equipment_location ON facility_fire_equipment(location_id, equipment_type);
        CREATE INDEX IF NOT EXISTS idx_facility_fire_equipment_expiry ON facility_fire_equipment(expiry_date, status);
        CREATE INDEX IF NOT EXISTS idx_facility_fire_equipment_next_inspection ON facility_fire_equipment(next_inspection_date, status);
      `);

      // --- Evacuation Drills ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_evacuation_drills (
          id TEXT PRIMARY KEY,
          location_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          drill_code TEXT NOT NULL UNIQUE,
          drill_date TEXT NOT NULL,
          drill_type TEXT NOT NULL CHECK(drill_type IN ('FIRE', 'EARTHQUAKE', 'GENERAL_EVACUATION', 'LOCKDOWN')),
          planned_evacuation_time_minutes INTEGER NOT NULL DEFAULT 0,
          actual_evacuation_time_minutes INTEGER NOT NULL DEFAULT 0,
          participants_count INTEGER NOT NULL DEFAULT 0,
          evacuated_count INTEGER NOT NULL DEFAULT 0,
          result TEXT NOT NULL CHECK(result IN ('SUCCESS', 'PARTIAL', 'FAILED')),
          observations TEXT,
          lessons_learned TEXT,
          improvements TEXT,
          conducted_by TEXT NOT NULL,
          conducted_by_name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE CASCADE,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (conducted_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_evacuation_drills_location ON facility_evacuation_drills(location_id, drill_date);
        CREATE INDEX IF NOT EXISTS idx_facility_evacuation_drills_result ON facility_evacuation_drills(result, drill_date);
      `);

      // --- PPE (Personal Protective Equipment) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_ppe_inventory (
          id TEXT PRIMARY KEY,
          location_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          ppe_code TEXT NOT NULL UNIQUE,
          ppe_name TEXT NOT NULL,
          ppe_type TEXT NOT NULL CHECK(ppe_type IN ('HELMET', 'GOGGLES', 'GLOVES', 'MASK', 'EAR_PROTECTION', 'SAFETY_SHOES', 'HARNESS', 'HIGH_VISIBILITY', 'OTHER')),
          quantity_total INTEGER NOT NULL DEFAULT 0 CHECK(quantity_total >= 0),
          quantity_available INTEGER NOT NULL DEFAULT 0 CHECK(quantity_available >= 0),
          quantity_in_use INTEGER NOT NULL DEFAULT 0 CHECK(quantity_in_use >= 0),
          size TEXT,
          manufacturer TEXT,
          model TEXT,
          expiry_date TEXT,
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'MAINTENANCE', 'EXPIRED', 'RETIRED')),
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE CASCADE,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_ppe_inventory_location ON facility_ppe_inventory(location_id, ppe_type);
        CREATE INDEX IF NOT EXISTS idx_facility_ppe_inventory_expiry ON facility_ppe_inventory(expiry_date, status);
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_ppe_assignments (
          id TEXT PRIMARY KEY,
          ppe_inventory_id TEXT NOT NULL,
          employee_id TEXT NOT NULL,
          employee_name TEXT NOT NULL,
          assigned_date TEXT NOT NULL,
          return_date TEXT,
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'RETURNED', 'LOST', 'DAMAGED')),
          condition_at_return TEXT,
          notes TEXT,
          assigned_by TEXT NOT NULL,
          assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (ppe_inventory_id) REFERENCES facility_ppe_inventory(id) ON DELETE CASCADE,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
          FOREIGN KEY (assigned_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_ppe_assignments_employee ON facility_ppe_assignments(employee_id, status);
        CREATE INDEX IF NOT EXISTS idx_facility_ppe_assignments_inventory ON facility_ppe_assignments(ppe_inventory_id, status);
      `);

      // --- Safety Training Records ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_safety_training (
          id TEXT PRIMARY KEY,
          training_code TEXT NOT NULL UNIQUE,
          training_name TEXT NOT NULL,
          training_type TEXT NOT NULL CHECK(training_type IN ('FIRE_SAFETY', 'FIRST_AID', 'PPE_USAGE', 'ERGONOMICS', 'EMERGENCY_EVACUATION', 'HAZARD_AWARENESS', 'OTHER')),
          trainer_name TEXT,
          training_date TEXT NOT NULL,
          duration_hours REAL NOT NULL DEFAULT 0 CHECK(duration_hours >= 0),
          location_id TEXT,
          branch_id TEXT NOT NULL,
          certificate_number TEXT,
          certificate_expiry_date TEXT,
          status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE SET NULL,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_safety_training_branch ON facility_safety_training(branch_id, training_date);
        CREATE INDEX IF NOT EXISTS idx_facility_safety_training_expiry ON facility_safety_training(certificate_expiry_date, status);
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_safety_training_attendees (
          id TEXT PRIMARY KEY,
          training_id TEXT NOT NULL,
          employee_id TEXT NOT NULL,
          employee_name TEXT NOT NULL,
          attendance_status TEXT NOT NULL CHECK(attendance_status IN ('ATTENDED', 'ABSENT', 'EXCUSED')),
          test_score REAL,
          certificate_issued INTEGER NOT NULL DEFAULT 0 CHECK(certificate_issued IN (0, 1)),
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (training_id) REFERENCES facility_safety_training(id) ON DELETE CASCADE,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_facility_safety_training_attendees_training ON facility_safety_training_attendees(training_id, attendance_status);
      `);
    },
  },
];
