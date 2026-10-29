// ─── ADVANCED ACCOUNTING TYPES ───────────────────────────────────────────

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' | 'BANK' | 'CASH';

export interface ChartOfAccountNode {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string | null;
  level: number;
  isActive: boolean;
  balance?: number;
  children?: ChartOfAccountNode[];
}

export interface JournalEntryLine {
  id: string;
  entryId: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  description?: string | null;
  costCenterId?: string | null;
  branchId?: string | null;
}

export interface JournalEntryHeader {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  referenceType?: string | null;
  referenceId?: string | null;
  totalDebit: number;
  totalCredit: number;
  isPosted: boolean;
  postedAt?: string | null;
  postedBy?: string | null;
  branchId?: string | null;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  lines?: JournalEntryLine[];
}

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  balance: number;
  normalSide: 'DEBIT' | 'CREDIT';
}

export interface TrialBalanceReport {
  asOfDate: string;
  rows: TrialBalanceRow[];
  totals: {
    totalDebit: number;
    totalCredit: number;
    difference: number;
  };
}

export interface ProfitLossRow {
  category: 'REVENUE' | 'EXPENSE' | 'COST_OF_GOODS_SOLD';
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
}

export interface ProfitLossReport {
  periodStart: string;
  periodEnd: string;
  revenue: ProfitLossRow[];
  cogs: ProfitLossRow[];
  expenses: ProfitLossRow[];
  totals: {
    totalRevenue: number;
    totalCogs: number;
    totalExpenses: number;
    grossProfit: number;
    netProfit: number;
  };
}

export interface BalanceSheetRow {
  category: 'ASSET' | 'LIABILITY' | 'EQUITY';
  subCategory: 'CURRENT' | 'NON_CURRENT' | 'OPENING_EQUITY' | 'RETAINED_EARNINGS';
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
}

export interface BalanceSheetReport {
  asOfDate: string;
  assets: BalanceSheetRow[];
  liabilities: BalanceSheetRow[];
  equity: BalanceSheetRow[];
  totals: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    difference: number;
  };
}

export interface AccountBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debit: number;
  credit: number;
  balance: number;
  normalSide: 'DEBIT' | 'CREDIT';
}

// ─── CASH FLOW & BANK TYPES ──────────────────────────────────────────────

export type CashFlowType = 'OPERATING' | 'INVESTING' | 'FINANCING';

export interface CashFlowStatementRow {
  category: CashFlowType;
  description: string;
  amount: number;
}

export interface CashFlowStatement {
  periodStart: string;
  periodEnd: string;
  operating: CashFlowStatementRow[];
  investing: CashFlowStatementRow[];
  financing: CashFlowStatementRow[];
  totals: {
    netOperating: number;
    netInvesting: number;
    netFinancing: number;
    netChange: number;
    openingCash: number;
    closingCash: number;
  };
}