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
