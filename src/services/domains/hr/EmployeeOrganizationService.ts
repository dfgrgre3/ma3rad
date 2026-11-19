import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { BranchAccessService } from '../auth/BranchAccessService';
import { EmployeeDepartmentAccessService } from '../auth/EmployeeDepartmentAccessService';
import type {
  DepartmentNode,
  EmployeeCostCenter,
  EmployeeCustodyItem,
  EmployeeDepartment,
  EmployeeJobGrade,
  EmployeeJobTitle,
  EmployeeLifecycleEvent,
  EmployeeOnboardingTask,
  EmployeeProbationReview,
  EmployeeTransfer,
  OrgServiceDeps,
} from './EmployeeOrganizationService/types';
import { requireManage, requireView } from './EmployeeOrganizationService/context';
import {
  createDepartment,
  deactivateDepartment,
  getDepartments,
  getOrgTree,
  getVacancies,
  updateDepartment,
  updateDepartmentStructure,
} from './EmployeeOrganizationService/departments';
import {
  createCostCenter,
  createJobGrade,
  createJobTitle,
  deactivateCostCenter,
  deactivateJobGrade,
  deactivateJobTitle,
  getCostCenters,
  getJobGrades,
  getJobTitles,
  updateJobTitle,
} from './EmployeeOrganizationService/catalog';
import {
  addLifecycleEvent,
  getLifecycleEvents,
  getTransfers,
  transferEmployee,
} from './EmployeeOrganizationService/people';
import {
  assignCustodyItem,
  cancelOnboardingTask,
  completeOnboardingTask,
  createOnboardingChecklist,
  getCustodyItems,
  getOnboardingReport,
  getOnboardingTasks,
  returnCustodyItem,
} from './EmployeeOrganizationService/onboarding';
import {
  createProbationReview,
  getProbationReport,
  getProbationReviews,
  runProbationCycle,
  submitProbationReview,
} from './EmployeeOrganizationService/reviews';
import {
  finalizeOffboarding,
  notifyHrAlerts,
  promoteEmployee,
  requestOffboardingApproval,
} from './EmployeeOrganizationService/lifecycle';

export type {
  DepartmentNode,
  EmployeeCostCenter,
  EmployeeCustodyItem,
  EmployeeDepartment,
  EmployeeJobGrade,
  EmployeeJobTitle,
  EmployeeLifecycleEvent,
  EmployeeOnboardingTask,
  EmployeeProbationReview,
  EmployeeTransfer,
} from './EmployeeOrganizationService/types';

