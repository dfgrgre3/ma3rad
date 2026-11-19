import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import type { User } from '../../../../types';
import type {
  EmployeeAttendancePeriod,
  OperationCashSummary,
  OperationShiftInstance,
  OperationShiftProductionRow,
  OperationStaffRole,
} from './types';

/**
 * Internal context shared by the OperationsShiftService modules.
 * The class in ../OperationsShiftService.ts builds this object once; every
 * entry is a closure over the service instance so `this` semantics are
 * preserved exactly.
 */
export interface ShiftServiceContext {
  db: DatabaseManager;
  branchAccess: BranchAccessService;
  requireView(): User;
  requireManage(): User;
  audit(action: string, recordId: string, values?: unknown): void;

  // Cross-module internals (implemented by sibling modules).
  definitionRows(branchId?: string): any[];
  currentAssignments(definitionId: string, businessDate: string): Array<{ employeeId: string; role: OperationStaffRole }>;
  ensureShiftInstances(from: string, to: string, branchId?: string): number;
  getShiftBoard(options: { from?: string; to?: string; branchId?: string }): OperationShiftInstance[];
  assertEmployeeAvailable(
    employeeId: string,
    shift: Pick<OperationShiftInstance, 'id' | 'branchId' | 'scheduledStart' | 'scheduledEnd' | 'businessDate'>,
    excludedShiftIds?: string[]
  ): void;
  getInstance(id: string): OperationShiftInstance;
  getCashSummary(operationShiftId: string): OperationCashSummary;
  getShiftDetail(id: string): import('./types').OperationShiftDetail;
  getProduction(operationShiftId: string): OperationShiftProductionRow[];
  getPeriods(filters: {
    employeeId?: string;
    date?: string;
    from?: string;
    to?: string;
    operationShiftId?: string;
  }): EmployeeAttendancePeriod[];
}
