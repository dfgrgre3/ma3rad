import { DatabaseManager } from '../database/db';
import { AuditService } from './AuditService';
import type { Role, User } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface PermissionDef {
  code: string;
  name: string;
  module: string;
}

export type PermissionEffect = 'GRANT' | 'DENY';

// ─── Permission catalog ───────────────────────────────────────────────────────
// Every actionable capability in the app lives here. UI guards, route guards
// and service-layer enforcement all resolve against these codes.
export const PERMISSIONS: PermissionDef[] = [
  // Dashboard
  { code: 'dashboard.view', name: 'عرض لوحة المعلومات', module: 'DASHBOARD' },
  { code: 'dashboard.export', name: 'تصدير بيانات لوحة المعلومات', module: 'DASHBOARD' },

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
  { code: 'inventory.export', name: 'تصدير بيانات المخزون', module: 'INVENTORY' },

  // Sales
  { code: 'sales.view', name: 'عرض المبيعات', module: 'SALES' },
  { code: 'sales.create', name: 'إنشاء فاتورة بيع', module: 'SALES' },
  { code: 'sales.update', name: 'تعديل فاتورة بيع', module: 'SALES' },
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

  // Orders
  { code: 'orders.view', name: 'عرض الطلبات', module: 'ORDERS' },
  { code: 'orders.create', name: 'إنشاء طلب', module: 'ORDERS' },
  { code: 'orders.update', name: 'تعديل طلب', module: 'ORDERS' },
  { code: 'orders.delete', name: 'حذف طلب', module: 'ORDERS' },
  { code: 'orders.approve', name: 'اعتماد طلب', module: 'ORDERS' },

  // Returns
  { code: 'returns.view', name: 'عرض المرتجعات', module: 'RETURNS' },
  { code: 'returns.create', name: 'إنشاء مرتجع', module: 'RETURNS' },
  { code: 'returns.approve', name: 'اعتماد مرتجع', module: 'RETURNS' },

  // Purchases
  { code: 'purchases.view', name: 'عرض المشتريات', module: 'PURCHASES' },
  { code: 'purchases.create', name: 'إدخال مشتريات وتوريد', module: 'PURCHASES' },
  { code: 'purchases.update', name: 'تعديل مشتريات', module: 'PURCHASES' },
  { code: 'purchases.delete', name: 'حذف مشتريات', module: 'PURCHASES' },
  { code: 'purchases.return', name: 'مرتجعات الشراء', module: 'PURCHASES' },
  { code: 'purchases.approve', name: 'اعتماد طلبات الشراء', module: 'PURCHASES' },

  // Customers
  { code: 'customers.view', name: 'عرض العملاء', module: 'CUSTOMERS' },
  { code: 'customers.create', name: 'إضافة عميل', module: 'CUSTOMERS' },
  { code: 'customers.update', name: 'تعديل عميل', module: 'CUSTOMERS' },
  { code: 'customers.delete', name: 'حذف عميل', module: 'CUSTOMERS' },
  { code: 'customers.payment', name: 'تحصيل من عميل', module: 'CUSTOMERS' },
  { code: 'customers.export', name: 'تصدير العملاء', module: 'CUSTOMERS' },

  // Suppliers
  { code: 'suppliers.view', name: 'عرض الموردين', module: 'SUPPLIERS' },
  { code: 'suppliers.create', name: 'إضافة مورد', module: 'SUPPLIERS' },
  { code: 'suppliers.update', name: 'تعديل مورد', module: 'SUPPLIERS' },
  { code: 'suppliers.delete', name: 'حذف مورد', module: 'SUPPLIERS' },
  { code: 'suppliers.payment', name: 'سداد لمورد', module: 'SUPPLIERS' },

  // Cashier / treasury
  { code: 'cashier.view', name: 'عرض الخزينة', module: 'CASHIER' },
  { code: 'cashier.expense', name: 'إثبات مصروف', module: 'CASHIER' },
  { code: 'cashier.shift', name: 'فتح/إغلاق وردية', module: 'CASHIER' },
  { code: 'cashier.manage', name: 'إدارة الخزائن', module: 'CASHIER' },

  // Finance
  { code: 'finance.view', name: 'عرض التقارير المالية', module: 'FINANCE' },
  { code: 'finance.approve', name: 'اعتماد مالي', module: 'FINANCE' },
  { code: 'finance.debts.view', name: 'عرض الديون والذمم', module: 'FINANCE' },
  { code: 'finance.installments.view', name: 'عرض الأقساط', module: 'FINANCE' },
  { code: 'finance.installments.manage', name: 'إدارة الأقساط', module: 'FINANCE' },

  // Reports
  { code: 'reports.view', name: 'عرض التقارير', module: 'REPORTS' },
  { code: 'reports.export', name: 'تصدير التقارير', module: 'REPORTS' },

  // CRM
  { code: 'crm.view', name: 'عرض العملاء المحتملين', module: 'CRM' },
  { code: 'crm.create', name: 'إضافة عميل محتمل', module: 'CRM' },
  { code: 'crm.update', name: 'تعديل ومتابعة العملاء المحتملين', module: 'CRM' },
  { code: 'crm.delete', name: 'حذف عميل محتمل', module: 'CRM' },

  // Projects
  { code: 'projects.view', name: 'عرض المشاريع', module: 'PROJECTS' },
  { code: 'projects.create', name: 'إضافة مشروع', module: 'PROJECTS' },
  { code: 'projects.update', name: 'تعديل مشروع', module: 'PROJECTS' },
  { code: 'projects.delete', name: 'حذف مشروع', module: 'PROJECTS' },

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
  { code: 'employees.manage', name: 'إدارة الموظفين والرواتب', module: 'EMPLOYEES' },
  { code: 'deliveries.view', name: 'عرض التوصيل', module: 'DELIVERIES' },
  { code: 'deliveries.manage', name: 'إدارة التوصيل', module: 'DELIVERIES' },
  { code: 'drivers.view', name: 'عرض السائقين', module: 'DRIVERS' },
  { code: 'drivers.manage', name: 'إدارة السائقين', module: 'DRIVERS' },
  { code: 'vehicles.view', name: 'عرض المركبات', module: 'VEHICLES' },
  { code: 'vehicles.manage', name: 'إدارة المركبات', module: 'VEHICLES' },

  // Approvals
  { code: 'approvals.view', name: 'عرض صندوق الموافقات', module: 'APPROVALS' },
  { code: 'approvals.approve', name: 'اعتماد أو رفض الطلبات', module: 'APPROVALS' },

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
  { code: 'sessions.manage', name: 'إدارة الجلسات', module: 'SESSIONS' },

  // Settings & system
  { code: 'settings.view', name: 'عرض الإعدادات', module: 'SETTINGS' },
  { code: 'settings.update', name: 'تعديل الإعدادات', module: 'SETTINGS' },
  { code: 'settings.backup', name: 'النسخ الاحتياطي والاستعادة', module: 'SETTINGS' },
  { code: 'audit.view', name: 'عرض سجل التدقيق', module: 'AUDIT' },
  { code: 'audit.export', name: 'تصدير سجل التدقيق', module: 'AUDIT' },
  { code: 'admin.view', name: 'الدخول إلى مركز التحكم', module: 'ADMIN' },
  { code: 'admin.navigation', name: 'تخصيص قوائم التنقل', module: 'ADMIN' },
  { code: 'admin.data', name: 'أدوات البيانات والصيانة', module: 'ADMIN' },
  { code: 'admin.data.export', name: 'تصدير بيانات النظام', module: 'ADMIN' },
  { code: 'admin.data.delete', name: 'حذف بيانات النظام', module: 'ADMIN' },

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

  // Analytics
  { code: 'analytics.view', name: 'عرض التحليلات المتقدمة', module: 'ANALYTICS' },
  { code: 'analytics.write', name: 'تسجيل مقاييس التحليلات', module: 'ANALYTICS' },
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
  'admin.data',
]);

