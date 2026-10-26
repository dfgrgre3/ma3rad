export type FiscalPeriodStatus = 'OPEN' | 'CLOSED' | 'LOCKED';

export interface FiscalYear {
  id: string;
  yearCode: string;
  name: string;
  startDate: string;
  endDate: string;
  status: FiscalPeriodStatus;
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

export interface BudgetItem {
  id: string;
  budgetId: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  allocatedAmount: number;
  actualSpent?: number;
  variance?: number;
  notes?: string | null;
}

export interface CashForecastItem {
  id: string;
  forecastDate: string;
  type: 'INFLOW' | 'OUTFLOW';
  sourceType: 'INVOICE' | 'CHEQUE' | 'INSTALLMENT' | 'PURCHASE' | 'EXPENSE' | 'PAYROLL' | 'OTHER';
  sourceId?: string | null;
  category: string;
  description: string;
  amount: number;
  probability: number;
  status: 'PROJECTED' | 'REALIZED' | 'CANCELLED';
  createdAt: string;
}
