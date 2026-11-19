export type OperationsWorkMode = 'NORMAL' | 'TWO_SHIFTS' | 'THREE_SHIFTS' | 'CONTINUOUS';
export type OperationShiftStatus = 'PLANNED' | 'OPEN' | 'HANDOVER_PENDING' | 'CLOSED' | 'MISSED' | 'CANCELLED';
export type OperationStaffRole = 'SUPERVISOR' | 'STAFF';
export type OperationStaffStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE';

export interface OperationShiftDefinition {
  id: string;
  branchId: string;
  name: string;
  department: string | null;
  location: string | null;
  shiftCode: string | null;
  color: string | null;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  breakMinutes: number;
  graceMinutes: number;
  overtimeAfterMinutes: number;
  minimumStaffCount: number;
  requiredRestMinutes: number;
  workdays: number[];
  shiftOrder: number;
  isActive: boolean;
  assignedCount: number;
}

export interface OperationShiftInstance {
  id: string;
  shiftNumber: string;
  definitionId: string;
  definitionName: string;
  department: string | null;
  location: string | null;
  branchId: string;
  businessDate: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: OperationShiftStatus;
  supervisorId: string | null;
  supervisorName: string | null;
  openedBy: string | null;
  openedByName: string | null;
  openedAt: string | null;
  closedAt: string | null;
  staffCount: number;
  presentCount: number;
  minimumStaffCount: number;
  shortageCount: number;
  handoverStatus: string | null;
  expectedCash: number;
  actualCash: number;
  cashDifference: number;
  producedQty: number;
  scrapQty: number;
  openIncidents: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperationShiftStaff {
  id: string;
  operationShiftId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  role: OperationStaffRole;
  status: OperationStaffStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  overtimeMinutes: number;
  notes: string | null;
}

export interface OperationShiftHandover {
  id: string;
  operationShiftId: string;
  expectedCash: number;
  actualCash: number;
  cashDifference: number;
  cashDelivered: number;
  pendingOrders: string[];
  inventoryStatus: string;
  equipmentStatus: string;
  notes: string;
  nextStaffIds: string[];
  status: 'PENDING' | 'RECEIVED' | 'REJECTED';
  submittedBy: string;
  submittedByName?: string;
  submittedAt: string;
  receivedBy: string | null;
  receivedByName?: string | null;
  receivedAt: string | null;
  receivedNotes: string | null;
}

export interface OperationShiftIncident {
  id: string;
  operationShiftId: string;
  type: 'BREAKDOWN' | 'NOTE' | 'SAFETY' | 'QUALITY' | 'OTHER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string | null;
  startedAt: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  reportedBy: string;
  reportedByName?: string;
}

export interface OperationShiftProductionRow {
  id: string;
  operationShiftId: string;
  productionOrderId: string | null;
  orderNumber: string | null;
  productId: string | null;
  productName: string | null;
  workCenterId: string | null;
  workCenterName: string | null;
  targetQty: number;
  producedQty: number;
  goodQty: number;
  scrapQty: number;
  downtimeMinutes: number;
  downtimeReason: string | null;
  notes: string | null;
  createdAt: string;
}

export interface OperationShiftDetail {
  shift: OperationShiftInstance;
  staff: OperationShiftStaff[];
  handover: OperationShiftHandover | null;
  incidents: OperationShiftIncident[];
  production: OperationShiftProductionRow[];
  cashShifts: Array<Record<string, unknown>>;
  cashSummary: OperationCashSummary;
  attendancePeriods: EmployeeAttendancePeriod[];
  openProductionOrders: Array<Record<string, unknown>>;
}

export interface OperationCashSummary {
  expected: number;
  actual: number;
  difference: number;
  delivered: number;
  openShifts: number;
  closedShifts: number;
}

export interface EmployeeAttendancePeriod {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  operationShiftId: string | null;
  shiftNumber?: string | null;
  attendanceDate: string;
  checkInAt: string;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  overtimeApproved?: boolean;
  overtimeApprovedBy?: string | null;
  overtimeApprovedAt?: string | null;
  status: 'OPEN' | 'CLOSED';
  source: string;
  notes: string | null;
}

export interface OperationShiftReportRow {
  shiftId: string;
  shiftNumber: string;
  definitionName: string;
  department: string | null;
  businessDate: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: OperationShiftStatus;
  supervisorName: string | null;
  staffCount: number;
  expectedCash: number;
  actualCash: number;
  cashDifference: number;
  cashDelivered: number;
  producedQty: number;
  goodQty: number;
  scrapQty: number;
  downtimeMinutes: number;
  incidents: number;
  workedMinutes: number;
  approvedOvertimeMinutes: number;
  laborCost: number;
  productivityPerLaborHour: number;
  costPerGoodUnit: number;
}

export interface OperationEmployee {
  id: string;
  branchId: string;
  code: string;
  name: string;
  role: string;
  status: string;
}

export type ShiftPayrollRow = {
  employeeId: string; employeeName: string; employeeCode: string; branchId: string;
  date: string; shiftId: string; shiftNumber: string; shiftName: string;
  scheduledStart: string; scheduledEnd: string;
  checkInAt: string | null; checkOutAt: string | null;
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE';
  lateMinutes: number; overtimeMinutes: number; workedMinutes: number;
  isApprovedOvertime: boolean;
};

export interface OperationShiftAssignmentRow {
  id: string;
  definitionId: string;
  definitionName: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  role: OperationStaffRole;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface OperationShiftSwapRequest {
  id: string;
  requesterEmployeeId: string;
  requesterEmployeeName: string;
  targetEmployeeId: string;
  targetEmployeeName: string;
  requesterShiftId: string;
  requesterShiftName: string;
  requesterShiftDate: string;
  targetShiftId: string;
  targetShiftName: string;
  targetShiftDate: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedByName: string;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
}
