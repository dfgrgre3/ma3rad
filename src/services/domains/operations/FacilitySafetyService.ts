import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { NotificationService } from '../notifications/NotificationService';
import type { SafetyContext } from './FacilitySafetyService/context';
import * as riskRegister from './FacilitySafetyService/riskRegister';
import * as inspections from './FacilitySafetyService/inspections';
import * as accidents from './FacilitySafetyService/accidents';
import * as capa from './FacilitySafetyService/capa';
import * as fireEquipment from './FacilitySafetyService/fireEquipment';
import * as drills from './FacilitySafetyService/drills';
import * as ppe from './FacilitySafetyService/ppe';
import * as training from './FacilitySafetyService/training';
import * as stats from './FacilitySafetyService/stats';
import type {
  AccidentRecord,
  AccidentRecordInput,
  AttendanceStatus,
  CAPAInput,
  CAPAItem,
  CAPAStatus,
  EvacuationDrill,
  EvacuationDrillInput,
  FireEquipment,
  FireEquipmentInput,
  FireEquipmentStatus,
  InspectionChecklist,
  InspectionChecklistInput,
  InspectionChecklistItem,
  InspectionRecord,
  InspectionRecordInput,
  InvestigationStatus,
  PPEAssignment,
  PPEAssignmentInput,
  PPEInventory,
  PPEInventoryInput,
  RiskRegisterInput,
  RiskRegisterItem,
  RiskStatus,
  SafetyStats,
  SafetyTraining,
  SafetyTrainingAttendee,
  SafetyTrainingInput,
} from './FacilitySafetyService/types';

export * from './FacilitySafetyService/types';

export class FacilitySafetyService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();
  private static notification = new NotificationService();

  private static readonly ctx: SafetyContext = {
    db: FacilitySafetyService.db,
    branchAccess: FacilitySafetyService.branchAccess,
    notification: FacilitySafetyService.notification,
    requireView: () => FacilitySafetyService.requireView(),
    requireManage: () => FacilitySafetyService.requireManage(),
    currentCompanyId: (actor) => FacilitySafetyService.currentCompanyId(actor),
    auditActor: (actor, action, recordId, values) =>
      FacilitySafetyService.auditActor(actor, action, recordId, values),
    auditDB: (db, actor, action, recordId, values) =>
      FacilitySafetyService.auditDB(db, actor, action, recordId, values),
  };

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
    return riskRegister.getRiskRegister(this.ctx);
  }

  static createRiskRegisterItem(input: RiskRegisterInput): RiskRegisterItem {
    return riskRegister.createRiskRegisterItem(this.ctx, input);
  }

  static updateRiskRegisterItem(id: string, input: Partial<RiskRegisterInput> & { status?: RiskStatus }): RiskRegisterItem {
    return riskRegister.updateRiskRegisterItem(this.ctx, id, input);
  }

  static closeRiskRegisterItem(id: string): RiskRegisterItem {
    return riskRegister.closeRiskRegisterItem(this.ctx, id);
  }

  /* ========== Inspection Checklists ========== */

  static getInspectionChecklists(): InspectionChecklist[] {
    return inspections.getInspectionChecklists(this.ctx);
  }

  static createInspectionChecklist(input: InspectionChecklistInput): InspectionChecklist {
    return inspections.createInspectionChecklist(this.ctx, input);
  }

  static getInspectionChecklistItems(checklistId: string): InspectionChecklistItem[] {
    return inspections.getInspectionChecklistItems(this.ctx, checklistId);
  }

  /* ========== Inspection Records ========== */

  static getInspectionRecords(): InspectionRecord[] {
    return inspections.getInspectionRecords(this.ctx);
  }

  static createInspectionRecord(input: InspectionRecordInput): InspectionRecord {
    return inspections.createInspectionRecord(this.ctx, input);
  }

  static closeInspectionRecord(id: string): InspectionRecord {
    return inspections.closeInspectionRecord(this.ctx, id);
  }

  /* ========== Accidents ========== */

  static getAccidents(): AccidentRecord[] {
    return accidents.getAccidents(this.ctx);
  }

  static createAccidentRecord(input: AccidentRecordInput): AccidentRecord {
    return accidents.createAccidentRecord(this.ctx, input);
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
    return accidents.investigateAccident(this.ctx, id, input);
  }

  /* ========== CAPA ========== */

  static getCAPA(): CAPAItem[] {
    return capa.getCAPA(this.ctx);
  }

  static createCAPA(input: CAPAInput): CAPAItem {
    return capa.createCAPA(this.ctx, input);
  }

  static updateCAPAStatus(id: string, status: CAPAStatus, effectivenessNotes?: string | null): CAPAItem {
    return capa.updateCAPAStatus(this.ctx, id, status, effectivenessNotes);
  }

  /* ========== Fire Equipment ========== */

  static getFireEquipment(): FireEquipment[] {
    return fireEquipment.getFireEquipment(this.ctx);
  }

  static createFireEquipment(input: FireEquipmentInput): FireEquipment {
    return fireEquipment.createFireEquipment(this.ctx, input);
  }

  static updateFireEquipmentStatus(id: string, status: FireEquipmentStatus): FireEquipment {
    return fireEquipment.updateFireEquipmentStatus(this.ctx, id, status);
  }

  /* ========== Evacuation Drills ========== */

  static getEvacuationDrills(): EvacuationDrill[] {
    return drills.getEvacuationDrills(this.ctx);
  }

  static createEvacuationDrill(input: EvacuationDrillInput): EvacuationDrill {
    return drills.createEvacuationDrill(this.ctx, input);
  }

  /* ========== PPE Inventory ========== */

  static getPPEInventory(): PPEInventory[] {
    return ppe.getPPEInventory(this.ctx);
  }

  static createPPEInventory(input: PPEInventoryInput): PPEInventory {
    return ppe.createPPEInventory(this.ctx, input);
  }

  static assignPPE(input: PPEAssignmentInput): PPEAssignment {
    return ppe.assignPPE(this.ctx, input);
  }

  static getPPEAssignments(): PPEAssignment[] {
    return ppe.getPPEAssignments(this.ctx);
  }

  static returnPPE(assignmentId: string, conditionAtReturn?: string | null): PPEAssignment {
    return ppe.returnPPE(this.ctx, assignmentId, conditionAtReturn);
  }

  /* ========== Safety Training ========== */

  static getSafetyTraining(): SafetyTraining[] {
    return training.getSafetyTraining(this.ctx);
  }

  static createSafetyTraining(input: SafetyTrainingInput): SafetyTraining {
    return training.createSafetyTraining(this.ctx, input);
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
    return training.addTrainingAttendee(this.ctx, trainingId, input);
  }

  static getTrainingAttendees(): SafetyTrainingAttendee[] {
    return training.getTrainingAttendees(this.ctx);
  }

  /* ========== Stats ========== */

  static getSafetyStats(): SafetyStats {
    return stats.getSafetyStats(this.ctx);
  }

  /* ========== Alerts ========== */

  static generateCriticalRiskAlerts(): void {
    stats.generateCriticalRiskAlerts(this.ctx);
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
