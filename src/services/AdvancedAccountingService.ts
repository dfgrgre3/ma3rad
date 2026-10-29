import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import type {
  ChartOfAccountNode,
  JournalEntryHeader,
  JournalEntryLine,
  TrialBalanceReport,
  ProfitLossReport,
  BalanceSheetReport,
  AccountType,
  AccountBalance,
  CashFlowStatement,
} from '../types/advancedAccounting';

const round2 = (value: number): number => Math.round(value * 100) / 100;

export interface CreateJournalEntryDTO {
  date: string;
  description: string;
  referenceType?: string | null;
  referenceId?: string | null;
  branchId?: string | null;
  lines: Array<{
    accountId: string;
    accountCode?: string;
    accountName?: string;
    debit: number;
    credit: number;
    description?: string | null;
    costCenterId?: string | null;
  }>;
}

export interface AccountHierarchy {
  root: ChartOfAccountNode[];
  flat: ChartOfAccountNode[];
}

export class AdvancedAccountingService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private requireView(permission: string): void {
    PermissionService.require(AuthService.requireAuth(), permission);
  }

  private requireManage(permission: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, permission);
  }

  private ledgerScope(alias = 'e') {
    const branch = this.branchAccess.sqlScope(`${alias}.branch_id`);
    const company = this.branchAccess.companyScope(`${alias}.company_id`);
    return {
      clause: `(${branch.clause}) AND (${company.clause})`,
      params: [...branch.params, ...company.params],
    };
  }
}
