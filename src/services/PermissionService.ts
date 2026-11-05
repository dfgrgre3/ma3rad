import { DatabaseManager } from '../database/db';
import { AuditService } from './AuditService';
import { CentralFeaturePermissionService } from './CentralFeaturePermissionService';
import type { Role, User } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface PermissionDef {
  code: string;
  name: string;
  module: string;
}

export type PermissionEffect = 'GRANT' | 'DENY';

/** Alphabetical comparator backed by String.localeCompare for deterministic text sorts. */
const compareAlphabetically = (a: string, b: string) => a.localeCompare(b, 'ar');

// ─── Permission catalog ───────────────────────────────────────────────────────
// Every actionable capability in the app lives here. UI guards, route guards
// and service-layer enforcement all resolve against these codes.
export const PERMISSIONS: PermissionDef[] = [
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
  { code: 'inventory.transfer', name: 'تحويل بين المخازن', module: 'INVENTORY' },
  { code: 'inventory.count', name: 'جرد المخزون', module: 'INVENTORY' },
  { code: 'inventory.count.approve', name: 'اعتماد جرد المخزون', module: 'INVENTORY' },
  { code: 'inventory.export', name: 'تصدير بيانات المخزون', module: 'INVENTORY' },

  // Sales
  { code: 'sales.view', name: 'عرض المبيعات', module: 'SALES' },
  { code: 'sales.create', name: 'إنشاء فاتورة بيع', module: 'SALES' },
  { code: 'sales.discount', name: 'منح خصم استثنائي', module: 'SALES' },
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

  // Approvals
  { code: 'approvals.view', name: 'عرض صندوق الموافقات', module: 'APPROVALS' },
  { code: 'approvals.create', name: 'إنشاء طلب اعتماد', module: 'APPROVALS' },
  { code: 'approvals.approve', name: 'اعتماد الطلبات', module: 'APPROVALS' },
  { code: 'approvals.reject', name: 'رفض الطلبات', module: 'APPROVALS' },
  { code: 'approvals.cancel', name: 'إلغاء طلب اعتماد', module: 'APPROVALS' },

  // Notifications
  { code: 'notifications.view', name: 'عرض الإشعارات', module: 'NOTIFICATIONS' },
  { code: 'notifications.manage', name: 'إدارة الإشعارات', module: 'NOTIFICATIONS' },

  // Users & security
  { code: 'users.view', name: 'عرض المستخدمين', module: 'USERS' },
  { code: 'users.create', name: 'إضافة مستخدم', module: 'USERS' },
  { code: 'users.update', name: 'تعديل مستخدم', module: 'USERS' },
  { code: 'users.delete', name: 'حذف/تعطيل مستخدم', module: 'USERS' },
  { code: 'users.reset_password', name: 'إعادة تعيين كلمة المرور', module: 'USERS' },
  { code: 'users.permissions', name: 'إدارة صلاحيات المستخدمين', module: 'USERS' },
  { code: 'roles.manage', name: 'إدارة الأدوار', module: 'ROLES' },
  { code: 'sessions.view', name: 'عرض الجلسات وسجل الدخول', module: 'SESSIONS' },
  { code: 'sessions.manage', name: 'إدارة الجلسات', module: 'SESSIONS' },

  // Settings & system
  { code: 'settings.view', name: 'عرض الإعدادات', module: 'SETTINGS' },
  { code: 'settings.update', name: 'تعديل الإعدادات', module: 'SETTINGS' },
  { code: 'settings.backup', name: 'النسخ الاحتياطي والاستعادة', module: 'SETTINGS' },
  { code: 'settings.maintenance', name: 'صيانة قاعدة البيانات', module: 'SETTINGS' },
  { code: 'audit.view', name: 'عرض سجل التدقيق', module: 'AUDIT' },
  { code: 'audit.export', name: 'تصدير سجل التدقيق', module: 'AUDIT' },
  { code: 'admin.view', name: 'الدخول إلى مركز التحكم', module: 'ADMIN' },
  { code: 'admin.navigation', name: 'تخصيص قوائم التنقل', module: 'ADMIN' },
  { code: 'admin.data', name: 'أدوات البيانات والصيانة', module: 'ADMIN' },
  { code: 'admin.data.export', name: 'تصدير بيانات النظام', module: 'ADMIN' },
  { code: 'admin.data.delete', name: 'حذف بيانات النظام', module: 'ADMIN' },
  { code: 'admin.license.manage', name: 'إدارة ترخيص المنصة المركزية', module: 'ADMIN' },

  // Electronic invoicing
  { code: 'electronic_invoices.view', name: 'عرض الفواتير الإلكترونية', module: 'E_INVOICING' },
  { code: 'electronic_invoices.create', name: 'إنشاء فاتورة إلكترونية', module: 'E_INVOICING' },
  { code: 'electronic_invoices.submit', name: 'إرسال الفاتورة الإلكترونية للهيئة الضريبية', module: 'E_INVOICING' },
  { code: 'electronic_invoices.accept', name: 'قبول الفاتورة الإلكترونية', module: 'E_INVOICING' },
  { code: 'electronic_invoices.reject', name: 'رفض الفاتورة الإلكترونية', module: 'E_INVOICING' },
  { code: 'electronic_invoices.cancel', name: 'إلغاء الفاتورة الإلكترونية', module: 'E_INVOICING' },

  // Loyalty program
  { code: 'loyalty.view', name: 'عرض برنامج الولاء', module: 'LOYALTY' },
  { code: 'loyalty.earn', name: 'إضافة نقاط ولاء', module: 'LOYALTY' },
  { code: 'loyalty.redeem', name: 'استبدال نقاط ولاء', module: 'LOYALTY' },
  { code: 'loyalty.manage', name: 'إدارة مستويات الولاء', module: 'LOYALTY' },

  // Multi-branch (branches.view is declared in the operations block above)
  { code: 'branches.create', name: 'إضافة فرع', module: 'BRANCHES' },
  { code: 'branches.update', name: 'تعديل فرع', module: 'BRANCHES' },
  { code: 'branches.delete', name: 'حذف فرع', module: 'BRANCHES' },
  { code: 'branches.manage_users', name: 'إدارة مستخدمي الفرع', module: 'BRANCHES' },
  { code: 'branches.access_all', name: 'الوصول المركزي إلى جميع الفروع', module: 'BRANCHES' },

  // Analytics
  { code: 'analytics.view', name: 'عرض التحليلات المتقدمة', module: 'ANALYTICS' },
  { code: 'analytics.write', name: 'تسجيل مقاييس التحليلات', module: 'ANALYTICS' },

  // Module registry (activation lifecycle and per-module configuration)
  { code: 'modules.view', name: 'عرض الوحدات المفعّلة', module: 'MODULES' },
  { code: 'modules.manage', name: 'تفعيل وتعطيل وحدات الأعمال', module: 'MODULES' },

  // Companies / legal entities
  { code: 'companies.view', name: 'عرض الشركات والكيانات القانونية', module: 'COMPANIES' },
  { code: 'companies.create', name: 'إضافة شركة أو كيان قانوني', module: 'COMPANIES' },
  { code: 'companies.update', name: 'تعديل بيانات الشركة', module: 'COMPANIES' },
  { code: 'companies.delete', name: 'تعطيل شركة', module: 'COMPANIES' },

  // Documents and contracts
  { code: 'documents.view', name: 'عرض المستندات', module: 'DOCUMENTS' },
  { code: 'documents.create', name: 'إضافة مستند', module: 'DOCUMENTS' },
  { code: 'documents.update', name: 'تعديل مستند أو إضافة نسخة', module: 'DOCUMENTS' },
  { code: 'documents.archive', name: 'أرشفة مستند واستعادته', module: 'DOCUMENTS' },
  { code: 'documents.export', name: 'تصدير سجل المستندات', module: 'DOCUMENTS' },
  { code: 'contracts.view', name: 'عرض العقود', module: 'CONTRACTS' },
  { code: 'contracts.create', name: 'إضافة عقد', module: 'CONTRACTS' },
  { code: 'contracts.update', name: 'تعديل عقد أو تجديده', module: 'CONTRACTS' },
  { code: 'contracts.terminate', name: 'فسخ عقد', module: 'CONTRACTS' },
  { code: 'contracts.export', name: 'تصدير سجل العقود', module: 'CONTRACTS' },

  // HR leave
  { code: 'hr.leave.view', name: 'عرض طلبات الإجازات', module: 'HR' },
  { code: 'hr.leave.request', name: 'تقديم طلب إجازة', module: 'HR' },
  { code: 'hr.leave.approve', name: 'اعتماد أو رفض الإجازات', module: 'HR' },

  // HR contracts
  { code: 'hr.contracts.view', name: 'عرض عقود الموظفين', module: 'HR' },
  { code: 'hr.contracts.manage', name: 'إدارة عقود الموظفين وتجديدها', module: 'HR' },
  { code: 'hr.contracts.terminate', name: 'إنهاء عقود الموظفين', module: 'HR' },

  // HR documents
  { code: 'hr.documents.view', name: 'عرض مستندات الموظفين', module: 'HR' },
  { code: 'hr.documents.manage', name: 'إدارة مستندات الموظفين وأرشفتها', module: 'HR' },

  // HR recruitment
  { code: 'hr.recruitment.view', name: 'عرض الوظائف والمرشحين', module: 'HR' },
  { code: 'hr.recruitment.manage', name: 'إدارة الوظائف ومراحل التوظيف', module: 'HR' },
  { code: 'hr.recruitment.hire', name: 'تعيين مرشح وتحويله لموظف', module: 'HR' },
  { code: 'hr.leave.export', name: 'تصدير طلبات الإجازات', module: 'HR' },
  { code: 'hr.contracts.export', name: 'تصدير عقود الموظفين', module: 'HR' },
  { code: 'hr.documents.export', name: 'تصدير مستندات الموظفين', module: 'HR' },
  { code: 'hr.dashboard.view', name: 'عرض لوحة الموارد البشرية', module: 'HR' },

  // ── صلاحيات دقيقة للصفحات والأقسام والأزرار ──────────────────────────────
  // Dashboard
  { code: 'dashboard.export', name: 'تصدير بيانات لوحة المعلومات', module: 'DASHBOARD' },
  { code: 'dashboard.executive.view', name: 'عرض اللوحة التنفيذية', module: 'DASHBOARD' },
  { code: 'dashboard.analytics.view', name: 'عرض التحليلات في لوحة المعلومات', module: 'DASHBOARD' },
  { code: 'dashboard.quick_actions.manage', name: 'تخصيص الإجراءات السريعة', module: 'DASHBOARD' },

  // Sales / POS / after-sales
  { code: 'sales.update', name: 'تعديل فاتورة بيع', module: 'SALES' },
  { code: 'sales.pos.view', name: 'الدخول إلى نقطة البيع', module: 'SALES' },
  { code: 'sales.pos.discount', name: 'تطبيق خصم في نقطة البيع', module: 'SALES' },
  { code: 'sales.pos.hold', name: 'تعليق فاتورة في نقطة البيع', module: 'SALES' },
  { code: 'sales.pos.resume', name: 'استئناف فاتورة معلّقة', module: 'SALES' },
  { code: 'sales.pos.void', name: 'إلغاء فاتورة من نقطة البيع', module: 'SALES' },
  { code: 'sales.pos.print', name: 'طباعة إيصال نقطة البيع', module: 'SALES' },
  { code: 'sales.invoice.print', name: 'طباعة فاتورة بيع', module: 'SALES' },
  { code: 'sales.invoice.share', name: 'مشاركة فاتورة بيع', module: 'SALES' },
  { code: 'sales.invoice.email', name: 'إرسال فاتورة بيع بالبريد', module: 'SALES' },
  { code: 'sales.analytics.view', name: 'عرض تحليلات المبيعات', module: 'SALES' },
  { code: 'sales.cycle.view', name: 'عرض دورة الفاتورة الشاملة', module: 'SALES' },
  { code: 'sales.statement.view', name: 'عرض كشف حساب العميل', module: 'SALES' },
  { code: 'sales.after_sales.view', name: 'عرض خدمة ما بعد البيع', module: 'SALES' },
  { code: 'sales.after_sales.manage', name: 'إدارة الضمان وخدمة ما بعد البيع', module: 'SALES' },
  { code: 'sales.reservations.view', name: 'عرض حجوزات المبيعات', module: 'SALES' },
  { code: 'sales.reservations.manage', name: 'إدارة حجوزات المبيعات والعربونات', module: 'SALES' },
  { code: 'sales.orders_deposits.view', name: 'عرض الطلبات والعربونات', module: 'SALES' },
  { code: 'sales.orders_deposits.manage', name: 'إدارة الطلبات والعربونات', module: 'SALES' },
  { code: 'sales.print', name: 'طباعة تقارير المبيعات', module: 'SALES' },
  { code: 'quotations.print', name: 'طباعة عرض سعر', module: 'QUOTATIONS' },
  { code: 'orders.print', name: 'طباعة طلب بيع', module: 'ORDERS' },
  { code: 'orders.convert', name: 'تحويل الطلب إلى فاتورة', module: 'ORDERS' },
  { code: 'returns.print', name: 'طباعة مرتجع بيع', module: 'RETURNS' },
  { code: 'returns.delete', name: 'حذف مرتجع بيع', module: 'RETURNS' },
  { code: 'restaurant.view', name: 'عرض إدارة المطعم', module: 'SALES' },
  { code: 'restaurant.manage', name: 'إدارة إعدادات المطعم', module: 'SALES' },
  { code: 'restaurant.orders.create', name: 'إنشاء طلب مطعم', module: 'SALES' },
  { code: 'restaurant.tables.manage', name: 'إدارة طاولات المطعم', module: 'SALES' },

  // Products catalog detail
  { code: 'products.attributes.view', name: 'عرض الخصائص الديناميكية', module: 'PRODUCTS' },
  { code: 'products.attributes.manage', name: 'إدارة الخصائص الديناميكية', module: 'PRODUCTS' },
  { code: 'products.barcodes.print', name: 'طباعة باركود المنتجات', module: 'PRODUCTS' },
  { code: 'products.costs.view', name: 'عرض تكلفة المنتجات', module: 'PRODUCTS' },
  { code: 'products.variants.manage', name: 'إدارة متغيرات المنتج', module: 'PRODUCTS' },
  { code: 'products.images.manage', name: 'إدارة صور المنتج', module: 'PRODUCTS' },
  { code: 'products.documents.view', name: 'عرض مستندات المنتج', module: 'PRODUCTS' },
  { code: 'products.stock.view', name: 'عرض مخزون المنتج', module: 'PRODUCTS' },
  { code: 'products.price_lists.view', name: 'عرض قوائم أسعار المنتج', module: 'PRODUCTS' },
  { code: 'products.price_lists.update', name: 'تعديل قوائم أسعار المنتج', module: 'PRODUCTS' },
  { code: 'products.duplicate', name: 'نسخ منتج', module: 'PRODUCTS' },
  { code: 'products.print', name: 'طباعة كتالوج المنتجات', module: 'PRODUCTS' },

  // Inventory pages and sections
  { code: 'inventory.warehouse_stock.view', name: 'عرض أرصدة المخازن', module: 'INVENTORY' },
  { code: 'inventory.showroom_stock.view', name: 'عرض أرصدة المعارض', module: 'INVENTORY' },
  { code: 'inventory.ledger.view', name: 'عرض سجل حركة المخزون', module: 'INVENTORY' },
  { code: 'inventory.valuation.view', name: 'عرض تقييم المخزون', module: 'INVENTORY' },
  { code: 'inventory.reorder.view', name: 'عرض إعادة الطلب', module: 'INVENTORY' },
  { code: 'inventory.reorder.manage', name: 'إدارة إعادة الطلب', module: 'INVENTORY' },
  { code: 'inventory.locations.view', name: 'عرض مواقع الرفوف', module: 'INVENTORY' },
  { code: 'inventory.locations.manage', name: 'إدارة مواقع الرفوف', module: 'INVENTORY' },
  { code: 'inventory.damage.view', name: 'عرض التالف والحجر', module: 'INVENTORY' },
  { code: 'inventory.damage.manage', name: 'إدارة التالف والحجر', module: 'INVENTORY' },
  { code: 'inventory.reconciliation.view', name: 'عرض مطابقة المخزون', module: 'INVENTORY' },
  { code: 'inventory.reconciliation.manage', name: 'توثيق واعتماد مطابقة المخزون', module: 'INVENTORY' },
  { code: 'inventory.reservations.view', name: 'عرض حجوزات المخزون', module: 'INVENTORY' },
  { code: 'inventory.reservations.manage', name: 'إدارة حجوزات المخزون', module: 'INVENTORY' },
  { code: 'inventory.count.start', name: 'بدء جلسة جرد', module: 'INVENTORY' },
  { code: 'inventory.count.finalize', name: 'اعتماد جلسة الجرد', module: 'INVENTORY' },
  { code: 'inventory.transfer.approve', name: 'اعتماد التحويل المخزني', module: 'INVENTORY' },
  { code: 'inventory.print', name: 'طباعة تقارير المخزون', module: 'INVENTORY' },

  // Purchasing cycle
  { code: 'purchases.requests.view', name: 'عرض طلبات الشراء', module: 'PURCHASES' },
  { code: 'purchases.requests.create', name: 'إنشاء طلب شراء', module: 'PURCHASES' },
  { code: 'purchases.requests.approve', name: 'اعتماد طلب شراء', module: 'PURCHASES' },
  { code: 'purchases.requests.reject', name: 'رفض طلب شراء', module: 'PURCHASES' },
  { code: 'purchases.quotations.view', name: 'عرض عروض الموردين', module: 'PURCHASES' },
  { code: 'purchases.quotations.create', name: 'إنشاء عرض مورد', module: 'PURCHASES' },
  { code: 'purchases.quotations.approve', name: 'اعتماد عرض مورد', module: 'PURCHASES' },
  { code: 'purchases.orders.view', name: 'عرض أوامر الشراء', module: 'PURCHASES' },
  { code: 'purchases.orders.create', name: 'إنشاء أمر شراء', module: 'PURCHASES' },
  { code: 'purchases.orders.approve', name: 'اعتماد أمر شراء', module: 'PURCHASES' },
  { code: 'purchases.receipts.view', name: 'عرض استلامات المشتريات', module: 'PURCHASES' },
  { code: 'purchases.receipts.create', name: 'تسجيل استلام مشتريات', module: 'PURCHASES' },
  { code: 'purchases.incoming.view', name: 'عرض الواردات', module: 'PURCHASES' },
  { code: 'purchases.claims.view', name: 'عرض مطالبات الموردين', module: 'PURCHASES' },
  { code: 'purchases.claims.manage', name: 'إدارة مطالبات الموردين', module: 'PURCHASES' },
  { code: 'purchases.statement.view', name: 'عرض كشف حساب المورد', module: 'PURCHASES' },
  { code: 'purchases.payment', name: 'تسجيل دفعة لمورد', module: 'PURCHASES' },
  { code: 'purchases.print', name: 'طباعة مستندات المشتريات', module: 'PURCHASES' },
  { code: 'suppliers.statement.view', name: 'عرض كشف حساب مورد', module: 'SUPPLIERS' },
  { code: 'suppliers.scorecard.view', name: 'عرض تقييم المورد', module: 'SUPPLIERS' },
  { code: 'suppliers.contacts.manage', name: 'إدارة جهات اتصال المورد', module: 'SUPPLIERS' },

  // Finance pages and sections
  { code: 'finance.overview.view', name: 'عرض النظرة العامة للمالية', module: 'FINANCE' },
  { code: 'finance.expenses.view', name: 'عرض المصروفات', module: 'FINANCE' },
  { code: 'finance.expenses.create', name: 'إضافة مصروف', module: 'FINANCE' },
  { code: 'finance.expenses.update', name: 'تعديل مصروف', module: 'FINANCE' },
  { code: 'finance.expenses.delete', name: 'حذف مصروف', module: 'FINANCE' },
  { code: 'finance.accounts.view', name: 'عرض دليل الحسابات', module: 'FINANCE' },
  { code: 'finance.accounts.manage', name: 'إدارة دليل الحسابات', module: 'FINANCE' },
  { code: 'finance.journal.view', name: 'عرض القيود اليومية', module: 'FINANCE' },
  { code: 'finance.journal.create', name: 'إنشاء قيد يومية', module: 'FINANCE' },
  { code: 'finance.journal.post', name: 'ترحيل قيد يومية', module: 'FINANCE' },
  { code: 'finance.cheques.view', name: 'عرض الشيكات', module: 'FINANCE' },
  { code: 'finance.cheques.manage', name: 'إدارة الشيكات', module: 'FINANCE' },
  { code: 'finance.bank_reconciliation.view', name: 'عرض مطابقة البنك', module: 'FINANCE' },
  { code: 'finance.bank_reconciliation.manage', name: 'إدارة مطابقة البنك', module: 'FINANCE' },
  { code: 'finance.fiscal_closing.view', name: 'عرض الإقفال المالي', module: 'FINANCE' },
  { code: 'finance.fiscal_closing.execute', name: 'تنفيذ الإقفال المالي', module: 'FINANCE' },
  { code: 'finance.budgets.view', name: 'عرض الموازنات ومراكز التكلفة', module: 'FINANCE' },
  { code: 'finance.budgets.manage', name: 'إدارة الموازنات ومراكز التكلفة', module: 'FINANCE' },
  { code: 'finance.cash_forecast.view', name: 'عرض توقع التدفقات النقدية', module: 'FINANCE' },
  { code: 'finance.cash_forecast.manage', name: 'إدارة سيناريوهات التدفقات النقدية', module: 'FINANCE' },
  { code: 'finance.epayments.view', name: 'عرض الدفع الإلكتروني والتسويات', module: 'FINANCE' },
  { code: 'finance.epayments.settle', name: 'تسوية الدفع الإلكتروني', module: 'FINANCE' },
  { code: 'finance.assets.view', name: 'عرض الأصول الثابتة', module: 'FINANCE' },
  { code: 'finance.assets.manage', name: 'إدارة الأصول الثابتة', module: 'FINANCE' },
  { code: 'finance.receivables.collect', name: 'تحصيل ذمة عميل', module: 'FINANCE' },
  { code: 'finance.print', name: 'طباعة التقارير المالية', module: 'FINANCE' },

  // Report center
  { code: 'reports.hub.view', name: 'عرض مركز التقارير', module: 'REPORTS' },
  { code: 'reports.financial.view', name: 'عرض التقارير المالية', module: 'REPORTS' },
  { code: 'reports.sales.view', name: 'عرض تقارير المبيعات', module: 'REPORTS' },
  { code: 'reports.purchases.view', name: 'عرض تقارير المشتريات', module: 'REPORTS' },
  { code: 'reports.inventory.view', name: 'عرض تقارير المخزون', module: 'REPORTS' },
  { code: 'reports.tax.view', name: 'عرض التقارير الضريبية', module: 'REPORTS' },
  { code: 'reports.pos.view', name: 'عرض تقارير نقطة البيع', module: 'REPORTS' },
  { code: 'reports.profit_loss.view', name: 'عرض تقرير الأرباح والخسائر', module: 'REPORTS' },
  { code: 'reports.custom.view', name: 'عرض التقارير المخصصة', module: 'REPORTS' },
  { code: 'reports.print', name: 'طباعة التقارير', module: 'REPORTS' },

  // CRM pages and sections
  { code: 'crm.dashboard.view', name: 'عرض لوحة علاقات العملاء', module: 'CRM' },
  { code: 'crm.leads.view', name: 'عرض العملاء المحتملين', module: 'CRM' },
  { code: 'crm.leads.create', name: 'إضافة عميل محتمل', module: 'CRM' },
  { code: 'crm.leads.update', name: 'تعديل عميل محتمل', module: 'CRM' },
  { code: 'crm.leads.delete', name: 'حذف عميل محتمل', module: 'CRM' },
  { code: 'crm.leads.convert', name: 'تحويل عميل محتمل إلى عميل', module: 'CRM' },
  { code: 'crm.pipeline.view', name: 'عرض خط المبيعات', module: 'CRM' },
  { code: 'crm.pipeline.update', name: 'تحديث مراحل خط المبيعات', module: 'CRM' },
  { code: 'crm.activities.view', name: 'عرض الأنشطة والمتابعات', module: 'CRM' },
  { code: 'crm.activities.create', name: 'إضافة نشاط أو متابعة', module: 'CRM' },
  { code: 'crm.activities.update', name: 'تعديل نشاط أو متابعة', module: 'CRM' },
  { code: 'crm.activities.delete', name: 'حذف نشاط أو متابعة', module: 'CRM' },
  { code: 'crm.campaigns.view', name: 'عرض الحملات التسويقية', module: 'CRM' },
  { code: 'crm.campaigns.create', name: 'إنشاء حملة تسويقية', module: 'CRM' },
  { code: 'crm.campaigns.update', name: 'تعديل حملة تسويقية', module: 'CRM' },
  { code: 'crm.campaigns.delete', name: 'حذف حملة تسويقية', module: 'CRM' },
  { code: 'crm.export', name: 'تصدير بيانات علاقات العملاء', module: 'CRM' },
  { code: 'crm.print', name: 'طباعة تقارير علاقات العملاء', module: 'CRM' },

  // Projects
  { code: 'projects.tasks.view', name: 'عرض مهام المشروع', module: 'PROJECTS' },
  { code: 'projects.tasks.manage', name: 'إدارة مهام المشروع', module: 'PROJECTS' },
  { code: 'projects.controls.view', name: 'عرض ضوابط المشروع', module: 'PROJECTS' },
  { code: 'projects.controls.manage', name: 'إدارة ضوابط المشروع', module: 'PROJECTS' },
  { code: 'projects.financials.view', name: 'عرض مالية المشروع', module: 'PROJECTS' },
  { code: 'projects.documents.view', name: 'عرض مستندات المشروع', module: 'PROJECTS' },
  { code: 'projects.print', name: 'طباعة تقارير المشاريع', module: 'PROJECTS' },

  // Manufacturing
  { code: 'manufacturing.orders.view', name: 'عرض أوامر التصنيع', module: 'MANUFACTURING' },
  { code: 'manufacturing.orders.create', name: 'إنشاء أمر تصنيع', module: 'MANUFACTURING' },
  { code: 'manufacturing.orders.approve', name: 'اعتماد أمر تصنيع', module: 'MANUFACTURING' },
  { code: 'manufacturing.orders.execute', name: 'تنفيذ أمر تصنيع', module: 'MANUFACTURING' },
  { code: 'manufacturing.bom.view', name: 'عرض قوائم المواد', module: 'MANUFACTURING' },
  { code: 'manufacturing.bom.manage', name: 'إدارة قوائم المواد', module: 'MANUFACTURING' },
  { code: 'manufacturing.quality.view', name: 'عرض مراقبة الجودة', module: 'MANUFACTURING' },
  { code: 'manufacturing.quality.manage', name: 'إدارة مراقبة الجودة', module: 'MANUFACTURING' },
  { code: 'manufacturing.maintenance.view', name: 'عرض الصيانة', module: 'MANUFACTURING' },
  { code: 'manufacturing.maintenance.manage', name: 'إدارة الصيانة', module: 'MANUFACTURING' },
  { code: 'manufacturing.wip.view', name: 'عرض الإنتاج تحت التشغيل', module: 'MANUFACTURING' },
  { code: 'manufacturing.wip.manage', name: 'إدارة الإنتاج تحت التشغيل', module: 'MANUFACTURING' },
  { code: 'manufacturing.disposition.view', name: 'عرض التصرف في المخلفات', module: 'MANUFACTURING' },
  { code: 'manufacturing.disposition.manage', name: 'إدارة التصرف في المخلفات', module: 'MANUFACTURING' },
  { code: 'manufacturing.export', name: 'تصدير بيانات التصنيع', module: 'MANUFACTURING' },

  // Employees / operations
  { code: 'employees.attendance.view', name: 'عرض الحضور والانصراف', module: 'EMPLOYEES' },
  { code: 'employees.attendance.manage', name: 'إدارة الحضور والانصراف', module: 'EMPLOYEES' },
  { code: 'employees.commissions.view', name: 'عرض عمولات المبيعات', module: 'EMPLOYEES' },
  { code: 'employees.commissions.manage', name: 'إدارة عمولات المبيعات', module: 'EMPLOYEES' },
  { code: 'employees.transactions.view', name: 'عرض حركات الموظفين', module: 'EMPLOYEES' },
  { code: 'employees.transactions.manage', name: 'إدارة حركات الموظفين', module: 'EMPLOYEES' },
  { code: 'employees.print', name: 'طباعة بيانات الموظفين', module: 'EMPLOYEES' },
  { code: 'operations.fleet.view', name: 'عرض لوحة الأسطول', module: 'OPERATIONS' },
  { code: 'deliveries.create', name: 'إنشاء توصيل', module: 'DELIVERIES' },
  { code: 'deliveries.update', name: 'تعديل توصيل', module: 'DELIVERIES' },
  { code: 'deliveries.delete', name: 'حذف توصيل', module: 'DELIVERIES' },
  { code: 'drivers.create', name: 'إضافة سائق', module: 'DRIVERS' },
  { code: 'drivers.update', name: 'تعديل سائق', module: 'DRIVERS' },
  { code: 'drivers.delete', name: 'حذف سائق', module: 'DRIVERS' },
  { code: 'vehicles.create', name: 'إضافة مركبة', module: 'VEHICLES' },
  { code: 'vehicles.update', name: 'تعديل مركبة', module: 'VEHICLES' },
  { code: 'vehicles.delete', name: 'حذف مركبة', module: 'VEHICLES' },
  { code: 'branches.export', name: 'تصدير بيانات الفروع', module: 'BRANCHES' },
  { code: 'warehouses.export', name: 'تصدير بيانات المخازن', module: 'WAREHOUSES' },

  // Documents and contracts
  { code: 'documents.download', name: 'تنزيل مستند', module: 'DOCUMENTS' },
  { code: 'documents.print', name: 'طباعة مستند', module: 'DOCUMENTS' },
  { code: 'documents.types.manage', name: 'إدارة أنواع المستندات', module: 'DOCUMENTS' },
  { code: 'contracts.renew', name: 'تجديد عقد', module: 'CONTRACTS' },
  { code: 'contracts.print', name: 'طباعة عقد', module: 'CONTRACTS' },

  // Approvals and notifications
  { code: 'approvals.export', name: 'تصدير قائمة الموافقات', module: 'APPROVALS' },
  { code: 'notifications.send', name: 'إرسال إشعار', module: 'NOTIFICATIONS' },
  { code: 'notifications.delete', name: 'حذف إشعار', module: 'NOTIFICATIONS' },

  // Users, roles and security
  { code: 'roles.view', name: 'عرض الأدوار والصلاحيات', module: 'ROLES' },
  { code: 'users.export', name: 'تصدير قائمة المستخدمين', module: 'USERS' },
  { code: 'users.import', name: 'استيراد مستخدمين', module: 'USERS' },
  { code: 'users.activate', name: 'تفعيل أو تعطيل مستخدم', module: 'USERS' },
  { code: 'sessions.terminate', name: 'إنهاء جلسة مستخدم', module: 'SESSIONS' },
  { code: 'security.view', name: 'عرض مركز الأمان', module: 'SECURITY' },
  { code: 'security.settings', name: 'إدارة إعدادات الأمان', module: 'SECURITY' },

  // Settings pages and sections
  { code: 'settings.appearance.manage', name: 'إدارة الهوية والمظهر', module: 'SETTINGS' },
  { code: 'settings.app_config.view', name: 'عرض محرك التكوين الديناميكي', module: 'SETTINGS' },
  { code: 'settings.app_config.manage', name: 'إدارة محرك التكوين الديناميكي', module: 'SETTINGS' },
  { code: 'settings.config_studio.view', name: 'عرض استوديو التكوين', module: 'SETTINGS' },
  { code: 'settings.config_studio.manage', name: 'إدارة استوديو التكوين', module: 'SETTINGS' },
  { code: 'settings.import.view', name: 'عرض مركز استيراد البيانات', module: 'SETTINGS' },
  { code: 'settings.import.execute', name: 'تنفيذ استيراد البيانات', module: 'SETTINGS' },
  { code: 'settings.dynamic_data.view', name: 'عرض أنواع البيانات الديناميكية', module: 'SETTINGS' },
  { code: 'settings.dynamic_data.manage', name: 'إدارة أنواع البيانات الديناميكية', module: 'SETTINGS' },
  { code: 'settings.health.view', name: 'عرض صحة النظام', module: 'SETTINGS' },
  { code: 'settings.health.manage', name: 'إدارة صحة النظام', module: 'SETTINGS' },
  { code: 'settings.license_mode.view', name: 'عرض وضع الترخيص', module: 'SETTINGS' },
  { code: 'settings.license_mode.manage', name: 'إدارة وضع الترخيص', module: 'SETTINGS' },
  { code: 'settings.taxes.manage', name: 'إدارة إعدادات الضرائب', module: 'SETTINGS' },
  { code: 'settings.numbering.manage', name: 'إدارة ترقيم المستندات', module: 'SETTINGS' },
  { code: 'settings.printers.manage', name: 'إدارة الطابعات والطباعة', module: 'SETTINGS' },
  { code: 'settings.export', name: 'تصدير الإعدادات', module: 'SETTINGS' },

  // Electronic invoicing extras
  { code: 'electronic_invoices.print', name: 'طباعة فاتورة إلكترونية', module: 'E_INVOICING' },
  { code: 'electronic_invoices.export', name: 'تصدير الفواتير الإلكترونية', module: 'E_INVOICING' },
];

