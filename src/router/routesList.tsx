import React from 'react';
import { Navigate } from 'react-router-dom';
import * as P from './lazyPages';

export interface RouteDef {
  path: string;
  element: React.ReactNode;
}

export const appRoutes: RouteDef[] = [
  // Dashboard & Tools
  { path: 'dashboard', element: <P.DashboardView /> },
  { path: 'dashboard/executive', element: <P.ExecutiveDashboard /> },
  { path: 'tools', element: <Navigate to="/dashboard" replace /> },

  // Sales & POS
  { path: 'sales/analytics', element: <P.SalesAnalyticsPage /> },
  { path: 'sales/cycle', element: <P.InvoiceCyclePage /> },
  { path: 'sales/statement', element: <P.CustomerStatementPage /> },
  { path: 'sales/reservations', element: <P.ReservationsDepositPage /> },
  { path: 'sales/after-sales', element: <P.AfterSalesPage /> },
  { path: 'restaurant', element: <P.RestaurantPage /> },
  { path: 'pos', element: <P.PosView /> },
  { path: 'sales', element: <P.SalesView /> },
  { path: 'daily/sales', element: <P.TodaySalesPage /> },
  { path: 'daily/purchases', element: <P.TodayPurchasesPage /> },
  { path: 'daily/expenses', element: <P.TodayExpensesPage /> },
  { path: 'daily/debts', element: <P.TodayDebtsPage /> },
  { path: 'quotations', element: <P.QuotationsPage /> },
  { path: 'orders', element: <P.OrdersPage /> },
  { path: 'returns', element: <P.ReturnsPage /> },

  // Products & Pricing
  { path: 'products', element: <P.ProductsView /> },
  { path: 'products/attributes', element: <P.ProductAttributesPage /> },
  { path: 'products/barcodes', element: <P.BarcodesPrintPage /> },
  { path: 'products/:id', element: <P.ProductDetailPage /> },
  { path: 'categories', element: <P.CategoriesView /> },
  { path: 'brands', element: <P.BrandsView /> },
  { path: 'pricing', element: <P.PricingPage /> },
  { path: 'promotions', element: <P.PromotionsPage /> },

  // Inventory
  { path: 'inventory', element: <P.InventoryView /> },
  { path: 'inventory/warehouse-stock', element: <P.LocationStockPage mode="warehouse" /> },
  { path: 'inventory/showroom-stock', element: <P.LocationStockPage mode="showroom" /> },
  { path: 'inventory/ledger', element: <P.StockLedgerPage /> },
  { path: 'inventory/transfers', element: <P.StockTransfersView /> },
  { path: 'inventory/counts', element: <P.InventoryCountPage /> },
  { path: 'inventory/valuation', element: <P.InventoryValuationPage /> },
  { path: 'inventory/adjustments', element: <P.InventoryAdjustmentsPage /> },
  { path: 'inventory/reservations', element: <Navigate to="/sales/reservations?tab=reservations" replace /> },
  { path: 'inventory/reorder-planning', element: <P.ReorderPlanningPage /> },
  { path: 'inventory/locations', element: <P.WarehouseLocationsPage /> },
  { path: 'inventory/damage-quarantine', element: <P.DamageQuarantinePage /> },
  { path: 'inventory/reconciliation', element: <P.InventoryReconciliationPage /> },

  // Branches & Warehouses
  { path: 'branches', element: <P.BranchesPage /> },
  { path: 'warehouses', element: <P.WarehousesPage /> },

  // CRM
  { path: 'customers', element: <P.CustomersView /> },
  { path: 'customers/imported-products', element: <P.CustomerImportedProductsPage /> },
  { path: 'customers/ready-deliveries', element: <P.ReadyDeliveriesPage /> },
  { path: 'customers/:id/imported-products', element: <P.CustomerImportedProductsPage /> },
  { path: 'customers/:id', element: <P.CustomerDetailPage /> },
  { path: 'crm/dashboard', element: <P.CrmDashboardPage /> },
  { path: 'crm/leads', element: <P.LeadsPage /> },
  { path: 'crm/pipeline', element: <P.PipelinePage /> },
  { path: 'crm/activities', element: <P.CrmActivitiesPage /> },
  { path: 'crm/campaigns', element: <P.CampaignsPage /> },

  // Purchasing
  { path: 'suppliers', element: <P.SuppliersView /> },
  { path: 'suppliers/:id', element: <P.SupplierDetailPage /> },
  { path: 'purchases', element: <P.PurchasesView /> },
  { path: 'purchases/requests', element: <P.PurchaseRequestsPage /> },
  { path: 'purchases/quotations', element: <P.SupplierQuotationsPage /> },
  { path: 'purchases/orders', element: <P.PurchaseOrdersPage /> },
  { path: 'purchases/receipts', element: <P.GoodsReceiptsPage /> },
  { path: 'purchases/incoming', element: <P.IncomingProductsPage /> },
  { path: 'purchases/returns', element: <P.PurchaseReturnsPage /> },
  { path: 'purchases/claims', element: <P.SupplierClaimsPage /> },
  { path: 'purchases/statement', element: <P.SupplierStatementPage /> },

  // Finance
  { path: 'cashboxes', element: <P.CashierView /> },
  { path: 'finance', element: <P.FinanceOverviewPage /> },
  { path: 'finance/other-receivables', element: <P.OtherReceivablesPage /> },
  { path: 'finance/installments', element: <P.InstallmentsPage /> },
  { path: 'finance/expenses', element: <P.ExpensesPage /> },
  { path: 'finance/accounts', element: <P.ChartOfAccountsPage /> },
  { path: 'finance/journal', element: <P.JournalEntriesPage /> },
  { path: 'finance/cheques', element: <P.ChequesPage /> },
  { path: 'finance/fiscal-closing', element: <P.FiscalClosingPage /> },
  { path: 'finance/bank-reconciliation', element: <P.BankReconciliationPage /> },
  { path: 'finance/budgets-cost-centers', element: <P.BudgetsCostCentersPage /> },
  { path: 'finance/cash-forecast', element: <P.CashFlowForecastPage /> },
  { path: 'finance/epayment-settlements', element: <P.EPaymentSettlementPage /> },
  { path: 'finance/assets', element: <P.FixedAssetsPage /> },

  // Projects & Operations
  { path: 'projects', element: <P.ProjectsPage /> },
  { path: 'projects/:id', element: <P.ProjectDetailPage /> },
  { path: 'fleet/dashboard', element: <P.FleetDashboardPage /> },
  { path: 'deliveries', element: <P.DeliveriesPage /> },
  { path: 'drivers', element: <P.DriversPage /> },
  { path: 'vehicles', element: <P.VehiclesPage /> },
  { path: 'employees', element: <P.EmployeesPage /> },
  { path: 'employees/attendance', element: <P.AttendancePage /> },
  { path: 'employees/payroll', element: <P.PayrollPage /> },
  { path: 'employees/commissions', element: <P.CommissionsPage /> },
  { path: 'employees/leave', element: <P.LeavePage /> },
  { path: 'employees/contracts', element: <P.EmployeeContractsPage /> },
  { path: 'employees/documents', element: <P.EmployeeDocumentsPage /> },
  { path: 'manufacturing', element: <P.ManufacturingPage /> },
  { path: 'hr/dashboard', element: <P.HrDashboardPage /> },

  // Reports
  { path: 'reports', element: <P.ReportsHubPage /> },
  { path: 'reports/tax', element: <P.TaxReportPage /> },
  { path: 'reports/profit-loss', element: <P.ProfitLossPage /> },
  { path: 'reports/statements', element: <P.FinancialStatementsPage /> },
  { path: 'reports/sales', element: <P.SalesReportsPage /> },
  { path: 'reports/pos', element: <P.PosReportsPage /> },
  { path: 'reports/purchases', element: <P.PurchaseInventoryReportPage /> },

  // Approvals, Documents & Security
  { path: 'approvals', element: <P.ApprovalsPage /> },
  { path: 'documents', element: <P.DocumentsPage mode="documents" /> },
  { path: 'contracts', element: <P.DocumentsPage mode="contracts" /> },
  { path: 'notifications', element: <P.NotificationsView /> },
  { path: 'audit', element: <P.AuditLogView /> },
  { path: 'security', element: <P.SecurityCenterPage /> },
  { path: 'admin', element: <P.AdminPage /> },
  { path: 'admin/sync-conflicts', element: <P.SyncConflictsPage /> },
  { path: 'admin/data-deletion', element: <P.DataDeletionPage /> },

  // Settings
  { path: 'data-import/types', element: <P.DynamicDataPage /> },
  { path: 'data-import', element: <P.DataImportPage /> },
  { path: 'settings', element: <P.SettingsHubPage /> },
  { path: 'settings/app-configuration', element: <Navigate to="/settings?tab=appConfig" replace /> },
  { path: 'settings/configuration-studio', element: <Navigate to="/settings?tab=configStudio" replace /> },
  { path: 'central-activation', element: <P.CentralActivationView /> },
  { path: 'users', element: <P.UsersView /> },
  { path: 'backup', element: <P.BackupPage /> },
  { path: 'system-health', element: <P.SystemHealthPage /> },
  { path: '*', element: <P.NotFoundPage /> },
];
