import { DatabaseManager } from '../database/db';
import type { User } from '../types';

export interface PermissionDef {
  code: string;
  name: string;
  module: string;
}

// Granular permission matrix (brief §41/§237). Wildcard-checking is supported via 'module.*'.
export const PERMISSIONS: PermissionDef[] = [
  { code: 'dashboard.view', name: 'عرض لوحة المعلومات', module: 'DASHBOARD' },

  { code: 'products.view', name: 'عرض الأصناف', module: 'PRODUCTS' },
  { code: 'products.create', name: 'إضافة صنف', module: 'PRODUCTS' },
  { code: 'products.update', name: 'تعديل صنف', module: 'PRODUCTS' },
  { code: 'products.delete', name: 'حذف/تعطيل صنف', module: 'PRODUCTS' },

  { code: 'inventory.view', name: 'عرض المخزون', module: 'INVENTORY' },
  { code: 'inventory.adjust', name: 'تسوية المخزون', module: 'INVENTORY' },
  { code: 'inventory.transfer', name: 'تحويل بين المخازن', module: 'INVENTORY' },
  { code: 'inventory.count', name: 'جرد المخزون', module: 'INVENTORY' },

  { code: 'sales.view', name: 'عرض المبيعات', module: 'SALES' },
  { code: 'sales.create', name: 'إنشاء فاتورة بيع', module: 'SALES' },
  { code: 'sales.discount', name: 'منح خصم استثنائي', module: 'SALES' },
  { code: 'sales.refund', name: 'مرتجعات البيع', module: 'SALES' },
  { code: 'sales.approve', name: 'اعتماد أسعار/خصومات', module: 'SALES' },
  { code: 'sales.void', name: 'إلغاء فاتورة', module: 'SALES' },

  { code: 'purchases.view', name: 'عرض المشتريات', module: 'PURCHASES' },
  { code: 'purchases.create', name: 'إدخال مشتريات وتوريد', module: 'PURCHASES' },

  { code: 'customers.view', name: 'عرض العملاء', module: 'CUSTOMERS' },
  { code: 'customers.create', name: 'إضافة عميل', module: 'CUSTOMERS' },
  { code: 'customers.payment', name: 'تحصيل من عميل', module: 'CUSTOMERS' },

  { code: 'suppliers.view', name: 'عرض الموردين', module: 'SUPPLIERS' },
  { code: 'suppliers.payment', name: 'سداد لمورد', module: 'SUPPLIERS' },

  { code: 'cashier.view', name: 'عرض الخزينة', module: 'CASHIER' },
  { code: 'cashier.expense', name: 'إثبات مصروف', module: 'CASHIER' },
  { code: 'cashier.shift', name: 'فتح/إغلاق وردية', module: 'CASHIER' },

  { code: 'finance.view', name: 'عرض التقارير المالية', module: 'FINANCE' },
  { code: 'finance.approve', name: 'اعتماد مالي', module: 'FINANCE' },

  { code: 'reports.view', name: 'عرض التقارير', module: 'REPORTS' },
  { code: 'reports.export', name: 'تصدير التقارير', module: 'REPORTS' },

  { code: 'users.view', name: 'عرض المستخدمين', module: 'USERS' },
  { code: 'users.create', name: 'إضافة مستخدم', module: 'USERS' },
  { code: 'users.update', name: 'تعديل مستخدم', module: 'USERS' },
  { code: 'users.delete', name: 'حذف مستخدم', module: 'USERS' },

  { code: 'settings.view', name: 'عرض الإعدادات', module: 'SETTINGS' },
  { code: 'settings.update', name: 'تعديل الإعدادات', module: 'SETTINGS' },

  { code: 'audit.view', name: 'عرض سجل التدقيق', module: 'AUDIT' },

  { code: 'categories.view', name: 'عرض التصنيفات', module: 'CATEGORIES' },
  { code: 'categories.create', name: 'إضافة تصنيف', module: 'CATEGORIES' },
  { code: 'categories.update', name: 'تعديل تصنيف', module: 'CATEGORIES' },
  { code: 'categories.delete', name: 'حذف تصنيف', module: 'CATEGORIES' },

  { code: 'brands.view', name: 'عرض الماركات', module: 'BRANDS' },
  { code: 'brands.create', name: 'إضافة ماركة', module: 'BRANDS' },
  { code: 'brands.update', name: 'تعديل ماركة', module: 'BRANDS' },
  { code: 'brands.delete', name: 'حذف ماركة', module: 'BRANDS' },

  { code: 'transfers.view', name: 'عرض التحويلات', module: 'TRANSFERS' },
  { code: 'transfers.create', name: 'إنشاء تحويل', module: 'TRANSFERS' },

  { code: 'notifications.view', name: 'عرض الإشعارات', module: 'NOTIFICATIONS' },
  { code: 'notifications.manage', name: 'إدارة الإشعارات', module: 'NOTIFICATIONS' },
];

