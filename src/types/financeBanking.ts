import type { CashForecastItem } from './finance';

export interface CashForecastDaySummary {
  date: string;
  inflows: number;
  outflows: number;
  net: number;
  projectedClosingBalance: number;
  items: CashForecastItem[];
}

export interface PaymentGateway {
  id: string;
  name: string;
  providerCode: string;
  glAccountId: string;
  glAccountCode?: string;
  commissionRate: number;
  fixedFee: number;
  settlementPeriodDays: number;
  isActive: boolean;
  configJson?: string;
  createdAt: string;
}

export interface PaymentGatewaySettlement {
  id: string;
  settlementNumber: string;
  gatewayId: string;
  gatewayName?: string;
  settlementDate: string;
  grossAmount: number;
  commissionAmount: number;
  taxDeduction: number;
  netAmount: number;
  bankAccountId: string;
  bankAccountName?: string;
  journalEntryId?: string | null;
  status: 'PENDING' | 'SETTLED' | 'DISPUTED';
  notes?: string | null;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  exchangeRate: number;
  isBase: boolean;
  isActive: boolean;
}

export interface MultiDimensionalReportFilters {
  dateFrom?: string;
  dateTo?: string;
  branchId?: string;
  projectId?: string;
  costCenterId?: string;
}