// Default permissions per built-in role. These are only used to seed a role
// the first time it appears; after that the database (role_permissions) is the
// single source of truth and the admin can change anything from the UI.
const ALL = PERMISSIONS.map((p) => p.code);
const MANAGER_RESTRICTED = new Set([
  ...ALL.filter((code) => code.endsWith('.delete')),
  'roles.manage',
  'users.create',
  'users.update',
  'users.delete',
  'users.reset_password',
  'users.permissions',
  'settings.update',
  'settings.backup',
  'settings.maintenance',
  'admin.data',
  'settings.appearance.manage',
  'settings.app_config.manage',
  'settings.config_studio.manage',
  'settings.import.execute',
  'settings.dynamic_data.manage',
  'settings.license_mode.manage',
  'settings.taxes.manage',
  'settings.numbering.manage',
  'settings.printers.manage',
  'security.settings',
  'sessions.terminate',
  'users.export',
  'users.import',
  'users.activate',
  'finance.fiscal_closing.execute',
  'finance.journal.post',
]);

export const ROLE_DEFAULTS: Record<string, string[]> = {
  ADMIN: [...ALL],
  MANAGER: [...new Set([...ALL.filter((code) => !MANAGER_RESTRICTED.has(code)), 'admin.data', 'admin.data.export'])],
  ACCOUNTANT: [
    'dashboard.view', 'dashboard.export',
    'products.view', 'categories.view', 'brands.view',
    'inventory.view', 'sales.view', 'sales.export',
    'quotations.view', 'quotations.export', 'orders.view', 'orders.export', 'returns.view', 'returns.export',
    'purchases.view', 'purchases.approve', 'purchases.reject', 'purchases.cancel_request', 'purchases.export',
    'customers.view', 'customers.payment', 'customers.export',
    'suppliers.view', 'suppliers.payment', 'suppliers.export',
    'cashier.view', 'cashier.expense', 'cashier.shift', 'cashier.shift.open', 'cashier.shift.close',
    'finance.view', 'finance.approve', 'finance.close', 'finance.debts.view', 'finance.export',
    'finance.receivables.view', 'finance.receivables.create', 'finance.receivables.update', 'finance.receivables.export',
    'finance.installments.view', 'finance.installments.manage',
    'reports.view', 'reports.export',
    'crm.view', 'projects.view', 'pricing.view', 'promotions.view',
    'manufacturing.view',
    'operations.view', 'operations.update', 'branches.view', 'warehouses.view',
    'employees.view', 'employees.export', 'employees.payroll.view', 'employees.financials.view', 'deliveries.view', 'drivers.view', 'vehicles.view',
    'approvals.view', 'approvals.create', 'approvals.approve', 'approvals.reject', 'approvals.cancel',
    'notifications.view', 'audit.view', 'audit.export',
    'analytics.view', 'modules.view',
    'documents.view', 'documents.export', 'contracts.view', 'contracts.export',
    'hr.leave.view', 'hr.contracts.view', 'hr.documents.view',
  ],
  SALES: [
    'dashboard.view',
    'products.view', 'categories.view', 'brands.view', 'inventory.view',
    'sales.view', 'sales.create', 'sales.update', 'sales.refund', 'sales.approve', 'sales.credit',
    'quotations.view', 'quotations.create', 'quotations.update',
    'orders.view', 'orders.create', 'orders.update',
    'returns.view', 'returns.create',
    'customers.view', 'customers.create', 'customers.update', 'customers.payment',
    'reports.view', 'crm.view', 'crm.create', 'crm.update',
    'projects.view', 'projects.create',
    'pricing.view', 'promotions.view',
    'approvals.view', 'approvals.create', 'notifications.view',
    'employees.view', 'deliveries.view', 'branches.view', 'warehouses.view',
    'operations.view', 'loyalty.view',
    'documents.view', 'contracts.view',
    'hr.leave.view', 'hr.leave.request',
  ],
  CASHIER: [
    'dashboard.view', 'products.view', 'categories.view', 'brands.view',
    'sales.view', 'sales.create', 'sales.refund', 'sales.credit',
    'quotations.view', 'quotations.export', 'orders.view', 'orders.export', 'returns.view', 'returns.export', 'returns.create',
    'customers.view', 'customers.create', 'customers.payment',
    'cashier.view', 'cashier.expense', 'cashier.shift', 'cashier.shift.open', 'cashier.shift.close',
    'approvals.create', 'crm.view', 'notifications.view',
    'documents.view', 'hr.leave.view', 'loyalty.view',
  ],
  WAREHOUSE: [
    'dashboard.view', 'products.view', 'categories.view', 'brands.view',
    'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.count',
    'purchases.view', 'purchases.create', 'returns.view',
    'operations.view', 'branches.view', 'warehouses.view', 'warehouses.manage',
    'deliveries.view', 'deliveries.manage', 'drivers.view', 'vehicles.view',
    'employees.view', 'approvals.view', 'approvals.create', 'notifications.view',
    'documents.view', 'hr.leave.view', 'hr.leave.request',
  ],
};

