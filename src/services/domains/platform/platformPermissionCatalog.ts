/**
 * Platform (Super Admin) granular permission catalog.
 *
 * Every platform page and button is gated by one of these codes — never by a
 * bare module name. The codes are grouped into sections; each section exposes
 * the six standard actions (view/create/update/delete/approve/export) where
 * they apply, plus section-specific "special" operations.
 *
 * This module is intentionally dependency-free so both the database migration
 * (seeding) and the runtime authorization service can import it.
 */

export interface PlatformPermissionDefinition {
  code: string;
  module: string;
  action: string;
  /** Arabic display name. */
  name: string;
  /** True for operations outside the six standard matrix columns. */
  special?: boolean;
}

export interface PlatformPermissionSection {
  module: string;
  /** Arabic section title shown in the RBAC matrix. */
  title: string;
  /** Which of the six standard action columns are rendered as checkboxes. */
  standardActions: Array<'view' | 'create' | 'update' | 'delete' | 'approve' | 'export'>;
  permissions: PlatformPermissionDefinition[];
}

const std = (
  module: string,
  action: PlatformPermissionDefinition['action'],
  name: string,
): PlatformPermissionDefinition => ({ code: `platform.${module}.${action}`, module, action, name });

const special = (
  module: string,
  action: string,
  name: string,
): PlatformPermissionDefinition => ({ code: `platform.${module}.${action}`, module, action, name, special: true });

const SIX: PlatformPermissionSection['standardActions'] = ['view', 'create', 'update', 'delete', 'approve', 'export'];
const NO_CREATE_NO_DELETE: PlatformPermissionSection['standardActions'] = ['view', 'update', 'approve', 'export'];
const SETTINGS_STYLE: PlatformPermissionSection['standardActions'] = ['view', 'update', 'approve'];
const BACKUPS_STYLE: PlatformPermissionSection['standardActions'] = ['view', 'create', 'approve', 'export'];
const VIEW_ONLY: PlatformPermissionSection['standardActions'] = ['view'];

