import type { AttendanceStatus } from '../EmployeeService';
import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import type { EmployeeDepartmentAccessService } from '../../auth/EmployeeDepartmentAccessService';

export interface AttendanceEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  branchId: string;
  date: string;
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  breakMinutes: number;
  overtimeApproved: boolean;
  notes: string;
  source: string;
  recordedBy: string;
  activeBreak?: boolean;
}

export interface AttendanceShift {
  id: string;
  branchId: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
  overtimeAfterMinutes: number;
  workdays: number[];
  isActive: boolean;
}

export interface AttendanceCorrection {
  id: string;
  employeeId: string;
  employeeName: string;
  attendanceDate: string;
  beforeJson: string | null;
  proposedJson: string;
  requestedByName: string;
  requestedAt: string;
}

export interface AttendanceCorrectionHistory extends AttendanceCorrection {
  status: 'APPROVED' | 'REJECTED';
  beforeJson: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
}

export interface AttendanceBreakEntry {
  id: string;
  attendanceId: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
}

export interface AttendanceAuditEntry {
  id: string;
  employeeName: string;
  date: string;
  action: string;
  beforeJson: string | null;
  afterJson: string | null;
  actorName: string;
  createdAt: string;
}

export interface AttendanceReportRow extends AttendanceEntry {
  shiftName: string | null;
}

export interface AttendanceSaveResult {
  pendingApproval: boolean;
  attendanceId: string | null;
}

export interface AttendanceEmployee {
  id: string;
  branchId: string;
  name: string;
  role: string;
  phone: string;
  status: string;
}

/**
 * An append-only attendance period. Unlike the daily `attendance` summary, an
 * employee can have several periods on the same day (double shift, replacement,
 * overtime after a break, ...).
 */
export interface AttendancePeriod {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  branchId: string;
  operationShiftId: string | null;
  shiftNumber: string | null;
  attendanceDate: string;
  checkInAt: string;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  status: 'OPEN' | 'CLOSED';
  source: string;
  notes: string | null;
}

export interface AttendanceSnapshot {
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  overtimeMinutes: number;
  notes: string;
  source: string;
}

export interface ShiftRow extends Omit<AttendanceShift, 'workdays' | 'isActive'> {
  workdaysJson: string;
  isActive: number;
}

export interface AttendanceDeps {
  db: DatabaseManager;
  branchAccess: BranchAccessService;
  departmentAccess: EmployeeDepartmentAccessService;
}
