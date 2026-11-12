import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { NotificationService } from '../notifications/NotificationService';
import { localDateString, addLocalDays } from '../../../utils/shared/date';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskStatus = 'OPEN' | 'MITIGATED' | 'ACCEPTED' | 'CLOSED' | 'REVIEWED';
export type RiskCategory = 'SAFETY' | 'HEALTH' | 'ENVIRONMENT' | 'SECURITY' | 'EQUIPMENT' | 'FIRE' | 'ERGONOMICS' | 'ELECTRICAL' | 'OTHER';
export type RiskType = 'PHYSICAL' | 'CHEMICAL' | 'BIOLOGICAL' | 'ERGONOMIC' | 'PSYCHOSOCIAL' | 'OTHER';
export type Probability = 'RARE' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'ALMOST_CERTAIN';
export type Impact = 'INSIGNIFICANT' | 'MINOR' | 'MODERATE' | 'MAJOR' | 'CATASTROPHIC';

export type InspectionResult = 'PASS' | 'OBSERVATION' | 'FAIL' | 'CLOSED';
export type InspectionItemResult = 'PASS' | 'FAIL' | 'N_A';

export type AccidentType = 'INJURY' | 'NEAR_MISS' | 'PROPERTY_DAMAGE' | 'FIRE' | 'SPILL' | 'OTHER';
export type AccidentSeverity = 'MINOR' | 'MODERATE' | 'SERIOUS' | 'CRITICAL' | 'FATAL';
export type AccidentStatus = 'OPEN' | 'INVESTIGATING' | 'CLOSED';
export type InvestigationStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'NOT_REQUIRED';

export type CAPAStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'VERIFIED' | 'CLOSED';
export type CAPAType = 'CORRECTIVE' | 'PREVENTIVE';
export type CAPAPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FireEquipmentType = 'FIRE_EXTINGUISHER' | 'FIRE_ALARM' | 'SMOKE_DETECTOR' | 'EMERGENCY_EXIT' | 'EXIT_SIGN' | 'FIRE_HOSE' | 'SPRINKLER' | 'OTHER';
export type FireEquipmentStatus = 'ACTIVE' | 'MAINTENANCE' | 'EXPIRED' | 'OUT_OF_SERVICE' | 'RETIRED';

export type DrillType = 'FIRE' | 'EARTHQUAKE' | 'GENERAL_EVACUATION' | 'LOCKDOWN';
export type DrillResult = 'SUCCESS' | 'PARTIAL' | 'FAILED';

export type PPEType = 'HELMET' | 'GOGGLES' | 'GLOVES' | 'MASK' | 'EAR_PROTECTION' | 'SAFETY_SHOES' | 'HARNESS' | 'HIGH_VISIBILITY' | 'OTHER';
export type PPEStatus = 'ACTIVE' | 'MAINTENANCE' | 'EXPIRED' | 'RETIRED';
export type PPEAssignmentStatus = 'ACTIVE' | 'RETURNED' | 'LOST' | 'DAMAGED';

export type TrainingType = 'FIRE_SAFETY' | 'FIRST_AID' | 'PPE_USAGE' | 'ERGONOMICS' | 'EMERGENCY_EVACUATION' | 'HAZARD_AWARENESS' | 'OTHER';
export type TrainingStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type AttendanceStatus = 'ATTENDED' | 'ABSENT' | 'EXCUSED';