/**
 * Export rights that were introduced after the original seeding. A role that
 * could already read the domain keeps its ability to export it, so upgrading
 * does not silently remove capabilities. The backfill runs once per role and is
 * marked in system_settings, which keeps later administrator choices intact.
 */
const EXPORT_PERMISSION_SOURCES: Record<string, string> = {
  'purchases.export': 'purchases.view',
  'suppliers.export': 'suppliers.view',
  'finance.export': 'finance.view',
  'employees.export': 'employees.view',
  'sales.export': 'sales.view',
  'orders.export': 'orders.view',
  'quotations.export': 'quotations.view',
  'returns.export': 'returns.view',
  'inventory.export': 'inventory.view',

  'reports.export': 'reports.view',
  'customers.export': 'customers.view',
  'products.export': 'products.view',
  'documents.export': 'documents.view',
  'contracts.export': 'contracts.view',
  'audit.export': 'audit.view',
};

const RECEIVABLE_PERMISSION_BACKFILL: Record<string, string[]> = {
  ADMIN: ['finance.receivables.view', 'finance.receivables.create', 'finance.receivables.update', 'finance.receivables.delete', 'finance.receivables.export'],
  MANAGER: ['finance.receivables.view', 'finance.receivables.create', 'finance.receivables.update', 'finance.receivables.export'],
  ACCOUNTANT: ['finance.receivables.view', 'finance.receivables.create', 'finance.receivables.update', 'finance.receivables.export'],
};

