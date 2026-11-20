import { lazy } from 'react';
import { moduleLazy } from '../modules/moduleLazy';

// Dashboard & Tools
export const DashboardView = lazy(() => import('../components/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));

export const ExecutiveDashboard = lazy(() => import('../pages/dashboard/executive/ExecutiveDashboard').then(m => ({ default: m.ExecutiveDashboard })));

// Sales & POS
export const PosView = moduleLazy('sales', () => import('../pages/sales/pos/PosPage').then(m => ({ default: m.PosView })));

export const RestaurantPage = moduleLazy('sales', () => import('../pages/restaurant/restaurant/RestaurantPage').then(m => ({ default: m.RestaurantPage })));

export const SalesView = moduleLazy('sales', () => import('../components/sales/SalesView').then(m => ({ default: m.SalesView })));

export const SalesAnalyticsPage = moduleLazy('sales', () => import('../pages/sales/sales-analytics/SalesAnalyticsPage').then(m => ({ default: m.SalesAnalyticsPage })));

export const SalesHubPage = moduleLazy('sales', () => import('../pages/sales/sales-hub/SalesHubPage').then(m => ({ default: m.SalesHubPage })));

export const InvoiceCyclePage = moduleLazy('sales', () => import('../pages/sales/invoice-cycle/InvoiceCyclePage').then(m => ({ default: m.InvoiceCyclePage })));

export const CustomerStatementPage = moduleLazy('sales', () => import('../pages/sales/customer-statement/CustomerStatementPage').then(m => ({ default: m.CustomerStatementPage })));

export const SalesOrdersDepositsPage = moduleLazy('sales', () => import('../pages/sales/sales-orders-deposits/SalesOrdersDepositsPage').then(m => ({ default: m.SalesOrdersDepositsPage })));

export const AfterSalesPage = moduleLazy('sales', () => import('../pages/sales/after-sales/AfterSalesPage').then(m => ({ default: m.AfterSalesPage })));

export const QuotationsPage = moduleLazy('sales', () => import('../pages/sales/quotations/QuotationsPage').then(m => ({ default: m.QuotationsPage })));

export const OrdersPage = moduleLazy('sales', () => import('../pages/sales/orders/OrdersPage').then(m => ({ default: m.OrdersPage })));

export const ReturnsPage = moduleLazy('sales', () => import('../pages/sales/returns/ReturnsPage').then(m => ({ default: m.ReturnsPage })));

// Daily Operations
export const TodaySalesPage = moduleLazy('sales', () => import('../pages/daily/daily/DailyPage').then(m => ({ default: m.TodaySalesPage })));

export const TodayPurchasesPage = moduleLazy('purchasing', () => import('../pages/daily/daily/DailyPage').then(m => ({ default: m.TodayPurchasesPage })));

export const TodayExpensesPage = moduleLazy('finance', () => import('../pages/finance/expenses/ExpensesPage').then(m => ({ default: m.TodayExpensesPage })));

export const TodayDebtsPage = moduleLazy('finance', () => import('../pages/daily/daily/DailyPage').then(m => ({ default: m.TodayDebtsPage })));

// Products & Pricing
export const ProductsView = moduleLazy('inventory', () => import('../components/products/ProductsView').then(m => ({ default: m.ProductsView })));

export const ProductCatalogHubPage = moduleLazy('inventory', () => import('../pages/products/product-catalog-hub/ProductCatalogHubPage').then(m => ({ default: m.ProductCatalogHubPage })));

export const ProductDetailPage = moduleLazy('inventory', () => import('../pages/products/product-detail/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })));

export const ProductAttributesPage = moduleLazy('inventory', () => import('../pages/products/product-attributes/ProductAttributesPage').then(m => ({ default: m.ProductAttributesPage })));

export const BarcodesPrintPage = moduleLazy('inventory', () => import('../pages/products/barcodes-print/BarcodesPrintPage').then(m => ({ default: m.BarcodesPrintPage })));

export const CategoriesView = moduleLazy('inventory', () => import('../components/products/CategoriesView').then(m => ({ default: m.CategoriesView })));

export const BrandsView = moduleLazy('inventory', () => import('../components/products/BrandsView').then(m => ({ default: m.BrandsView })));

export const PricingPage = moduleLazy('inventory', () => import('../pages/pricing/pricing/PricingPage').then(m => ({ default: m.PricingPage })));

export const PromotionsPage = moduleLazy('inventory', () => import('../pages/pricing/promotions/PromotionsPage').then(m => ({ default: m.PromotionsPage })));

// Inventory
export const InventoryView = moduleLazy('inventory', () => import('../components/inventory/InventoryView').then(m => ({ default: m.InventoryView })));

export const InventoryHubPage = moduleLazy('inventory', () => import('../pages/inventory/inventory-hub/InventoryHubPage').then(m => ({ default: m.InventoryHubPage })));

export const LocationStockPage = moduleLazy('inventory', () => import('../pages/inventory/location-stock/LocationStockPage').then(m => ({ default: m.LocationStockPage })));

export const StockLedgerPage = moduleLazy('inventory', () => import('../pages/inventory/stock-ledger/StockLedgerPage').then(m => ({ default: m.StockLedgerPage })));

export const StockTransfersView = moduleLazy('inventory', () => import('../pages/inventory/stock-transfers/StockTransfersPage').then(m => ({ default: m.StockTransfersPage })));

export const InventoryCountPage = moduleLazy('inventory', () => import('../pages/inventory/inventory-count/InventoryCountPage').then(m => ({ default: m.InventoryCountPage })));
