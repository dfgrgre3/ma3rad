import type { Migration } from './support';
import { DEFAULT_BRANCH_ID } from './support';

/**
 * Seeds the single platform-owner account, its built-in role, the permission
 * wildcard, and the initial commercial catalogue (plans, modules, flags,
 * releases and settings). Idempotent so it is safe on existing databases.
 */
const DEFAULT_PLATFORM_PASSWORD_HASH =
  '$2a$10$KJzlFD3QCu5JpZHfsS7joO2SSV1HAavbfMlwO8d6q1TmSTv/nh2QO'; // Platform@2026

const PLATFORM_PERMISSIONS = [
  'platform.tenants.view',
  'platform.tenants.manage',
  'platform.licenses.view',
  'platform.licenses.manage',
  'platform.billing.view',
  'platform.billing.manage',
  'platform.plans.view',
  'platform.plans.manage',
  'platform.product.view',
  'platform.product.manage',
  'platform.audit.view',
  'platform.settings.manage',
];

const DEFAULT_PLANS: Array<[string, string, string, string, string, number, number, number, number, number, string, string, number, number]> = [
  ['plan_basic', 'BASIC', 'الأساسية', 'مناسبة للمعارض الصغيرة والبداية السريعة', 'YEARLY', 1499, 2, 1, 2, 1, '["dashboard","sales","pos","inventory"]', '["offline_sync"]', 1, 1],
  ['plan_professional', 'PROFESSIONAL', 'الاحترافية', 'الأكثر طلباً للمعارض المتوسطة متعددة الفروع', 'YEARLY', 3499, 10, 3, 8, 2, '["dashboard","sales","pos","inventory","purchases","customers","crm","finance","reports"]', '["offline_sync","multi_branch","advanced_reports","e_invoicing"]', 2, 0],
  ['plan_enterprise', 'ENTERPRISE', 'المؤسسية', 'تحكم كامل بكل الوحدات والفروع والمستخدمين', 'YEARLY', 7999, 50, 20, 30, 3, '["dashboard","sales","pos","inventory","purchases","customers","crm","finance","cashier","reports","hr","projects","manufacturing","operations","documents","approvals","restaurant"]', '["offline_sync","multi_branch","advanced_reports","e_invoicing","loyalty","restaurant_mode","api_access","audit_export"]', 3, 0],
];

const DEFAULT_MODULES: Array<[string, string, string, string, number]> = [
  ['dashboard', 'لوحة المعلومات', 'المؤشرات التنفيذية والملخصات اليومية', 'CORE', 1],
  ['sales', 'المبيعات', 'فواتير البيع والمرتجعات والعروض', 'SALES', 2],
  ['pos', 'نقطة البيع', 'كاشير سريع مناسب للمعارض', 'SALES', 3],
  ['inventory', 'المخزون', 'الأرصدة والتحويلات والجرد والتقييم', 'OPERATIONS', 4],
  ['purchases', 'المشتريات', 'أوامر الشراء والاستلام والموردون', 'OPERATIONS', 5],
  ['customers', 'العملاء', 'ملفات العملاء والأرصدة والتحصيل', 'CRM', 6],
  ['crm', 'علاقات العملاء', 'العملاء المحتملون والفرص والحملات', 'CRM', 7],
  ['finance', 'المالية', 'الحسابات والقيود والتقارير المالية', 'FINANCE', 8],
  ['cashier', 'الخزينة', 'الورديات والمصروفات والتحصيل', 'FINANCE', 9],
  ['reports', 'التقارير', 'مركز التقارير والتحليلات', 'REPORTING', 10],
  ['hr', 'الموارد البشرية', 'الموظفون والحضور والإجازات', 'HR', 11],
  ['projects', 'المشاريع', 'تنفيذ المشاريع والمقايسات', 'OPERATIONS', 12],
  ['manufacturing', 'التصنيع', 'أوامر الإنتاج وقوائم المواد', 'OPERATIONS', 13],
  ['documents', 'المستندات', 'الأرشيف والموافقات والعقود', 'CORE', 14],
  ['restaurant', 'المطاعم', 'وضع المطاعم والطاولات', 'SALES', 15],
];

