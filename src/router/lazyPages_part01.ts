import { lazy } from 'react';

// Dashboard & Tools
export const DashboardView = lazy(() => import('../components/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));

export const ExecutiveDashboard = lazy(() => import('../pages/dashboard/executive/ExecutiveDashboard').then(m => ({ default: m.ExecutiveDashboard })));

// Sales & POS
export const PosView = lazy(() => import('../components/pos/PosView').then(m => ({ default: m.PosView })));

export const RestaurantPage = lazy(() => import('../pages/restaurant/restaurant/RestaurantPage').then(m => ({ default: m.RestaurantPage })));

export const SalesView = lazy(() => import('../components/sales/SalesView').then(m => ({ default: m.SalesView })));

export const SalesAnalyticsPage = lazy(() => import('../pages/sales/sales-analytics/SalesAnalyticsPage').then(m => ({ default: m.SalesAnalyticsPage })));

export const SalesHubPage = lazy(() => import('../pages/sales/sales-hub/SalesHubPage').then(m => ({ default: m.SalesHubPage })));

export const InvoiceCyclePage = lazy(() => import('../pages/sales/invoice-cycle/InvoiceCyclePage').then(m => ({ default: m.InvoiceCyclePage })));

export const CustomerStatementPage = lazy(() => import('../pages/sales/customer-statement/CustomerStatementPage').then(m => ({ default: m.CustomerStatementPage })));

export const SalesOrdersDepositsPage = lazy(() => import('../pages/sales/sales-orders-deposits/SalesOrdersDepositsPage').then(m => ({ default: m.SalesOrdersDepositsPage })));

export const AfterSalesPage = lazy(() => import('../pages/sales/after-sales/AfterSalesPage').then(m => ({ default: m.AfterSalesPage })));

export const QuotationsPage = lazy(() => import('../pages/sales/quotations/QuotationsPage').then(m => ({ default: m.QuotationsPage })));

export const OrdersPage = lazy(() => import('../pages/sales/orders/OrdersPage').then(m => ({ default: m.OrdersPage })));

export const ReturnsPage = lazy(() => import('../pages/sales/returns/ReturnsPage').then(m => ({ default: m.ReturnsPage })));

// Daily Operations
export const TodaySalesPage = lazy(() => import('../pages/daily/daily/DailyPage').then(m => ({ default: m.TodaySalesPage })));

export const TodayPurchasesPage = lazy(() => import('../pages/daily/daily/DailyPage').then(m => ({ default: m.TodayPurchasesPage })));

export const TodayExpensesPage = lazy(() => import('../pages/finance/expenses/ExpensesPage').then(m => ({ default: m.TodayExpensesPage })));

export const TodayDebtsPage = lazy(() => import('../pages/daily/daily/DailyPage').then(m => ({ default: m.TodayDebtsPage })));

// Products & Pricing
export const ProductsView = lazy(() => import('../components/products/ProductsView').then(m => ({ default: m.ProductsView })));

export const ProductCatalogHubPage = lazy(() => import('../pages/products/product-catalog-hub/ProductCatalogHubPage').then(m => ({ default: m.ProductCatalogHubPage })));

export const ProductDetailPage = lazy(() => import('../pages/products/product-detail/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })));

export const ProductAttributesPage = lazy(() => import('../pages/products/product-attributes/ProductAttributesPage').then(m => ({ default: m.ProductAttributesPage })));

export const BarcodesPrintPage = lazy(() => import('../pages/products/barcodes-print/BarcodesPrintPage').then(m => ({ default: m.BarcodesPrintPage })));

export const CategoriesView = lazy(() => import('../components/products/CategoriesView').then(m => ({ default: m.CategoriesView })));

export const BrandsView = lazy(() => import('../components/products/BrandsView').then(m => ({ default: m.BrandsView })));

export const PricingPage = lazy(() => import('../pages/pricing/pricing/PricingPage').then(m => ({ default: m.PricingPage })));

export const PromotionsPage = lazy(() => import('../pages/pricing/promotions/PromotionsPage').then(m => ({ default: m.PromotionsPage })));

// Inventory
export const InventoryView = lazy(() => import('../components/inventory/InventoryView').then(m => ({ default: m.InventoryView })));

export const InventoryHubPage = lazy(() => import('../pages/inventory/inventory-hub/InventoryHubPage').then(m => ({ default: m.InventoryHubPage })));

export const LocationStockPage = lazy(() => import('../pages/inventory/location-stock/LocationStockPage').then(m => ({ default: m.LocationStockPage })));

export const StockLedgerPage = lazy(() => import('../pages/inventory/stock-ledger/StockLedgerPage').then(m => ({ default: m.StockLedgerPage })));

export const StockTransfersView = lazy(() => import('../components/inventory/stock-transfers/StockTransfersView').then(m => ({ default: m.StockTransfersView })));

export const InventoryCountPage = lazy(() => import('../pages/inventory/inventory-count/InventoryCountPage').then(m => ({ default: m.InventoryCountPage })));
