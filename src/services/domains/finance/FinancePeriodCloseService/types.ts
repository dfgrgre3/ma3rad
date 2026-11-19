export type CloseCheckStatus = 'PASS' | 'WARNING' | 'FAIL' | 'NOT_APPLICABLE';
export type PeriodWorkflowState = 'OPEN' | 'IN_REVIEW' | 'PENDING_APPROVAL' | 'CLOSED' | 'LOCKED';

export interface FiscalCloseIssue {
  reference: string;
  message: string;
  documentId?: string;
  route?: string;
  amount?: number;
}

export interface FiscalCloseCheck {
  id: string;
  area:
    | 'SALES'
    | 'PURCHASES'
    | 'TREASURY'
    | 'BANKS'
    | 'CUSTOMERS'
    | 'SUPPLIERS'
    | 'INVENTORY'
    | 'COGS'
    | 'FIXED_ASSETS'
    | 'PAYROLL'
    | 'EXPENSES'
    | 'TAXES'
    | 'JOURNALS'
    | 'CONTROLS';
  label: string;
  status: CloseCheckStatus;
  /** Backwards-compatible flag: only FAIL blocks closing; warnings are review notes. */
  passed: boolean;
  issueCount: number;
  issues: string[];
  details: FiscalCloseIssue[];
  route?: string;
}

export interface PeriodCloseTask {
  id: string;
  fiscalPeriodId: string;
  closeRunId?: string | null;
  title: string;
  description?: string | null;
  department?: string | null;
  category: string;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  dueDate?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REVIEWED' | 'APPROVED' | 'CANCELLED';
  notes?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PeriodAdjustment {
  id: string;
  fiscalPeriodId: string;
  adjustmentType: string;
  description: string;
  amount: number;
  debitAccountCode: string;
  creditAccountCode: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'POSTED' | 'REJECTED';
  journalEntryId?: string | null;
  createdBy: string;
  createdAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  postedAt?: string | null;
  rejectionReason?: string | null;
}

export interface PeriodCloseReport {
  id: string;
  fiscalPeriodId: string;
  reportType: string;
  payload: PeriodCloseReportPayload;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
}

export interface PeriodCloseReportPayload {
  period: { id: string; name: string; startDate: string; endDate: string };
  generatedAt: string;
  trialBalance: Array<{ code: string; name: string; type: string; debit: number; credit: number; balance: number }>;
  profitAndLoss: { revenue: number; expenses: number; grossProfit: number; netProfit: number };
  balanceSheet: { assets: number; liabilities: number; equity: number; balanced: boolean };
  cashFlow: { opening: number; inflow: number; outflow: number; closing: number };
  inventoryValuation: number;
  receivablesAging: Array<{ bucket: string; amount: number }>;
  partySubledgerBalances?: Array<{
    partyType: 'CUSTOMER' | 'SUPPLIER';
    partyId: string;
    controlAccountCode: string;
    balance: number;
  }>;
  subledgerCoverageStartDate?: string;
  legacyManualSubledgerMatches?: Array<{
    partyType: 'CUSTOMER' | 'SUPPLIER';
    verifiedSubledgerBalance: number;
    controlBalance: number;
    evidenceReference: string;
    notes?: string | null;
    createdByName: string;
    createdAt: string;
  }>;
}

export interface FiscalYearOpening {
  id: string;
  fiscalYearId: string;
  sourceYearId?: string | null;
  accountCode: string;
  accountName?: string | null;
  accountType: string;
  debit: number;
  credit: number;
  balance: number;
}

export type QueryFn = (sql: string, params?: any[]) => any[];

export interface PeriodRow {
  id: string;
  fiscalYearId: string;
  periodNumber: number;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  workflowState?: string | null;
  companyId?: string | null;
  branchId?: string | null;
  closeRunId?: string | null;
}

export interface TaskInput {
  fiscalPeriodId: string;
  title: string;
  description?: string;
  department?: string;
  category?: string;
  assigneeUserId?: string;
  dueDate?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  notes?: string;
}

export interface AdjustmentInput {
  fiscalPeriodId: string;
  adjustmentType:
    | 'ACCRUED_EXPENSE'
    | 'PREPAID_EXPENSE'
    | 'ACCRUED_REVENUE'
    | 'DEFERRED_REVENUE'
    | 'DEPRECIATION'
    | 'BAD_DEBT_PROVISION'
    | 'INVENTORY_VARIANCE'
    | 'COGS_ADJUSTMENT'
    | 'CASH_VARIANCE'
    | 'BANK_VARIANCE'
    | 'PAYROLL_ACCRUAL'
    | 'OTHER';
  description: string;
  amount: number;
  debitAccountCode: string;
  creditAccountCode: string;
}

export const DEFAULT_CLOSE_TASKS: Array<{ title: string; department: string; category: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }> = [
  { title: 'مطابقة الخزينة والصناديق', department: 'الخزينة', category: 'TREASURY', priority: 'HIGH' },
  { title: 'مطابقة الحسابات البنكية', department: 'الحسابات', category: 'BANKS', priority: 'HIGH' },
  { title: 'مراجعة أرصدة العملاء', department: 'الحسابات', category: 'CUSTOMERS', priority: 'MEDIUM' },
  { title: 'مراجعة أرصدة الموردين', department: 'المشتريات والحسابات', category: 'SUPPLIERS', priority: 'MEDIUM' },
  { title: 'جرد وتسوية المخزون', department: 'المخازن', category: 'INVENTORY', priority: 'HIGH' },
  { title: 'احتساب وترحيل الإهلاك', department: 'الحسابات', category: 'FIXED_ASSETS', priority: 'MEDIUM' },
  { title: 'مراجعة الرواتب والعمولات', department: 'الموارد البشرية', category: 'PAYROLL', priority: 'MEDIUM' },
  { title: 'إعداد ميزان المراجعة', department: 'المحاسبة', category: 'JOURNALS', priority: 'HIGH' },
  { title: 'مراجعة الضرائب والتسويات', department: 'المحاسبة', category: 'TAXES', priority: 'MEDIUM' },
  { title: 'اعتماد إقفال الفترة', department: 'الإدارة المالية', category: 'APPROVAL', priority: 'CRITICAL' },
];
