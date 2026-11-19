import type { PermissionDef } from '../types';

// ─── Administration & HR core permissions ────────────────────────────────────
// Approvals, notifications, users/roles/security, settings, platform console,
// electronic invoicing, loyalty, modules, companies, documents/contracts and
// the HR domain. Order preserved verbatim from the original catalog.
export const ADMIN_PERMISSIONS: PermissionDef[] = [
  // Approvals
  { code: 'approvals.view', name: 'عرض صندوق الموافقات', module: 'APPROVALS' },
  { code: 'approvals.create', name: 'إنشاء طلب اعتماد', module: 'APPROVALS' },
  { code: 'approvals.approve', name: 'اعتماد الطلبات', module: 'APPROVALS' },
  { code: 'approvals.reject', name: 'رفض الطلبات', module: 'APPROVALS' },
  { code: 'approvals.cancel', name: 'إلغاء طلب اعتماد', module: 'APPROVALS' },
  { code: 'approvals.settings.manage', name: 'إدارة سياسات الموافقات', module: 'APPROVALS' },

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
  { code: 'settings.backup.restore', name: 'استعادة نسخة احتياطية كاملة', module: 'SETTINGS' },
  { code: 'settings.maintenance', name: 'صيانة قاعدة البيانات', module: 'SETTINGS' },
  { code: 'settings.health.view', name: 'عرض صحة النظام', module: 'SETTINGS' },
  { code: 'audit.view', name: 'عرض سجل التدقيق', module: 'AUDIT' },
  { code: 'audit.export', name: 'تصدير سجل التدقيق', module: 'AUDIT' },
  { code: 'admin.view', name: 'الدخول إلى مركز التحكم', module: 'ADMIN' },
  { code: 'admin.navigation', name: 'تخصيص قوائم التنقل', module: 'ADMIN' },
  { code: 'admin.data', name: 'أدوات البيانات والصيانة', module: 'ADMIN' },
  { code: 'admin.data.export', name: 'تصدير بيانات النظام', module: 'ADMIN' },
  { code: 'admin.data.import', name: 'استيراد جداول بيانات النظام', module: 'ADMIN' },
  { code: 'admin.data.delete', name: 'حذف بيانات النظام', module: 'ADMIN' },
  { code: 'admin.license.manage', name: 'إدارة ترخيص المنصة المركزية', module: 'ADMIN' },

  // Platform owner (Super Admin) console
  { code: 'platform.tenants.view', name: 'عرض عملاء المنصة', module: 'PLATFORM' },
  { code: 'platform.tenants.manage', name: 'إدارة عملاء المنصة', module: 'PLATFORM' },
  { code: 'platform.licenses.view', name: 'عرض التراخيص', module: 'PLATFORM' },
  { code: 'platform.licenses.manage', name: 'إصدار وإدارة التراخيص', module: 'PLATFORM' },
  { code: 'platform.billing.view', name: 'عرض مبيعات المنصة', module: 'PLATFORM' },
  { code: 'platform.billing.manage', name: 'إدارة الفواتير والمدفوعات', module: 'PLATFORM' },
  { code: 'platform.plans.view', name: 'عرض خطط الاشتراك', module: 'PLATFORM' },
  { code: 'platform.plans.manage', name: 'إدارة خطط الاشتراك', module: 'PLATFORM' },
  { code: 'platform.product.view', name: 'عرض إعدادات المنتج', module: 'PLATFORM' },
  { code: 'platform.product.manage', name: 'إدارة وحدات ومزايا المنتج', module: 'PLATFORM' },
  { code: 'platform.audit.view', name: 'عرض سجل عمليات المنصة', module: 'PLATFORM' },
  { code: 'platform.settings.manage', name: 'إدارة إعدادات المنصة', module: 'PLATFORM' },

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
  { code: 'hr.contracts.approve', name: 'اعتماد العقود قبل التفعيل', module: 'HR' },
  { code: 'hr.contracts.terminate', name: 'إنهاء عقود الموظفين', module: 'HR' },

  // HR documents
  { code: 'hr.documents.view', name: 'عرض مستندات الموظفين', module: 'HR' },
  { code: 'hr.documents.manage', name: 'إدارة مستندات الموظفين وأرشفتها', module: 'HR' },
  { code: 'hr.documents.download', name: 'تنزيل ملفات مستندات الموظفين', module: 'HR' },
  { code: 'hr.documents.restricted.view', name: 'عرض المستندات المقيّدة للموظفين', module: 'HR' },
  { code: 'hr.documents.confidential.view', name: 'عرض المستندات السرية للموظفين', module: 'HR' },

  // HR recruitment
  { code: 'hr.recruitment.view', name: 'عرض الوظائف والمرشحين', module: 'HR' },
  { code: 'hr.recruitment.manage', name: 'إدارة الوظائف ومراحل التوظيف', module: 'HR' },
  { code: 'hr.recruitment.hire', name: 'تعيين مرشح وتحويله لموظف', module: 'HR' },
  { code: 'hr.leave.export', name: 'تصدير طلبات الإجازات', module: 'HR' },
  { code: 'hr.contracts.export', name: 'تصدير عقود الموظفين', module: 'HR' },
  { code: 'hr.documents.export', name: 'تصدير مستندات الموظفين', module: 'HR' },
  { code: 'hr.dashboard.view', name: 'عرض لوحة الموارد البشرية', module: 'HR' },

  // HR employee self-service
  { code: 'hr.selfservice.view', name: 'بوابة الموظف الذاتية', module: 'HR' },
  { code: 'hr.selfservice.request', name: 'تقديم طلبات من بوابة الموظف', module: 'HR' },

  // HR core domain permissions (spec 2.2)
  { code: 'hr.employees.view', name: 'عرض بيانات الموظفين', module: 'HR' },
  { code: 'hr.employees.manage', name: 'إضافة وتعديل بيانات الموظفين', module: 'HR' },
  { code: 'hr.organization.view', name: 'عرض الهيكل التنظيمي', module: 'HR' },
  { code: 'hr.attendance.manage', name: 'إدارة الحضور', module: 'HR' },
  { code: 'hr.attendance.approve', name: 'اعتماد تعديلات الحضور', module: 'HR' },
  { code: 'hr.payroll.view', name: 'عرض الرواتب', module: 'HR' },
  { code: 'hr.payroll.calculate', name: 'احتساب الرواتب', module: 'HR' },
  { code: 'hr.payroll.approve', name: 'اعتماد الرواتب', module: 'HR' },
  { code: 'hr.payroll.pay', name: 'تنفيذ الصرف', module: 'HR' },
  { code: 'hr.documents.confidential', name: 'الوصول للمستندات السرية', module: 'HR' },
  { code: 'hr.performance.manage', name: 'إدارة تقييم الأداء', module: 'HR' },
  { code: 'hr.training.manage', name: 'إدارة التدريب', module: 'HR' },
  { code: 'hr.discipline.manage', name: 'إدارة الجزاءات والشكاوى', module: 'HR' },
  { code: 'hr.benefits.manage', name: 'إدارة المزايا والبدلات', module: 'HR' },
  { code: 'hr.clearance.manage', name: 'إدارة إخلاء الطرف', module: 'HR' },
  { code: 'hr.workforce.manage', name: 'إدارة تخطيط القوى العاملة', module: 'HR' },
  { code: 'hr.insurance.manage', name: 'إدارة التأمينات الاجتماعية', module: 'HR' },
];