export const PLATFORM_PERMISSION_SECTIONS: PlatformPermissionSection[] = [
  {
    module: 'tenants',
    title: 'العملاء (Tenants)',
    standardActions: ['view', 'create', 'update', 'delete', 'export'],
    permissions: [
      std('tenants', 'view', 'عرض العملاء'),
      std('tenants', 'create', 'إنشاء عميل جديد'),
      std('tenants', 'update', 'تعديل بيانات العميل'),
      std('tenants', 'delete', 'حذف العميل'),
      std('tenants', 'export', 'تصدير بيانات العملاء'),
      special('tenants', 'suspend', 'تعليق العميل'),
      special('tenants', 'activate', 'إعادة تفعيل العميل'),
      special('tenants', 'manage_users', 'إدارة مستخدمي العميل'),
    ],
  },
  {
    module: 'staff',
    title: 'الموظفون (Staff)',
    standardActions: ['view', 'create', 'update', 'delete', 'export'],
    permissions: [
      std('staff', 'view', 'عرض موظفي المنصة'),
      std('staff', 'create', 'إضافة موظف للمنصة'),
      std('staff', 'update', 'تعديل بيانات الموظف'),
      std('staff', 'delete', 'حذف الموظف (منطقي)'),
      std('staff', 'export', 'تصدير بيانات الموظفين'),
      special('staff', 'deactivate', 'تفعيل وتعطيل الحساب'),
      special('staff', 'reset_password', 'إعادة تعيين كلمة المرور'),
      special('staff', 'assign_role', 'تعيين الأدوار'),
      special('staff', 'manage_permissions', 'إدارة الصلاحيات والأدوار'),
      special('staff', 'revoke_sessions', 'إبطال جلسات الموظف'),
    ],
  },
  {
    module: 'subscriptions',
    title: 'الاشتراكات (Subscriptions)',
    standardActions: SIX,
    permissions: [
      std('subscriptions', 'view', 'عرض الاشتراكات'),
      std('subscriptions', 'create', 'إنشاء اشتراك'),
      std('subscriptions', 'update', 'تعديل الاشتراك'),
      std('subscriptions', 'delete', 'إلغاء الاشتراك'),
      std('subscriptions', 'approve', 'اعتماد الاشتراك / الترقية'),
      std('subscriptions', 'export', 'تصدير سجل الاشتراكات'),
    ],
  },
  {
    module: 'billing',
    title: 'الفواتير (Billing)',
    standardActions: SIX,
    permissions: [
      std('billing', 'view', 'عرض الفواتير والمبيعات'),
      std('billing', 'create', 'إنشاء فاتورة'),
      std('billing', 'update', 'تعديل فاتورة'),
      std('billing', 'delete', 'حذف/عكس فاتورة'),
      std('billing', 'approve', 'اعتماد المدفوعات'),
      std('billing', 'export', 'تصدير الفواتير'),
    ],
  },
  {
    module: 'licenses',
    title: 'التراخيص (Licenses)',
    standardActions: SIX,
    permissions: [
      std('licenses', 'view', 'عرض التراخيص'),
      std('licenses', 'create', 'إصدار ترخيص'),
      std('licenses', 'update', 'تعديل / تجديد ترخيص'),
      std('licenses', 'delete', 'إلغاء ترخيص'),
      std('licenses', 'approve', 'اعتماد التراخيص'),
      std('licenses', 'export', 'تصدير سجل التراخيص'),
    ],
  },
  {
    module: 'devices',
    title: 'الأجهزة (Devices)',
    standardActions: SIX,
    permissions: [
      std('devices', 'view', 'عرض الأجهزة'),
      std('devices', 'create', 'تسجيل جهاز'),
      std('devices', 'update', 'تعديل بيانات الجهاز'),
      std('devices', 'delete', 'إزالة جهاز'),
      std('devices', 'approve', 'اعتماد ربط الأجهزة'),
      std('devices', 'export', 'تصدير بيانات الأجهزة'),
    ],
  },
  {
    module: 'plans',
    title: 'خطط الاشتراك (Plans)',
    standardActions: SIX,
    permissions: [
      std('plans', 'view', 'عرض الخطط'),
      std('plans', 'create', 'إنشاء خطة'),
      std('plans', 'update', 'تعديل خطة'),
      std('plans', 'delete', 'حذف خطة'),
      std('plans', 'approve', 'اعتماد تغييرات الخطط'),
      std('plans', 'export', 'تصدير الخطط'),
    ],
  },
  {
    module: 'product',
    title: 'المنتج والمزايا (Product)',
    standardActions: SIX,
    permissions: [
      std('product', 'view', 'عرض إعدادات المنتج'),
      std('product', 'create', 'إضافة وحدة / ميزة'),
      std('product', 'update', 'تعديل المنتج والمزايا'),
      std('product', 'delete', 'حذف وحدة / ميزة'),
      std('product', 'approve', 'اعتماد نشر المزايا'),
      std('product', 'export', 'تصدير إعدادات المنتج'),
    ],
  },
  {
    module: 'releases',
    title: 'الإصدارات والتحديثات (Releases)',
    standardActions: SIX,
    permissions: [
      std('releases', 'view', 'عرض الإصدارات'),
      std('releases', 'create', 'إنشاء حزمة إصدار'),
      std('releases', 'update', 'تعديل الإصدار'),
      std('releases', 'delete', 'حذف إصدار'),
      std('releases', 'approve', 'اعتماد النشر للعملاء'),
      std('releases', 'export', 'تصدير سجل الإصدارات'),
    ],
  },
  {
    module: 'support',
    title: 'الدعم الفني (Support)',
    standardActions: SIX,
    permissions: [
      std('support', 'view', 'عرض تذاكر الدعم'),
      std('support', 'create', 'فتح تذكرة'),
      std('support', 'update', 'الرد والتحديث'),
      std('support', 'delete', 'حذف تذكرة'),
      std('support', 'approve', 'إغلاق / اعتماد الحل'),
      std('support', 'export', 'تصدير التذاكر'),
    ],
  },
  {
    module: 'settings',
    title: 'الإعدادات (Settings)',
    standardActions: SETTINGS_STYLE,
    permissions: [
      std('settings', 'view', 'عرض إعدادات المنصة'),
      std('settings', 'update', 'تعديل الإعدادات'),
      std('settings', 'approve', 'اعتماد تغييرات الإعدادات'),
    ],
  },
  {
    module: 'security',
    title: 'الأمان (Security)',
    standardActions: NO_CREATE_NO_DELETE,
    permissions: [
      std('security', 'view', 'عرض مركز الأمان'),
      std('security', 'update', 'تعديل سياسات الأمان'),
      std('security', 'approve', 'اعتماد إجراءات الاستجابة'),
      std('security', 'export', 'تصدير تقارير الأمان'),
    ],
  },
  {
    module: 'backups',
    title: 'النسخ الاحتياطي (Backups)',
    standardActions: BACKUPS_STYLE,
    permissions: [
      std('backups', 'view', 'عرض النسخ الاحتياطية'),
      std('backups', 'create', 'إنشاء نسخة احتياطية'),
      std('backups', 'approve', 'اعتماد الاستعادة'),
      std('backups', 'export', 'تصدير / تنزيل نسخة'),
    ],
  },
  {
    module: 'audit',
    title: 'سجل العمليات (Audit)',
    standardActions: ['view', 'export'],
    permissions: [
      std('audit', 'view', 'عرض سجل العمليات'),
      std('audit', 'export', 'تصدير سجل العمليات'),
    ],
  },
  {
    module: 'analytics',
    title: 'التحليلات والتقارير (Analytics)',
    standardActions: ['view', 'export'],
    permissions: [
      std('analytics', 'view', 'عرض التحليلات'),
      std('analytics', 'export', 'تصدير التقارير'),
    ],
  },
  {
    module: 'sync',
    title: 'المزامنة (Sync)',
    standardActions: ['view', 'update'],
    permissions: [
      std('sync', 'view', 'عرض مراقبة المزامنة'),
      std('sync', 'update', 'إعادة تشغيل / تدخل تشغيلي'),
    ],
  },
  {
    module: 'integrations',
    title: 'التكاملات (Integrations)',
    standardActions: SIX,
    permissions: [
      std('integrations', 'view', 'عرض التكاملات'),
      std('integrations', 'create', 'إضافة تكامل / Webhook'),
      std('integrations', 'update', 'تعديل التكامل'),
      std('integrations', 'delete', 'حذف تكامل'),
      std('integrations', 'approve', 'اعتماد مفاتيح الربط'),
      std('integrations', 'export', 'تصدير إعدادات التكامل'),
    ],
  },
  {
    module: 'notifications',
    title: 'الإشعارات (Notifications)',
    standardActions: SIX,
    permissions: [
      std('notifications', 'view', 'عرض مركز الإشعارات'),
      std('notifications', 'create', 'إرسال إشعار'),
      std('notifications', 'update', 'تعديل قوالب الإشعارات'),
      std('notifications', 'delete', 'حذف إشعار / قالب'),
      std('notifications', 'approve', 'اعتماد حملات الإرسال'),
      std('notifications', 'export', 'تصدير سجل التسليم'),
    ],
  },
  {
    module: 'policies',
    title: 'سياسات المنصة (Policies)',
    standardActions: ['view', 'create', 'update', 'approve', 'export'],
    permissions: [
      std('policies', 'view', 'عرض السياسات'),
      std('policies', 'create', 'إضافة سياسة'),
      std('policies', 'update', 'تعديل سياسة'),
      std('policies', 'approve', 'اعتماد نشر السياسة'),
      std('policies', 'export', 'تصدير السياسات'),
    ],
  },
  {
    module: 'operations',
    title: 'العمليات والموافقات (Operations)',
    standardActions: SIX,
    permissions: [
      std('operations', 'view', 'عرض مركز العمليات'),
      std('operations', 'create', 'إنشاء مهمة تشغيلية'),
      std('operations', 'update', 'تحديث العمليات'),
      std('operations', 'delete', 'إلغاء عملية'),
      std('operations', 'approve', 'اعتماد مهام التشغيل'),
      std('operations', 'export', 'تصدير سجل العمليات'),
    ],
  },
  {
    module: 'overview',
    title: 'لوحة المتابعة (Overview)',
    standardActions: VIEW_ONLY,
    permissions: [std('overview', 'view', 'عرض لوحة المتابعة')],
  },
  {
    module: 'super-admin',
    title: 'لوحة مالك المنصة (Super Admin)',
    standardActions: VIEW_ONLY,
    permissions: [std('super-admin', 'view', 'عرض لوحة مالك المنصة')],
  },
  {
    module: 'activity',
    title: 'إعدادات النشاط (Activity)',
    standardActions: ['view', 'update'],
    permissions: [
      std('activity', 'view', 'عرض إعدادات النشاط'),
      std('activity', 'update', 'تعديل إعدادات النشاط'),
    ],
  },
  {
    module: 'branding',
    title: 'الهوية والمظهر (Branding)',
    standardActions: ['view', 'update'],
    permissions: [
      std('branding', 'view', 'عرض الهوية'),
      std('branding', 'update', 'تعديل الهوية'),
    ],
  },
  {
    module: 'customization',
    title: 'تخصيص الواجهة (Customization)',
    standardActions: ['view', 'update'],
    permissions: [
      std('customization', 'view', 'عرض تخصيصات الواجهة'),
      std('customization', 'update', 'تعديل تخصيصات الواجهة'),
    ],
  },
  {
    module: 'app-configuration',
    title: 'محرك التكوين (App Configuration)',
    standardActions: ['view', 'update', 'export'],
    permissions: [
      std('app-configuration', 'view', 'عرض التكوين الديناميكي'),
      std('app-configuration', 'update', 'تعديل التكوين'),
      std('app-configuration', 'export', 'تصدير التكوين'),
    ],
  },
  {
    module: 'system-health',
    title: 'صحة النظام (System Health)',
    standardActions: ['view', 'update', 'approve'],
    permissions: [
      std('system-health', 'view', 'عرض صحة النظام'),
      std('system-health', 'update', 'إجراءات تشخيصية'),
      std('system-health', 'approve', 'اعتماد إجراءات المعالجة'),
    ],
  },
  {
    module: 'platform-health',
    title: 'صحة المنصة (Platform Health)',
    standardActions: ['view', 'update', 'approve'],
    permissions: [
      std('platform-health', 'view', 'عرض صحة المنصة للعملاء'),
      std('platform-health', 'update', 'إجراءات معالجة'),
      std('platform-health', 'approve', 'اعتماد إجراءات المعالجة'),
    ],
  },
  {
    module: 'admin-control',
    title: 'مركز التحكم الإداري (Admin Control)',
    standardActions: ['view', 'update', 'approve', 'export'],
    permissions: [
      std('admin-control', 'view', 'عرض مركز التحكم الإداري'),
      std('admin-control', 'update', 'تعديل أدوات التحكم المؤسسي'),
      std('admin-control', 'approve', 'اعتماد موافقات التحكم الإداري'),
      std('admin-control', 'export', 'تصدير أدوات البيانات والصيانة'),
    ],
  },
  {
    module: 'emergency',
    title: 'إجراءات الطوارئ (Emergency)',
    standardActions: ['view', 'update', 'approve'],
    permissions: [
      std('emergency', 'view', 'عرض مركز الطوارئ'),
      std('emergency', 'update', 'تنفيذ إجراءات الطوارئ'),
      std('emergency', 'approve', 'اعتماد إجراءات الطوارئ'),
    ],
  },
  {
    module: 'customer-portal',
    title: 'بوابة العملاء (Customer Portal)',
    standardActions: ['view', 'update'],
    permissions: [
      std('customer-portal', 'view', 'عرض بوابة العملاء'),
      std('customer-portal', 'update', 'تعديل إعدادات البوابة'),
    ],
  },
];

