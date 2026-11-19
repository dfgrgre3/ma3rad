import type { LeaveType } from '../../../../types/hr/leave';
import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import type { EmployeeDepartmentAccessService } from '../../auth/EmployeeDepartmentAccessService';

export interface LeaveBalanceSummary {
  year: number;
  grantedDays: number;
  approvedDays: number;
  pendingDays: number;
  availableDays: number;
}

export interface LeaveBalanceTransaction {
  id: string;
  employeeId: string;
  employeeName: string;
  year: number;
  daysDelta: number;
  transactionType: 'ALLOCATION' | 'CARRYOVER' | 'ADJUSTMENT';
  effectiveDate: string;
  reason: string;
  createdByName: string;
  createdAt: string;
}

export interface LeaveTypePolicy {
  leaveType: LeaveType;
  maxDaysPerYear: number | null;
}

export interface AnnualLeaveAccrualPolicy {
  id: string;
  branchId: string;
  employeeId: string | null;
  effectiveFrom: string;
  annualEntitlementDays: number | null;
  carryoverLimitDays: number | null;
  prorateOnService: boolean | null;
}

export interface AnnualLeaveAccrualPolicyState {
  branchPolicy: AnnualLeaveAccrualPolicy | null;
  employeePolicy: AnnualLeaveAccrualPolicy | null;
  effectivePolicy: AnnualLeaveAccrualPolicy | null;
}

export interface LeaveCalendarEntry {
  date: string;
  employeeId: string;
  employeeName: string;
  leaveType: LeaveType | null;
  status: 'PENDING' | 'APPROVED' | 'ABSENT';
}

export interface AnnualLeavePolicyRow {
  id: string;
  branchId: string;
  employeeId: string | null;
  effectiveFrom: string;
  annualEntitlementDays: number | null;
  carryoverLimitDays: number | null;
  prorateOnService: number | null;
}

export interface AttendanceSnapshot {
  id: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  breakMinutes: number;
  overtimeApproved: number;
  overtimeApprovedBy: string | null;
  overtimeApprovedAt: string | null;
  source: string;
  notes: string | null;
  recordedBy: string | null;
}

export interface LeaveScheduleRow {
  effectiveFrom: string;
  effectiveTo: string | null;
  workdaysJson: string;
}

export interface LeaveServiceDeps {
  db: DatabaseManager;
  branchAccess: BranchAccessService;
  departmentAccess: EmployeeDepartmentAccessService;
}
