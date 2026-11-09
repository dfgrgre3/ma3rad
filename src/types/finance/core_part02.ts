import type { BudgetItem } from './core_part03';

export interface BankReconciliationLine {
  id: string;
  reconciliationId: string;
  journalLineId?: string | null;
  chequeId?: string | null;
  transactionDate: string;
  reference?: string | null;
  description: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  isCleared: boolean;
  clearedDate?: string | null;
  notes?: string | null;
}

export type ExtendedChequeStatus = 'PENDING' | 'DEPOSITED' | 'CLEARED' | 'BOUNCED' | 'CANCELLED' | 'RE_PRESENTED';

export interface ChequeStatusHistory {
  id: string;
  chequeId: string;
  fromStatus?: string | null;
  toStatus: ExtendedChequeStatus;
  changedAt: string;
  changedBy: string;
  changedByName?: string;
  journalEntryId?: string | null;
  notes?: string | null;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  branchId?: string | null;
  branchName?: string | null;
  managerId?: string | null;
  managerName?: string | null;
  isActive: boolean;
  description?: string | null;
  createdAt: string;
}

export type BudgetStatus = 'DRAFT' | 'APPROVED' | 'REVISED' | 'CLOSED';

export interface Budget {
  id: string;
  budgetCode: string;
  fiscalYearId: string;
  fiscalYearCode?: string;
  costCenterId?: string | null;
  costCenterName?: string | null;
  name: string;
  totalAllocated: number;
  status: BudgetStatus;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  items?: BudgetItem[];
}