const DEFAULT_FEATURES: Array<[string, string, string, string]> = [
  ['offline_sync', 'المزامنة دون اتصال', 'تزامن البيانات بين الفروع والأجهزة عند عودة الشبكة', 'SYNC'],
  ['multi_branch', 'تعدد الفروع', 'إدارة أكثر من فرع بصلاحيات منفصلة', 'ORGANIZATION'],
  ['advanced_reports', 'التقارير المتقدمة', 'تحليلات ولوحات تنفيذية متقدمة', 'REPORTING'],
  ['e_invoicing', 'الفاتورة الإلكترونية', 'إصدار وربط الفواتير الإلكترونية', 'COMPLIANCE'],
  ['loyalty', 'برنامج الولاء', 'نقاط ومكافآت العملاء', 'CRM'],
  ['restaurant_mode', 'وضع المطاعم', 'إدارة الطاولات وقوائم المطاعم', 'SALES'],
  ['api_access', 'واجهات API', 'ربط الأنظمة الخارجية عبر واجهات آمنة', 'INTEGRATION'],
  ['audit_export', 'تصدير سجل التدقيق', 'تصدير كامل لسجل العمليات', 'SECURITY'],
];

export const MIGRATION_PART_72: Migration = {
  id: '190_platform_super_admin',
  description: 'Seed the single platform-owner account, platform role, plans, modules and feature catalogue.',
  up: (db) => {
    // 1. Built-in platform role.
    db.run(
      `INSERT OR IGNORE INTO roles (id, code, name, description, is_system)
       VALUES ('role_super_admin', 'SUPER_ADMIN', 'مالك المنصة', 'تحكم كامل في المنصة والعملاء والتراخيص والمبيعات', 1)`
    );

    // 2. Permission wildcard + explicit platform permissions for the role.
    db.run(
      `INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES ('SUPER_ADMIN', '*')`
    );
    for (const code of PLATFORM_PERMISSIONS) {
      db.run(
        `INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES ('SUPER_ADMIN', ?)`,
        [code]
      );
    }

    // 3. The single platform-owner account (created once; never overwritten).
    db.run(
      `INSERT OR IGNORE INTO users
         (id, username, password_hash, full_name, role, phone, pin_code, is_active, branch_id, branch_scope)
       VALUES ('usr_platform', 'platform', ?, 'مالك المنصة', 'SUPER_ADMIN', NULL, NULL, 1, ?, 'ALL')`,
      [DEFAULT_PLATFORM_PASSWORD_HASH, DEFAULT_BRANCH_ID]
    );

    // 4. Commercial catalogue.
    for (const [id, code, name, description, cycle, price, seats, branches, devices, sort, modules, features, isDefault] of DEFAULT_PLANS) {
      db.run(
        `INSERT OR IGNORE INTO platform_plans
           (id, code, name, description, billing_cycle, price, currency, seats_limit, branches_limit,
            devices_limit, included_modules, features, is_active, is_default, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 'EGP', ?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, code, name, description, cycle, price, seats, branches, devices, modules, features, isDefault, sort]
      );
    }

    for (const [code, name, description, category, sort] of DEFAULT_MODULES) {
      db.run(
        `INSERT OR IGNORE INTO platform_modules (id, code, name, description, category, is_enabled, sort_order)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [`pmod_${code}`, code, name, description, category, sort]
      );
    }

    for (const [code, name, description, category] of DEFAULT_FEATURES) {
      db.run(
        `INSERT OR IGNORE INTO platform_feature_flags (id, code, name, description, category, is_enabled, rollout_percent)
         VALUES (?, ?, ?, ?, ?, 1, 100)`,
        [`pflag_${code}`, code, name, description, category]
      );
    }

    db.run(
      `INSERT OR IGNORE INTO platform_releases (id, version, channel, status, notes, released_at)
       VALUES ('prel_1_1_5', '1.1.5', 'STABLE', 'PUBLISHED', 'الإصدار الأساسي لنظام إدارة معارض السيراميك', CURRENT_TIMESTAMP)`
    );

    const settings: Array<[string, string]> = [
      ['platform_name', 'سيراميسي'],
      ['support_email', 'support@ceramisys.app'],
      ['support_phone', ''],
      ['default_currency', 'EGP'],
      ['default_trial_days', '14'],
      ['invoice_prefix', 'CS-INV'],
    ];
    for (const [key, value] of settings) {
      db.run(
        `INSERT OR IGNORE INTO platform_settings (key, value) VALUES (?, ?)`,
        [key, value]
      );
    }
  },
};
