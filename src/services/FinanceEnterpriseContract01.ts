import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { round2 } from './financials';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import type {
  FiscalYear,
  FiscalPeriod,
  BankAccount,
  BankReconciliation,
  BankReconciliationLine,
  ExtendedChequeStatus,
  ChequeStatusHistory,
  CostCenter,
  Budget,
  BudgetItem,
  CashForecastItem,
  CashForecastDaySummary,
  PaymentGateway,
  PaymentGatewaySettlement,
  MultiDimensionalReportFilters,
} from '../types/finance';
import type { Cheque } from './FinanceExtrasService';

export abstract class FinanceEnterpriseContract01 {
  protected db = DatabaseManager.getInstance();

  protected abstract requireView(): any;

  protected abstract requireManage(): any;

  public abstract getFiscalYears(): FiscalYear[];

  public abstract getFiscalPeriods(fiscalYearId?: string): FiscalPeriod[];

  public abstract createFiscalYear(input: { yearCode: string; name: string; startDate: string; endDate: string }): string;

  public abstract closePeriod(periodId: string, notes?: string): void;

  public abstract reopenPeriod(periodId: string, reason: string): void;

  public abstract closeFiscalYear(fiscalYearId: string, retainedEarningsCode: any): string;

  public abstract getBankAccounts(): BankAccount[];

  public abstract saveBankAccount(input: Partial<BankAccount> & { accountName: string; bankName: string; accountNumber: string; glAccountId: string }): string;

  public abstract getUnreconciledBankTransactions(bankAccountId: string, asOfDate: string): Array<{
      id: string;
      journalLineId?: string;
      chequeId?: string;
      date: string;
      reference: string;
      description: string;
      type: 'DEPOSIT' | 'WITHDRAWAL';
      amount: number;
      isCleared: boolean;
    }>;

  public abstract createBankReconciliation(input: {
      bankAccountId: string;
      statementDate: string;
      statementBalance: number;
      clearedTransactions: Array<{ journalLineId?: string; chequeId?: string; date: string; reference: string; description: string; type: 'DEPOSIT' | 'WITHDRAWAL'; amount: number }>;
      notes?: string;
    }): BankReconciliation;

  public abstract getBankReconciliations(bankAccountId?: string): BankReconciliation[];

  public abstract getBankReconciliationById(id: string): BankReconciliation | null;

  public abstract transitionChequeStatus(chequeId: string, toStatus: ExtendedChequeStatus, options: {
        bankAccountId?: string;
        bounceReason?: string;
        bounceFee?: number;
        date?: string;
        notes?: string;
      }): void;

  public abstract getChequeHistory(chequeId: string): ChequeStatusHistory[];

  public abstract getCostCenters(): CostCenter[];

  public abstract saveCostCenter(input: Partial<CostCenter> & { code: string; name: string }): string;

  public abstract getBudgets(fiscalYearId?: string): Budget[];

  public abstract getBudgetWithItems(budgetId: string): Budget | null;

  public abstract saveBudget(input: {
      fiscalYearId: string;
      costCenterId?: string;
      name: string;
      items: Array<{ accountId: string; allocatedAmount: number; notes?: string }>;
    }): string;

  public abstract getCashFlowForecast(daysAhead: any): {
      currentCashBalance: number;
      projectedEndBalance: number;
      totalExpectedInflow: number;
      totalExpectedOutflow: number;
      days: CashForecastDaySummary[];
    };

  public abstract getPaymentGateways(): PaymentGateway[];

  public abstract savePaymentGateway(input: Partial<PaymentGateway> & { name: string; providerCode: string; glAccountId: string }): string;

  public abstract getPaymentGatewaySettlements(): PaymentGatewaySettlement[];

  public abstract recordGatewaySettlement(input: {
      gatewayId: string;
      settlementDate: string;
      grossAmount: number;
      commissionAmount: number;
      taxDeduction?: number;
      bankAccountId: string;
      notes?: string;
    }): string;

  public abstract getMultiDimensionalPnL(filters: MultiDimensionalReportFilters): {
      revenue: number;
      cogs: number;
      grossProfit: number;
      expenses: number;
      netProfit: number;
      accountsBreakdown: Array<{ code: string; name: string; type: string; amount: number }>;
    };
}
