export function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export interface DashboardMetrics {
  todaySales: number;
  monthSales: number;
  todayPurchases: number;
  todayExpenses: number;
  grossProfit: number;
  netProfit: number;
  totalReceivables: number; // ديون العملاء
  totalPayables: number; // مستحقات الموردين
  inventoryValuationCost: number | null; // قيمة المخزون بسعر الشراء (null = غير متاح)
  inventoryValuationSale: number | null; // قيمة المخزون بسعر البيع (null = غير متاح)
  inventoryValuationUnavailable: boolean; // true إذا كانت التكلفة غير متاحة بسبب خطأ FIFO
  lowStockCount: number;
  outOfStockCount: number;
  salesCount: number;
  // New fields for enhanced analytics
  previousMonthSales: number;
  salesGrowthRate: number;
  profitMargin: number;
  averageOrderValue: number;
  topCustomer: { name: string; totalPurchases: number } | null;
  urgentDebtsCount: number;
}

export interface MonthlyComparison {
  currentMonth: { sales: number; profit: number; invoices: number };
  previousMonth: { sales: number; profit: number; invoices: number };
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
