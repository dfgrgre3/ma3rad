import type { PermissionDef } from '../types';

// ─── Business-domain permissions ─────────────────────────────────────────────
// Core catalog entries for day-to-day business modules: sales, purchasing,
// inventory, finance, HR and operations. Order is significant: it is preserved
// verbatim from the original single-file catalog.
export const BUSINESS_PERMISSIONS: PermissionDef[] = [
  // Dashboard
  { code: 'dashboard.view', name: 'عرض لوحة المعلومات', module: 'DASHBOARD' },

  // Products
  { code: 'products.view', name: 'عرض الأصناف', module: 'PRODUCTS' },
  { code: 'products.create', name: 'إضافة صنف', module: 'PRODUCTS' },
  { code: 'products.update', name: 'تعديل صنف', module: 'PRODUCTS' },
  { code: 'products.delete', name: 'حذف/تعطيل صنف', module: 'PRODUCTS' },
  { code: 'products.export', name: 'تصدير الأصناف', module: 'PRODUCTS' },
  { code: 'products.import', name: 'استيراد الأصناف', module: 'PRODUCTS' },

  // Categories
  { code: 'categories.view', name: 'عرض التصنيفات', module: 'CATEGORIES' },
  { code: 'categories.create', name: 'إضافة تصنيف', module: 'CATEGORIES' },
  { code: 'categories.update', name: 'تعديل تصنيف', module: 'CATEGORIES' },
  { code: 'categories.delete', name: 'حذف تصنيف', module: 'CATEGORIES' },

  // Brands
  { code: 'brands.view', name: 'عرض الماركات', module: 'BRANDS' },
  { code: 'brands.create', name: 'إضافة ماركة', module: 'BRANDS' },
  { code: 'brands.update', name: 'تعديل ماركة', module: 'BRANDS' },
  { code: 'brands.delete', name: 'حذف ماركة', module: 'BRANDS' },

  // Inventory
  { code: 'inventory.view', name: 'عرض المخزون', module: 'INVENTORY' },
  { code: 'inventory.adjust', name: 'تسوية المخزون', module: 'INVENTORY' },
  { code: 'inventory.adjustment.approve', name: 'اعتماد تسوية المخزون', module: 'INVENTORY' },
  { code: 'inventory.adjustment.post', name: 'ترحيل تسوية المخزون', module: 'INVENTORY' },
  { code: 'inventory.transfer', name: 'تحويل بين المخازن', module: 'INVENTORY' },
  { code: 'inventory.transfer.workflow.approve', name: 'اعتماد طلب التحويل المخزني', module: 'INVENTORY' },
  { code: 'inventory.transfer.execute', name: 'تنفيذ وإرسال التحويل المخزني', module: 'INVENTORY' },
  { code: 'inventory.transfer.receive', name: 'استلام التحويل المخزني', module: 'INVENTORY' },
  { code: 'inventory.count', name: 'جرد المخزون', module: 'INVENTORY' },
  { code: 'inventory.count.approve', name: 'اعتماد جرد المخزون', module: 'INVENTORY' },
  { code: 'inventory.export', name: 'تصدير بيانات المخزون', module: 'INVENTORY' },

  // Sales
  { code: 'sales.view', name: 'عرض المبيعات', module: 'SALES' },
  { code: 'sales.create', name: 'إنشاء فاتورة بيع', module: 'SALES' },
  { code: 'sales.discount', name: 'منح خصم استثنائي', module: 'SALES' },
  { code: 'sales.tax.override', name: 'تعديل نسبة الضريبة على الفاتورة', module: 'SALES' },
  { code: 'sales.credit', name: 'البيع الآجل', module: 'SALES' },
  { code: 'sales.refund', name: 'مرتجعات البيع', module: 'SALES' },
  { code: 'sales.approve', name: 'اعتماد أسعار/خصومات', module: 'SALES' },
  { code: 'sales.void', name: 'إلغاء فاتورة', module: 'SALES' },
  { code: 'sales.export', name: 'تصدير المبيعات', module: 'SALES' },

  // Quotations
  { code: 'quotations.view', name: 'عرض عروض الأسعار', module: 'QUOTATIONS' },
  { code: 'quotations.create', name: 'إنشاء عرض سعر', module: 'QUOTATIONS' },
  { code: 'quotations.update', name: 'تعديل عرض سعر', module: 'QUOTATIONS' },
  { code: 'quotations.delete', name: 'حذف عرض سعر', module: 'QUOTATIONS' },
  { code: 'quotations.approve', name: 'اعتماد عرض سعر', module: 'QUOTATIONS' },
  { code: 'quotations.export', name: 'تصدير عروض الأسعار', module: 'QUOTATIONS' },

  // Orders
  { code: 'orders.view', name: 'عرض الطلبات', module: 'ORDERS' },
  { code: 'orders.create', name: 'إنشاء طلب', module: 'ORDERS' },
  { code: 'orders.update', name: 'تعديل طلب', module: 'ORDERS' },
  { code: 'orders.delete', name: 'حذف طلب', module: 'ORDERS' },
  { code: 'orders.approve', name: 'اعتماد طلب', module: 'ORDERS' },
  { code: 'orders.export', name: 'تصدير الأوامر', module: 'ORDERS' },

  // Returns
  { code: 'returns.view', name: 'عرض المرتجعات', module: 'RETURNS' },
  { code: 'returns.create', name: 'إنشاء مرتجع', module: 'RETURNS' },
  { code: 'returns.approve', name: 'اعتماد مرتجع', module: 'RETURNS' },
  { code: 'returns.export', name: 'تصدير المرتجعات', module: 'RETURNS' },

  // Purchases
  { code: 'purchases.view', name: 'عرض المشتريات', module: 'PURCHASES' },
  { code: 'purchases.create', name: 'إدخال مشتريات وتوريد', module: 'PURCHASES' },
  { code: 'purchases.update', name: 'تعديل مشتريات', module: 'PURCHASES' },
  { code: 'purchases.delete', name: 'حذف مشتريات', module: 'PURCHASES' },
  { code: 'purchases.reject', name: 'رفض طلب شراء', module: 'PURCHASES' },
  { code: 'purchases.cancel_request', name: 'إلغاء طلب شراء', module: 'PURCHASES' },
  { code: 'purchases.return', name: 'مرتجعات الشراء', module: 'PURCHASES' },
  { code: 'purchases.approve', name: 'اعتماد طلبات الشراء', module: 'PURCHASES' },
  { code: 'purchases.export', name: 'تصدير المشتريات', module: 'PURCHASES' },

  // Customers
  { code: 'customers.view', name: 'عرض العملاء', module: 'CUSTOMERS' },
  { code: 'customers.create', name: 'إضافة عميل', module: 'CUSTOMERS' },
  { code: 'customers.update', name: 'تعديل عميل', module: 'CUSTOMERS' },
  { code: 'customers.delete', name: 'حذف عميل', module: 'CUSTOMERS' },
  { code: 'customers.payment', name: 'تحصيل من عميل', module: 'CUSTOMERS' },
  { code: 'customers.payment.reverse', name: 'عكس/حذف سند تحصيل', module: 'CUSTOMERS' },
  { code: 'customers.export', name: 'تصدير العملاء', module: 'CUSTOMERS' },

  // Suppliers
  { code: 'suppliers.view', name: 'عرض الموردين', module: 'SUPPLIERS' },
  { code: 'suppliers.create', name: 'إضافة مورد', module: 'SUPPLIERS' },
  { code: 'suppliers.update', name: 'تعديل مورد', module: 'SUPPLIERS' },
  { code: 'suppliers.delete', name: 'حذف مورد', module: 'SUPPLIERS' },
  { code: 'suppliers.payment', name: 'سداد لمورد', module: 'SUPPLIERS' },
  { code: 'suppliers.export', name: 'تصدير الموردين', module: 'SUPPLIERS' },

  // Business partners
  { code: 'partners.view', name: 'عرض الشركاء وكشوف حساباتهم', module: 'PARTNERS' },
  { code: 'partners.manage', name: 'إضافة وتعديل بيانات الشركاء ونسب الملكية', module: 'PARTNERS' },
  { code: 'partners.transactions', name: 'تسجيل مساهمات ومسحوبات ومصروفات الشركاء', module: 'PARTNERS' },
  { code: 'partners.profits.distribute', name: 'توزيع أرباح الشركاء', module: 'PARTNERS' },
  { code: 'partners.adjust', name: 'تسوية أرصدة الشركاء يدويًا', module: 'PARTNERS' },
  { code: 'partners.reverse', name: 'عكس حركات حسابات الشركاء', module: 'PARTNERS' },
  { code: 'partners.export', name: 'تصدير تقارير وأرصدة الشركاء', module: 'PARTNERS' },
  { code: 'partners.print', name: 'طباعة كشوف حساب الشركاء', module: 'PARTNERS' },

  // Cashier / treasury
  { code: 'cashier.view', name: 'عرض الخزينة', module: 'CASHIER' },
  { code: 'cashier.expense', name: 'إثبات مصروف', module: 'CASHIER' },
  { code: 'cashier.expense.update', name: 'تعديل مصروف مسجل', module: 'CASHIER' },
  { code: 'cashier.expense.delete', name: 'حذف مصروف مسجل', module: 'CASHIER' },
  { code: 'cashier.shift', name: 'فتح/إغلاق وردية', module: 'CASHIER' },
  { code: 'cashier.shift.open', name: 'فتح وردية', module: 'CASHIER' },
  { code: 'cashier.shift.close', name: 'إغلاق وردية', module: 'CASHIER' },
  { code: 'cashier.manage', name: 'إدارة الخزائن', module: 'CASHIER' },

  // Finance
  { code: 'finance.view', name: 'عرض التقارير المالية', module: 'FINANCE' },
  { code: 'finance.approve', name: 'اعتماد مالي', module: 'FINANCE' },
  { code: 'finance.close', name: 'إقفال المصالحات المالية', module: 'FINANCE' },
  { code: 'finance.reopen', name: 'إعادة فتح فترة مالية مقفلة', module: 'FINANCE' },
  { code: 'finance.debts.view', name: 'عرض الديون والذمم', module: 'FINANCE' },
  { code: 'finance.receivables.view', name: 'عرض المطالبات الأخرى', module: 'FINANCE' },
  { code: 'finance.receivables.create', name: 'إضافة مطالبة أخرى', module: 'FINANCE' },
  { code: 'finance.receivables.update', name: 'تعديل مطالبة أخرى', module: 'FINANCE' },
  { code: 'finance.receivables.delete', name: 'إلغاء مطالبة أخرى', module: 'FINANCE' },
  { code: 'finance.receivables.export', name: 'تصدير المطالبات الأخرى', module: 'FINANCE' },
  { code: 'finance.installments.view', name: 'عرض الأقساط', module: 'FINANCE' },
  { code: 'finance.installments.manage', name: 'إدارة الأقساط', module: 'FINANCE' },
  { code: 'finance.export', name: 'تصدير التقارير المالية', module: 'FINANCE' },

  // Reports
  { code: 'reports.view', name: 'عرض التقارير', module: 'REPORTS' },
  { code: 'reports.export', name: 'تصدير التقارير', module: 'REPORTS' },

  // CRM
  { code: 'crm.view', name: 'عرض العملاء المحتملين', module: 'CRM' },
  { code: 'crm.create', name: 'إضافة عميل محتمل', module: 'CRM' },
  { code: 'crm.update', name: 'تعديل ومتابعة العملاء المحتملين', module: 'CRM' },
  { code: 'crm.delete', name: 'حذف عميل محتمل', module: 'CRM' },

  // Manufacturing
  { code: 'manufacturing.view', name: 'عرض التصنيع وأوامر الإنتاج', module: 'MANUFACTURING' },
  { code: 'manufacturing.manage', name: 'إدارة BOM وأوامر الإنتاج', module: 'MANUFACTURING' },

  // Projects
  { code: 'projects.view', name: 'عرض المشاريع', module: 'PROJECTS' },
  { code: 'projects.create', name: 'إضافة مشروع', module: 'PROJECTS' },
  { code: 'projects.update', name: 'تعديل مشروع', module: 'PROJECTS' },
  { code: 'projects.delete', name: 'حذف مشروع', module: 'PROJECTS' },
  { code: 'projects.approve', name: 'اعتماد طلبات تغيير المشروع', module: 'PROJECTS' },

  // Pricing & promotions
  { code: 'pricing.view', name: 'عرض قوائم الأسعار والعروض', module: 'PRICING' },
  { code: 'pricing.update', name: 'إدارة قوائم الأسعار والعروض', module: 'PRICING' },
  { code: 'promotions.view', name: 'عرض العروض والخصومات', module: 'PROMOTIONS' },
  { code: 'promotions.manage', name: 'إدارة العروض والخصومات', module: 'PROMOTIONS' },

  // Operations (branches, warehouses, HR, fleet)
  { code: 'operations.view', name: 'عرض العمليات والفروع', module: 'OPERATIONS' },
  { code: 'operations.update', name: 'إدارة العمليات والفروع', module: 'OPERATIONS' },
  { code: 'branches.view', name: 'عرض الفروع', module: 'BRANCHES' },
  { code: 'branches.manage', name: 'إدارة الفروع', module: 'BRANCHES' },
  { code: 'warehouses.view', name: 'عرض المخازن', module: 'WAREHOUSES' },
  { code: 'warehouses.manage', name: 'إدارة المخازن', module: 'WAREHOUSES' },
  { code: 'employees.view', name: 'عرض الموظفين', module: 'EMPLOYEES' },
  { code: 'employees.profile.view', name: 'عرض بيانات الملف الشخصي الحساسة', module: 'EMPLOYEES' },
  { code: 'employees.create', name: 'إضافة موظفين', module: 'EMPLOYEES' },
  { code: 'employees.update', name: 'تعديل ملفات الموظفين', module: 'EMPLOYEES' },
  { code: 'employees.terminate', name: 'إنهاء الخدمة وأرشفة الموظفين', module: 'EMPLOYEES' },
  { code: 'employees.export', name: 'تصدير بيانات الموظفين', module: 'EMPLOYEES' },
  { code: 'employees.manage', name: 'إدارة الموظفين والرواتب', module: 'EMPLOYEES' },
  { code: 'employees.payroll.view', name: 'عرض بيانات الرواتب والعمولات', module: 'EMPLOYEES' },
  { code: 'employees.financials.view', name: 'عرض التفاصيل المالية للموظفين', module: 'EMPLOYEES' },
  { code: 'employees.payroll.manage', name: 'إدارة الرواتب والعمولات', module: 'EMPLOYEES' },
  { code: 'employees.payroll.approve', name: 'اعتماد وصرف الرواتب', module: 'EMPLOYEES' },
  { code: 'deliveries.view', name: 'عرض التوصيل', module: 'DELIVERIES' },
  { code: 'deliveries.manage', name: 'إدارة التوصيل', module: 'DELIVERIES' },
  { code: 'drivers.view', name: 'عرض السائقين', module: 'DRIVERS' },
  { code: 'drivers.manage', name: 'إدارة السائقين', module: 'DRIVERS' },
  { code: 'vehicles.view', name: 'عرض المركبات', module: 'VEHICLES' },
  { code: 'vehicles.manage', name: 'إدارة المركبات', module: 'VEHICLES' },
];
