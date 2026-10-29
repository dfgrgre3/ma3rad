import { lazy } from 'react';

// Dashboard & Tools
export const DashboardView = lazy(() => import('../components/DashboardView').then(m => ({ default: m.DashboardView })));
export const ExecutiveDashboard = lazy(() => import('../pages/dashboard/ExecutiveDashboard').then(m => ({ default: m.ExecutiveDashboard })));
export const QuickToolsPage = lazy(() => import('../pages/tools/QuickToolsPage').then(m => ({ default: m.QuickToolsPage })));

// Sales & POS
export const PosView = lazy(() => import('../components/PosView').then(m => ({ default: m.PosView })));
export const RestaurantPage = lazy(() => import('../pages/restaurant/RestaurantPage').then(m => ({ default: m.RestaurantPage })));
export const SalesView = lazy(() => import('../components/SalesView').then(m => ({ default: m.SalesView })));
export const SalesAnalyticsPage = lazy(() => import('../pages/sales/SalesAnalyticsPage').then(m => ({ default: m.SalesAnalyticsPage })));
export const InvoiceCyclePage = lazy(() => import('../pages/sales/InvoiceCyclePage').then(m => ({ default: m.InvoiceCyclePage })));
export const CustomerStatementPage = lazy(() => import('../pages/sales/CustomerStatementPage').then(m => ({ default: m.CustomerStatementPage })));
export const ReservationsDepositPage = lazy(() => import('../pages/sales/ReservationsDepositPage').then(m => ({ default: m.ReservationsDepositPage })));
export const AfterSalesPage = lazy(() => import('../pages/sales/AfterSalesPage').then(m => ({ default: m.AfterSalesPage })));
export const QuotationsPage = lazy(() => import('../pages/sales/QuotationsPage').then(m => ({ default: m.QuotationsPage })));
export const OrdersPage = lazy(() => import('../pages/sales/OrdersPage').then(m => ({ default: m.OrdersPage })));
export const ReturnsPage = lazy(() => import('../pages/sales/ReturnsPage').then(m => ({ default: m.ReturnsPage })));

// Daily Operations
export const TodaySalesPage = lazy(() => import('../pages/daily/DailyPage').then(m => ({ default: m.TodaySalesPage })));
export const TodayPurchasesPage = lazy(() => import('../pages/daily/DailyPage').then(m => ({ default: m.TodayPurchasesPage })));
export const TodayExpensesPage = lazy(() => import('../pages/daily/DailyPage').then(m => ({ default: m.TodayExpensesPage })));
export const TodayDebtsPage = lazy(() => import('../pages/daily/DailyPage').then(m => ({ default: m.TodayDebtsPage })));