export interface RiskRegisterItem {
  id: string;
  riskCode: string;
  riskTitle: string;
  locationId: string;
  locationName: string;
  branchId: string;
  branchName: string;
  assetId: string | null;
  assetName: string | null;
  riskCategory: RiskCategory;
  riskType: RiskType;
  hazardDescription: string;
  probability: Probability;
  impact: Impact;
  riskScore: number;
  riskLevel: RiskLevel;
  existingControls: string | null;
  mitigationPlan: string | null;
  responsibleEmployeeId: string | null;
  responsibleEmployeeName: string | null;
  targetDate: string | null;
  status: RiskStatus;
  reviewDate: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiskRegisterInput {
  locationId: string;
  assetId?: string | null;
  riskTitle: string;
  riskCategory: RiskCategory;
  riskType: RiskType;
  hazardDescription: string;
  probability: Probability;
  impact: Impact;
  existingControls?: string | null;
  mitigationPlan?: string | null;
  responsibleEmployeeId?: string | null;
  targetDate?: string | null;
  reviewDate?: string | null;
}

export interface InspectionChecklist {
  id: string;
  checklistCode: string;
  checklistName: string;
  category: string;
  applicableLocationTypes: string;
  isActive: boolean;
  itemCount: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionChecklistInput {
  checklistName: string;
  category: string;
  applicableLocationTypes?: string;
  isActive?: boolean;
  items: Array<{
    itemCode: string;
    itemName: string;
    itemDescription?: string | null;
    isCritical?: boolean;
    sortOrder?: number;
  }>;
}

export interface InspectionChecklistItem {
  id: string;
  itemCode: string;
  itemName: string;
  itemDescription: string | null;
  isCritical: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface InspectionRecord {
  id: string;
  checklistId: string;
  checklistName: string;
  locationId: string;
  locationName: string;
  branchId: string;
  assetId: string | null;
  assetName: string | null;
  inspectionDate: string;
  inspectorId: string;
  inspectorName: string;
  overallResult: InspectionResult;
  totalItems: number;
  passedItems: number;
  failedItems: number;
  observations: string | null;
  nextInspectionDate: string | null;
  status: 'OPEN' | 'CLOSED';
  items: InspectionRecordItem[];
  createdAt: string;
  updatedAt: string;
}

export interface InspectionRecordInput {
  checklistId: string;
  locationId: string;
  assetId?: string | null;
  inspectionDate: string;
  inspectorId: string;
  overallResult: InspectionResult;
  observations?: string | null;
  nextInspectionDate?: string | null;
  items: Array<{
    checklistItemId: string;
    itemName: string;
    result: InspectionItemResult;
    observation?: string | null;
    correctiveAction?: string | null;
    dueDate?: string | null;
  }>;
}

export interface InspectionRecordItem {
  id: string;
  checklistItemId: string;
  itemName: string;
  result: InspectionItemResult;
  observation: string | null;
  correctiveAction: string | null;
  dueDate: string | null;
}

export interface AccidentRecord {
  id: string;
  accidentCode: string;
  locationId: string;
  locationName: string;
  branchId: string;
  branchName: string;
  assetId: string | null;
  assetName: string | null;
  accidentDate: string;
  accidentType: AccidentType;
  severity: AccidentSeverity;
  injuredEmployeeId: string | null;
  injuredEmployeeName: string | null;
  description: string;
  immediateAction: string | null;
  investigationRequired: boolean;
  investigationStatus: InvestigationStatus;
  rootCause: string | null;
  correctiveAction: string | null;
  preventiveAction: string | null;
  daysLost: number;
  reportedBy: string;
  reportedByName: string;
  reportedAt: string;
  closedAt: string | null;
  status: AccidentStatus;
}

export interface AccidentRecordInput {
  locationId: string;
  assetId?: string | null;
  accidentDate: string;
  accidentType: AccidentType;
  severity: AccidentSeverity;
  injuredEmployeeId?: string | null;
  description: string;
  immediateAction?: string | null;
  investigationRequired?: boolean;
}

export interface CAPAItem {
  id: string;
  capaCode: string;
  sourceType: string;
  sourceId: string;
  sourceTitle: string;
  title: string;
  description: string;
  actionType: CAPAType;
  priority: CAPAPriority;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  dueDate: string | null;
  status: CAPAStatus;
  effectivenessCheck: boolean;
  effectivenessNotes: string | null;
  completedAt: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CAPAInput {
  sourceType: string;
  sourceId: string;
  sourceTitle: string;
  title: string;
  description: string;
  actionType: CAPAType;
  priority: CAPAPriority;
  assignedEmployeeId?: string | null;
  dueDate?: string | null;
}

export interface FireEquipment {
  id: string;
  equipmentCode: string;
  equipmentName: string;
  locationId: string;
  locationName: string;
  branchId: string;
  assetId: string | null;
  assetName: string | null;
  equipmentType: FireEquipmentType;
  installationDate: string | null;
  lastInspectionDate: string | null;
  nextInspectionDate: string | null;
  inspectionFrequencyMonths: number;
  lastServiceDate: string | null;
  nextServiceDate: string | null;
  serviceFrequencyMonths: number;
  expiryDate: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  capacityRating: string | null;
  status: FireEquipmentStatus;
  locationDescription: string | null;
  responsibleEmployeeId: string | null;
  responsibleEmployeeName: string | null;
  isInspectionDue: boolean;
  isServiceDue: boolean;
  isExpired: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface FireEquipmentInput {
  locationId: string;
  assetId?: string | null;
  equipmentName: string;
  equipmentType: FireEquipmentType;
  installationDate?: string | null;
  inspectionFrequencyMonths?: number;
  serviceFrequencyMonths?: number;
  expiryDate?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  capacityRating?: string | null;
  locationDescription?: string | null;
  responsibleEmployeeId?: string | null;
}

export interface EvacuationDrill {
  id: string;
  drillCode: string;
  locationId: string;
  locationName: string;
  branchId: string;
  drillDate: string;
  drillType: DrillType;
  plannedEvacuationTimeMinutes: number;
  actualEvacuationTimeMinutes: number;
  participantsCount: number;
  evacuatedCount: number;
  result: DrillResult;
  observations: string | null;
  lessonsLearned: string | null;
  improvements: string | null;
  conductedBy: string;
  conductedByName: string;
  createdAt: string;
}

export interface EvacuationDrillInput {
  locationId: string;
  drillDate: string;
  drillType: DrillType;
  plannedEvacuationTimeMinutes?: number;
  actualEvacuationTimeMinutes?: number;
  participantsCount?: number;
  evacuatedCount?: number;
  result: DrillResult;
  observations?: string | null;
  lessonsLearned?: string | null;
  improvements?: string | null;
  conductedBy: string;
}

export interface PPEInventory {
  id: string;
  ppeCode: string;
  ppeName: string;
  locationId: string;
  locationName: string;
  branchId: string;
  ppeType: PPEType;
  quantityTotal: number;
  quantityAvailable: number;
  quantityInUse: number;
  size: string | null;
  manufacturer: string | null;
  model: string | null;
  expiryDate: string | null;
  status: PPEStatus;
  notes: string | null;
  isExpired: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PPEInventoryInput {
  locationId: string;
  ppeName: string;
  ppeType: PPEType;
  quantityTotal: number;
  size?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
}

export interface PPEAssignment {
  id: string;
  ppeInventoryId: string;
  ppeName: string;
  ppeCode: string;
  employeeId: string;
  employeeName: string;
  assignedDate: string;
  returnDate: string | null;
  status: PPEAssignmentStatus;
  conditionAtReturn: string | null;
  notes: string | null;
  assignedBy: string;
  assignedByName: string;
  assignedAt: string;
}

export interface PPEAssignmentInput {
  ppeInventoryId: string;
  employeeId: string;
  assignedDate: string;
  notes?: string | null;
}

export interface SafetyTraining {
  id: string;
  trainingCode: string;
  trainingName: string;
  trainingType: TrainingType;
  trainerName: string | null;
  trainingDate: string;
  durationHours: number;
  locationId: string | null;
  locationName: string | null;
  branchId: string;
  branchName: string;
  certificateNumber: string | null;
  certificateExpiryDate: string | null;
  status: TrainingStatus;
  attendeeCount: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyTrainingInput {
  trainingName: string;
  trainingType: TrainingType;
  trainerName?: string | null;
  trainingDate: string;
  durationHours?: number;
  locationId?: string | null;
  certificateNumber?: string | null;
  certificateExpiryDate?: string | null;
  status?: TrainingStatus;
}

export interface SafetyTrainingAttendee {
  id: string;
  employeeId: string;
  employeeName: string;
  attendanceStatus: AttendanceStatus;
  testScore: number | null;
  certificateIssued: boolean;
  notes: string | null;
}

export interface SafetyStats {
  totalRisks: number;
  criticalRisks: number;
  highRisks: number;
  openRisks: number;
  mitigatedRisks: number;
  totalInspections: number;
  failedInspections: number;
  totalAccidents: number;
  seriousAccidents: number;
  openAccidents: number;
  totalCAPA: number;
  overdueCAPA: number;
  fireEquipmentDueInspection: number;
  ppeExpiringSoon: number;
  trainingExpiringSoon: number;
}

const _MAX_DATE = '9999-12-31';

const RISK_SCORE_MAP: Record<string, Record<string, number>> = {
  RARE: { INSIGNIFICANT: 1, MINOR: 2, MODERATE: 3, MAJOR: 4, CATASTROPHIC: 5 },
  UNLIKELY: { INSIGNIFICANT: 2, MINOR: 4, MODERATE: 6, MAJOR: 8, CATASTROPHIC: 10 },
  POSSIBLE: { INSIGNIFICANT: 3, MINOR: 6, MODERATE: 9, MAJOR: 12, CATASTROPHIC: 15 },
  LIKELY: { INSIGNIFICANT: 4, MINOR: 8, MODERATE: 12, MAJOR: 16, CATASTROPHIC: 20 },
  ALMOST_CERTAIN: { INSIGNIFICANT: 5, MINOR: 10, MODERATE: 15, MAJOR: 20, CATASTROPHIC: 25 },
};

function computeRiskScore(probability: Probability, impact: Impact): number {
  return RISK_SCORE_MAP[probability]?.[impact] ?? 0;
}

function computeRiskLevel(score: number): RiskLevel {
  if (score >= 15) return 'CRITICAL';
  if (score >= 8) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
}

function isValidDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function _roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

export class FacilitySafetyService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();
  private static notification = new NotificationService();

  private static requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'operations.view', 'facility_management.view',
    ]);
    return actor;
  }

  private static requireManage() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.requireAny(actor, [
      'operations.update', 'facility_management.manage',
    ]);
    return actor;
  }

  private static currentCompanyId(actor = AuthService.requireAuth()): string {
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const row = this.db.query<{ companyId: string | null }>(
      'SELECT company_id AS companyId FROM branches WHERE id = ?',
      [branchId]
    )[0];
    if (!row?.companyId) throw new Error('فرع العمل الحالي غير مرتبط بشركة.');
    return row.companyId;
  }

  /* ========== Risk Register ========== */