const PERMISSION_BACKFILL_SOURCES: Record<string, string[]> = {
  'quotations.create': ['sales.create'],
  'quotations.update': ['sales.create'],
  'quotations.delete': ['sales.create'],
  'quotations.approve': ['sales.approve'],
  'orders.create': ['sales.create'],
  'orders.update': ['sales.create'],
  'orders.delete': ['sales.approve'],
  'orders.approve': ['sales.approve'],
  'returns.create': ['sales.refund'],
  'returns.approve': ['sales.refund'],
  'employees.export': ['employees.view'],
  'notifications.manage': ['notifications.view'],
  'audit.export': ['audit.view'],
  'loyalty.view': ['sales.view'],
  'analytics.view': ['dashboard.view'],
  'modules.view': ['settings.view'],
  'operations.view': ['branches.view', 'warehouses.view', 'deliveries.view', 'employees.view', 'drivers.view', 'vehicles.view', 'manufacturing.view'],
  'operations.update': ['branches.manage', 'warehouses.manage', 'deliveries.manage', 'employees.manage', 'drivers.manage', 'vehicles.manage'],

  // Fine-grained page/section/action permissions introduced with the expanded
  // catalog. Existing roles keep the capabilities they already had; destructive
  // permissions are intentionally absent and must be granted explicitly.
  'dashboard.export': ['dashboard.view'],
  'dashboard.executive.view': ['dashboard.view'],
  'dashboard.analytics.view': ['dashboard.view'],
  'sales.update': ['sales.create'],
  'sales.pos.view': ['sales.create'],
  'sales.pos.discount': ['sales.discount'],
  'sales.pos.hold': ['sales.create'],
  'sales.pos.resume': ['sales.create'],
  'sales.pos.void': ['sales.void'],
  'sales.pos.print': ['sales.view'],
  'sales.invoice.print': ['sales.view'],
  'sales.invoice.share': ['sales.view'],
  'sales.invoice.email': ['sales.view'],
  'sales.analytics.view': ['sales.view'],
  'sales.cycle.view': ['sales.view'],
  'sales.statement.view': ['sales.view'],
  'sales.after_sales.view': ['sales.view'],
  'sales.after_sales.manage': ['sales.refund'],
  'sales.reservations.view': ['sales.view'],
  'sales.reservations.manage': ['sales.create'],
  'sales.orders_deposits.view': ['sales.view'],
  'sales.orders_deposits.manage': ['sales.create'],
  'sales.print': ['sales.view'],
  'quotations.print': ['quotations.view'],
  'orders.print': ['orders.view'],
  'orders.convert': ['orders.create'],
  'returns.print': ['returns.view'],
  'restaurant.view': ['orders.view'],
  'restaurant.manage': ['orders.create'],
  'restaurant.orders.create': ['sales.create'],
  'restaurant.tables.manage': ['orders.view'],
  'products.attributes.view': ['products.view'],
  'products.attributes.manage': ['products.update'],
  'products.barcodes.print': ['products.view'],
  'products.costs.view': ['finance.view'],
  'products.variants.manage': ['products.update'],
  'products.images.manage': ['products.update'],
  'products.documents.view': ['products.view'],
  'products.stock.view': ['inventory.view'],
  'products.price_lists.view': ['pricing.view'],
  'products.price_lists.update': ['pricing.update'],
  'products.duplicate': ['products.create'],
  'products.print': ['products.view'],
  'inventory.warehouse_stock.view': ['inventory.view'],
  'inventory.showroom_stock.view': ['inventory.view'],
  'inventory.ledger.view': ['inventory.view'],
  'inventory.valuation.view': ['inventory.view'],
  'inventory.reorder.view': ['inventory.view'],
  'inventory.reorder.manage': ['inventory.adjust'],
  'inventory.locations.view': ['inventory.view'],
  'inventory.locations.manage': ['warehouses.manage'],
  'inventory.damage.view': ['inventory.adjust'],
  'inventory.damage.manage': ['inventory.adjust'],
  'inventory.reconciliation.view': ['inventory.view'],
  'inventory.reconciliation.manage': ['inventory.adjust'],
  'inventory.reservations.view': ['inventory.view'],
  'inventory.reservations.manage': ['inventory.adjust'],
  'inventory.count.start': ['inventory.count'],
  'inventory.count.finalize': ['inventory.count'],
  'inventory.transfer.approve': ['inventory.transfer'],
  'inventory.print': ['inventory.view'],
  'purchases.requests.view': ['purchases.view'],
  'purchases.requests.create': ['purchases.create'],
  'purchases.requests.approve': ['purchases.approve'],
  'purchases.requests.reject': ['purchases.reject'],
  'purchases.quotations.view': ['purchases.view'],
  'purchases.quotations.create': ['purchases.create'],
  'purchases.quotations.approve': ['purchases.approve'],
  'purchases.orders.view': ['purchases.view'],
  'purchases.orders.create': ['purchases.create'],
  'purchases.orders.approve': ['purchases.approve'],
  'purchases.receipts.view': ['purchases.view'],
  'purchases.receipts.create': ['purchases.create'],
  'purchases.incoming.view': ['purchases.view'],
  'purchases.claims.view': ['purchases.view'],
  'purchases.claims.manage': ['purchases.update'],
  'purchases.statement.view': ['finance.debts.view'],
  'purchases.payment': ['suppliers.payment'],
  'purchases.print': ['purchases.view'],
  'suppliers.statement.view': ['finance.debts.view'],
  'suppliers.scorecard.view': ['suppliers.view'],
  'suppliers.contacts.manage': ['suppliers.update'],
  'finance.overview.view': ['finance.view'],
  'finance.expenses.view': ['cashier.expense'],
  'finance.expenses.create': ['cashier.expense'],
  'finance.expenses.update': ['cashier.expense.update'],
  'finance.expenses.delete': ['cashier.expense.delete'],
  'finance.accounts.view': ['finance.view'],
  'finance.accounts.manage': ['finance.view'],
  'finance.journal.view': ['finance.view'],
  'finance.journal.create': ['finance.view'],
  'finance.journal.post': ['finance.approve'],
  'finance.cheques.view': ['finance.view'],
  'finance.cheques.manage': ['finance.approve'],
  'finance.bank_reconciliation.view': ['finance.view'],
  'finance.bank_reconciliation.manage': ['finance.approve'],
  'finance.fiscal_closing.view': ['finance.close'],
  'finance.fiscal_closing.execute': ['finance.close'],
  'finance.budgets.view': ['finance.view'],
  'finance.budgets.manage': ['finance.approve'],
  'finance.cash_forecast.view': ['finance.view'],
  'finance.cash_forecast.manage': ['finance.approve'],
  'finance.epayments.view': ['finance.view'],
  'finance.epayments.settle': ['finance.approve'],
  'finance.assets.view': ['finance.view'],
  'finance.assets.manage': ['finance.approve'],
  'finance.receivables.collect': ['finance.receivables.update'],
  'finance.print': ['finance.view'],
  'reports.hub.view': ['reports.view'],
  'reports.financial.view': ['reports.view'],
  'reports.sales.view': ['reports.view'],
  'reports.purchases.view': ['reports.view'],
  'reports.inventory.view': ['reports.view'],
  'reports.tax.view': ['reports.view'],
  'reports.pos.view': ['reports.view'],
  'reports.profit_loss.view': ['reports.view'],
  'reports.custom.view': ['reports.view'],
  'reports.print': ['reports.export'],
  'crm.dashboard.view': ['crm.view'],
  'crm.leads.view': ['crm.view'],
  'crm.leads.create': ['crm.create'],
  'crm.leads.update': ['crm.update'],
  'crm.leads.delete': ['crm.delete'],
  'crm.leads.convert': ['crm.create'],
  'crm.pipeline.view': ['crm.view'],
  'crm.pipeline.update': ['crm.update'],
  'crm.activities.view': ['crm.view'],
  'crm.activities.create': ['crm.create'],
  'crm.activities.update': ['crm.update'],
  'crm.activities.delete': ['crm.delete'],
  'crm.campaigns.view': ['crm.view'],
  'crm.campaigns.create': ['crm.create'],
  'crm.campaigns.update': ['crm.update'],
  'crm.campaigns.delete': ['crm.delete'],
  'crm.export': ['crm.view'],
  'crm.print': ['crm.view'],
  'projects.tasks.view': ['projects.view'],
  'projects.tasks.manage': ['projects.update'],
  'projects.controls.view': ['projects.view'],
  'projects.controls.manage': ['projects.update'],
  'projects.financials.view': ['projects.view'],
  'projects.documents.view': ['projects.view'],
  'projects.print': ['projects.view'],
  'manufacturing.orders.view': ['manufacturing.view'],
  'manufacturing.orders.create': ['manufacturing.manage'],
  'manufacturing.orders.approve': ['manufacturing.manage'],
  'manufacturing.orders.execute': ['manufacturing.manage'],
  'manufacturing.bom.view': ['manufacturing.view'],
  'manufacturing.bom.manage': ['manufacturing.manage'],
  'manufacturing.quality.view': ['manufacturing.view'],
  'manufacturing.quality.manage': ['manufacturing.manage'],
  'manufacturing.maintenance.view': ['manufacturing.view'],
  'manufacturing.maintenance.manage': ['manufacturing.manage'],
  'manufacturing.wip.view': ['manufacturing.view'],
  'manufacturing.wip.manage': ['manufacturing.manage'],
  'manufacturing.disposition.view': ['manufacturing.view'],
  'manufacturing.disposition.manage': ['manufacturing.manage'],
  'manufacturing.export': ['manufacturing.view'],
  'employees.attendance.view': ['employees.view'],
  'employees.attendance.manage': ['employees.manage'],
  'employees.commissions.view': ['employees.payroll.view'],
  'employees.commissions.manage': ['employees.payroll.manage'],
  'employees.transactions.view': ['employees.view'],
  'employees.transactions.manage': ['employees.manage'],
  'employees.print': ['employees.view'],
  'operations.fleet.view': ['deliveries.view'],
  'deliveries.create': ['deliveries.manage'],
  'deliveries.update': ['deliveries.manage'],
  'drivers.create': ['drivers.manage'],
  'drivers.update': ['drivers.manage'],
  'vehicles.create': ['vehicles.manage'],
  'vehicles.update': ['vehicles.manage'],
  'branches.export': ['branches.view'],
  'warehouses.export': ['warehouses.view'],
  'documents.download': ['documents.view'],
  'documents.print': ['documents.view'],
  'documents.types.manage': ['documents.update'],
  'contracts.renew': ['contracts.update'],
  'contracts.print': ['contracts.view'],
  'approvals.export': ['approvals.view'],
  'notifications.send': ['notifications.manage'],
  'notifications.delete': ['notifications.manage'],
  'roles.view': ['users.view'],
  'users.export': ['users.view'],
  'users.import': ['users.create'],
  'users.activate': ['users.update'],
  'sessions.terminate': ['sessions.manage'],
  'security.view': ['sessions.view'],
  'security.settings': ['sessions.manage'],
  'settings.appearance.manage': ['settings.update'],
  'settings.app_config.view': ['settings.view'],
  'settings.app_config.manage': ['settings.update'],
  'settings.config_studio.view': ['settings.view'],
  'settings.config_studio.manage': ['settings.update'],
  'settings.import.view': ['settings.view'],
  'settings.import.execute': ['admin.data'],
  'settings.dynamic_data.view': ['settings.view'],
  'settings.dynamic_data.manage': ['settings.update'],
  'settings.health.view': ['settings.maintenance'],
  'settings.health.manage': ['settings.maintenance'],
  'settings.license_mode.view': ['settings.view'],
  'settings.license_mode.manage': ['settings.update'],
  'settings.taxes.manage': ['settings.update'],
  'settings.numbering.manage': ['settings.update'],
  'settings.printers.manage': ['settings.update'],
  'settings.export': ['settings.view'],
  'electronic_invoices.print': ['electronic_invoices.view'],
  'electronic_invoices.export': ['electronic_invoices.view'],
  'hr.recruitment.hire': ['hr.recruitment.manage'],
  'hr.leave.export': ['hr.leave.view'],
  'hr.contracts.export': ['hr.contracts.view'],
  'hr.documents.export': ['hr.documents.view'],
  'hr.dashboard.view': ['employees.view'],
};