export const ROLE_DEFAULTS: Record<string, string[]> = {
  ADMIN: [...ALL],
  MANAGER: [...ALL.filter((code) => !MANAGER_RESTRICTED.has(code)), 'admin.data', 'admin.data.export'],
  ACCOUNTANT: [
    'dashboard.view', 'dashboard.export',
    'products.view', 'categories.view', 'brands.view',
    'inventory.view', 'sales.view', 'sales.export',
    'quotations.view', 'orders.view', 'returns.view',
    'purchases.view', 'purchases.approve',
    'customers.view', 'customers.payment', 'customers.export',
    'suppliers.view', 'suppliers.payment',
    'cashier.view', 'cashier.expense', 'cashier.shift',
    'finance.view', 'finance.approve', 'finance.debts.view',
    'finance.installments.view', 'finance.installments.manage',
    'reports.view', 'reports.export',
    'crm.view', 'projects.view', 'pricing.view', 'promotions.view',
    'operations.view', 'branches.view', 'warehouses.view',
    'employees.view', 'deliveries.view', 'drivers.view', 'vehicles.view',
    'approvals.view', 'approvals.approve',
    'notifications.view', 'audit.view', 'audit.export',
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
    'approvals.view', 'notifications.view',
    'employees.view', 'deliveries.view', 'branches.view', 'warehouses.view',
  ],
  CASHIER: [
    'dashboard.view', 'products.view', 'categories.view', 'brands.view',
    'sales.view', 'sales.create', 'sales.refund', 'sales.credit',
    'quotations.view', 'orders.view', 'returns.view', 'returns.create',
    'customers.view', 'customers.create', 'customers.payment',
    'cashier.view', 'cashier.expense', 'cashier.shift',
    'crm.view', 'notifications.view',
  ],
  WAREHOUSE: [
    'dashboard.view', 'products.view', 'categories.view', 'brands.view',
    'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.count',
    'purchases.view', 'purchases.create', 'returns.view',
    'operations.view', 'branches.view', 'warehouses.view', 'warehouses.manage',
    'deliveries.view', 'deliveries.manage', 'drivers.view', 'vehicles.view',
    'employees.view', 'approvals.view', 'notifications.view',
  ],
};

