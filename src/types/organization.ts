export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  managerId?: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  managerName?: string | null;
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