// Products & Pricing
export const ProductsView = lazy(() => import('../components/ProductsView').then(m => ({ default: m.ProductsView })));
export const ProductDetailPage = lazy(() => import('../pages/products/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })));
export const ProductAttributesPage = lazy(() => import('../pages/products/ProductAttributesPage').then(m => ({ default: m.ProductAttributesPage })));
export const BarcodesPrintPage = lazy(() => import('../pages/products/BarcodesPrintPage').then(m => ({ default: m.BarcodesPrintPage })));
export const CategoriesView = lazy(() => import('../components/CategoriesView').then(m => ({ default: m.CategoriesView })));
export const BrandsView = lazy(() => import('../components/BrandsView').then(m => ({ default: m.BrandsView })));
export const PricingPage = lazy(() => import('../pages/pricing/PricingPage').then(m => ({ default: m.PricingPage })));
export const PromotionsPage = lazy(() => import('../pages/pricing/PromotionsPage').then(m => ({ default: m.PromotionsPage })));

// Inventory
export const InventoryView = lazy(() => import('../components/InventoryView').then(m => ({ default: m.InventoryView })));
export const LocationStockPage = lazy(() => import('../pages/inventory/LocationStockPage').then(m => ({ default: m.LocationStockPage })));
export const StockLedgerPage = lazy(() => import('../pages/inventory/StockLedgerPage').then(m => ({ default: m.StockLedgerPage })));
export const StockTransfersView = lazy(() => import('../components/StockTransfersView').then(m => ({ default: m.StockTransfersView })));
export const InventoryCountPage = lazy(() => import('../pages/inventory/InventoryCountPage').then(m => ({ default: m.InventoryCountPage })));
export const InventoryValuationPage = lazy(() => import('../pages/inventory/InventoryValuationPage').then(m => ({ default: m.InventoryValuationPage })));
export const InventoryAdjustmentsPage = lazy(() => import('../pages/inventory/InventoryAdjustmentsPage').then(m => ({ default: m.InventoryAdjustmentsPage })));
export const ReservationsPage = lazy(() => import('../pages/inventory/ReservationsPage').then(m => ({ default: m.ReservationsPage })));
export const ReorderPlanningPage = lazy(() => import('../pages/inventory/ReorderPlanningPage').then(m => ({ default: m.ReorderPlanningPage })));
export const WarehouseLocationsPage = lazy(() => import('../pages/inventory/WarehouseLocationsPage').then(m => ({ default: m.WarehouseLocationsPage })));
export const DamageQuarantinePage = lazy(() => import('../pages/inventory/DamageQuarantinePage').then(m => ({ default: m.DamageQuarantinePage })));
export const InventoryReconciliationPage = lazy(() => import('../pages/inventory/InventoryReconciliationPage').then(m => ({ default: m.InventoryReconciliationPage })));

// Operations, Branches & Warehouses
export const BranchesPage = lazy(() => import('../pages/operations/BranchesPage').then(m => ({ default: m.BranchesPage })));
export const WarehousesPage = lazy(() => import('../pages/operations/WarehousesPage').then(m => ({ default: m.WarehousesPage })));
export const FleetDashboardPage = lazy(() => import('../pages/operations/FleetDashboardPage').then(m => ({ default: m.FleetDashboardPage })));
export const DeliveriesPage = lazy(() => import('../pages/operations/DeliveriesPage').then(m => ({ default: m.DeliveriesPage })));
export const DriversPage = lazy(() => import('../pages/operations/DriversPage').then(m => ({ default: m.DriversPage })));
export const VehiclesPage = lazy(() => import('../pages/operations/VehiclesPage').then(m => ({ default: m.VehiclesPage })));
export const EmployeesPage = lazy(() => import('../pages/operations/EmployeesPage').then(m => ({ default: m.EmployeesPage })));
export const AttendancePage = lazy(() => import('../pages/operations/AttendancePage').then(m => ({ default: m.AttendancePage })));
export const PayrollPage = lazy(() => import('../pages/operations/PayrollPage').then(m => ({ default: m.PayrollPage })));
export const CommissionsPage = lazy(() => import('../pages/hr/CommissionsPage').then(m => ({ default: m.CommissionsPage })));
export const LeavePage = lazy(() => import('../pages/hr/LeavePage').then(m => ({ default: m.LeavePage })));
export const EmployeeContractsPage = lazy(() => import('../pages/hr/EmployeeContractsPage').then(m => ({ default: m.EmployeeContractsPage })));
export const EmployeeDocumentsPage = lazy(() => import('../pages/hr/EmployeeDocumentsPage').then(m => ({ default: m.EmployeeDocumentsPage })));
export const ManufacturingPage = lazy(() => import('../pages/manufacturing/ManufacturingPage').then(m => ({ default: m.ManufacturingPage })));
export const HrDashboardPage = lazy(() => import('../pages/hr/HrDashboardPage').then(m => ({ default: m.HrDashboardPage })));

// CRM & Customers
export const CustomersView = lazy(() => import('../components/CustomersView').then(m => ({ default: m.CustomersView })));
export const CustomerDetailPage = lazy(() => import('../pages/customers/CustomerDetailPage').then(m => ({ default: m.CustomerDetailPage })));
export const CustomerImportedProductsPage = lazy(() => import('../pages/customers/CustomerImportedProductsPage').then(m => ({ default: m.CustomerImportedProductsPage })));
export const ReadyDeliveriesPage = lazy(() => import('../pages/customers/ReadyDeliveriesPage').then(m => ({ default: m.ReadyDeliveriesPage })));
export const CrmDashboardPage = lazy(() => import('../pages/crm/CrmDashboardPage').then(m => ({ default: m.CrmDashboardPage })));
export const LeadsPage = lazy(() => import('../pages/crm/LeadsPage').then(m => ({ default: m.LeadsPage })));
export const PipelinePage = lazy(() => import('../pages/crm/PipelinePage').then(m => ({ default: m.PipelinePage })));
export const CrmActivitiesPage = lazy(() => import('../pages/crm/CrmActivitiesPage').then(m => ({ default: m.CrmActivitiesPage })));
export const CampaignsPage = lazy(() => import('../pages/crm/CampaignsPage').then(m => ({ default: m.CampaignsPage })));

// Purchasing & Suppliers
export const SuppliersView = lazy(() => import('../components/SuppliersView').then(m => ({ default: m.SuppliersView })));
export const SupplierDetailPage = lazy(() => import('../pages/purchasing/SupplierDetailPage').then(m => ({ default: m.SupplierDetailPage })));
export const PurchasesView = lazy(() => import('../components/PurchasesView').then(m => ({ default: m.PurchasesView })));
export const PurchaseRequestsPage = lazy(() => import('../pages/purchasing/PurchaseRequestsPage').then(m => ({ default: m.PurchaseRequestsPage })));
export const SupplierQuotationsPage = lazy(() => import('../pages/purchasing/SupplierQuotationsPage').then(m => ({ default: m.SupplierQuotationsPage })));
export const PurchaseOrdersPage = lazy(() => import('../pages/purchasing/PurchaseOrdersPage').then(m => ({ default: m.PurchaseOrdersPage })));
export const GoodsReceiptsPage = lazy(() => import('../pages/purchasing/GoodsReceiptsPage').then(m => ({ default: m.GoodsReceiptsPage })));
export const IncomingProductsPage = lazy(() => import('../pages/purchasing/IncomingProductsPage').then(m => ({ default: m.IncomingProductsPage })));
export const PurchaseReturnsPage = lazy(() => import('../pages/purchasing/PurchaseReturnsPage').then(m => ({ default: m.PurchaseReturnsPage })));
export const SupplierClaimsPage = lazy(() => import('../pages/purchasing/SupplierClaimsPage').then(m => ({ default: m.SupplierClaimsPage })));
export const SupplierStatementPage = lazy(() => import('../pages/purchasing/SupplierStatementPage').then(m => ({ default: m.SupplierStatementPage })));

// Finance
export const CashierView = lazy(() => import('../components/CashierView').then(m => ({ default: m.CashierView })));
export const FinanceOverviewPage = lazy(() => import('../pages/finance/FinanceOverviewPage').then(m => ({ default: m.FinanceOverviewPage })));
export const OtherReceivablesPage = lazy(() => import('../pages/finance/OtherReceivablesPage').then(m => ({ default: m.OtherReceivablesPage })));
export const InstallmentsPage = lazy(() => import('../pages/finance/InstallmentsPage').then(m => ({ default: m.InstallmentsPage })));
export const ExpensesPage = lazy(() => import('../pages/finance/ExpensesPage').then(m => ({ default: m.ExpensesPage })));
export const ChartOfAccountsPage = lazy(() => import('../pages/finance/ChartOfAccountsPage').then(m => ({ default: m.ChartOfAccountsPage })));
export const JournalEntriesPage = lazy(() => import('../pages/finance/JournalEntriesPage').then(m => ({ default: m.JournalEntriesPage })));
export const ChequesPage = lazy(() => import('../pages/finance/ChequesPage').then(m => ({ default: m.ChequesPage })));
export const FiscalClosingPage = lazy(() => import('../pages/finance/FiscalClosingPage').then(m => ({ default: m.FiscalClosingPage })));
export const BankReconciliationPage = lazy(() => import('../pages/finance/BankReconciliationPage').then(m => ({ default: m.BankReconciliationPage })));
export const BudgetsCostCentersPage = lazy(() => import('../pages/finance/BudgetsCostCentersPage').then(m => ({ default: m.BudgetsCostCentersPage })));
export const CashFlowForecastPage = lazy(() => import('../pages/finance/CashFlowForecastPage').then(m => ({ default: m.CashFlowForecastPage })));
export const EPaymentSettlementPage = lazy(() => import('../pages/finance/EPaymentSettlementPage').then(m => ({ default: m.EPaymentSettlementPage })));
export const FixedAssetsPage = lazy(() => import('../pages/finance/FixedAssetsPage').then(m => ({ default: m.FixedAssetsPage })));

// Projects & Reports
export const ProjectsPage = lazy(() => import('../pages/projects/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
export const ProjectDetailPage = lazy(() => import('../pages/projects/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));
export const ReportsView = lazy(() => import('../components/ReportsView').then(m => ({ default: m.ReportsView })));
export const TaxReportPage = lazy(() => import('../pages/reports/TaxReportPage').then(m => ({ default: m.TaxReportPage })));
export const ProfitLossPage = lazy(() => import('../pages/reports/ProfitLossPage').then(m => ({ default: m.ProfitLossPage })));
export const FinancialStatementsPage = lazy(() => import('../pages/reports/FinancialStatementsPage').then(m => ({ default: m.FinancialStatementsPage })));
export const SalesReportsPage = lazy(() => import('../pages/reports/SalesReportsPage').then(m => ({ default: m.SalesReportsPage })));
export const PosReportsPage = lazy(() => import('../pages/reports/PosReportsPage').then(m => ({ default: m.PosReportsPage })));
export const PurchaseInventoryReportPage = lazy(() => import('../pages/reports/PurchaseInventoryReportPage').then(m => ({ default: m.PurchaseInventoryReportPage })));

// Approvals, Documents & Security
export const ApprovalsPage = lazy(() => import('../pages/approvals/ApprovalsPage').then(m => ({ default: m.ApprovalsPage })));
export const DocumentsPage = lazy(() => import('../pages/documents/DocumentsPage').then(m => ({ default: m.DocumentsPage })));
export const NotificationsView = lazy(() => import('../components/NotificationsView').then(m => ({ default: m.NotificationsView })));
export const AuditLogView = lazy(() => import('../components/AuditLogView').then(m => ({ default: m.AuditLogView })));
export const SecurityCenterPage = lazy(() => import('../pages/admin/SecurityCenterPage').then(m => ({ default: m.SecurityCenterPage })));
export const SyncConflictsPage = lazy(() => import('../pages/admin/SyncConflictsPage').then(m => ({ default: m.SyncConflictsPage })));
export const AdminPage = lazy(() => import('../pages/admin/AdminPage').then(m => ({ default: m.AdminPage })));
export const DataDeletionPage = lazy(() => import('../pages/admin/DataDeletionPage').then(m => ({ default: m.DataDeletionPage })));

// Settings & Fallback
export const DynamicDataPage = lazy(() => import('../pages/settings/DynamicDataPage').then(m => ({ default: m.DynamicDataPage })));
export const DataImportPage = lazy(() => import('../pages/settings/DataImportPage').then(m => ({ default: m.DataImportPage })));
export const SettingsView = lazy(() => import('../components/SettingsView').then(m => ({ default: m.SettingsView })));
export const UsersView = lazy(() => import('../components/UsersView').then(m => ({ default: m.UsersView })));
export const BackupPage = lazy(() => import('../pages/settings/BackupPage').then(m => ({ default: m.BackupPage })));
export const SystemHealthPage = lazy(() => import('../pages/settings/SystemHealthPage').then(m => ({ default: m.SystemHealthPage })));
export const NotFoundPage = lazy(() => import('../pages/common/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
