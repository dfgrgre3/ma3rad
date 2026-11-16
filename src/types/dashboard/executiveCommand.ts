export type CommandRange = 'today' | 'week' | 'month' | 'year';

export type DrilldownKey =
  | 'salesToday'
  | 'salesMonth'
  | 'sales'
  | 'profit'
  | 'expenses'
  | 'expensesToday'
  | 'collections'
  | 'receivables'
  | 'overdueInvoices'
  | 'cashBalance'
  | 'inventory'
  | 'inventoryValue'
  | 'topProducts'
  | 'slowMoving'
  | 'branches'
  | 'employees'
  | 'cashFlow'
  | 'cashInflow'
  | 'cashOutflow'
  | 'purchases'
  | 'lowStock'
  | 'comparison';

export type DrilldownValueType = 'money' | 'number' | 'percent' | 'text' | 'date';

export interface DrilldownColumn {
  key: string;
  label: string;
  type?: DrilldownValueType;
}

export interface DrilldownRow {
  [key: string]: string | number | null;
}

export interface DrilldownTotal {
  label: string;
  value: number;
  type?: 'money' | 'number' | 'percent';
}

export interface DrilldownResult {
  key: DrilldownKey;
  title: string;
  subtitle: string;
  columns: DrilldownColumn[];
  rows: DrilldownRow[];
  totals: DrilldownTotal[];
  note?: string;
}

export interface CommandPeriod {
  range: CommandRange;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  days: number;
  label: string;
  previousLabel: string;
}

export interface CashAccountRow {
  id: string;
  name: string;
  type: 'cash' | 'bank';
  balance: number;
  branchName: string;
}

export interface ProductSaleRow {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  profit: number;
  productType: 'CERAMIC' | 'GENERAL';
  baseUnit: string;
  customUnit?: string;
}

export interface SlowMovingRow {
  productId: string;
  name: string;
  stockQty: number;
  stockValue: number;
  lastSaleDate: string | null;
  daysIdle: number | null;
  baseUnit: string;
  customUnit?: string;
}

export interface BranchPerformanceRow {
  branchId: string;
  name: string;
  sales: number;
  invoices: number;
  grossProfit: number;
}

export interface EmployeeSaleRow {
  key: string;
  name: string;
  sales: number;
  invoices: number;
  grossProfit: number;
}

export interface InventoryRow {
  productId: string;
  name: string;
  quantity: number;
  costValue: number;
  saleValue: number;
  productType: 'CERAMIC' | 'GENERAL';
  baseUnit: string;
  customUnit?: string;
}

export interface LowStockRow {
  productId: string;
  name: string;
  warehouse: string;
  quantity: number;
  minLevel: number;
  productType: 'CERAMIC' | 'GENERAL';
  baseUnit: string;
  customUnit?: string;
}

export interface CommandTrendPoint {
  date: string;
  label: string;
  sales: number;
  profit: number;
  previousSales: number;
}

export interface PeriodSnapshot {
  sales: number;
  profit: number;
  expenses: number;
  collections: number;
  invoices: number;
  purchases: number;
}

export interface ExecutiveCommandOverview {
  period: CommandPeriod;
  generatedAt: string;
  sales: {
    net: number;
    gross: number;
    returns: number;
    invoiceCount: number;
    today: number;
    todayInvoiceCount: number;
    purchases: number;
    purchaseCount: number;
  };
  profit: {
    net: number;
    margin: number;
    source: 'ledger' | 'estimated';
  };
  expenses: {
    total: number;
    today: number;
    count: number;
  };
  collections: {
    total: number;
    count: number;
    invoiceCollections: number;
    laterCollections: number;
  };
  receivables: {
    total: number;
    invoiceCount: number;
    overdueTotal: number;
    overdueCount: number;
  };
  liquidity: {
    cashTotal: number;
    bankTotal: number;
    total: number;
    cashAccounts: CashAccountRow[];
  };
  inventory: {
    costValue: number;
    saleValue: number;
    unavailable: boolean;
    lowStockCount: number;
    outOfStockCount: number;
    productCount: number;
    totalQuantity: number;
  };
  cashFlow: {
    inflow: number;
    outflow: number;
    net: number;
    purchasesPaid: number;
    supplierPayments: number;
    expenses: number;
  };
  topProducts: ProductSaleRow[];
  slowMoving: SlowMovingRow[];
  branches: BranchPerformanceRow[];
  employees: EmployeeSaleRow[];
  trend: CommandTrendPoint[];
  comparison: {
    current: PeriodSnapshot;
    previous: PeriodSnapshot;
  };
  alerts: {
    overdueInvoices: Array<{
      id: string;
      invoiceNumber: string;
      customer: string;
      remaining: number;
      daysOverdue: number;
    }>;
    lowStock: LowStockRow[];
  };
}

export const COMMAND_RANGES: Array<{ id: CommandRange; label: string; periodLabel: string }> = [
  { id: 'today', label: 'اليوم', periodLabel: 'اليوم' },
  { id: 'week', label: '٧ أيام', periodLabel: 'آخر ٧ أيام' },
  { id: 'month', label: 'هذا الشهر', periodLabel: 'الشهر حتى تاريخه' },
  { id: 'year', label: 'هذه السنة', periodLabel: 'السنة حتى تاريخه' },
];
