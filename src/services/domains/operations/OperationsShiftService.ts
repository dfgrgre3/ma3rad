import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { localDateString } from '../../../utils/shared/date';
import { v4 as uuidv4 } from 'uuid';
import type { ShiftServiceContext } from './OperationsShiftService/context';
import * as definitions from './OperationsShiftService/definitions';
import * as scheduling from './OperationsShiftService/scheduling';
import * as swaps from './OperationsShiftService/swaps';
import * as queries from './OperationsShiftService/queries';
import * as lifecycle from './OperationsShiftService/lifecycle';
import * as activity from './OperationsShiftService/activity';
import type {
  EmployeeAttendancePeriod,
  OperationCashSummary,
  OperationEmployee,
  OperationShiftAssignmentRow,
  OperationShiftDefinition,
  OperationShiftDetail,
  OperationShiftHandover,
  OperationShiftIncident,
  OperationShiftInstance,
  OperationShiftProductionRow,
  OperationShiftReportRow,
  OperationShiftStaff,
  OperationShiftSwapRequest,
  OperationsWorkMode,
  OperationStaffRole,
  ShiftPayrollRow,
} from './OperationsShiftService/types';

export * from './OperationsShiftService/types';

export class OperationsShiftService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private readonly ctx: ShiftServiceContext;

  constructor() {
    this.ctx = {
      db: this.db,
      branchAccess: this.branchAccess,
      requireView: () => this.requireView(),
      requireManage: () => this.requireManage(),
      audit: (action, recordId, values) => this.audit(action, recordId, values),
      definitionRows: (branchId) => definitions.definitionRows(this.ctx, branchId),
      currentAssignments: (definitionId, businessDate) =>
        definitions.currentAssignments(this.ctx, definitionId, businessDate),
      ensureShiftInstances: (from, to, branchId) =>
        scheduling.ensureShiftInstances(this.ctx, from, to, branchId),
      getShiftBoard: (options) => queries.getShiftBoard(this.ctx, options),
      assertEmployeeAvailable: (employeeId, shift, excludedShiftIds) =>
        scheduling.assertEmployeeAvailable(this.ctx, employeeId, shift, excludedShiftIds),
      getInstance: (id) => queries.getInstance(this.ctx, id),
      getCashSummary: (operationShiftId) => queries.getCashSummary(this.ctx, operationShiftId),
      getShiftDetail: (id) => queries.getShiftDetail(this.ctx, id),
      getProduction: (operationShiftId) => activity.getProduction(this.ctx, operationShiftId),
      getPeriods: (filters) => queries.getPeriods(this.ctx, filters),
    };
  }

  private requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'operations.view', 'cashier.view', 'employees.attendance.view',
      'employees.view', 'manufacturing.view',
    ]);
    return actor;
  }

  private requireManage() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'operations.update', 'cashier.manage', 'employees.attendance.manage',
      'employees.manage', 'manufacturing.manage',
    ]);
    return actor;
  }

  private audit(action: string, recordId: string, values?: unknown): void {
    const actor = AuthService.requireAuth();
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'OPERATIONS', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
        values == null ? null : JSON.stringify(values)]
    );
  }

  public getShiftDefinitions(branchId?: string): OperationShiftDefinition[] {
    return definitions.getShiftDefinitions(this.ctx, branchId);
  }

  public getWorkMode(): OperationsWorkMode {
    return definitions.getWorkMode(this.ctx);
  }

  public saveWorkMode(mode: OperationsWorkMode): void {
    definitions.saveWorkMode(this.ctx, mode);
  }

  public saveShiftDefinition(input: {
    id?: string;
    branchId?: string;
    name: string;
    department?: string | null;
    location?: string | null;
    shiftCode?: string | null;
    color?: string | null;
    startTime: string;
    endTime: string;
    breakMinutes?: number;
    graceMinutes?: number;
    overtimeAfterMinutes?: number;
    minimumStaffCount?: number;
    requiredRestMinutes?: number;
    workdays?: number[];
    shiftOrder?: number;
    isActive?: boolean;
  }): OperationShiftDefinition {
    return definitions.saveShiftDefinition(this.ctx, input);
  }

  public deactivateShiftDefinition(id: string): void {
    definitions.deactivateShiftDefinition(this.ctx, id);
  }

  public getEmployees(branchId?: string): OperationEmployee[] {
    return definitions.getEmployees(this.ctx, branchId);
  }

  public getAssignments(definitionId?: string): OperationShiftAssignmentRow[] {
    return definitions.getAssignments(this.ctx, definitionId);
  }

  public assignEmployee(input: {
    definitionId: string;
    employeeId: string;
    role?: OperationStaffRole;
    effectiveFrom: string;
    effectiveTo?: string | null;
  }): OperationShiftAssignmentRow {
    return definitions.assignEmployee(this.ctx, input);
  }

  public removeAssignment(id: string): void {
    definitions.removeAssignment(this.ctx, id);
  }

  public ensureShiftInstances(from: string, to: string, branchId?: string): number {
    return scheduling.ensureShiftInstances(this.ctx, from, to, branchId);
  }

  public syncShiftLifecycle(today = localDateString()): number {
    return scheduling.syncShiftLifecycle(this.ctx, today);
  }

  public generateWorkforceSchedule(from: string, to: string, branchId?: string): {
    shiftsCreated: number;
    staffAssigned: number;
    shortages: Array<{ shiftId: string; name: string; date: string; shortageCount: number }>;
  } {
    return scheduling.generateWorkforceSchedule(this.ctx, from, to, branchId);
  }

  public getShiftSwapRequests(from?: string, to?: string): OperationShiftSwapRequest[] {
    return swaps.getShiftSwapRequests(this.ctx, from, to);
  }

  public requestShiftSwap(input: {
    requesterEmployeeId: string;
    targetEmployeeId: string;
    requesterShiftId: string;
    targetShiftId: string;
  }): OperationShiftSwapRequest {
    return swaps.requestShiftSwap(this.ctx, input);
  }

  public decideShiftSwap(requestId: string, approve: boolean, notes = ''): void {
    swaps.decideShiftSwap(this.ctx, requestId, approve, notes);
  }

  public getShiftBoard(options: { from?: string; to?: string; branchId?: string } = {}): OperationShiftInstance[] {
    return queries.getShiftBoard(this.ctx, options);
  }

  public getOpenShiftForBranch(branchId?: string): OperationShiftInstance | null {
    return queries.getOpenShiftForBranch(this.ctx, branchId);
  }

  public getCashSummary(operationShiftId: string): OperationCashSummary {
    return queries.getCashSummary(this.ctx, operationShiftId);
  }

  public getShiftDetail(id: string): OperationShiftDetail {
    return queries.getShiftDetail(this.ctx, id);
  }

  public openShift(id: string, input: {
    supervisorId?: string | null;
    employeeIds?: string[];
    notes?: string;
  } = {}): OperationShiftDetail {
    return lifecycle.openShift(this.ctx, id, input);
  }

  public addStaff(operationShiftId: string, employeeId: string, role: OperationStaffRole = 'STAFF'): void {
    lifecycle.addStaff(this.ctx, operationShiftId, employeeId, role);
  }

  public replaceAbsentStaff(
    operationShiftId: string,
    absentEmployeeId: string,
    replacementEmployeeId: string,
    notes = ''
  ): void {
    lifecycle.replaceAbsentStaff(this.ctx, operationShiftId, absentEmployeeId, replacementEmployeeId, notes);
  }

  public approveShiftOvertime(attendancePeriodId: string): void {
    lifecycle.approveShiftOvertime(this.ctx, attendancePeriodId);
  }

  public recordStaffPresence(operationShiftId: string, employeeId: string, direction: 'IN' | 'OUT'): OperationShiftStaff {
    return lifecycle.recordStaffPresence(this.ctx, operationShiftId, employeeId, direction);
  }

  public submitHandover(operationShiftId: string, input: {
    expectedCash?: number;
    actualCash: number;
    cashDelivered?: number;
    pendingOrders?: string[];
    inventoryStatus?: string;
    equipmentStatus?: string;
    notes?: string;
    nextStaffIds?: string[];
  }): OperationShiftHandover {
    return lifecycle.submitHandover(this.ctx, operationShiftId, input);
  }

  public confirmHandover(operationShiftId: string, notes = ''): OperationShiftDetail {
    return lifecycle.confirmHandover(this.ctx, operationShiftId, notes);
  }

  public closeShift(operationShiftId: string, notes = ''): OperationShiftDetail {
    return lifecycle.closeShift(this.ctx, operationShiftId, notes);
  }

  public addIncident(operationShiftId: string, input: {
    type?: OperationShiftIncident['type'];
    severity?: OperationShiftIncident['severity'];
    title: string;
    description?: string;
  }): OperationShiftIncident {
    return activity.addIncident(this.ctx, operationShiftId, input);
  }

  public resolveIncident(incidentId: string, notes = ''): OperationShiftIncident {
    return activity.resolveIncident(this.ctx, incidentId, notes);
  }

  public recordProduction(operationShiftId: string, input: {
    productionOrderId?: string | null;
    productId?: string | null;
    workCenterId?: string | null;
    targetQty?: number;
    producedQty?: number;
    goodQty?: number;
    scrapQty?: number;
    downtimeMinutes?: number;
    downtimeReason?: string | null;
    notes?: string | null;
  }): OperationShiftProductionRow {
    return activity.recordProduction(this.ctx, operationShiftId, input);
  }

  public getProduction(operationShiftId: string): OperationShiftProductionRow[] {
    return activity.getProduction(this.ctx, operationShiftId);
  }

  public getPeriods(filters: {
    employeeId?: string;
    date?: string;
    from?: string;
    to?: string;
    operationShiftId?: string;
  } = {}): EmployeeAttendancePeriod[] {
    return queries.getPeriods(this.ctx, filters);
  }

  public getShiftReport(from: string, to: string, branchId?: string): OperationShiftReportRow[] {
    return activity.getShiftReport(this.ctx, from, to, branchId);
  }

  /** Cashier page helper: link a cash drawer shift to the branch's current operations shift. */
  public getLinkableOpenShift(branchId: string): OperationShiftInstance | null {
    return queries.getOpenShiftForBranch(this.ctx, branchId);
  }

  public getShiftAttendanceForPayroll(options: {
    from: string; to: string; branchId?: string;
  }): ShiftPayrollRow[] {
    return activity.getShiftAttendanceForPayroll(this.ctx, options);
  }

  public getEmployeeShiftSummary(employeeId: string, options: {
    from: string; to: string; branchId?: string;
  }): {
    employeeId: string; employeeName: string; branchId: string;
    totalShifts: number; presentShifts: number; lateShifts: number; absentShifts: number;
    totalWorkedMinutes: number; totalLateMinutes: number; totalOvertimeMinutes: number;
    approvedOvertimeMinutes: number;
  } {
    return activity.getEmployeeShiftSummary(this.ctx, employeeId, options);
  }
}