export class EmployeeOrganizationService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private departmentAccess = new EmployeeDepartmentAccessService();

  private get deps(): OrgServiceDeps {
    return {
      db: this.db,
      branchAccess: this.branchAccess,
      departmentAccess: this.departmentAccess,
    };
  }

  public getDepartments(branchId = this.branchAccess.getCurrentBranchId()): EmployeeDepartment[] {
    const actor = requireView();
    return getDepartments(this.deps, actor, branchId);
  }

  public createDepartment(input: { name: string; branchId?: string; description?: string }): EmployeeDepartment {
    const actor = requireManage();
    return createDepartment(this.deps, actor, input);
  }

  public updateDepartment(id: string, patch: { name: string; description?: string }): EmployeeDepartment {
    const actor = requireManage();
    return updateDepartment(this.deps, actor, id, patch);
  }

  public deactivateDepartment(id: string): void {
    const actor = requireManage();
    deactivateDepartment(this.deps, actor, id);
  }

  public getJobTitles(departmentId?: string): EmployeeJobTitle[] {
    const actor = requireView();
    return getJobTitles(this.deps, actor, departmentId);
  }

  public createJobTitle(input: { title: string; departmentId?: string | null }): EmployeeJobTitle {
    const actor = requireManage();
    return createJobTitle(this.deps, actor, input);
  }

  public updateJobTitle(id: string, titleValue: string): EmployeeJobTitle {
    const actor = requireManage();
    return updateJobTitle(this.deps, actor, id, titleValue);
  }

  public deactivateJobTitle(id: string): void {
    const actor = requireManage();
    deactivateJobTitle(this.deps, actor, id);
  }

  public updateDepartmentStructure(id: string, patch: {
    parentId?: string | null;
    managerEmployeeId?: string | null;
    requiredHeadcount?: number;
    costCenterId?: string | null;
  }): void {
    const actor = requireManage();
    updateDepartmentStructure(this.deps, actor, id, patch);
  }

  public getOrgTree(branchId = this.branchAccess.getCurrentBranchId()): DepartmentNode[] {
    const actor = requireView();
    return getOrgTree(this.deps, actor, branchId);
  }

  public getVacancies(branchId = this.branchAccess.getCurrentBranchId()): Array<{
    departmentId: string; departmentName: string; required: number; actual: number; vacant: number;
  }> {
    const actor = requireView();
    return getVacancies(this.deps, actor, branchId);
  }

  public getJobGrades(branchId = this.branchAccess.getCurrentBranchId()): EmployeeJobGrade[] {
    const actor = requireView();
    return getJobGrades(this.deps, actor, branchId);
  }

  public createJobGrade(input: {
    name: string; branchId?: string; level?: number; minSalary?: number; maxSalary?: number; description?: string;
  }): EmployeeJobGrade {
    const actor = requireManage();
    return createJobGrade(this.deps, actor, input);
  }

  public deactivateJobGrade(id: string): void {
    const actor = requireManage();
    deactivateJobGrade(this.deps, actor, id);
  }

  public getCostCenters(branchId = this.branchAccess.getCurrentBranchId()): EmployeeCostCenter[] {
    const actor = requireView();
    return getCostCenters(this.deps, actor, branchId);
  }

  public createCostCenter(input: { code: string; name: string; branchId?: string }): EmployeeCostCenter {
    const actor = requireManage();
    return createCostCenter(this.deps, actor, input);
  }

  public deactivateCostCenter(id: string): void {
    const actor = requireManage();
    deactivateCostCenter(this.deps, actor, id);
  }

  public transferEmployee(input: {
    employeeId: string;
    toBranchId?: string | null;
    toDepartmentId?: string | null;
    toJobTitle?: string | null;
    toGradeId?: string | null;
    transferDate: string;
    reason?: string;
  }): EmployeeTransfer {
    const actor = requireManage();
    return transferEmployee(this.deps, actor, input);
  }

  public getTransfers(employeeId?: string): EmployeeTransfer[] {
    requireView();
    return getTransfers(this.deps, employeeId);
  }

  public addLifecycleEvent(input: {
    employeeId: string; eventType: string; eventDate: string;
    fromValue?: string | null; toValue?: string | null; notes?: string;
  }): EmployeeLifecycleEvent {
    const actor = requireManage();
    return addLifecycleEvent(this.deps, actor, input);
  }

  public getLifecycleEvents(employeeId: string): EmployeeLifecycleEvent[] {
    requireView();
    return getLifecycleEvents(this.deps, employeeId);
  }

  public createOnboardingChecklist(employeeId: string, tasks?: string[]): EmployeeOnboardingTask[] {
    const actor = requireManage();
    return createOnboardingChecklist(this.deps, actor, employeeId, tasks);
  }

  public getOnboardingTasks(employeeId: string): EmployeeOnboardingTask[] {
    requireView();
    return getOnboardingTasks(this.deps, employeeId);
  }

  public completeOnboardingTask(taskId: string, notes?: string): void {
    const actor = requireManage();
    completeOnboardingTask(this.deps, actor, taskId, notes);
  }

  public cancelOnboardingTask(taskId: string): void {
    const actor = requireManage();
    cancelOnboardingTask(this.deps, actor, taskId);
  }

  public assignCustodyItem(input: {
    employeeId: string; itemName: string; itemType?: string; serialNumber?: string; notes?: string;
  }): EmployeeCustodyItem {
    const actor = requireManage();
    return assignCustodyItem(this.deps, actor, input);
  }

  public returnCustodyItem(id: string, status: 'RETURNED' | 'LOST' = 'RETURNED', notes?: string): void {
    const actor = requireManage();
    returnCustodyItem(this.deps, actor, id, status, notes);
  }

  public getCustodyItems(employeeId: string): EmployeeCustodyItem[] {
    requireView();
    return getCustodyItems(this.deps, employeeId);
  }

  public createProbationReview(input: {
    employeeId: string; reviewDate: string; reviewerId?: string; score: number;
    rating?: string; recommendation?: string; notes?: string; status?: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
  }): EmployeeProbationReview {
    const actor = requireManage();
    return createProbationReview(this.deps, actor, input);
  }

  public getProbationReviews(employeeId: string): EmployeeProbationReview[] {
    requireView();
    return getProbationReviews(this.deps, employeeId);
  }

  public submitProbationReview(id: string): void {
    const actor = requireManage();
    submitProbationReview(this.deps, actor, id);
  }

  public requestOffboardingApproval(input: {
    employeeId: string; reason: string; branchId?: string;
  }): string {
    const actor = requireManage();
    return requestOffboardingApproval(this.deps, actor, input);
  }

  public finalizeOffboarding(employeeId: string, terminationDate: string, notes?: string): void {
    const actor = requireManage();
    finalizeOffboarding(this.deps, actor, employeeId, terminationDate, notes);
  }

  public runProbationCycle(today?: string): string[] {
    const actor = requireManage();
    return runProbationCycle(this.deps, actor, today);
  }

  public promoteEmployee(input: {
    employeeId: string;
    newRole?: string;
    newGradeId?: string | null;
    newBaseSalary?: number;
    effectiveDate: string;
    reason?: string;
    createBonus?: boolean;
    bonusAmount?: number;
  }): void {
    const actor = requireManage();
    promoteEmployee(this.deps, actor, input);
  }

  public notifyHrAlerts(): void {
    notifyHrAlerts(this.deps);
  }

  public getOnboardingReport(): Array<{ employeeId: string; total: number; completed: number; pending: number; overdue: number }> {
    requireView();
    return getOnboardingReport(this.deps);
  }

  public getProbationReport(): Array<{ employeeId: string; reviewDate: string; score: number; rating: string; recommendation: string; status: string }> {
    requireView();
    return getProbationReport(this.deps);
  }
}
