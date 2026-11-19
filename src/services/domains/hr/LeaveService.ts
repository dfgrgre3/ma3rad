import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { EmployeeDepartmentAccessService } from '../auth/EmployeeDepartmentAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import type { User } from '../../../types/auth/identity';
import type {
  CreateLeaveRequestDTO,
  EmployeeLeaveRequest,
  LeaveFilters,
  LeaveSummary,
  LeaveType,
} from '../../../types/hr/leave';
import type {
  AnnualLeaveAccrualPolicyState,
  LeaveBalanceSummary,
  LeaveBalanceTransaction,
  LeaveCalendarEntry,
  LeaveServiceDeps,
  LeaveTypePolicy,
} from './LeaveService/types';
import {
  getAnnualAccrualPolicyState,
  getTypePolicies,
  getTypePoliciesAsync,
  saveAnnualAccrualPolicy,
  saveTypePolicy,
} from './LeaveService/policies';
import {
  adjustAnnualBalance,
  getAnnualBalanceAsOf,
  getBalanceSummary,
  getBalanceTransactions,
} from './LeaveService/balance';
import {
  getCalendar,
  getCalendarAsync,
  getRequests,
  getRequestsAsync,
  getSummary,
  getSummaryAsync,
} from './LeaveService/reports';
import {
  cancel,
  decide,
  requestLeave,
  requireRequestExists,
} from './LeaveService/requests';

export type {
  AnnualLeaveAccrualPolicy,
  AnnualLeaveAccrualPolicyState,
  LeaveBalanceSummary,
  LeaveBalanceTransaction,
  LeaveCalendarEntry,
  LeaveTypePolicy,
} from './LeaveService/types';

export class LeaveService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private departmentAccess = new EmployeeDepartmentAccessService();

  private get deps(): LeaveServiceDeps {
    return {
      db: this.db,
      branchAccess: this.branchAccess,
      departmentAccess: this.departmentAccess,
    };
  }

  private require(permission: string): User {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, permission);
    return actor;
  }

  private guardWrites(): void {
    ModuleRegistryService.assertModuleEnabled('hr');
  }

  public getBalanceSummary(employeeId: string, year: number, asOfDate?: string): LeaveBalanceSummary {
    const actor = AuthService.requireAuth();
    if (!PermissionService.can(actor, 'hr.leave.view') && !PermissionService.can(actor, 'hr.leave.request')) {
      throw new Error('ليس لديك صلاحية عرض رصيد الإجازات.');
    }
    return getBalanceSummary(this.deps, actor, employeeId, year, asOfDate);
  }

  public getAnnualBalanceAsOf(employeeId: string, asOfDate: string): number {
    const actor = AuthService.requireAuth();
    if (!PermissionService.canAny(actor, ['hr.leave.view', 'hr.contracts.terminate'])) {
      throw new Error('ليس لديك صلاحية عرض رصيد الإجازات.');
    }
    return getAnnualBalanceAsOf(this.deps, actor, employeeId, asOfDate);
  }

  public getBalanceTransactions(employeeId: string, year: number): LeaveBalanceTransaction[] {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, ['hr.leave.view', 'hr.leave.approve']);
    return getBalanceTransactions(this.deps, actor, employeeId, year);
  }

  public adjustAnnualBalance(input: {
    employeeId: string;
    year: number;
    daysDelta: number;
    transactionType: 'ALLOCATION' | 'CARRYOVER' | 'ADJUSTMENT';
    effectiveDate: string;
    reason: string;
  }): LeaveBalanceTransaction {
    this.guardWrites();
    const actor = this.require('hr.leave.approve');
    return adjustAnnualBalance(this.deps, actor, input);
  }

  public getAnnualAccrualPolicyState(
    employeeId?: string,
    asOfDate = new Date().toISOString().slice(0, 10)
  ): AnnualLeaveAccrualPolicyState {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, ['hr.leave.view', 'hr.leave.approve']);
    return getAnnualAccrualPolicyState(this.deps, actor, employeeId, asOfDate);
  }

  public saveAnnualAccrualPolicy(input: {
    employeeId?: string;
    effectiveFrom: string;
    annualEntitlementDays?: number;
    carryoverLimitDays?: number;
    prorateOnService?: boolean;
    inheritBranchPolicy?: boolean;
  }): void {
    this.guardWrites();
    const actor = this.require('hr.leave.approve');
    saveAnnualAccrualPolicy(this.deps, actor, input);
  }

  public getTypePolicies(): LeaveTypePolicy[] {
    const actor = this.require('hr.leave.view');
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    return getTypePolicies(this.db, branchId);
  }

  public saveTypePolicy(leaveType: LeaveType, maxDaysPerYear: number | null): void {
    this.guardWrites();
    const actor = this.require('hr.leave.approve');
    saveTypePolicy(this.deps, actor, leaveType, maxDaysPerYear);
  }

  public getCalendar(period: string): LeaveCalendarEntry[] {
    const actor = this.require('hr.leave.view');
    return getCalendar(this.deps, actor, period);
  }

  public getRequests(filters: LeaveFilters = {}): EmployeeLeaveRequest[] {
    const actor = this.require('hr.leave.view');
    return getRequests(this.deps, actor, filters);
  }

  public async getRequestsAsync(filters: LeaveFilters = {}): Promise<EmployeeLeaveRequest[]> {
    const actor = this.require('hr.leave.view');
    return getRequestsAsync(this.deps, actor, filters);
  }

  public getRequest(id: string): EmployeeLeaveRequest {
    const actor = this.require('hr.leave.view');
    return requireRequestExists(this.deps, actor, id);
  }

  public requestLeave(input: CreateLeaveRequestDTO): EmployeeLeaveRequest {
    this.guardWrites();
    const actor = this.require('hr.leave.request');
    return requestLeave(this.deps, actor, input);
  }

  public decide(id: string, decision: 'APPROVED' | 'REJECTED', note?: string): EmployeeLeaveRequest {
    this.guardWrites();
    const actor = this.require('hr.leave.approve');
    return decide(this.deps, actor, id, decision, note);
  }

  public cancel(id: string, note?: string): EmployeeLeaveRequest {
    this.guardWrites();
    const actor = AuthService.requireAuth();
    return cancel(this.deps, actor, id, note);
  }

  public getSummary(year?: number): LeaveSummary {
    const actor = this.require('hr.leave.view');
    return getSummary(this.deps, actor, year);
  }

  public async getTypePoliciesAsync(): Promise<LeaveTypePolicy[]> {
    const actor = this.require('hr.leave.view');
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    return getTypePoliciesAsync(this.db, branchId);
  }

  public async getCalendarAsync(period: string): Promise<LeaveCalendarEntry[]> {
    const actor = this.require('hr.leave.view');
    return getCalendarAsync(this.deps, actor, period);
  }

  public async getSummaryAsync(year?: number): Promise<LeaveSummary> {
    const actor = this.require('hr.leave.view');
    return getSummaryAsync(this.deps, actor, year);
  }
}
