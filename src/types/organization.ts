export interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  managerId?: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  managerName?: string | null;
  companyId?: string | null;
  companyName?: string | null;
}

export interface Company {
  id: string;
  code: string;
  name: string;
  legalName?: string | null;
  taxNumber?: string | null;
  commercialRecord?: string | null;
  currency?: string | null;
  fiscalYearStartMonth?: number | null;
  timeZone?: string | null;
  locale?: string | null;
  dateFormat?: string | null;
  payrollTaxRate?: number | null;
  overtimeMultiplier?: number | null;
  workingDaysPerMonth?: number | null;
  parentCompanyId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  branchCount?: number;
}

export interface CreateCompanyDTO {
  code: string;
  name: string;
  legalName?: string;
  taxNumber?: string;
  commercialRecord?: string;
  currency?: string;
  fiscalYearStartMonth?: number;
  timeZone?: string;
  locale?: string;
  dateFormat?: string;
  payrollTaxRate?: number;
  overtimeMultiplier?: number;
  workingDaysPerMonth?: number;
  parentCompanyId?: string;
}

export interface BranchWarehouse {
  id: string;
  branchId: string;
  warehouseId: string;
  isPrimary: boolean;
  warehouseName?: string | null;
}

export interface UserBranch {
  userId: string;
  branchId: string;
}

export interface CreateBranchDTO {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  managerId?: string;
  isDefault?: boolean;
  companyId?: string;
}

// ─── ADVANCED ANALYTICS ───────────────────────────────────────────────────────

export interface AnalyticsSnapshot {
  id: string;
  metricName: string;
  metricValue: number;
  dimension?: string | null;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface SalesAnalytics {
  period: string;
  totalSales: number;
  totalOrders: number;
  averageOrderValue: number;
  totalProfit: number;
  topProducts: Array<{ productId: string; productName: string; quantity: number; revenue: number }>;
  topCustomers: Array<{ customerId: string; customerName: string; totalSpent: number; orderCount: number }>;
  salesByDay: Array<{ date: string; amount: number; count: number }>;
}

// ─── NOTIFICATION PREFERENCES ─────────────────────────────────────────────────

export interface NotificationPreference {
  id: string;
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  lowStockAlerts: boolean;
  paymentDueAlerts: boolean;
  systemAlerts: boolean;
}

export interface UpdateNotificationPreferencesDTO {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  lowStockAlerts?: boolean;
  paymentDueAlerts?: boolean;
  systemAlerts?: boolean;
}