// Default permissions granted to each role. ADMIN/MANAGER get everything.
const ALL = PERMISSIONS.map((p) => p.code);

const ROLE_DEFAULTS: Record<string, string[]> = {
  ADMIN: [...ALL],
  MANAGER: [...ALL],
  ACCOUNTANT: [
    'dashboard.view', 'products.view', 'inventory.view', 'sales.view',
    'purchases.view', 'customers.view', 'customers.payment', 'suppliers.view',
    'suppliers.payment', 'cashier.view', 'cashier.expense', 'cashier.shift',
    'finance.view', 'finance.approve', 'reports.view', 'reports.export', 'audit.view',
  ],
  SALES: [
    'dashboard.view', 'products.view', 'inventory.view',
    'sales.view', 'sales.create', 'sales.refund', 'sales.approve',
    'customers.view', 'customers.create', 'customers.payment',
    'reports.view',
  ],
  CASHIER: [
    'dashboard.view', 'products.view', 'sales.view', 'sales.create',
    'sales.refund', 'customers.view', 'cashier.view', 'cashier.expense',
  ],
  WAREHOUSE: [
    'dashboard.view', 'products.view', 'inventory.view', 'inventory.adjust',
    'inventory.transfer', 'inventory.count', 'purchases.view',
  ],
};

export class PermissionService {
  private static cache: Map<string, Set<string>> | null = null;

  /** Idempotently populate the permissions catalog (brief §41). Safe to call on every boot. */
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
    PermissionService.cache = null;
  }

  private static loadEffective(user: User): Set<string> {
    if (PermissionService.cache && PermissionService.cache.has(user.id)) {
      return PermissionService.cache.get(user.id)!;
    }
    const effective = new Set<string>(ROLE_DEFAULTS[user.role] || []);
    try {
      const rows = DatabaseManager.getInstance().query<{ permission_code: string }>(
        'SELECT permission_code FROM user_permissions WHERE user_id = ?',
        [user.id]
      );
      for (const r of rows) effective.add(r.permission_code);
    } catch {
      // table may not exist in edge cases; role defaults still apply
    }
    if (!PermissionService.cache) PermissionService.cache = new Map();
    PermissionService.cache.set(user.id, effective);
    return effective;
  }

  public static can(user: User | null, required: string): boolean {
    if (!user) return false;
    const effective = PermissionService.loadEffective(user);
    if (effective.has(required)) return true;
    // wildcard support: 'sales.*' grants all sales.* permissions
    const [mod] = required.split('.');
    return effective.has(`${mod}.*`);
  }

  /** Server-side (service-layer) enforcement — never trust the UI (brief §108). */
  public static require(user: User | null, required: string): void {
    if (!PermissionService.can(user, required)) {
      throw new Error(`غير مصرح لك بتنفيذ هذا الإجراء (الصلاحية المطلوبة: ${required}).`);
    }
  }

  public static invalidate(user?: User): void {
    if (user && PermissionService.cache) PermissionService.cache.delete(user.id);
    else PermissionService.cache = null;
  }
}
