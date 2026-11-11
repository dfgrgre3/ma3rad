export type FiscalPeriodStatus = 'OPEN' | 'CLOSED' | 'LOCKED';

export type FiscalWorkflowState = 'OPEN' | 'IN_REVIEW' | 'PENDING_APPROVAL' | 'CLOSED' | 'LOCKED';

export interface FiscalYear {
  id: string;
  yearCode: string;
  name: string;
  startDate: string;
  endDate: string;
  status: FiscalPeriodStatus;
  workflowState?: FiscalWorkflowState;
  companyId?: string;
  companyName?: string;
  branchScope?: string;
  currency?: string;
  yearType?: string;
  periodCount?: number;
  previousYearId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  lockedAt?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  closingEntryId?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface FiscalPeriod {
  id: string;
  fiscalYearId: string;
  periodNumber: number;
  name: string;
  startDate: string;
  endDate: string;
  status: FiscalPeriodStatus;
  workflowState?: FiscalWorkflowState;
  periodType?: string;
  companyId?: string;
  branchId?: string | null;
  reviewStartedAt?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  lockedAt?: string | null;
  closeRunId?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  closingNotes?: string | null;
  createdAt: string;
}

export interface BankAccount {
  id: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  iban?: string | null;
  swiftCode?: string | null;
  currency: string;
  openingBalance: number;
  currentBalance: number;
  glAccountId: string;
  glAccountCode?: string;
  glAccountName?: string;
  branchId?: string | null;
  branchName?: string;
  isActive: boolean;
  createdAt: string;
}

export type BankReconciliationStatus = 'DRAFT' | 'RECONCILED' | 'APPROVED' | 'CANCELLED';

export interface BankReconciliation {
  id: string;
  reconciliationNumber: string;
  bankAccountId: string;
  bankAccountName?: string;
  statementDate: string;
  statementBalance: number;
  bookBalance: number;
  unreconciledDifference: number;
  clearedDeposits: number;
  clearedWithdrawals: number;
  status: BankReconciliationStatus;
  reconciledBy: string;
  reconciledByName?: string;
  approvedBy?: string | null;
  approvedByName?: string | null;
  notes?: string | null;
  createdAt: string;
}