  static getRiskRegister(): RiskRegisterItem[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('rr.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT rr.id, rr.risk_code AS riskCode, rr.risk_title AS riskTitle,
              rr.location_id AS locationId, fl.name AS locationName,
              rr.branch_id AS branchId, b.name AS branchName,
              rr.asset_id AS assetId, fa.name AS assetName,
              rr.risk_category AS riskCategory, rr.risk_type AS riskType,
              rr.hazard_description AS hazardDescription, rr.probability,
              rr.impact, rr.risk_score AS riskScore, rr.risk_level AS riskLevel,
              rr.existing_controls AS existingControls, rr.mitigation_plan AS mitigationPlan,
              rr.responsible_employee_id AS responsibleEmployeeId,
              e.name AS responsibleEmployeeName,
              rr.target_date AS targetDate, rr.status, rr.review_date AS reviewDate,
              rr.created_by AS createdBy, u.full_name AS createdByName,
              rr.created_at AS createdAt, rr.updated_at AS updatedAt
       FROM facility_risk_register rr
       JOIN facility_locations fl ON fl.id = rr.location_id
       JOIN branches b ON b.id = rr.branch_id
       LEFT JOIN facility_assets fa ON fa.id = rr.asset_id
       LEFT JOIN employees e ON e.id = rr.responsible_employee_id
       LEFT JOIN users u ON u.id = rr.created_by
       WHERE rr.company_id = ? AND ${scope.clause}
       ORDER BY rr.risk_score DESC, rr.risk_title`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      riskLevel: row.risk_level as RiskLevel,
      riskCategory: row.risk_category as RiskCategory,
      riskType: row.risk_type as RiskType,
      probability: row.probability as Probability,
      impact: row.impact as Impact,
      status: row.status as RiskStatus,
    }));
  }

  static createRiskRegisterItem(input: RiskRegisterInput): RiskRegisterItem {
    const actor = this.requireManage();
    const _companyId = this.currentCompanyId(actor);
    const location = this.db.query<{ id: string; name: string; branch_id: string }>(
      'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
      [input.locationId]
    )[0];
    if (!location) throw new Error('الموقع غير موجود.');
    const branch = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM branches WHERE id = ?',
      [location.branch_id]
    )[0];
    if (!branch) throw new Error('الفرع غير موجود.');
    if (input.assetId) {
      const asset = this.db.query<{ id: string; name: string }>(
        'SELECT id, name FROM facility_assets WHERE id = ? AND location_id = ?',
        [input.assetId, input.locationId]
      )[0];
      if (!asset) throw new Error('الأصل المحدد لا يتبع الموقع المختار.');
    }
    const riskScore = computeRiskScore(input.probability, input.impact);
    const riskLevel = computeRiskLevel(riskScore);
    const riskCode = `RSK-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `rsk_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_risk_register
         (id, risk_code, risk_title, location_id, branch_id, asset_id,
          risk_category, risk_type, hazard_description, probability, impact,
          risk_score, risk_level, existing_controls, mitigation_plan,
          responsible_employee_id, target_date, review_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
      [id, riskCode, input.riskTitle, input.locationId, location.branch_id,
        input.assetId || null, input.riskCategory, input.riskType,
        input.hazardDescription, input.probability, input.impact,
        riskScore, riskLevel, input.existingControls || null,
        input.mitigationPlan || null, input.responsibleEmployeeId || null,
        input.targetDate || null, input.reviewDate || null, actor.id]
    );
    this.auditActor(actor, 'إضافة سجل مخاطر', id, {
      riskCode, riskTitle: input.riskTitle, riskLevel, riskScore,
    });
    // Notify if critical risk
    if (riskLevel === 'CRITICAL') {
      this.notification.createNotification(
        'SYSTEM', 'مخاطر حرجة مسجلة',
        `تم تسجيل مخاطر حرجة: ${input.riskTitle} في موقع ${location.name}`,
        actor.id, 'SAFETY_RISK', `${id}:critical`
      );
    }
    return this.getRiskRegisterItem(id)!;
  }

  private static getRiskRegisterItem(id: string): RiskRegisterItem | null {
    const items = this.getRiskRegister().filter((i) => i.id === id);
    return items[0] ?? null;
  }

  static updateRiskRegisterItem(id: string, input: Partial<RiskRegisterInput> & { status?: RiskStatus }): RiskRegisterItem {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const existing = this.db.query<{ id: string; riskScore: number; riskLevel: RiskLevel }>(
      'SELECT id, risk_score AS riskScore, risk_level AS riskLevel FROM facility_risk_register WHERE id = ? AND company_id = ?',
      [id, companyId]
    )[0];
    if (!existing) throw new Error('سجل المخاطر غير موجود.');
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const setField = (column: string, value: string | number | null | undefined) => {
      if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
    };
    setField('risk_title', input.riskTitle?.trim() || null);
    setField('risk_category', input.riskCategory || null);
    setField('risk_type', input.riskType || null);
    setField('hazard_description', input.hazardDescription || null);
    setField('probability', input.probability || null);
    setField('impact', input.impact || null);
    setField('existing_controls', input.existingControls || null);
    setField('mitigation_plan', input.mitigationPlan || null);
    setField('responsible_employee_id', input.responsibleEmployeeId || null);
    setField('target_date', input.targetDate || null);
    setField('review_date', input.reviewDate || null);
    setField('status', input.status || null);
    // Recalculate score if probability or impact changed
    if (input.probability !== undefined || input.impact !== undefined) {
      const prob = input.probability as Probability;
      const imp = input.impact as Impact;
      const score = computeRiskScore(prob, imp);
      const level = computeRiskLevel(score);
      updates.push('risk_score = ?', 'risk_level = ?');
      params.push(score, level);
    }
    if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    this.db.run(`UPDATE facility_risk_register SET ${updates.join(', ')} WHERE id = ?`, params);
    this.auditActor(actor, 'تعديل سجل مخاطر', id, input);
    return this.getRiskRegisterItem(id)!;
  }

  static closeRiskRegisterItem(id: string): RiskRegisterItem {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const existing = this.db.query<{ id: string; status: RiskStatus }>(
      'SELECT id, status FROM facility_risk_register WHERE id = ? AND company_id = ?',
      [id, companyId]
    )[0];
    if (!existing) throw new Error('سجل المخاطر غير موجود.');
    if (existing.status === 'CLOSED') throw new Error('سجل المخاطر مغلق مسبقاً.');
    this.db.run(
      `UPDATE facility_risk_register SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );
    this.auditActor(actor, 'إغلاق سجل مخاطر', id, {});
    return this.getRiskRegisterItem(id)!;
  }

  /* ========== Inspection Checklists ========== */

  static getInspectionChecklists(): InspectionChecklist[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('ic.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT ic.id, ic.checklist_code AS checklistCode, ic.checklist_name AS checklistName,
              ic.category, ic.applicable_location_types AS applicableLocationTypes,
              ic.is_active AS isActive,
              COUNT(ici.id) AS itemCount,
              ic.created_by AS createdBy, u.full_name AS createdByName,
              ic.created_at AS createdAt, ic.updated_at AS updatedAt
       FROM facility_inspection_checklists ic
       LEFT JOIN facility_inspection_checklist_items ici ON ici.checklist_id = ic.id AND ici.is_active = 1
       LEFT JOIN users u ON u.id = ic.created_by
       WHERE ic.company_id = ? AND ${scope.clause}
       GROUP BY ic.id
       ORDER BY ic.checklist_name`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      isActive: Boolean(row.isActive),
      itemCount: Number(row.itemCount) || 0,
    }));
  }

  static createInspectionChecklist(input: InspectionChecklistInput): InspectionChecklist {
    const actor = this.requireManage();
    const _companyId = this.currentCompanyId(actor);
    if (!input.checklistName?.trim()) throw new Error('اسم قائمة التفتيش مطلوب.');
    if (!input.items || !input.items.length) throw new Error('يجب إضافة بند واحد على الأقل.');
    const checklistCode = `CHK-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `chk_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO facility_inspection_checklists
           (id, checklist_code, checklist_name, category, applicable_location_types,
            is_active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, checklistCode, input.checklistName.trim(), input.category,
          input.applicableLocationTypes || 'ALL',
          input.isActive !== false ? 1 : 0, actor.id, now, now]
      );
      for (const item of input.items) {
        if (!item.itemCode?.trim() || !item.itemName?.trim()) continue;
        db.run(
          `INSERT INTO facility_inspection_checklist_items
             (id, checklist_id, item_code, item_name, item_description,
              is_critical, sort_order, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [`chki_${uuidv4().replace(/-/g, '').slice(0, 14)}`, id, item.itemCode.trim(),
            item.itemName.trim(), item.itemDescription || null,
            item.isCritical ? 1 : 0, item.sortOrder ?? 0, 1]
        );
      }
      this.auditDB(db, actor, 'إضافة قائمة تفتيش', id, {
        checklistName: input.checklistName, itemCount: input.items.length,
      });
    });
    return this.getInspectionChecklist(id)!;
  }

  private static getInspectionChecklist(id: string): InspectionChecklist | null {
    const lists = this.getInspectionChecklists().filter((l) => l.id === id);
    return lists[0] ?? null;
  }