const ROLE_NAMES: Record<string, string> = {
  ADMIN: 'مدير النظام',
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
    const existing = new Set(db.query<{ code: string }>('SELECT code FROM permissions').map((r) => r.code));
    for (const p of PERMISSIONS) {
      if (!existing.has(p.code)) {
        db.run(
          'INSERT INTO permissions (id, code, name, module, description) VALUES (?, ?, ?, ?, ?)',
          [`perm_${p.code}`, p.code, p.name, p.module, '']
        );
      }
    }

    // Ensure built-in roles exist even on databases created before the roles
    // table was introduced.
    for (const [code, name] of Object.entries(ROLE_NAMES)) {
      db.run(
        `INSERT OR IGNORE INTO roles (id, code, name, description, is_system)
         VALUES (?, ?, ?, ?, 1)`,
        [`role_${code.toLowerCase()}`, code, name, '']
      );
    }

    // Seed built-in role defaults exactly once. A persistent marker (not the
    // row count) is used so an admin can intentionally clear every permission
    // from a role without the defaults coming back on the next boot.
    for (const [roleCode, defaults] of Object.entries(ROLE_DEFAULTS)) {
      const markerKey = `rbac.seeded.${roleCode}`;
      const seeded = db.query('SELECT value FROM system_settings WHERE key = ?', [markerKey]);
      if (seeded.length > 0) {
        if (roleCode === 'ADMIN') {
          for (const permission of ['admin.data.export', 'admin.data.delete']) {
            db.run(
              'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
              [roleCode, permission]
            );
          }
        }
        if (roleCode === 'MANAGER') {
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

    PermissionService.cache = null;
  }

  // ─── Catalog & roles ────────────────────────────────────────────────────────

  public static getCatalog(): PermissionDef[] {
    return PERMISSIONS;
  }

  public static getModules(): string[] {
    return Array.from(new Set(PERMISSIONS.map((p) => p.module)));
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
    return Array.from(PermissionService.loadSets(user).grants).sort();
  }

  public static can(user: User | null, required: string): boolean {
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

  public static canAny(user: User | null, required: string[]): boolean {
    return required.some((code) => PermissionService.can(user, code));
  }

  /** Server-side (service-layer) enforcement — never trust the UI. */
  public static require(user: User | null, required: string): void {
    if (!PermissionService.can(user, required)) {
      PermissionService.audit(
        user,
        'محاولة وصول مرفوضة',
        'SECURITY',
        `perm:${required}`,
        null,
        { required, path: typeof window !== 'undefined' ? window.location.hash : '' }
      );
      throw new Error(`غير مصرح لك بتنفيذ هذا الإجراء (الصلاحية المطلوبة: ${required}).`);
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
