export const PROJECT_MONEY_FIELDS = ['contract_value', 'total_sold', 'total_paid', 'outstanding_amount'] as const;
export const PROJECT_PRODUCT_MONEY_FIELDS = ['agreed_price_m2'] as const;
export const PROJECT_BUDGET_MONEY_FIELDS = ['planned_amount', 'actual_amount'] as const;
export const CHANGE_REQUEST_MONEY_FIELDS = ['cost_impact'] as const;

export type ProjectStatus = 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type ProjectType = 'BUILDING' | 'VILLA' | 'APARTMENT' | 'COMPOUND' | 'COMMERCIAL' | 'OTHER';

export interface Project {
  id: string;
  code: string;
  name: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  branchId?: string | null;
  projectType: ProjectType;
  contractorName?: string | null;
  contractorPhone?: string | null;
  engineerName?: string | null;
  engineerPhone?: string | null;
  address?: string | null;
  city?: string | null;
  startDate?: string | null;
  expectedEndDate?: string | null;
  actualEndDate?: string | null;
  contractValue: number;
  totalSold: number;
  totalPaid: number;
  outstandingAmount: number;
  status: ProjectStatus;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  unitsCount?: number;
  deliveredUnits?: number;
  invoicedAmount?: number;
}

export interface ProjectUnit {
  id: string;
  projectId: string;
  parentId?: string | null;
  unitType: 'BUILDING' | 'FLOOR' | 'APARTMENT' | 'ROOM';
  name: string;
  areaM2: number;
  sortOrder: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'DELIVERED';
  notes?: string | null;
  createdAt: string;
}

export interface ProjectProduct {
  id: string;
  projectId: string;
  unitId?: string | null;
  unitName?: string;
  productId: string;
  productName: string;
  plannedQuantityM2: number;
  deliveredQuantityM2: number;
  agreedPriceM2: number;
  notes?: string | null;
  createdAt: string;
}

export type ProjectTaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
export type ProjectTaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ProjectRiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ProjectRiskProbability = 'LOW' | 'MEDIUM' | 'HIGH';
export type ProjectRiskStatus = 'OPEN' | 'MITIGATED' | 'ACCEPTED' | 'CLOSED';
export type ProjectChangeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type ProjectDeliverableStatus = 'PENDING' | 'IN_PROGRESS' | 'DELIVERED' | 'ACCEPTED' | 'REJECTED';

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  priority: ProjectTaskPriority;
  assigneeName: string | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  progress: number;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  dependencyIds?: string[];
}

export interface ProjectTaskDependency {
  id: string;
  projectId: string;
  taskId: string;
  dependsOnTaskId: string;
  createdAt: string;
}

export interface ProjectTimeEntry {
  id: string;
  projectId: string;
  taskId: string | null;
  taskTitle?: string | null;
  employeeName: string | null;
  entryDate: string;
  hours: number;
  description: string | null;
  billable: number;
  createdBy: string | null;
  createdAt: string;
}

export interface ProjectBudgetLine {
  id: string;
  projectId: string;
  category: string;
  description: string | null;
  plannedAmount: number;
  actualAmount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBudgetSummary {
  plannedTotal: number;
  actualTotal: number;
  variance: number;
  contractValue: number;
  remainingContract: number;
  byCategory: Array<{ category: string; plannedAmount: number; actualAmount: number }>;
}

export interface ProjectTimeSummary {
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  byTask: Array<{ taskId: string | null; taskTitle: string; hours: number }>;
}

export interface ProjectRisk {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  severity: ProjectRiskSeverity;
  probability: ProjectRiskProbability;
  status: ProjectRiskStatus;
  mitigation: string | null;
  ownerName: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectChangeRequest {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  costImpact: number;
  timeImpactDays: number;
  status: ProjectChangeStatus;
  requestedBy: string | null;
  requesterName?: string | null;
  decidedBy: string | null;
  deciderName?: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDeliverable {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: ProjectDeliverableStatus;
  deliveredAt: string | null;
  acceptedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const TASK_STATUSES: ProjectTaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];
export const TASK_PRIORITIES: ProjectTaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
export const RISK_SEVERITIES: ProjectRiskSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const RISK_PROBABILITIES: ProjectRiskProbability[] = ['LOW', 'MEDIUM', 'HIGH'];
export const RISK_STATUSES: ProjectRiskStatus[] = ['OPEN', 'MITIGATED', 'ACCEPTED', 'CLOSED'];
export const DELIVERABLE_STATUSES: ProjectDeliverableStatus[] = ['PENDING', 'IN_PROGRESS', 'DELIVERED', 'ACCEPTED', 'REJECTED'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertDate(value: string | undefined | null, label: string): void {
  if (!value) return;
  if (!DATE_PATTERN.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) {
    throw new Error(`${label} غير صالح. استخدم الصيغة YYYY-MM-DD.`);
  }
}

export function assertAmount(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} يجب أن يكون رقماً غير سالب.`);
}