  static getInspectionChecklistItems(checklistId: string): InspectionChecklistItem[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('ic.branch_id', undefined, actor);
    return this.db.query<any>(
      `SELECT ici.id, ici.item_code AS itemCode, ici.item_name AS itemName,
              ici.item_description AS itemDescription, ici.is_critical AS isCritical,
              ici.sort_order AS sortOrder, ici.is_active AS isActive
       FROM facility_inspection_checklist_items ici
       JOIN facility_inspection_checklists ic ON ic.id = ici.checklist_id
       WHERE ici.checklist_id = ? AND ic.company_id = ? AND ${scope.clause}
       ORDER BY ici.sort_order`,
      [checklistId, companyId, ...scope.params]
    ).map((row) => ({
      ...row,
      isCritical: Boolean(row.isCritical),
      isActive: Boolean(row.isActive),
    }));
  }

  /* ========== Inspection Records ========== */

  static getInspectionRecords(): InspectionRecord[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('ir.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT ir.id, ir.checklist_id AS checklistId, ic.checklist_name AS checklistName,
              ir.location_id AS locationId, fl.name AS locationName,
              ir.branch_id AS branchId, b.name AS branchName,
              ir.asset_id AS assetId, fa.name AS assetName,
              ir.inspection_date AS inspectionDate, ir.inspector_id AS inspectorId,
              e.name AS inspectorName, ir.overall_result AS overallResult,
              ir.total_items AS totalItems, ir.passed_items AS passedItems,
              ir.failed_items AS failedItems, ir.observations,
              ir.next_inspection_date AS nextInspectionDate, ir.status,
              ir.created_at AS createdAt, ir.updated_at AS updatedAt
       FROM facility_inspection_records ir
       JOIN facility_inspection_checklists ic ON ic.id = ir.checklist_id
       JOIN facility_locations fl ON fl.id = ir.location_id
       JOIN branches b ON b.id = ir.branch_id
       LEFT JOIN facility_assets fa ON fa.id = ir.asset_id
       LEFT JOIN employees e ON e.id = ir.inspector_id
       WHERE ir.company_id = ? AND ${scope.clause}
       ORDER BY ir.inspection_date DESC`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      overallResult: row.overall_result as InspectionResult,
      status: row.status as 'OPEN' | 'CLOSED',
      items: this.getInspectionRecordItems(row.id),
    }));
  }

  private static getInspectionRecordItems(recordId: string): InspectionRecordItem[] {
    return this.db.query<any>(
      `SELECT id, checklist_item_id AS checklistItemId, item_name AS itemName,
              result, observation, corrective_action AS correctiveAction,
              due_date AS dueDate
       FROM facility_inspection_record_items
       WHERE inspection_record_id = ?
       ORDER BY id`,
      [recordId]
    );
  }

  static createInspectionRecord(input: InspectionRecordInput): InspectionRecord {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const checklist = this.db.query<{ id: string }>(
      'SELECT id FROM facility_inspection_checklists WHERE id = ? AND company_id = ?',
      [input.checklistId, companyId]
    )[0];
    if (!checklist) throw new Error('قائمة التفتيش غير موجودة.');
    const location = this.db.query<{ id: string; name: string; branch_id: string }>(
      'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
      [input.locationId]
    )[0];
    if (!location) throw new Error('الموقع غير موجود.');
    if (input.assetId) {
      const asset = this.db.query<{ id: string }>(
        'SELECT id FROM facility_assets WHERE id = ? AND location_id = ?',
        [input.assetId, input.locationId]
      )[0];
      if (!asset) throw new Error('الأصل المحدد لا يتبع الموقع المختار.');
    }
    if (!isValidDate(input.inspectionDate)) throw new Error('تاريخ التفتيش غير صالح.');
    const items = input.items;
    const totalItems = items.length;
    const passedItems = items.filter((i) => i.result === 'PASS').length;
    const failedItems = items.filter((i) => i.result === 'FAIL').length;
    let overallResult: InspectionResult = input.overallResult;
    if (failedItems > 0) overallResult = 'FAIL';
    else if (items.some((i) => i.result === 'N_A') && passedItems === 0) overallResult = 'OBSERVATION';
    const id = `insp_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO facility_inspection_records
           (id, checklist_id, location_id, branch_id, asset_id, inspection_date,
            inspector_id, inspector_name, overall_result, total_items, passed_items,
            failed_items, observations, next_inspection_date, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
        [id, input.checklistId, input.locationId, location.branch_id,
          input.assetId || null, input.inspectionDate, input.inspectorId,
          '', overallResult, totalItems, passedItems, failedItems,
          input.observations || null, input.nextInspectionDate || null, actor.id]
      );
      for (const item of items) {
        db.run(
          `INSERT INTO facility_inspection_record_items
             (id, inspection_record_id, checklist_item_id, item_name, result,
              observation, corrective_action, due_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [`inspi_${uuidv4().replace(/-/g, '').slice(0, 14)}`, id,
            item.checklistItemId, item.itemName, item.result,
            item.observation || null, item.correctiveAction || null, item.dueDate || null]
        );
      }
      this.auditDB(db, actor, 'إضافة سجل تفتيش', id, {
        checklistId: input.checklistId, locationId: input.locationId,
        overallResult, totalItems, passedItems, failedItems,
      });
    });
    return this.getInspectionRecord(id)!;
  }

  private static getInspectionRecord(id: string): InspectionRecord | null {
    const records = this.getInspectionRecords().filter((r) => r.id === id);
    return records[0] ?? null;
  }

  static closeInspectionRecord(id: string): InspectionRecord {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const existing = this.db.query<{ id: string; status: string }>(
      'SELECT id, status FROM facility_inspection_records WHERE id = ? AND company_id = ?',
      [id, companyId]
    )[0];
    if (!existing) throw new Error('سجل التفتيش غير موجود.');
    if (existing.status === 'CLOSED') throw new Error('سجل التفتيش مغلق مسبقاً.');
    this.db.run(
      `UPDATE facility_inspection_records SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );
    this.auditActor(actor, 'إغلاق سجل تفتيش', id, {});
    return this.getInspectionRecord(id)!;
  }

  /* ========== Accidents ========== */

  static getAccidents(): AccidentRecord[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('a.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT a.id, a.accident_code AS accidentCode, a.location_id AS locationId,
              fl.name AS locationName, a.branch_id AS branchId, b.name AS branchName,
              a.asset_id AS assetId, fa.name AS assetName,
              a.accident_date AS accidentDate, a.accident_type AS accidentType,
              a.severity, a.injured_employee_id AS injuredEmployeeId,
              e.name AS injuredEmployeeName, a.description, a.immediate_action AS immediateAction,
              a.investigation_required AS investigationRequired,
              a.investigation_status AS investigationStatus,
              a.root_cause AS rootCause, a.corrective_action AS correctiveAction,
              a.preventive_action AS preventiveAction, a.days_lost AS daysLost,
              a.reported_by AS reportedBy, u.full_name AS reportedByName,
              a.reported_at AS reportedAt, a.closed_at AS closedAt, a.status
       FROM facility_accidents a
       JOIN facility_locations fl ON fl.id = a.location_id
       JOIN branches b ON b.id = a.branch_id
       LEFT JOIN facility_assets fa ON fa.id = a.asset_id
       LEFT JOIN employees e ON e.id = a.injured_employee_id
       LEFT JOIN users u ON u.id = a.reported_by
       WHERE a.company_id = ? AND ${scope.clause}
       ORDER BY a.accident_date DESC`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      accidentType: row.accident_type as AccidentType,
      severity: row.severity as AccidentSeverity,
      investigationStatus: row.investigation_status as InvestigationStatus,
      investigationRequired: Boolean(row.investigation_required),
      status: row.status as AccidentStatus,
    }));
  }

  static createAccidentRecord(input: AccidentRecordInput): AccidentRecord {
    const actor = this.requireManage();
    const _companyId = this.currentCompanyId(actor);
    const location = this.db.query<{ id: string; name: string; branch_id: string }>(
      'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
      [input.locationId]
    )[0];
    if (!location) throw new Error('الموقع غير موجود.');
    if (input.assetId) {
      const asset = this.db.query<{ id: string }>(
        'SELECT id FROM facility_assets WHERE id = ? AND location_id = ?',
        [input.assetId, input.locationId]
      )[0];
      if (!asset) throw new Error('الأصل المحدد لا يتبع الموقع المختار.');
    }
    if (!isValidDate(input.accidentDate)) throw new Error('تاريخ الحادث غير صالح.');
    if (!input.description?.trim()) throw new Error('وصف الحادث مطلوب.');
    const accidentCode = `ACC-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `acc_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_accidents
         (id, accident_code, location_id, branch_id, asset_id, accident_date,
          accident_type, severity, injured_employee_id, description,
          immediate_action, investigation_required, investigation_status,
          reported_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
      [id, accidentCode, input.locationId, location.branch_id,
        input.assetId || null, input.accidentDate, input.accidentType,
        input.severity, input.injuredEmployeeId || null,
        input.description.trim(), input.immediateAction || null,
        input.investigationRequired ? 1 : 0,
        input.investigationRequired ? 'PENDING' : 'NOT_REQUIRED',
        actor.id]
    );
    this.auditActor(actor, 'تسجيل حادث سلامة', id, {
      accidentCode, accidentType: input.accidentType, severity: input.severity,
    });
    // Notify if serious
    if (input.severity === 'SERIOUS' || input.severity === 'CRITICAL' || input.severity === 'FATAL') {
      this.notification.createNotification(
        'SYSTEM', 'حادث سلامة خطير',
        `تم تسجيل حادث ${input.severity}: ${input.description} في ${location.name}`,
        actor.id, 'SAFETY_ACCIDENT', `${id}:serious`
      );
    }
    return this.getAccidentRecord(id)!;
  }

  private static getAccidentRecord(id: string): AccidentRecord | null {
    const records = this.getAccidents().filter((r) => r.id === id);
    return records[0] ?? null;
  }

  static investigateAccident(
    id: string,
    input: {
      investigationStatus: InvestigationStatus;
      rootCause?: string | null;
      correctiveAction?: string | null;
      preventiveAction?: string | null;
      daysLost?: number;
    }
  ): AccidentRecord {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const existing = this.db.query<{ id: string; status: AccidentStatus }>(
      'SELECT id, status FROM facility_accidents WHERE id = ? AND company_id = ?',
      [id, companyId]
    )[0];
    if (!existing) throw new Error('الحادث غير موجود.');
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const setField = (column: string, value: string | number | null | undefined) => {
      if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
    };
    setField('investigation_status', input.investigationStatus || null);
    setField('root_cause', input.rootCause || null);
    setField('corrective_action', input.correctiveAction || null);
    setField('preventive_action', input.preventiveAction || null);
    setField('days_lost', input.daysLost !== undefined ? Math.max(0, input.daysLost) : undefined);
    if (input.investigationStatus === 'COMPLETED') {
      updates.push('status = ?');
      params.push('CLOSED');
      updates.push('closed_at = ?');
      params.push(localDateString());
    }
    if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    this.db.run(`UPDATE facility_accidents SET ${updates.join(', ')} WHERE id = ?`, params);
    this.auditActor(actor, 'تحقيق حادث سلامة', id, input);
    return this.getAccidentRecord(id)!;
  }

  /* ========== CAPA ========== */

  static getCAPA(): CAPAItem[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('c.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT c.id, c.capa_code AS capaCode, c.source_type AS sourceType,
              c.source_id AS sourceId,
              CASE c.source_type
                WHEN 'ACCIDENT' THEN (SELECT title FROM facility_accidents WHERE id = c.source_id)
                WHEN 'INSPECTION' THEN (SELECT id FROM facility_inspection_records WHERE id = c.source_id)
                WHEN 'RISK' THEN (SELECT risk_title FROM facility_risk_register WHERE id = c.source_id)
                ELSE c.title
              END AS sourceTitle,
              c.title, c.description, c.action_type AS actionType,
              c.priority, c.assigned_employee_id AS assignedEmployeeId,
              emp.name AS assignedEmployeeName, c.due_date AS dueDate,
              c.status, c.effectiveness_check AS effectivenessCheck,
              c.effectiveness_notes AS effectivenessNotes,
              c.completed_at AS completedAt,
              c.created_by AS createdBy, u.full_name AS createdByName,
              c.created_at AS createdAt, c.updated_at AS updatedAt
       FROM facility_capa c
       LEFT JOIN employees emp ON emp.id = c.assigned_employee_id
       LEFT JOIN users u ON u.id = c.created_by
       WHERE c.company_id = ? AND ${scope.clause}
       ORDER BY c.due_date, c.priority DESC`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      actionType: row.action_type as CAPAType,
      priority: row.priority as CAPAPriority,
      status: row.status as CAPAStatus,
      effectivenessCheck: Boolean(row.effectiveness_check),
    }));
  }

