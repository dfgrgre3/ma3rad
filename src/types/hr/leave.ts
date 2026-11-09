export type LeaveType = 'ANNUAL' | 'SICK' | 'UNPAID' | 'OTHER';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface EmployeeLeaveRequest {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  branchId: string;
  branchName?: string | null;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  requestedBy: string;
  requesterName?: string | null;
  decidedBy: string | null;
  deciderName?: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeaveRequestDTO {
  employeeId: string;
  leaveType?: LeaveType;
  startDate: string;
  endDate: string;
  reason?: string | null;
}

export interface LeaveFilters {
  status?: LeaveStatus | 'ALL';
  employeeId?: string;
  type?: LeaveType | 'ALL';
  from?: string;
  to?: string;
}

export interface LeaveSummary {
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  approvedDays: number;
  daysByType: Record<LeaveType, number>;
}
