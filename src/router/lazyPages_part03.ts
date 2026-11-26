import { moduleLazy } from '../modules/moduleLazy';

// Purchasing & Suppliers
export const SuppliersView = moduleLazy('purchasing', () => import('../components/suppliers/SuppliersView').then(m => ({ default: m.SuppliersView })));

export const SupplierDetailPage = moduleLazy('purchasing', () => import('../pages/purchasing/supplier-detail/SupplierDetailPage').then(m => ({ default: m.SupplierDetailPage })));

export const PurchasingHubPage = moduleLazy('purchasing', () => import('../pages/purchasing/purchasing-hub/PurchasingHubPage').then(m => ({ default: m.PurchasingHubPage })));

export const PurchasesView = moduleLazy('purchasing', () => import('../components/purchases/PurchasesView').then(m => ({ default: m.PurchasesView })));

export const PurchaseRequestsPage = moduleLazy('purchasing', () => import('../pages/purchasing/purchase-requests/PurchaseRequestsPage').then(m => ({ default: m.PurchaseRequestsPage })));

export const SupplierQuotationsPage = moduleLazy('purchasing', () => import('../pages/purchasing/supplier-quotations/SupplierQuotationsPage').then(m => ({ default: m.SupplierQuotationsPage })));

export const PurchaseOrdersPage = moduleLazy('purchasing', () => import('../pages/purchasing/purchase-orders/PurchaseOrdersPage').then(m => ({ default: m.PurchaseOrdersPage })));

export const GoodsReceiptsPage = moduleLazy('purchasing', () => import('../pages/purchasing/goods-receipts/GoodsReceiptsPage').then(m => ({ default: m.GoodsReceiptsPage })));

export const IncomingProductsPage = moduleLazy('purchasing', () => import('../pages/purchasing/incoming-products/IncomingProductsPage').then(m => ({ default: m.IncomingProductsPage })));

export const PurchaseReturnsPage = moduleLazy('purchasing', () => import('../pages/purchasing/purchase-returns/PurchaseReturnsPage').then(m => ({ default: m.PurchaseReturnsPage })));

export const SupplierClaimsPage = moduleLazy('purchasing', () => import('../pages/purchasing/supplier-claims/SupplierClaimsPage').then(m => ({ default: m.SupplierClaimsPage })));

export const SupplierStatementPage = moduleLazy('purchasing', () => import('../pages/purchasing/supplier-statement/SupplierStatementPage').then(m => ({ default: m.SupplierStatementPage })));

// Finance
export const CashierView = moduleLazy('finance', () => import('../components/treasury/CashierView').then(m => ({ default: m.CashierView })));

export const FinanceOverviewPage = moduleLazy('finance', () => import('../pages/finance/finance-overview/FinanceOverviewPage').then(m => ({ default: m.FinanceOverviewPage })));

export const FinancialCalendarPage = moduleLazy('finance', () => import('../pages/finance/financial-calendar/FinancialCalendarPage').then(m => ({ default: m.FinancialCalendarPage })));

export const ReceivablesHubPage = moduleLazy('finance', () => import('../pages/finance/receivables-hub/ReceivablesHubPage').then(m => ({ default: m.ReceivablesHubPage })));

export const OtherReceivablesPage = moduleLazy('finance', () => import('../pages/finance/other-receivables/OtherReceivablesPage').then(m => ({ default: m.OtherReceivablesPage })));

export const DebtsDashboardPage = moduleLazy('finance', () => import('../pages/finance/debts-dashboard/DebtsDashboardPage').then(m => ({ default: m.DebtsDashboardPage })));

export const InstallmentsPage = moduleLazy('finance', () => import('../pages/finance/installments/InstallmentsPage').then(m => ({ default: m.InstallmentsPage })));

export const ExpensesPage = moduleLazy('finance', () => import('../pages/finance/expenses/ExpensesPage').then(m => ({ default: m.ExpensesPage })));

export const ChartOfAccountsPage = moduleLazy('finance', () => import('../pages/finance/chart-of-accounts/ChartOfAccountsPage').then(m => ({ default: m.ChartOfAccountsPage })));

export const JournalEntriesPage = moduleLazy('finance', () => import('../pages/finance/journal-entries/JournalEntriesPage').then(m => ({ default: m.JournalEntriesPage })));

export const ChequesPage = moduleLazy('finance', () => import('../pages/finance/cheques/ChequesPage').then(m => ({ default: m.ChequesPage })));

export const FiscalClosingPage = moduleLazy('finance', () => import('../pages/finance/fiscal-closing/FiscalClosingPage').then(m => ({ default: m.FiscalClosingPage })));

export const BankReconciliationPage = moduleLazy('finance', () => import('../pages/finance/bank-reconciliation/BankReconciliationPage').then(m => ({ default: m.BankReconciliationPage })));

export const ConsistencyAuditPage = moduleLazy('finance', () => import('../pages/finance/consistency-audit/ConsistencyAuditPage').then(m => ({ default: m.ConsistencyAuditPage })));

export const BudgetsCostCentersPage = moduleLazy('finance', () => import('../pages/finance/budgets-cost-centers/BudgetsCostCentersPage').then(m => ({ default: m.BudgetsCostCentersPage })));

export const CashFlowForecastPage = moduleLazy('finance', () => import('../pages/finance/cash-flow-forecast/CashFlowForecastPage').then(m => ({ default: m.CashFlowForecastPage })));

export const EPaymentSettlementPage = moduleLazy('finance', () => import('../pages/finance/e-payment-settlement/EPaymentSettlementPage').then(m => ({ default: m.EPaymentSettlementPage })));

export const FixedAssetsPage = moduleLazy('finance', () => import('../pages/finance/fixed-assets/FixedAssetsPage').then(m => ({ default: m.FixedAssetsPage })));

// Projects & Reports
export const ProjectsPage = moduleLazy('projects', () => import('../pages/projects/projects/ProjectsPage').then(m => ({ default: m.ProjectsPage })));

export const ProjectDetailPage = moduleLazy('projects', () => import('../pages/projects/project-detail/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));


export const ReportsView = moduleLazy('reports', () => import('../components/reports/ReportsView').then(m => ({ default: m.ReportsView })));

export const ReportsHubPage = moduleLazy('reports', () => import('../pages/reports/reports-hub/ReportsHubPage').then(m => ({ default: m.ReportsHubPage })));

export const TaxReportPage = moduleLazy('reports', () => import('../pages/reports/tax-report/TaxReportPage').then(m => ({ default: m.TaxReportPage })));

export const ProfitLossPage = moduleLazy('reports', () => import('../pages/reports/profit-loss/ProfitLossPage').then(m => ({ default: m.ProfitLossPage })));