const ROLE_NAMES: Record<string, string> = {  ADMIN: 'مدير النظام',
  MANAGER: 'مدير',
  ACCOUNTANT: 'محاسب',
  SALES: 'مبيعات',
  CASHIER: 'كاشير',
  WAREHOUSE: 'مستودع',
};

function nowIso(): string {
  return new Date().toISOString();
}

export class PermissionService {
  private static cache: Map<string, { grants: Set<string>; denies: Set<string> }> | null = null;

  /** Idempotently populate the permissions catalog and seed built-in roles. */
  public static seed(): void {
    const db = DatabaseManager.getInstance();
    PermissionService.seedPermissionCatalog(db);
    PermissionService.seedBuiltInRoles(db);
    PermissionService.seedRoleDefaults(db);
    PermissionService.cache = null;
  }

  private static seedPermissionCatalog(db: DatabaseManager): void {
    const existing = new Set(db.query<{ code: string }>('SELECT code FROM permissions').map((r) => r.code));
    for (const p of PERMISSIONS) {
      if (!existing.has(p.code)) {
        db.run(
          'INSERT INTO permissions (id, code, name, module, description) VALUES (?, ?, ?, ?, ?)',
          [`perm_${p.code}`, p.code, p.name, p.module, '']
        );
      }
    }
  }

