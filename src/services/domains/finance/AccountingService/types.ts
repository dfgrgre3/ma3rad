export function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export interface DashboardMetrics {
  // Domain-scoped fields are null when the actor lacks the matching view
  // permission (sales.view / purchases.view / finance.view / inventory.view)
  // so partial-permission users see "—" instead of hidden zeros.
  todaySales: number | null;
  monthSales: number | null;
  todayPurchases: number | null;
  todayExpenses: number | null;
  grossProfit: number | null;
  netProfit: number | null;
  totalReceivables: number | null; // ديون العملاء
  totalPayables: number | null; // مستحقات الموردين
  inventoryValuationCost: number | null; // قيمة المخزون بسعر الشراء (null = غير متاح)
  inventoryValuationSale: number | null; // قيمة المخزون بسعر البيع (null = غير متاح)
  inventoryValuationUnavailable: boolean; // true إذا كانت التكلفة غير متاحة بسبب خطأ FIFO
  lowStockCount: number | null;
  outOfStockCount: number | null;
  salesCount: number | null;
  // New fields for enhanced analytics
  previousMonthSales: number | null;
  salesGrowthRate: number | null;
  profitMargin: number | null;
  averageOrderValue: number | null;
  topCustomer: { name: string; totalPurchases: number } | null;
  urgentDebtsCount: number | null;
}

export interface MonthlyComparison {
  currentMonth: { sales: number; profit: number | null; invoices: number };
  previousMonth: { sales: number; profit: number | null; invoices: number };
  salesGrowth: number | null;
  invoiceGrowth: number | null;
  currentMonthInvoices: number;
}

export interface RecentDashboardActivity {
  type: 'sale' | 'purchase' | 'inventory';
  description: string;
  amount?: number;
  timestamp: string;
}

export interface DashboardProfitData {
  netProfit: number;
  dailyNetProfit: { date: string; profit: number }[];
}

export interface DashboardActivityRow {
  type: 'SALE' | 'PURCHASE' | 'STOCK';
  description: string;
  amount: number | null;
  date: string;
}

export interface SqlScope {
  clause: string;
  params: string[];
}

export interface DashboardContext {
  today: string;
  monthStart: string;
  prevMonthStart: string;
  prevMonthEnd: string;
  cutoff30Str: string;
  salesScope: SqlScope;
  purchaseScope: SqlScope;
  expenseScope: SqlScope;
  warehouseScope: SqlScope;
}

export interface ProfitAndLossReport {
  revenue: number;
  merchandiseRevenue: number;
  shippingRevenue: number;
  otherRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  expenses: number;
  sourceExpenses: number;
  expenseReconciliationDifference: number;
  netProfit: number;
  margin: number;
}

export interface NetSalesAnalysis {
  grossSales: number;
  returns: number;
  netSales: number;
  returnedCost: number;
  netProfit: number;
  invoices: number;
  returnRate: number;
}
