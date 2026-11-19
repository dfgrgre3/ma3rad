import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import type { EmployeeDepartmentAccessService } from '../../auth/EmployeeDepartmentAccessService';

export interface EmployeeDepartment {
  id: string;
  name: string;
  branchId: string | null;
  description: string | null;
  isActive: boolean;
}

export interface EmployeeJobTitle {
  id: string;
  departmentId: string | null;
  title: string;
  isActive: boolean;
}

export interface EmployeeJobGrade {
  id: string;
  branchId: string | null;
  name: string;
  level: number;
  minSalary: number;
  maxSalary: number;
  description: string | null;
  isActive: boolean;
}

export interface EmployeeCostCenter {
  id: string;
  branchId: string | null;
  code: string;
  name: string;
  isActive: boolean;
}

export interface EmployeeTransfer {
  id: string;
  employeeId: string;
  fromBranchId: string | null;
  toBranchId: string | null;
  fromDepartmentId: string | null;
  toDepartmentId: string | null;
  fromJobTitle: string | null;
  toJobTitle: string | null;
  transferDate: string;
  reason: string | null;
  status: string;
  approvedBy: string | null;
  createdAt: string;
}

export interface EmployeeLifecycleEvent {
  id: string;
  employeeId: string;
  eventType: string;
  eventDate: string;
  fromValue: string | null;
  toValue: string | null;
  notes: string | null;
  actorId: string | null;
  createdAt: string;
}

export interface EmployeeOnboardingTask {
  id: string;
  employeeId: string;
  taskName: string;
  category: string;
  dueDate: string | null;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  completedAt: string | null;
  completedBy: string | null;
  notes: string | null;
  createdAt: string;
}

export interface EmployeeCustodyItem {
  id: string;
  employeeId: string;
  itemName: string;
  itemType: string;
  serialNumber: string | null;
  assignedAt: string;
  returnedAt: string | null;
  status: 'ASSIGNED' | 'RETURNED' | 'LOST';
  notes: string | null;
  createdAt: string;
}

export interface EmployeeProbationReview {
  id: string;
  employeeId: string;
  reviewDate: string;
  reviewerId: string | null;
  score: number;
  rating: string;
  recommendation: string;
  notes: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
  createdAt: string;
}

export interface DepartmentNode {
  id: string;
  name: string;
  parentId: string | null;
  managerEmployeeId: string | null;
  managerName: string | null;
  requiredHeadcount: number;
  actualHeadcount: number;
  children: DepartmentNode[];
}

export type EmployeeDepartmentRow = Omit<EmployeeDepartment, 'isActive'> & { isActive: number };
export type EmployeeJobTitleRow = Omit<EmployeeJobTitle, 'isActive'> & { isActive: number };

export interface OrgServiceDeps {
  db: DatabaseManager;
  branchAccess: BranchAccessService;
  departmentAccess: EmployeeDepartmentAccessService;
}
