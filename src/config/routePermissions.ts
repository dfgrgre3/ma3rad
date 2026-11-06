/**
 * خريطة صلاحيات المسارات — مصدر واحد يغطي كل صفحة في التطبيق.
 *
 * كل عنصر يحدد صلاحية أو أكثر (`all` يجب توفرها كلها، `any` يكفي واحد منها).
 * تُدمج هذه القائمة مع صلاحيات عناصر القوائم في `NavigationService`، ويُختار
 * أطول مسار مطابق حتى تُحمى الصفحات الفرعية (مثل /products/:id) تلقائياً.
 */
export interface RoutePermissionRule {
  path: string;
  all?: string[];
  any?: string[];
}

export const DATA_IMPORT_ACCESS_PERMISSIONS = [
  'admin.data',
  'customers.create',
  'suppliers.create',
  'categories.create',
  'brands.create',
  'products.create',
  'employees.manage',
  'warehouses.manage',
];

export const ROUTE_PERMISSIONS: RoutePermissionRule[] = [
  // الرئيسية
  { path: '/dashboard', all: ['dashboard.view'] },
  { path: '/dashboard/executive', any: ['dashboard.executive.view', 'dashboard.view'] },
  { path: '/tools', all: ['dashboard.view'] },

  // العمليات اليومية
  { path: '/daily/sales', any: ['sales.view', 'sales.create'] },
  { path: '/daily/purchases', any: ['purchases.view', 'purchases.create'] },
  { path: '/daily/expenses', any: ['cashier.expense', 'finance.expenses.view'] },
  { path: '/daily/debts', any: ['finance.debts.view', 'finance.receivables.view'] },

  // المبيعات ونقطة البيع
  { path: '/pos', any: ['sales.pos.view', 'sales.create'] },
  { path: '/restaurant', any: ['restaurant.view', 'orders.view'] },
  { path: '/sales', all: ['sales.view'] },
  { path: '/sales/analytics', any: ['sales.analytics.view', 'sales.view'] },
  { path: '/sales/cycle', any: ['sales.cycle.view', 'sales.view'] },
  { path: '/sales/statement', all: ['customers.view', 'sales.view', 'finance.debts.view'] },
  { path: '/sales/orders-deposits', any: ['sales.orders_deposits.view', 'sales.reservations.view', 'sales.view'] },
  { path: '/sales/reservations', any: ['sales.reservations.view', 'sales.view'] },
  { path: '/sales/after-sales', any: ['sales.after_sales.view', 'sales.view'] },
  { path: '/quotations', all: ['quotations.view'] },
  { path: '/orders', all: ['orders.view'] },
  { path: '/returns', all: ['returns.view'] },

  // المنتجات والتسعير
  { path: '/products', all: ['products.view'] },
  { path: '/products/catalog', any: ['products.view', 'categories.view', 'brands.view'] },
  { path: '/products/attributes', any: ['products.attributes.view', 'products.view'] },
  { path: '/products/barcodes', any: ['products.barcodes.print', 'products.view'] },
  { path: '/categories', all: ['categories.view'] },
  { path: '/brands', all: ['brands.view'] },
  { path: '/pricing', all: ['pricing.view'] },
  { path: '/promotions', all: ['promotions.view'] },

  // المخزون
  { path: '/inventory', all: ['inventory.view'] },
  { path: '/inventory/hub', any: ['inventory.view', 'inventory.transfer', 'inventory.count', 'inventory.adjust'] },
  { path: '/inventory/warehouse-stock', any: ['inventory.warehouse_stock.view', 'inventory.view'] },
  { path: '/inventory/showroom-stock', any: ['inventory.showroom_stock.view', 'inventory.view'] },
  { path: '/inventory/ledger', any: ['inventory.ledger.view', 'inventory.view'] },
  { path: '/inventory/transfers', all: ['inventory.transfer'] },
  { path: '/inventory/counts', all: ['inventory.count'] },
  { path: '/inventory/valuation', any: ['inventory.valuation.view', 'inventory.view'] },
  { path: '/inventory/adjustments', all: ['inventory.adjust'] },
  { path: '/inventory/stock-reservations', any: ['inventory.reservations.view', 'inventory.view'] },
  { path: '/inventory/reservations', any: ['inventory.reservations.view', 'inventory.view'] },
  { path: '/inventory/reorder-planning', any: ['inventory.reorder.view', 'inventory.view'] },
  { path: '/inventory/locations', any: ['inventory.locations.view', 'inventory.view'] },
  { path: '/inventory/damage-quarantine', any: ['inventory.damage.view', 'inventory.adjust'] },
  { path: '/inventory/reconciliation', any: ['inventory.reconciliation.view', 'inventory.view'] },

  // الفروع والمخازن
  { path: '/branches', all: ['branches.view'] },
  { path: '/warehouses', all: ['warehouses.view'] },

  // علاقات العملاء
  { path: '/crm/hub', any: ['crm.view', 'crm.dashboard.view', 'customers.view'] },
  { path: '/crm/dashboard', any: ['crm.dashboard.view', 'crm.view'] },
  { path: '/crm/leads', any: ['crm.leads.view', 'crm.view'] },
  { path: '/crm/pipeline', any: ['crm.pipeline.view', 'crm.view'] },
  { path: '/crm/activities', any: ['crm.activities.view', 'crm.view'] },
  { path: '/crm/campaigns', any: ['crm.campaigns.view', 'crm.view'] },
  { path: '/crm', any: ['crm.view', 'customers.view'] },
  { path: '/partners', all: ['partners.view'] },
  { path: '/customers', all: ['customers.view'] },
  { path: '/customers/imported-products', all: ['sales.view'] },
  { path: '/customers/ready-deliveries', all: ['sales.view'] },

  // المشتريات
  { path: '/purchases', all: ['purchases.view'] },
  { path: '/purchases/requests', any: ['purchases.requests.view', 'purchases.view'] },
  { path: '/purchases/quotations', any: ['purchases.quotations.view', 'purchases.view'] },
  { path: '/purchases/orders', any: ['purchases.orders.view', 'purchases.view'] },
  { path: '/purchases/receipts', any: ['purchases.receipts.view', 'purchases.view'] },
  { path: '/purchases/incoming', any: ['purchases.incoming.view', 'purchases.view'] },
  { path: '/purchases/returns', all: ['purchases.return'] },
  { path: '/purchases/claims', any: ['purchases.claims.view', 'purchases.view'] },
  { path: '/purchases/statement', any: ['purchases.statement.view', 'finance.debts.view'] },
  { path: '/suppliers', all: ['suppliers.view'] },

  // المالية
  { path: '/cashboxes', all: ['cashier.view'] },
  { path: '/finance', all: ['finance.view'] },
  { path: '/finance/calendar', all: ['finance.view'] },
  { path: '/finance/receivables', any: ['finance.debts.view', 'finance.receivables.view', 'finance.installments.view', 'finance.installments.manage'] },
  { path: '/finance/debts', all: ['finance.debts.view'] },
  { path: '/finance/other-receivables', any: ['finance.view', 'finance.receivables.view'] },
  { path: '/finance/installments', all: ['finance.view'] },
  { path: '/finance/expenses', all: ['cashier.expense'] },
  { path: '/finance/accounts', any: ['finance.accounts.view', 'finance.view'] },
  { path: '/finance/journal', any: ['finance.journal.view', 'finance.view'] },
  { path: '/finance/cheques', any: ['finance.cheques.view', 'finance.view'] },
  { path: '/finance/fiscal-closing', any: ['finance.view', 'finance.close'] },
  { path: '/finance/bank-reconciliation', any: ['finance.bank_reconciliation.view', 'finance.view'] },
  { path: '/finance/budgets-cost-centers', any: ['finance.budgets.view', 'finance.view'] },
  { path: '/finance/cash-forecast', any: ['finance.cash_forecast.view', 'finance.view'] },
  { path: '/finance/epayment-settlements', any: ['finance.epayments.view', 'finance.view'] },
  { path: '/finance/assets', any: ['finance.assets.view', 'finance.view'] },

  // المشاريع والعمليات
  { path: '/projects', all: ['projects.view'] },
  { path: '/fleet/dashboard', any: ['operations.fleet.view', 'deliveries.view'] },
  { path: '/deliveries', all: ['deliveries.view'] },
  { path: '/drivers', all: ['drivers.view'] },
  { path: '/vehicles', all: ['vehicles.view'] },
  { path: '/employees', all: ['employees.view'] },
  { path: '/employees/attendance', any: ['employees.attendance.view', 'employees.view'] },
  { path: '/employees/payroll', all: ['employees.payroll.view'] },
  { path: '/employees/commissions', any: ['employees.commissions.view', 'employees.payroll.view'] },
  { path: '/employees/leave', all: ['hr.leave.view'] },
  { path: '/employees/contracts', all: ['hr.contracts.view'] },
  { path: '/employees/documents', all: ['hr.documents.view'] },
  { path: '/employees/recruitment', all: ['hr.recruitment.view'] },
  { path: '/manufacturing', all: ['manufacturing.view'] },
  { path: '/hr/dashboard', any: ['hr.dashboard.view', 'employees.view'] },

  // التقارير
  { path: '/reports', all: ['reports.view'] },
  { path: '/reports/category', all: ['reports.view'] },
  { path: '/reports/tax', all: ['reports.view'] },
  { path: '/reports/profit-loss', all: ['reports.view'] },
  { path: '/reports/statements', all: ['reports.view'] },
  { path: '/reports/sales', all: ['reports.view'] },
  { path: '/reports/pos', all: ['reports.view'] },
  { path: '/reports/purchases', all: ['reports.view'] },

  // الموافقات والمستندات والأمان
  { path: '/approvals', all: ['approvals.view'] },
  { path: '/documents', any: ['documents.view', 'contracts.view'] },
  { path: '/contracts', all: ['contracts.view'] },
  { path: '/notifications', all: ['notifications.view'] },
  { path: '/audit', all: ['audit.view'] },
  { path: '/security', any: ['security.view', 'sessions.view'] },
  { path: '/central-activation', all: ['admin.license.manage'] },
  { path: '/admin', any: ['admin.view', 'users.view', 'roles.view', 'roles.manage', 'admin.navigation', 'admin.data', 'audit.view', 'settings.view'] },
  { path: '/admin/sync-conflicts', all: ['admin.view'] },
  { path: '/admin/data-deletion', all: ['admin.data.delete'] },

  // الإعدادات والنظام
  { path: '/data-import/types', any: ['settings.dynamic_data.view', 'settings.view'] },
  { path: '/data-import', any: DATA_IMPORT_ACCESS_PERMISSIONS },
  { path: '/settings', any: ['settings.view', 'settings.backup'] },
  { path: '/settings/app-configuration', any: ['settings.app_config.view', 'settings.view'] },
  { path: '/settings/configuration-studio', any: ['settings.config_studio.view', 'settings.view'] },
  { path: '/users', all: ['users.view'] },
  { path: '/backup', all: ['settings.backup'] },
  { path: '/system-health', all: ['settings.health.view'] },
];