  static createCAPA(input: CAPAInput): CAPAItem {
    const actor = this.requireManage();
    const _companyId = this.currentCompanyId(actor);
    if (!input.title?.trim()) throw new Error('عنوان الإجراء مطلوب.');
    if (!input.description?.trim()) throw new Error('وصف الإجراء مطلوب.');
    const capaCode = `CAPA-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `capa_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_capa
         (id, capa_code, source_type, source_id, source_title, title, description,
          action_type, priority, assigned_employee_id, due_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
      [id, capaCode, input.sourceType, input.sourceId, input.sourceTitle,
        input.title.trim(), input.description.trim(), input.actionType,
        input.priority, input.assignedEmployeeId || null,
        input.dueDate || null, actor.id]
    );
    this.auditActor(actor, 'إضافة إجراء CAPA', id, {
      capaCode, title: input.title, actionType: input.actionType, priority: input.priority,
    });
    return this.getCAPAItem(id)!;
  }

  private static getCAPAItem(id: string): CAPAItem | null {
    const items = this.getCAPA().filter((i) => i.id === id);
    return items[0] ?? null;
  }

  static updateCAPAStatus(id: string, status: CAPAStatus, effectivenessNotes?: string | null): CAPAItem {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const existing = this.db.query<{ id: string; status: CAPAStatus }>(
      'SELECT id, status FROM facility_capa WHERE id = ? AND company_id = ?',
      [id, companyId]
    )[0];
    if (!existing) throw new Error('إجراء CAPA غير موجود.');
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const setField = (column: string, value: string | number | null | undefined) => {
      if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
    };
    setField('status', status || null);
    setField('effectiveness_notes', effectivenessNotes || null);
    if (status === 'COMPLETED' || status === 'VERIFIED' || status === 'CLOSED') {
      updates.push('completed_at = ?');
      params.push(localDateString());
      if (status === 'VERIFIED') {
        updates.push('effectiveness_check = ?');
        params.push(1);
      }
    }
    if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    this.db.run(`UPDATE facility_capa SET ${updates.join(', ')} WHERE id = ?`, params);
    this.auditActor(actor, 'تعديل إجراء CAPA', id, { status, effectivenessNotes });
    return this.getCAPAItem(id)!;
  }

  /* ========== Fire Equipment ========== */