/** Flat list of every platform permission code. */
export const PLATFORM_PERMISSION_CATALOG: PlatformPermissionDefinition[] =
  PLATFORM_PERMISSION_SECTIONS.flatMap((s) => s.permissions);

export const PLATFORM_PERMISSION_CODES: string[] = PLATFORM_PERMISSION_CATALOG.map((p) => p.code);

/** Wildcard grant (SUPER_ADMIN). */
export const PLATFORM_ALL_PERMISSION = '*';

export const STANDARD_ACTION_LABELS: Record<string, string> = {
  view: 'عرض',
  create: 'إنشاء',
  update: 'تعديل',
  delete: 'حذف',
  approve: 'اعتماد',
  export: 'تصدير',
};

/** Legacy module keys that gate existing navigation and module-level checks. */
export const PLATFORM_MODULE_KEYS = Array.from(
  new Set(PLATFORM_PERMISSION_SECTIONS.filter((s) => s.standardActions.length || s.permissions.length).map((s) => s.module)),
);

/**
 * Default permission sets for the built-in platform roles. These reproduce
 * the current effective capabilities of each role, expressed in granular
 * codes. Editing them at runtime happens through the RBAC matrix UI.
 */
export const PLATFORM_ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: [PLATFORM_ALL_PERMISSION],
  PLATFORM_ADMIN: PLATFORM_PERMISSION_CODES.filter(
    (code) => !code.startsWith('platform.staff.delete') && code !== 'platform.super-admin.view',
  ),
  SUPPORT_AGENT: [
    'platform.overview.view',
    'platform.tenants.view',
    'platform.support.view', 'platform.support.create', 'platform.support.update', 'platform.support.export',
    'platform.devices.view',
    'platform.system-health.view',
    'platform.platform-health.view',
    'platform.sync.view',
    'platform.notifications.view',
    'platform.customer-portal.view',
    'platform.analytics.view',
  ],
  OPERATIONS_ENGINEER: [
    'platform.overview.view',
    'platform.operations.view', 'platform.operations.create', 'platform.operations.update', 'platform.operations.approve', 'platform.operations.export',
    'platform.system-health.view', 'platform.system-health.update',
    'platform.platform-health.view', 'platform.platform-health.update',
    'platform.devices.view', 'platform.devices.update',
    'platform.app-configuration.view', 'platform.app-configuration.update',
    'platform.sync.view', 'platform.sync.update',
    'platform.backups.view', 'platform.backups.create',
    'platform.integrations.view', 'platform.integrations.update',
    'platform.notifications.view', 'platform.notifications.update',
    'platform.emergency.view', 'platform.emergency.update', 'platform.emergency.approve',
  ],
  BILLING_SPECIALIST: [
    'platform.overview.view',
    'platform.billing.view', 'platform.billing.create', 'platform.billing.update', 'platform.billing.approve', 'platform.billing.export',
    'platform.plans.view',
    'platform.subscriptions.view', 'platform.subscriptions.create', 'platform.subscriptions.update', 'platform.subscriptions.approve', 'platform.subscriptions.export',
    'platform.tenants.view', 'platform.tenants.export',
    'platform.analytics.view', 'platform.analytics.export',
    'platform.customer-portal.view',
  ],
  LICENSE_MANAGER: [
    'platform.overview.view',
    'platform.licenses.view', 'platform.licenses.create', 'platform.licenses.update', 'platform.licenses.approve', 'platform.licenses.export',
    'platform.devices.view', 'platform.devices.update',
    'platform.tenants.view',
    'platform.subscriptions.view', 'platform.subscriptions.create', 'platform.subscriptions.update',
    'platform.sync.view',
  ],
};

