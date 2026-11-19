import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { BranchAccessService } from '../auth/BranchAccessService';
import { EmployeeDepartmentAccessService } from '../auth/EmployeeDepartmentAccessService';
import type { AttendanceStatus } from './EmployeeService';
import type {
  AttendanceAuditEntry,
  AttendanceBreakEntry,
  AttendanceCorrection,
  AttendanceCorrectionHistory,
  AttendanceDeps,
  AttendanceEmployee,
  AttendanceEntry,
  AttendancePeriod,
  AttendanceReportRow,
  AttendanceSaveResult,
  AttendanceShift,
} from './AttendanceService/types';
import {
  getAttendanceByDate,
  getAttendanceByDateAsync,
  getBreaks,
  getBreaksByDate,
  getBreaksByDateAsync,
  getEmployees,
  getEmployeesAsync,
  getMonthlyReport,
  getMonthlyReportAsync,
  getMonthlyReportForExport,
  getMonthlyReportForExportAsync,
} from './AttendanceService/reports';
import {
  importPunches,
  manageBreak,
  punch,
  saveManualRecord,
} from './AttendanceService/punches';
import {
  approveOvertime,
  decideCorrection,
  getAuditHistory,
  getAuditHistoryAsync,
  getCorrectionHistory,
  getCorrectionHistoryAsync,
  getCorrectionRequests,
  getCorrectionRequestsAsync,
} from './AttendanceService/corrections';
import {
  addHoliday,
  assignShift,
  getAssignments,
  getAssignmentsAsync,
  getHolidays,
  getHolidaysAsync,
  getShifts,
  getShiftsAsync,
  removeHoliday,
  saveShift,
} from './AttendanceService/shifts';
import {
  clockAttendancePeriod,
  getAttendancePeriods,
  getOpenAttendancePeriod,
} from './AttendanceService/periods';

export type {
  AttendanceAuditEntry,
  AttendanceBreakEntry,
  AttendanceCorrection,
  AttendanceCorrectionHistory,
  AttendanceEmployee,
  AttendanceEntry,
  AttendancePeriod,
  AttendanceReportRow,
  AttendanceSaveResult,
  AttendanceShift,
} from './AttendanceService/types';