  private static seedBuiltInRoles(db: DatabaseManager): void {
    for (const [code, name] of Object.entries(ROLE_NAMES)) {
      db.run(
        `INSERT OR IGNORE INTO roles (id, code, name, description, is_system)
         VALUES (?, ?, ?, ?, 1)`,
        [`role_${code.toLowerCase()}`, code, name, '']
      );
    }
  }

  private static seedRoleDefaults(db: DatabaseManager): void {
    // Seed built-in role defaults exactly once. A persistent marker (not the
    // row count) is used so an admin can intentionally clear every permission
    // from a role without the defaults coming back on the next boot.
    for (const [roleCode, defaults] of Object.entries(ROLE_DEFAULTS)) {
      const markerKey = `rbac.seeded.${roleCode}`;
      const seeded = db.query('SELECT value FROM system_settings WHERE key = ?', [markerKey]);
      if (seeded.length > 0) {
        PermissionService.reconcileSeededRole(db, roleCode, defaults);
        continue;
      }
      for (const perm of defaults) {
        db.run(
          'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
          [roleCode, perm]
        );
      }
      db.run(
        `INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, '1')`,
        [markerKey]
      );
    }
  }

  private static reconcileSeededRole(db: DatabaseManager, roleCode: string, defaults: string[]): void {
    if (roleCode === 'ADMIN') {
      PermissionService.ensureAdminDataPermissions(db);
    }
    if (roleCode === 'MANAGER') {
      PermissionService.reconcileManagerPermissions(db, defaults);
      PermissionService.backfillInventoryCountApproval(db);
    }
    PermissionService.backfillRecruitmentPermissions(db, roleCode);
    PermissionService.backfillExportPermissions(db, roleCode);
    PermissionService.backfillReceivablesPermissions(db, roleCode);
    PermissionService.backfillPermissionMappings(db, roleCode);
  }