  static getFireEquipment(): FireEquipment[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('fe.branch_id', undefined, actor);
    const today = localDateString();
    const inThirtyDays = localDateString(addLocalDays(new Date(), 30));
    const rows = this.db.query<any>(
      `SELECT fe.id, fe.equipment_code AS equipmentCode, fe.equipment_name AS equipmentName,
              fe.location_id AS locationId, fl.name AS locationName,
              fe.branch_id AS branchId, b.name AS branchName,
              fe.asset_id AS assetId, fa.name AS assetName,
              fe.equipment_type AS equipmentType, fe.installation_date AS installationDate,
              fe.last_inspection_date AS lastInspectionDate,
              fe.next_inspection_date AS nextInspectionDate,
              fe.inspection_frequency_months AS inspectionFrequencyMonths,
              fe.last_service_date AS lastServiceDate,
              fe.next_service_date AS nextServiceDate,
              fe.service_frequency_months AS serviceFrequencyMonths,
              fe.expiry_date AS expiryDate, fe.manufacturer, fe.model,
              fe.serial_number AS serialNumber, fe.capacity_rating AS capacityRating,
              fe.status, fe.location_description AS locationDescription,
              fe.responsible_employee_id AS responsibleEmployeeId,
              emp.name AS responsibleEmployeeName,
              fe.created_by AS createdBy, u.full_name AS createdByName,
              fe.created_at AS createdAt, fe.updated_at AS updatedAt
       FROM facility_fire_equipment fe
       JOIN facility_locations fl ON fl.id = fe.location_id
       JOIN branches b ON b.id = fe.branch_id
       LEFT JOIN facility_assets fa ON fa.id = fe.asset_id
       LEFT JOIN employees emp ON emp.id = fe.responsible_employee_id
       LEFT JOIN users u ON u.id = fe.created_by
       WHERE fe.company_id = ? AND ${scope.clause}
       ORDER BY fe.equipment_name`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => {
      const nextInspection = row.next_inspection_date;
      const nextService = row.next_service_date;
      const expiry = row.expiry_date;
      return {
        ...row,
        equipmentType: row.equipment_type as FireEquipmentType,
        status: row.status as FireEquipmentStatus,
        isInspectionDue: nextInspection ? nextInspection <= inThirtyDays : false,
        isServiceDue: nextService ? nextService <= inThirtyDays : false,
        isExpired: expiry ? expiry <= today : false,
        responsibleEmployeeName: row.responsible_employee_name || null,
      };
    });
  }