export class AttendanceService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();
  private static departmentAccess = new EmployeeDepartmentAccessService();

  private static get deps(): AttendanceDeps {
    return {
      db: this.db,
      branchAccess: this.branchAccess,
      departmentAccess: this.departmentAccess,
    };
  }

  static getEmployees(): AttendanceEmployee[] {
    return getEmployees(this.deps);
  }

  static async getEmployeesAsync(): Promise<AttendanceEmployee[]> {
    return getEmployeesAsync(this.deps);
  }

  static getAttendanceByDate(date: string): AttendanceEntry[] {
    return getAttendanceByDate(this.deps, date);
  }

  static async getAttendanceByDateAsync(date: string): Promise<AttendanceEntry[]> {
    return getAttendanceByDateAsync(this.deps, date);
  }

  static getMonthlyReport(period: string): AttendanceReportRow[] {
    return getMonthlyReport(this.deps, period);
  }

  static async getMonthlyReportAsync(period: string): Promise<AttendanceReportRow[]> {
    return getMonthlyReportAsync(this.deps, period);
  }

  static getMonthlyReportForExport(period: string): AttendanceReportRow[] {
    return getMonthlyReportForExport(this.deps, period);
  }

  static async getMonthlyReportForExportAsync(period: string): Promise<AttendanceReportRow[]> {
    return getMonthlyReportForExportAsync(this.deps, period);
  }

  static punchIn(employeeId: string): AttendanceEntry {
    return punch(this.deps, employeeId, 'IN');
  }

  static punchOut(employeeId: string): AttendanceEntry {
    return punch(this.deps, employeeId, 'OUT');
  }

  static startBreak(employeeId: string): void {
    manageBreak(this.deps, employeeId, 'START');
  }

  static endBreak(employeeId: string): void {
    manageBreak(this.deps, employeeId, 'END');
  }

  static getBreaks(attendanceId: string): Array<{ id: string; startedAt: string; endedAt: string | null; minutes: number }> {
    return getBreaks(this.deps, attendanceId);
  }

  static getBreaksByDate(date: string): AttendanceBreakEntry[] {
    return getBreaksByDate(this.deps, date);
  }

  static async getBreaksByDateAsync(date: string): Promise<AttendanceBreakEntry[]> {
    return getBreaksByDateAsync(this.deps, date);
  }

  static saveManualRecord(data: {
    employeeId: string;
    date: string;
    status: AttendanceStatus;
    lateMinutes?: number;
    overtimeMinutes?: number;
    notes?: string;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    source?: 'MANUAL' | 'IMPORT';
  }): AttendanceSaveResult {
    return saveManualRecord(this.deps, data);
  }

  static getCorrectionRequests(): AttendanceCorrection[] {
    return getCorrectionRequests(this.deps);
  }

  static async getCorrectionRequestsAsync(): Promise<AttendanceCorrection[]> {
    return getCorrectionRequestsAsync(this.deps);
  }

  static getCorrectionHistory(period: string): AttendanceCorrectionHistory[] {
    return getCorrectionHistory(this.deps, period);
  }

  static async getCorrectionHistoryAsync(period: string): Promise<AttendanceCorrectionHistory[]> {
    return getCorrectionHistoryAsync(this.deps, period);
  }

  static getAuditHistory(period: string): AttendanceAuditEntry[] {
    return getAuditHistory(this.deps, period);
  }

  static async getAuditHistoryAsync(period: string): Promise<AttendanceAuditEntry[]> {
    return getAuditHistoryAsync(this.deps, period);
  }

  static decideCorrection(id: string, approve: boolean, notes = ''): void {
    decideCorrection(this.deps, id, approve, notes);
  }

  static approveOvertime(attendanceId: string): void {
    approveOvertime(this.deps, attendanceId);
  }

  static getShifts(): AttendanceShift[] {
    return getShifts(this.deps);
  }

  static async getShiftsAsync(): Promise<AttendanceShift[]> {
    return getShiftsAsync(this.deps);
  }

  static saveShift(data: Omit<AttendanceShift, 'id' | 'branchId' | 'isActive'> & { id?: string }): AttendanceShift {
    return saveShift(this.deps, data);
  }

  static assignShift(employeeId: string, shiftId: string, from: string, to?: string): void {
    assignShift(this.deps, employeeId, shiftId, from, to);
  }

  static getAssignments(): Array<{
    id: string; employeeId: string; employeeName: string; shiftId: string;
    shiftName: string; effectiveFrom: string; effectiveTo: string | null;
  }> {
    return getAssignments(this.deps);
  }

  static async getAssignmentsAsync(): Promise<Array<{
    id: string; employeeId: string; employeeName: string; shiftId: string;
    shiftName: string; effectiveFrom: string; effectiveTo: string | null;
  }>> {
    return getAssignmentsAsync(this.deps);
  }

  static addHoliday(date: string, name: string): void {
    addHoliday(this.deps, date, name);
  }

  static removeHoliday(id: string): void {
    removeHoliday(this.deps, id);
  }

  static getHolidays(period: string): Array<{ id: string; date: string; name: string }> {
    return getHolidays(this.deps, period);
  }

  static async getHolidaysAsync(period: string): Promise<Array<{ id: string; date: string; name: string }>> {
    return getHolidaysAsync(this.deps, period);
  }

  static importPunches(rows: Array<{
    employeeCode: string;
    date: string;
    checkIn: string;
    checkOut: string;
  }>): { imported: number; pendingApproval: number; errors: string[] } {
    return importPunches(this.deps, rows);
  }

  static getAttendancePeriods(filters: {
    employeeId?: string;
    date?: string;
    from?: string;
    to?: string;
    operationShiftId?: string;
  } = {}): AttendancePeriod[] {
    return getAttendancePeriods(this.deps, filters);
  }

  static getOpenAttendancePeriod(employeeId: string): AttendancePeriod | null {
    return getOpenAttendancePeriod(this.deps, employeeId);
  }

  /**
   * Standalone clock-in/out that is independent from the daily attendance
   * summary. Safe to call several times a day; one employee may only have one
   * open period at a time.
   */
  static clockAttendancePeriod(
    employeeId: string,
    direction: 'IN' | 'OUT',
    options: {
      operationShiftId?: string | null;
      at?: string;
      lateMinutes?: number;
      overtimeMinutes?: number;
      notes?: string;
      source?: string;
    } = {}
  ): AttendancePeriod {
    return clockAttendancePeriod(this.deps, employeeId, direction, options);
  }
}