  private static backfillReceivablesPermissions(db: DatabaseManager, roleCode: string): void {
    const markerKey = `rbac.receivablesPermissions.v1.${roleCode}`;
    if (db.query('SELECT 1 FROM system_settings WHERE key = ?', [markerKey]).length) return;
    for (const permission of RECEIVABLE_PERMISSION_BACKFILL[roleCode] || []) {
      db.run('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)', [roleCode, permission]);
    }
    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [markerKey, '1']);
  }
  private static backfillPermissionMappings(db: DatabaseManager, roleCode: string): void {
    const markerKey = `rbac.permissionMappings.v1.${roleCode}`;
    if (db.query('SELECT 1 FROM system_settings WHERE key = ?', [markerKey]).length) return;
    for (const [newPermission, sources] of Object.entries(PERMISSION_BACKFILL_SOURCES)) {
      // Destructive (delete) grants are full-access capabilities and must never
      // be propagated through legacy coarse-grained sources for built-in roles.
      if (MANAGER_RESTRICTED.has(newPermission)) continue;
      const hasSource = sources.length === 0
        ? false
        : sources.some((source) => db.query('SELECT 1 FROM role_permissions WHERE role_code = ? AND permission_code = ?', [roleCode, source]).length > 0);
      if (hasSource) {
        db.run('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)', [roleCode, newPermission]);
      }
    }
    if (roleCode === 'ADMIN') {
      for (const permission of Object.keys(PERMISSION_BACKFILL_SOURCES)) {
        db.run('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)', [roleCode, permission]);
      }
    }
    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [markerKey, '1']);
  }


  private static backfillExportPermissions(db: DatabaseManager, roleCode: string): void {
    const markerKey = `rbac.exportBackfill.v2.${roleCode}`;
    const done = db.query('SELECT value FROM system_settings WHERE key = ?', [markerKey]);
    if (done.length > 0) return;
    for (const [exportCode, viewCode] of Object.entries(EXPORT_PERMISSION_SOURCES)) {
      const hasView = db.query(
        'SELECT 1 FROM role_permissions WHERE role_code = ? AND permission_code = ?',
        [roleCode, viewCode]
      ).length > 0;
      if (hasView) {
        db.run(
          'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
          [roleCode, exportCode]
        );
      }
    }
    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [markerKey, '1']);
  }

  private static ensureAdminDataPermissions(db: DatabaseManager): void {
    for (const permission of ['admin.data.export', 'admin.data.delete', 'inventory.count.approve']) {
      db.run(
        'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
        ['ADMIN', permission]
      );
    }
  }

  private static backfillRecruitmentPermissions(db: DatabaseManager, roleCode: string): void {
    const markerKey = `rbac.recruitmentPermissions.v1.${roleCode}`;
    if (db.query('SELECT 1 FROM system_settings WHERE key = ?', [markerKey]).length) return;
    if (roleCode === 'ADMIN') {
      db.run(
        'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
        ['ADMIN', 'hr.recruitment.view']
      );
      db.run(
        'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
        ['ADMIN', 'hr.recruitment.manage']
      );
    } else if (roleCode === 'MANAGER') {
      const current = new Set(db.query<{ permissionCode: string }>(
        'SELECT permission_code AS permissionCode FROM role_permissions WHERE role_code = ?',
        [roleCode]
      ).map((row) => row.permissionCode));
      if (current.has('employees.view')) {
        db.run(
          'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
          ['MANAGER', 'hr.recruitment.view']
        );
      }
      if (current.has('employees.manage')) {
        db.run(
          'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
          ['MANAGER', 'hr.recruitment.manage']
        );
      }
    }
    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [markerKey, '1']);
  }

  private static backfillInventoryCountApproval(db: DatabaseManager): void {
    const markerKey = 'rbac.inventoryCountApprovalBackfill.v1';
    if (db.query('SELECT 1 FROM system_settings WHERE key = ?', [markerKey]).length) return;
    const qualified = ['inventory.count', 'inventory.adjust', 'approvals.view'].every((permission) =>
      db.query('SELECT 1 FROM role_permissions WHERE role_code = ? AND permission_code = ?', ['MANAGER', permission]).length > 0
    );
    if (qualified) db.run('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)', ['MANAGER', 'inventory.count.approve']);
    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [markerKey, '1']);
  }

  private static reconcileManagerPermissions(db: DatabaseManager, defaults: string[]): void {
    const roleCode = 'MANAGER';
    const current = db.query<{ permissionCode: string }>(
      'SELECT permission_code AS permissionCode FROM role_permissions WHERE role_code = ?',
      [roleCode]
    ).map((row) => row.permissionCode);
    const legacyPermissions = ALL.filter((permission) =>
      permission !== 'admin.data.export' && permission !== 'admin.data.delete'
    );
    const retainsOriginalFullGrant =
      (current.length === ALL.length && ALL.every((permission) => current.includes(permission))) ||
      (current.length === legacyPermissions.length && legacyPermissions.every((permission) => current.includes(permission)));
    db.executeTransaction(() => {
      if (retainsOriginalFullGrant) {
        db.run('DELETE FROM role_permissions WHERE role_code = ?', [roleCode]);
        for (const permission of defaults) {
          db.run(
            'INSERT INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
            [roleCode, permission]
          );
        }
      } else {
        // Keep view/export grants for customized managers, but strip deletion.
        db.run('DELETE FROM role_permissions WHERE role_code = ? AND permission_code = ?', [roleCode, 'admin.data.delete']);
        db.run('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)', [roleCode, 'admin.data']);
        db.run('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)', [roleCode, 'admin.data.export']);
      }
    });
  }

  // ─── Catalog & roles ────────────────────────────────────────────────────────

  public static getCatalog(): PermissionDef[] {
    return PERMISSIONS;
  }

  public static getModules(): string[] {
    return Array.from(new Set(PERMISSIONS.map((p) => p.module)));
  }

  /** أسماء عربية مقروءة لوحدات الصلاحيات، تُستخدم في مصفوفة الأدوار. */
  public static getModuleLabels(): Record<string, string> {
    return {
      DASHBOARD: 'لوحة المعلومات',
      PRODUCTS: 'المنتجات',
      CATEGORIES: 'التصنيفات',
      BRANDS: 'الماركات',
      INVENTORY: 'المخزون',
      SALES: 'المبيعات ونقطة البيع',
      QUOTATIONS: 'عروض الأسعار',
      ORDERS: 'طلبات البيع',
      RETURNS: 'المرتجعات',
      PURCHASES: 'المشتريات',
      CUSTOMERS: 'العملاء',
      SUPPLIERS: 'الموردون',
      CASHIER: 'الخزينة والكاشير',
      FINANCE: 'المالية والمحاسبة',
      REPORTS: 'التقارير',
      CRM: 'علاقات العملاء',
      MANUFACTURING: 'التصنيع',
      PROJECTS: 'المشاريع',
      PRICING: 'التسعير',
      PROMOTIONS: 'العروض والخصومات',
      OPERATIONS: 'العمليات',
      BRANCHES: 'الفروع',
      WAREHOUSES: 'المخازن',
      EMPLOYEES: 'الموظفون والرواتب',
      DELIVERIES: 'التوصيل',
      DRIVERS: 'السائقون',
      VEHICLES: 'المركبات',
      APPROVALS: 'الموافقات',
      NOTIFICATIONS: 'الإشعارات',
      USERS: 'المستخدمون',
      ROLES: 'الأدوار والصلاحيات',
      SESSIONS: 'الجلسات',
      SECURITY: 'الأمان',
      SETTINGS: 'الإعدادات',
      AUDIT: 'سجل التدقيق',
      ADMIN: 'الإدارة والنظام',
      E_INVOICING: 'الفاتورة الإلكترونية',
      LOYALTY: 'برنامج الولاء',
      ANALYTICS: 'التحليلات',
      MODULES: 'وحدات الأعمال',
      COMPANIES: 'الشركات',
      DOCUMENTS: 'المستندات',
      CONTRACTS: 'العقود',
      HR: 'الموارد البشرية',
    };
  }

  public static getRoles(): Role[] {
    return DatabaseManager.getInstance().query<Role>(
      'SELECT id, code, name, description, is_system AS isSystem, created_at AS createdAt FROM roles ORDER BY is_system DESC, name ASC'
    );
  }

  public static getRolePermissions(roleCode: string): string[] {
    return DatabaseManager.getInstance()
      .query<{ permissionCode: string }>(
        'SELECT permission_code AS permissionCode FROM role_permissions WHERE role_code = ?',
        [roleCode]
      )
      .map((r) => r.permissionCode);
  }

  public static setRolePermissions(roleCode: string, codes: string[], actor?: User | null): void {
    PermissionService.require(actor ?? null, 'roles.manage');
    const db = DatabaseManager.getInstance();
    const before = PermissionService.getRolePermissions(roleCode);
    db.executeTransaction(() => {
      db.run('DELETE FROM role_permissions WHERE role_code = ?', [roleCode]);
      for (const code of codes) {
        db.run(
          'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
          [roleCode, code]
        );
      }
    });
    PermissionService.cache = null;
    PermissionService.audit(actor, 'تعديل صلاحيات دور', 'ROLES', roleCode, before, codes);
  }

  public static createRole(input: { code: string; name: string; description?: string }, actor?: User | null): Role {
    PermissionService.require(actor ?? null, 'roles.manage');
    const db = DatabaseManager.getInstance();
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,30}$/.test(code)) {
      throw new Error('كود الدور يجب أن يكون بالإنجليزية (حروف كبيرة وأرقام و_ فقط).');
    }
    if (db.query('SELECT id FROM roles WHERE code = ?', [code]).length > 0) {
      throw new Error('كود الدور مستخدم مسبقاً.');
    }
    const id = `role_${uuidv4().substring(0, 8)}`;
    db.run(
      'INSERT INTO roles (id, code, name, description, is_system) VALUES (?, ?, ?, ?, 0)',
      [id, code, input.name.trim(), input.description || '']
    );
    PermissionService.audit(actor, 'إنشاء دور جديد', 'ROLES', id, null, input);
    return { id, code, name: input.name, description: input.description, isSystem: false, createdAt: nowIso() };
  }

  public static updateRole(id: string, patch: { name?: string; description?: string }, actor?: User | null): void {
    PermissionService.require(actor ?? null, 'roles.manage');
    const db = DatabaseManager.getInstance();
    const role = db.query<Role>('SELECT id, code, name, is_system AS isSystem FROM roles WHERE id = ?', [id])[0];
    if (!role) throw new Error('الدور غير موجود.');
    db.run('UPDATE roles SET name = ?, description = ? WHERE id = ?', [
      patch.name ?? role.name,
      patch.description ?? '',
      id,
    ]);
    PermissionService.audit(actor, 'تعديل دور', 'ROLES', id, role, patch);
  }

  public static deleteRole(id: string, actor?: User | null): void {
    PermissionService.require(actor ?? null, 'roles.manage');
    const db = DatabaseManager.getInstance();
    const role = db.query<Role>('SELECT id, code, is_system AS isSystem FROM roles WHERE id = ?', [id])[0];
    if (!role) throw new Error('الدور غير موجود.');
    if (role.isSystem) throw new Error('لا يمكن حذف دور أساسي من النظام.');
    const inUse = db.query<{ c: number }>('SELECT COUNT(*) AS c FROM users WHERE role = ?', [role.code])[0]?.c ?? 0;
    if (inUse > 0) throw new Error('لا يمكن حذف دور مرتبط بمستخدمين.');
    db.executeTransaction(() => {
      db.run('DELETE FROM role_permissions WHERE role_code = ?', [role.code]);
      db.run('DELETE FROM roles WHERE id = ?', [id]);
    });
    PermissionService.cache = null;
    PermissionService.audit(actor, 'حذف دور', 'ROLES', id, role, null);
  }

  // ─── Per-user overrides ─────────────────────────────────────────────────────

  public static getUserOverrides(userId: string): { code: string; effect: PermissionEffect }[] {
    try {
      return DatabaseManager.getInstance().query<{ code: string; effect: PermissionEffect }>(
        'SELECT permission_code AS code, COALESCE(effect, \'GRANT\') AS effect FROM user_permissions WHERE user_id = ?',
        [userId]
      );
    } catch {
      return [];
    }
  }

  public static setUserOverride(
    userId: string,
    permissionCode: string,
    effect: PermissionEffect | null,
    actor?: User | null
  ): void {
    PermissionService.require(actor ?? null, 'users.permissions');
    const db = DatabaseManager.getInstance();
    if (effect === null) {
      db.run('DELETE FROM user_permissions WHERE user_id = ? AND permission_code = ?', [userId, permissionCode]);
    } else {
      // Replace is not valid with a composite PK in sql.js for every version,
      // so delete-then-insert keeps behaviour deterministic.
      db.run('DELETE FROM user_permissions WHERE user_id = ? AND permission_code = ?', [userId, permissionCode]);
      db.run('INSERT INTO user_permissions (user_id, permission_code, effect) VALUES (?, ?, ?)', [
        userId,
        permissionCode,
        effect,
      ]);
    }
    PermissionService.cache = null;
    PermissionService.audit(actor, 'تعديل صلاحية مستخدم', 'USERS', userId, null, { permissionCode, effect });
  }

  public static clearUserOverrides(userId: string, actor?: User | null): void {
    PermissionService.require(actor ?? null, 'users.permissions');
    DatabaseManager.getInstance().run('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
    PermissionService.cache = null;
    PermissionService.audit(actor, 'مسح تخصيصات صلاحيات مستخدم', 'USERS', userId, null, null);
  }

  // ─── Effective permission resolution ────────────────────────────────────────

  private static loadSets(user: User | null): { grants: Set<string>; denies: Set<string> } {
    if (!user) return { grants: new Set(), denies: new Set() };

    if (PermissionService.cache && PermissionService.cache.has(user.id)) {
      return PermissionService.cache.get(user.id)!;
    }

    // ADMIN always has everything and cannot be locked out.
    if (user.role === 'ADMIN') {
      const sets = { grants: new Set<string>(ALL), denies: new Set<string>() };
      PermissionService.cache = PermissionService.cache || new Map();
      PermissionService.cache.set(user.id, sets);
      return sets;
    }

    const db = DatabaseManager.getInstance();
    let roleCodes: string[] = [];
    let loadedFromDb = false;
    try {
      roleCodes = db
        .query<{ permissionCode: string }>(
          'SELECT permission_code AS permissionCode FROM role_permissions WHERE role_code = ?',
          [user.role]
        )
        .map((r) => r.permissionCode);
      loadedFromDb = true;
    } catch {
      // table may not exist in edge cases; fall back to built-in defaults
    }
    if (!loadedFromDb) {
      roleCodes = [...(ROLE_DEFAULTS[user.role] || [])];
    }

    const grants = new Set<string>(roleCodes);
    const denies = new Set<string>();
    try {
      const rows = db.query<{ code: string; effect: string }>(
        `SELECT permission_code AS code, COALESCE(effect, 'GRANT') AS effect
         FROM user_permissions WHERE user_id = ?`,
        [user.id]
      );
      for (const r of rows) {
        if (String(r.effect).toUpperCase() === 'DENY') denies.add(r.code);
        else grants.add(r.code);
      }
    } catch {
      // ignore — role defaults still apply
    }

    const sets = { grants, denies };
    PermissionService.cache = PermissionService.cache || new Map();
    PermissionService.cache.set(user.id, sets);
    return sets;
  }

  public static getEffectiveCodes(user: User | null): string[] {
    if (!user) return [];
    return Array.from(PermissionService.loadSets(user).grants).sort(compareAlphabetically);
  }

  public static can(user: User | null, required: string, scope?: string): boolean {
    if (!user) return false;
    // القيود المنشورة من منصة الإدارة المركزية تتقدّم على صلاحيات الأدوار،
    // فتُخفى الأزرار/الإجراءات تلقائياً في كل واجهة تعتمد على هذه الطبقة.
    if (!CentralFeaturePermissionService.allowsPermission(required, scope)) return false;
    return PermissionService.hasRoleGrant(user, required);
  }

  /**
   * فحص صلاحية الدور فقط (بدون قيود الصفحة المركزية). يُستخدم في طبقة
   * الخدمات لأن قيود المنصة مرتبطة بمسار الواجهة الحالي، وربطها بعمليات
   * خلفية (مزامنة/تقارير) قد يمنع أعمالًا مشروعة.
   */
  public static hasRoleGrant(user: User | null, required: string): boolean {
    if (!user) return false;
    const { grants, denies } = PermissionService.loadSets(user);
    const [mod] = required.split('.');
    // A user-level DENY always wins — including over role wildcards
    // ('sales.*' or '*'), which are the broadest grants a role can carry.
    if (denies.has(required) || denies.has(`${mod}.*`) || denies.has('*')) return false;
    if (grants.has(required)) return true;
    // wildcard support: 'sales.*' grants all sales.* permissions
    return grants.has(`${mod}.*`) || grants.has('*');
  }

  public static canAny(user: User | null, required: string[], scope?: string): boolean {
    return required.some((code) => PermissionService.can(user, code, scope));
  }

  /** Server-side (service-layer) enforcement — never trust the UI. */
  public static require(user: User | null, required: string, scope?: string): void {
    if (!user || !PermissionService.can(user, required, scope)) {
      PermissionService.audit(
        user,
        'محاولة وصول مرفوضة',
        'SECURITY',
        `perm:${required}`,
        null,
        { required, path: scope ?? CentralFeaturePermissionService.getCurrentPath() }
      );
      throw new Error(`غير مصرح لك بتنفيذ هذا الإجراء (الصلاحية المطلوبة: ${required}).`);
    }
  }

  /** Require any one of several permission codes (least-privilege alternatives). */
  public static requireAny(user: User | null, required: string[], scope?: string): void {
    if (required.length === 0) throw new Error('لم تُحدد صلاحية مطلوبة.');
    if (!PermissionService.canAny(user, required, scope)) {
      const codes = required.join(' أو ');
      PermissionService.audit(
        user,
        'محاولة وصول مرفوضة',
        'SECURITY',
        `perm:${codes}`,
        null,
        { required: codes, path: scope ?? CentralFeaturePermissionService.getCurrentPath() }
      );
      throw new Error(`غير مصرح لك بتنفيذ هذا الإجراء (الصلاحية المطلوبة: ${codes}).`);
    }
  }

  public static invalidate(user?: User): void {
    if (user && PermissionService.cache) PermissionService.cache.delete(user.id);
    else PermissionService.cache = null;
  }

  private static audit(
    actor: User | null | undefined,
    action: string,
    module: string,
    recordId: string | null,
    oldValues: unknown,
    newValues: unknown
  ): void {
    try {
      new AuditService().log({
        userId: actor?.id || 'system',
        userName: actor?.fullName || 'النظام',
        action,
        module,
        recordId: recordId || undefined,
        oldValues: oldValues == null ? undefined : JSON.stringify(oldValues),
        newValues: newValues == null ? undefined : JSON.stringify(newValues),
      });
    } catch {
      // auditing must never break the operation
    }
  }
}