  static createFireEquipment(input: FireEquipmentInput): FireEquipment {
    const actor = this.requireManage();
    const _companyId = this.currentCompanyId(actor);
    const location = this.db.query<{ id: string; name: string; branch_id: string }>(
      'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
      [input.locationId]
    )[0];
    if (!location) throw new Error('الموقع غير موجود.');
    if (!input.equipmentName?.trim()) throw new Error('اسم المعدة مطلوب.');
    const equipmentCode = `FE-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `fe_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_fire_equipment
         (id, equipment_code, equipment_name, location_id, branch_id, asset_id,
          equipment_type, installation_date, inspection_frequency_months,
          service_frequency_months, expiry_date, manufacturer, model,
          serial_number, capacity_rating, location_description,
          responsible_employee_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, equipmentCode, input.equipmentName.trim(), input.locationId, location.branch_id,
        input.assetId || null, input.equipmentType, input.installationDate || null,
        input.inspectionFrequencyMonths ?? 6, input.serviceFrequencyMonths ?? 12,
        input.expiryDate || null, input.manufacturer || null, input.model || null,
        input.serialNumber || null, input.capacityRating || null,
        input.locationDescription || null, input.responsibleEmployeeId || null, actor.id]
    );
    this.auditActor(actor, 'إضافة معدات إطفاء', id, {
      equipmentCode, equipmentName: input.equipmentName, equipmentType: input.equipmentType,
    });
    return this.getFireEquipmentItem(id)!;
  }

  private static getFireEquipmentItem(id: string): FireEquipment | null {
    const items = this.getFireEquipment().filter((i) => i.id === id);
    return items[0] ?? null;
  }

  static updateFireEquipmentStatus(id: string, status: FireEquipmentStatus): FireEquipment {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const existing = this.db.query<{ id: string; status: FireEquipmentStatus }>(
      'SELECT id, status FROM facility_fire_equipment WHERE id = ? AND company_id = ?',
      [id, companyId]
    )[0];
    if (!existing) throw new Error('معدات الإطفاء غير موجودة.');
    this.db.run(
      `UPDATE facility_fire_equipment SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, id]
    );
    this.auditActor(actor, 'تعديل حالة معدات إطفاء', id, { status });
    return this.getFireEquipmentItem(id)!;
  }

  /* ========== Evacuation Drills ========== */

  static getEvacuationDrills(): EvacuationDrill[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('ed.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT ed.id, ed.drill_code AS drillCode, ed.location_id AS locationId,
              fl.name AS locationName, ed.branch_id AS branchId, b.name AS branchName,
              ed.drill_date AS drillDate, ed.drill_type AS drillType,
              ed.planned_evacuation_time_minutes AS plannedEvacuationTimeMinutes,
              ed.actual_evacuation_time_minutes AS actualEvacuationTimeMinutes,
              ed.participants_count AS participantsCount, ed.evacuated_count AS evacuatedCount,
              ed.result, ed.observations, ed.lessons_learned AS lessonsLearned,
              ed.improvements, ed.conducted_by AS conductedBy,
              u.full_name AS conductedByName, ed.created_at AS createdAt
       FROM facility_evacuation_drills ed
       JOIN facility_locations fl ON fl.id = ed.location_id
       JOIN branches b ON b.id = ed.branch_id
       LEFT JOIN users u ON u.id = ed.conducted_by
       WHERE ed.company_id = ? AND ${scope.clause}
       ORDER BY ed.drill_date DESC`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      drillType: row.drill_type as DrillType,
      result: row.result as DrillResult,
      conductedByName: row.conducted_by_name || null,
    }));
  }

  static createEvacuationDrill(input: EvacuationDrillInput): EvacuationDrill {
    const actor = this.requireManage();
    const _companyId = this.currentCompanyId(actor);
    const location = this.db.query<{ id: string; name: string; branch_id: string }>(
      'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
      [input.locationId]
    )[0];
    if (!location) throw new Error('الموقع غير موجود.');
    if (!isValidDate(input.drillDate)) throw new Error('تاريخ التدريب غير صالح.');
    const drillCode = `DRILL-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `drill_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_evacuation_drills
         (id, drill_code, location_id, branch_id, drill_date, drill_type,
          planned_evacuation_time_minutes, actual_evacuation_time_minutes,
          participants_count, evacuated_count, result, observations,
          lessons_learned, improvements, conducted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, drillCode, input.locationId, location.branch_id, input.drillDate,
        input.drillType, input.plannedEvacuationTimeMinutes ?? 0,
        input.actualEvacuationTimeMinutes ?? 0, input.participantsCount ?? 0,
        input.evacuatedCount ?? 0, input.result, input.observations || null,
        input.lessonsLearned || null, input.improvements || null, actor.id]
    );
    this.auditActor(actor, 'إضافة تدريب إخلاء', id, {
      drillCode, drillType: input.drillType, result: input.result,
    });
    return this.getEvacuationDrill(id)!;
  }

  private static getEvacuationDrill(id: string): EvacuationDrill | null {
    const drills = this.getEvacuationDrills().filter((d) => d.id === id);
    return drills[0] ?? null;
  }

  /* ========== PPE Inventory ========== */

  static getPPEInventory(): PPEInventory[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('ppi.branch_id', undefined, actor);
    const today = localDateString();
    const _inThirtyDays = localDateString(addLocalDays(new Date(), 30));
    const rows = this.db.query<any>(
      `SELECT ppi.id, ppi.ppe_code AS ppeCode, ppi.ppe_name AS ppeName,
              ppi.location_id AS locationId, fl.name AS locationName,
              ppi.branch_id AS branchId, b.name AS branchName,
              ppi.ppe_type AS ppeType, ppi.quantity_total AS quantityTotal,
              ppi.quantity_available AS quantityAvailable,
              ppi.quantity_in_use AS quantityInUse, ppi.size, ppi.manufacturer,
              ppi.model, ppi.expiry_date AS expiryDate, ppi.status,
              ppi.notes, ppi.created_by AS createdBy, u.full_name AS createdByName,
              ppi.created_at AS createdAt, ppi.updated_at AS updatedAt
       FROM facility_ppe_inventory ppi
       JOIN facility_locations fl ON fl.id = ppi.location_id
       JOIN branches b ON b.id = ppi.branch_id
       LEFT JOIN users u ON u.id = ppi.created_by
       WHERE ppi.company_id = ? AND ${scope.clause}
       ORDER BY ppi.ppe_name`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      ppeType: row.ppe_type as PPEType,
      status: row.status as PPEStatus,
      isExpired: row.expiry_date ? row.expiry_date <= today : false,
      createdByName: row.created_by_name || null,
    }));
  }

  static createPPEInventory(input: PPEInventoryInput): PPEInventory {
    const actor = this.requireManage();
    const _companyId = this.currentCompanyId(actor);
    const location = this.db.query<{ id: string; name: string; branch_id: string }>(
      'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
      [input.locationId]
    )[0];
    if (!location) throw new Error('الموقع غير موجود.');
    if (!input.ppeName?.trim()) throw new Error('اسم معدات الوقاية مطلوب.');
    if (Number(input.quantityTotal) < 0) throw new Error('الكمية الإجمالية يجب أن تكون غير سالبة.');
    const ppeCode = `PPE-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `ppe_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_ppe_inventory
         (id, ppe_code, ppe_name, location_id, branch_id, ppe_type,
          quantity_total, quantity_available, quantity_in_use, size,
          manufacturer, model, expiry_date, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, ppeCode, input.ppeName.trim(), input.locationId, location.branch_id,
        input.ppeType, Math.max(0, Number(input.quantityTotal)),
        Math.max(0, Number(input.quantityTotal)), 0,
        input.size || null, input.manufacturer || null, input.model || null,
        input.expiryDate || null, input.notes || null, actor.id]
    );
    this.auditActor(actor, 'إضافة مخزون معدات وقاية', id, {
      ppeCode, ppeName: input.ppeName, ppeType: input.ppeType,
    });
    return this.getPPEInventoryItem(id)!;
  }

  private static getPPEInventoryItem(id: string): PPEInventory | null {
    const items = this.getPPEInventory().filter((i) => i.id === id);
    return items[0] ?? null;
  }

  static assignPPE(input: PPEAssignmentInput): PPEAssignment {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const inventory = this.db.query<{ id: string; quantity_available: number; quantity_in_use: number }>(
      'SELECT id, quantity_available, quantity_in_use FROM facility_ppe_inventory WHERE id = ? AND company_id = ?',
      [input.ppeInventoryId, companyId]
    )[0];
    if (!inventory) throw new Error('مخزون معدات الوقاية غير موجود.');
    if (inventory.quantity_available <= 0) throw new Error('لا توجد كميات متاحة للإسناد.');
    const employee = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM employees WHERE id = ?',
      [input.employeeId]
    )[0];
    if (!employee) throw new Error('الموظف غير موجود.');
    if (!isValidDate(input.assignedDate)) throw new Error('تاريخ الإسناد غير صالح.');
    const id = `ppea_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO facility_ppe_assignments
           (id, ppe_inventory_id, employee_id, employee_name, assigned_date,
            status, assigned_by)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
        [id, input.ppeInventoryId, input.employeeId, employee.name,
          input.assignedDate, actor.id]
      );
      db.run(
        `UPDATE facility_ppe_inventory
         SET quantity_available = quantity_available - 1,
             quantity_in_use = quantity_in_use + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [input.ppeInventoryId]
      );
      this.auditDB(db, actor, 'إسناد معدات وقاية', id, {
        ppeInventoryId: input.ppeInventoryId, employeeId: input.employeeId,
      });
    });
    return this.getPPEAssignment(id)!;
  }

  private static getPPEAssignment(id: string): PPEAssignment | null {
    const assignments = this.getPPEAssignments().filter((a) => a.id === id);
    return assignments[0] ?? null;
  }

  static getPPEAssignments(): PPEAssignment[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('ppa.branch_id', undefined, actor);
    return this.db.query<any>(
      `SELECT ppa.id, ppa.ppe_inventory_id AS ppeInventoryId,
              ppi.ppe_name AS ppeName, ppi.ppe_code AS ppeCode,
              ppa.employee_id AS employeeId, e.name AS employeeName,
              ppa.assigned_date AS assignedDate, ppa.return_date AS returnDate,
              ppa.status, ppa.condition_at_return AS conditionAtReturn,
              ppa.notes, ppa.assigned_by AS assignedBy,
              u.full_name AS assignedByName, ppa.assigned_at AS assignedAt
       FROM facility_ppe_assignments ppa
       JOIN facility_ppe_inventory ppi ON ppi.id = ppa.ppe_inventory_id
       JOIN employees e ON e.id = ppa.employee_id
       LEFT JOIN users u ON u.id = ppa.assigned_by
       WHERE ppi.company_id = ? AND ${scope.clause}
       ORDER BY ppa.assigned_at DESC`,
      [companyId, ...scope.params]
    ).map((row) => ({
      ...row,
      status: row.status as PPEAssignmentStatus,
      assignedByName: row.assigned_by_name || null,
    }));
  }

  static returnPPE(assignmentId: string, conditionAtReturn?: string | null): PPEAssignment {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const assignment = this.db.query<any>(
      `SELECT ppa.id, ppa.ppe_inventory_id AS ppeInventoryId, ppa.status
       FROM facility_ppe_assignments ppa
       JOIN facility_ppe_inventory ppi ON ppi.id = ppa.ppe_inventory_id
       WHERE ppa.id = ? AND ppi.company_id = ?`,
      [assignmentId, companyId]
    )[0];
    if (!assignment) throw new Error('إسناد معدات الوقاية غير موجود.');
    if (assignment.status === 'RETURNED') throw new Error('المعدات مرتجعة مسبقاً.');
    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE facility_ppe_assignments
         SET status = 'RETURNED', return_date = ?,
             condition_at_return = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [localDateString(), conditionAtReturn || null, assignmentId]
      );
      db.run(
        `UPDATE facility_ppe_inventory
         SET quantity_available = quantity_available + 1,
             quantity_in_use = quantity_in_use - 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [assignment.ppeInventoryId]
      );
      this.auditDB(db, actor, 'إرجاع معدات وقاية', assignmentId, {
        conditionAtReturn,
      });
    });
    return this.getPPEAssignment(assignmentId)!;
  }

  /* ========== Safety Training ========== */

  static getSafetyTraining(): SafetyTraining[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('st.branch_id', undefined, actor);
    const _today = localDateString();
    const _inThirtyDays = localDateString(addLocalDays(new Date(), 30));
    const rows = this.db.query<any>(
      `SELECT st.id, st.training_code AS trainingCode, st.training_name AS trainingName,
              st.training_type AS trainingType, st.trainer_name AS trainerName,
              st.training_date AS trainingDate, st.duration_hours AS durationHours,
              st.location_id AS locationId, fl.name AS locationName,
              st.branch_id AS branchId, b.name AS branchName,
              st.certificate_number AS certificateNumber,
              st.certificate_expiry_date AS certificateExpiryDate, st.status,
              COUNT(sta.id) AS attendeeCount,
              st.created_by AS createdBy, u.full_name AS createdByName,
              st.created_at AS createdAt, st.updated_at AS updatedAt
       FROM facility_safety_training st
       LEFT JOIN facility_locations fl ON fl.id = st.location_id
       JOIN branches b ON b.id = st.branch_id
       LEFT JOIN facility_safety_training_attendees sta ON sta.training_id = st.id
       LEFT JOIN users u ON u.id = st.created_by
       WHERE st.company_id = ? AND ${scope.clause}
       GROUP BY st.id
       ORDER BY st.training_date DESC`,
      [companyId, ...scope.params]
    );
    return rows.map((row) => ({
      ...row,
      trainingType: row.training_type as TrainingType,
      status: row.status as TrainingStatus,
      attendeeCount: Number(row.attendeeCount) || 0,
      createdByName: row.created_by_name || null,
      locationName: row.location_name || null,
    }));
  }

  static createSafetyTraining(input: SafetyTrainingInput): SafetyTraining {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    if (!input.trainingName?.trim()) throw new Error('اسم التدريب مطلوب.');
    if (!isValidDate(input.trainingDate)) throw new Error('تاريخ التدريب غير صالح.');
    const trainingCode = `TRN-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `trn_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_safety_training
         (id, training_code, training_name, training_type, trainer_name,
          training_date, duration_hours, location_id, branch_id,
          certificate_number, certificate_expiry_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, trainingCode, input.trainingName.trim(), input.trainingType,
        input.trainerName || null, input.trainingDate,
        input.durationHours ?? 0, input.locationId || null,
        companyId, input.certificateNumber || null,
        input.certificateExpiryDate || null, input.status ?? 'SCHEDULED', actor.id]
    );
    this.auditActor(actor, 'إضافة تدريب سلامة', id, {
      trainingCode, trainingName: input.trainingName, trainingType: input.trainingType,
    });
    return this.getSafetyTrainingItem(id)!;
  }

  private static getSafetyTrainingItem(id: string): SafetyTraining | null {
    const trainings = this.getSafetyTraining().filter((t) => t.id === id);
    return trainings[0] ?? null;
  }

  static addTrainingAttendee(
    trainingId: string,
    input: {
      employeeId: string;
      attendanceStatus: AttendanceStatus;
      testScore?: number | null;
      certificateIssued?: boolean;
      notes?: string | null;
    }
  ): SafetyTrainingAttendee {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const training = this.db.query<{ id: string }>(
      'SELECT id FROM facility_safety_training WHERE id = ? AND company_id = ?',
      [trainingId, companyId]
    )[0];
    if (!training) throw new Error('التدريب غير موجود.');
    const employee = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM employees WHERE id = ?',
      [input.employeeId]
    )[0];
    if (!employee) throw new Error('الموظف غير موجود.');
    const id = `trna_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO facility_safety_training_attendees
         (id, training_id, employee_id, employee_name, attendance_status,
          test_score, certificate_issued, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, trainingId, input.employeeId, employee.name, input.attendanceStatus,
        input.testScore ?? null, input.certificateIssued ? 1 : 0, input.notes || null]
    );
    this.auditActor(actor, 'إضافة متدرب للتدريب', id, {
      trainingId, employeeId: input.employeeId, attendanceStatus: input.attendanceStatus,
    });
    return this.getTrainingAttendee(id)!;
  }

  private static getTrainingAttendee(id: string): SafetyTrainingAttendee | null {
    const attendees = this.getTrainingAttendees().filter((a) => a.id === id);
    return attendees[0] ?? null;
  }

  static getTrainingAttendees(): SafetyTrainingAttendee[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('sta.branch_id', undefined, actor);
    return this.db.query<any>(
      `SELECT sta.id, sta.employee_id AS employeeId, e.name AS employeeName,
              sta.attendance_status AS attendanceStatus, sta.test_score AS testScore,
              sta.certificate_issued AS certificateIssued, sta.notes, sta.created_at AS createdAt
       FROM facility_safety_training_attendees sta
       JOIN employees e ON e.id = sta.employee_id
       JOIN facility_safety_training st ON st.id = sta.training_id
       WHERE st.company_id = ? AND ${scope.clause}
       ORDER BY sta.created_at DESC`,
      [companyId, ...scope.params]
    ).map((row) => ({
      ...row,
      attendanceStatus: row.attendance_status as AttendanceStatus,
      certificateIssued: Boolean(row.certificate_issued),
    }));
  }

  /* ========== Stats ========== */

  static getSafetyStats(): SafetyStats {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('rr.branch_id', undefined, actor);
    const today = localDateString();
    const inThirtyDays = localDateString(addLocalDays(new Date(), 30));
    const totalRisks = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_risk_register WHERE company_id = ? AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const criticalRisks = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_risk_register WHERE company_id = ? AND risk_level = 'CRITICAL' AND status != 'CLOSED' AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const highRisks = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_risk_register WHERE company_id = ? AND risk_level = 'HIGH' AND status != 'CLOSED' AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const openRisks = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_risk_register WHERE company_id = ? AND status = 'OPEN' AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const mitigatedRisks = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_risk_register WHERE company_id = ? AND status = 'MITIGATED' AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const totalInspections = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_inspection_records WHERE company_id = ? AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const failedInspections = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_inspection_records WHERE company_id = ? AND overall_result = 'FAIL' AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const totalAccidents = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_accidents WHERE company_id = ? AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const seriousAccidents = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_accidents WHERE company_id = ? AND severity IN ('SERIOUS', 'CRITICAL', 'FATAL') AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const openAccidents = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_accidents WHERE company_id = ? AND status = 'OPEN' AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const totalCAPA = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_capa WHERE company_id = ? AND ${scope.clause}`,
      [companyId, ...scope.params]
    )[0]?.count ?? 0;
    const overdueCAPA = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_capa WHERE company_id = ? AND status != 'CLOSED' AND due_date < ? AND ${scope.clause}`,
      [companyId, today, ...scope.params]
    )[0]?.count ?? 0;
    const fireEquipmentDueInspection = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_fire_equipment WHERE company_id = ? AND next_inspection_date <= ? AND status != 'RETIRED' AND ${scope.clause}`,
      [companyId, inThirtyDays, ...scope.params]
    )[0]?.count ?? 0;
    const ppeExpiringSoon = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_ppe_inventory WHERE company_id = ? AND expiry_date <= ? AND status != 'RETIRED' AND ${scope.clause}`,
      [companyId, inThirtyDays, ...scope.params]
    )[0]?.count ?? 0;
    const trainingExpiringSoon = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM facility_safety_training WHERE company_id = ? AND certificate_expiry_date <= ? AND status != 'EXPIRED' AND ${scope.clause}`,
      [companyId, inThirtyDays, ...scope.params]
    )[0]?.count ?? 0;
    return {
      totalRisks: Number(totalRisks),
      criticalRisks: Number(criticalRisks),
      highRisks: Number(highRisks),
      openRisks: Number(openRisks),
      mitigatedRisks: Number(mitigatedRisks),
      totalInspections: Number(totalInspections),
      failedInspections: Number(failedInspections),
      totalAccidents: Number(totalAccidents),
      seriousAccidents: Number(seriousAccidents),
      openAccidents: Number(openAccidents),
      totalCAPA: Number(totalCAPA),
      overdueCAPA: Number(overdueCAPA),
      fireEquipmentDueInspection: Number(fireEquipmentDueInspection),
      ppeExpiringSoon: Number(ppeExpiringSoon),
      trainingExpiringSoon: Number(trainingExpiringSoon),
    };
  }

  /* ========== Alerts ========== */

  static generateCriticalRiskAlerts(): void {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('rr.branch_id', undefined, actor);
    const criticalRisks = this.db.query<any>(
      `SELECT rr.id, rr.risk_title AS riskTitle, rr.location_id AS locationId,
              fl.name AS locationName, rr.responsible_employee_id AS responsibleEmployeeId
       FROM facility_risk_register rr
       JOIN facility_locations fl ON fl.id = rr.location_id
       WHERE rr.company_id = ? AND rr.risk_level = 'CRITICAL' AND rr.status = 'OPEN' AND ${scope.clause}`,
      [companyId, ...scope.params]
    );
    for (const risk of criticalRisks) {
      const referenceId = `SAFETY_RISK_ALERT:${risk.id}`;
      const exists = this.db.query<{ id: string }>(
        `SELECT id FROM notifications WHERE user_id = ? AND reference_type = 'SAFETY_RISK_ALERT' AND reference_id = ? LIMIT 1`,
        [actor.id, referenceId]
      );
      if (!exists.length) {
        this.notification.createNotification(
          'SYSTEM', 'مخاطر حرجة مفتوحة',
          `مخاطر حرجة غير مُعالجة: ${risk.riskTitle} في موقع ${risk.locationName}`,
          actor.id, 'SAFETY_RISK_ALERT', referenceId
        );
      }
    }
  }

  /* ========== Helpers ========== */

  private static auditActor(actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'OPERATIONS', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
        JSON.stringify(values)]
    );
  }

  private static auditDB(db: any, actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void {
    db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'OPERATIONS', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
        JSON.stringify(values)]
    );
  }
}