export const PLATFORM_ROLE_CODES = Object.keys(PLATFORM_ROLE_DEFAULT_PERMISSIONS);

/**
 * Page-level catalog exposed by the central server so clients can build the
 * navigation and guards from the same source of truth as the API. Every entry
 * names the module that owns the page and the permission required to open it.
 */
export interface PlatformPageDefinition {
  /** Client route path, e.g. `/platform/tenants`. */
  path: string;
  /** Permission module that owns the page. */
  module: string;
  /** Arabic page title. */
  title: string;
  /** Permission code required to view the page. */
  requiredPermission: string;
}

const page = (path: string, module: string, title: string, requiredPermission: string): PlatformPageDefinition => ({
  path,
  module,
  title,
  requiredPermission,
});

export const PLATFORM_PAGE_CATALOG: PlatformPageDefinition[] = [
  page('/platform', 'overview', 'نظرة عامة على المنصة', 'platform.overview.view'),
  page('/platform/tenants', 'tenants', 'إدارة العملاء', 'platform.tenants.view'),
  page('/platform/subscriptions', 'subscriptions', 'إدارة الاشتراكات المركزية', 'platform.subscriptions.view'),
  page('/platform/licenses', 'licenses', 'إدارة التراخيص', 'platform.licenses.view'),
  page('/platform/billing', 'billing', 'المبيعات والفواتير', 'platform.billing.view'),
  page('/platform/plans', 'plans', 'خطط الاشتراك', 'platform.plans.view'),
  page('/platform/staff', 'staff', 'مركز التحكم في حسابات الإدارة', 'platform.staff.view'),
  page('/platform/roles', 'staff', 'مصفوفة الأدوار والصلاحيات', 'platform.staff.manage_permissions'),
  page('/platform/releases', 'releases', 'حزم الإصدارات والتحديثات', 'platform.releases.view'),
  page('/platform/product', 'product', 'التحكم في المنتج', 'platform.product.view'),
  page('/platform/audit', 'audit', 'سجل عمليات المنصة', 'platform.audit.view'),
  page('/platform/settings', 'settings', 'إعدادات المنصة', 'platform.settings.view'),
  page('/platform/activity', 'activity', 'إعدادات النشاط', 'platform.activity.view'),
  page('/platform/operations', 'operations', 'التشغيل والموافقات', 'platform.operations.view'),
  page('/platform/branding', 'branding', 'الهوية والمظهر', 'platform.branding.view'),
  page('/platform/customization', 'customization', 'تخصيص الواجهة', 'platform.customization.view'),
  page('/platform/app-configuration', 'app-configuration', 'محرك التكوين الديناميكي', 'platform.app-configuration.view'),
  page('/platform/system-health', 'system-health', 'صحة النظام وتشخيصه', 'platform.system-health.view'),
  page('/platform/platform-health', 'platform-health', 'صحة المنصة (جميع العملاء)', 'platform.platform-health.view'),
  page('/platform/support', 'support', 'الدعم الفني', 'platform.support.view'),
  page('/platform/devices', 'devices', 'الأجهزة', 'platform.devices.view'),
  page('/platform/admin-control', 'admin-control', 'مركز التحكم الإداري', 'platform.admin-control.view'),
  page('/platform/security-center', 'security', 'مركز الأمان', 'platform.security.view'),
  page('/platform/analytics', 'analytics', 'التقارير والتحليلات المركزية', 'platform.analytics.view'),
  page('/platform/sync', 'sync', 'مراقبة المزامنة والأجهزة', 'platform.sync.view'),
  page('/platform/backups', 'backups', 'النسخ الاحتياطي السحابي', 'platform.backups.view'),
  page('/platform/integrations', 'integrations', 'إدارة التكاملات والربط الخارجي', 'platform.integrations.view'),
  page('/platform/notifications', 'notifications', 'مركز الإشعارات وسجل التسليم', 'platform.notifications.view'),
  page('/platform/policies', 'policies', 'سياسات المنصة والامتثال', 'platform.policies.view'),
  page('/platform/emergency', 'emergency', 'مركز إجراءات الطوارئ والحماية', 'platform.emergency.view'),
  page('/platform/customer-portal', 'customer-portal', 'بوابة العملاء المركزية', 'platform.customer-portal.view'),
  page('/platform/super-admin', 'super-admin', 'منطقة المالك الحساسة', 'platform.super-admin.view'),
];
