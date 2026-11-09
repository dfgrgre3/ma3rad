import { lazy } from 'react';

// Purchasing & Suppliers
export const SuppliersView = lazy(() => import('../components/suppliers/SuppliersView').then(m => ({ default: m.SuppliersView })));

export const SupplierDetailPage = lazy(() => import('../pages/purchasing/supplier-detail/SupplierDetailPage').then(m => ({ default: m.SupplierDetailPage })));

export const PurchasesView = lazy(() => import('../components/purchases/PurchasesView').then(m => ({ default: m.PurchasesView })));

export const PurchaseRequestsPage = lazy(() => import('../pages/purchasing/purchase-requests/PurchaseRequestsPage').then(m => ({ default: m.PurchaseRequestsPage })));

export const SupplierQuotationsPage = lazy(() => import('../pages/purchasing/supplier-quotations/SupplierQuotationsPage').then(m => ({ default: m.SupplierQuotationsPage })));

export const PurchaseOrdersPage = lazy(() => import('../pages/purchasing/purchase-orders/PurchaseOrdersPage').then(m => ({ default: m.PurchaseOrdersPage })));

export const GoodsReceiptsPage = lazy(() => import('../pages/purchasing/goods-receipts/GoodsReceiptsPage').then(m => ({ default: m.GoodsReceiptsPage })));

export const IncomingProductsPage = lazy(() => import('../pages/purchasing/incoming-products/IncomingProductsPage').then(m => ({ default: m.IncomingProductsPage })));

export const PurchaseReturnsPage = lazy(() => import('../pages/purchasing/purchase-returns/PurchaseReturnsPage').then(m => ({ default: m.PurchaseReturnsPage })));

export const SupplierClaimsPage = lazy(() => import('../pages/purchasing/supplier-claims/SupplierClaimsPage').then(m => ({ default: m.SupplierClaimsPage })));

export const SupplierStatementPage = lazy(() => import('../pages/purchasing/supplier-statement/SupplierStatementPage').then(m => ({ default: m.SupplierStatementPage })));

// Finance
export const CashierView = lazy(() => import('../components/treasury/CashierView').then(m => ({ default: m.CashierView })));

export const FinanceOverviewPage = lazy(() => import('../pages/finance/finance-overview/FinanceOverviewPage').then(m => ({ default: m.FinanceOverviewPage })));

export const FinancialCalendarPage = lazy(() => import('../pages/finance/financial-calendar/FinancialCalendarPage').then(m => ({ default: m.FinancialCalendarPage })));

export const ReceivablesHubPage = lazy(() => import('../pages/finance/receivables-hub/ReceivablesHubPage').then(m => ({ default: m.ReceivablesHubPage })));

export const OtherReceivablesPage = lazy(() => import('../pages/finance/other-receivables/OtherReceivablesPage').then(m => ({ default: m.OtherReceivablesPage })));

export const DebtsDashboardPage = lazy(() => import('../pages/finance/debts-dashboard/DebtsDashboardPage').then(m => ({ default: m.DebtsDashboardPage })));

export const InstallmentsPage = lazy(() => import('../pages/finance/installments/InstallmentsPage').then(m => ({ default: m.InstallmentsPage })));

export const ExpensesPage = lazy(() => import('../pages/finance/expenses/ExpensesPage').then(m => ({ default: m.ExpensesPage })));

export const ChartOfAccountsPage = lazy(() => import('../pages/finance/chart-of-accounts/ChartOfAccountsPage').then(m => ({ default: m.ChartOfAccountsPage })));

export const JournalEntriesPage = lazy(() => import('../pages/finance/journal-entries/JournalEntriesPage').then(m => ({ default: m.JournalEntriesPage })));

export const ChequesPage = lazy(() => import('../pages/finance/cheques/ChequesPage').then(m => ({ default: m.ChequesPage })));

export const FiscalClosingPage = lazy(() => import('../pages/finance/fiscal-closing/FiscalClosingPage').then(m => ({ default: m.FiscalClosingPage })));

export const BankReconciliationPage = lazy(() => import('../pages/finance/bank-reconciliation/BankReconciliationPage').then(m => ({ default: m.BankReconciliationPage })));

export const BudgetsCostCentersPage = lazy(() => import('../pages/finance/budgets-cost-centers/BudgetsCostCentersPage').then(m => ({ default: m.BudgetsCostCentersPage })));

export const CashFlowForecastPage = lazy(() => import('../pages/finance/cash-flow-forecast/CashFlowForecastPage').then(m => ({ default: m.CashFlowForecastPage })));

export const EPaymentSettlementPage = lazy(() => import('../pages/finance/e-payment-settlement/EPaymentSettlementPage').then(m => ({ default: m.EPaymentSettlementPage })));

export const FixedAssetsPage = lazy(() => import('../pages/finance/fixed-assets/FixedAssetsPage').then(m => ({ default: m.FixedAssetsPage })));

// Projects & Reports
export const ProjectsPage = lazy(() => import('../pages/projects/projects/ProjectsPage').then(m => ({ default: m.ProjectsPage })));

export const ProjectDetailPage = lazy(() => import('../pages/projects/project-detail/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));

export const ReportsView = lazy(() => import('../components/reports/ReportsView').then(m => ({ default: m.ReportsView })));

export const ReportsHubPage = lazy(() => import('../pages/reports/reports-hub/ReportsHubPage').then(m => ({ default: m.ReportsHubPage })));

export const TaxReportPage = lazy(() => import('../pages/reports/tax-report/TaxReportPage').then(m => ({ default: m.TaxReportPage })));

export const ProfitLossPage = lazy(() => import('../pages/reports/profit-loss/ProfitLossPage').then(m => ({ default: m.ProfitLossPage })));
