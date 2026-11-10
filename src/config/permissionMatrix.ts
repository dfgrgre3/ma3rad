/**
 * مصفوفة الصلاحيات الدقيقة (Fine-grained permission matrix)
 * ------------------------------------------------------------------
 * كل صفحة في التطبيق، وكل قسم/تبويب داخلها، وكل زر/إجراء متاح عليها
 * يُولِّد هنا صلاحية مستقلة قابلة للمنح أو السحب من مصفوفة الأدوار.
 *
 * اصطلاح الترميز:
 *   ui.<module>.<page>.view                      → الدخول إلى الصفحة
 *   ui.<module>.<page>.<action>                  → زر/إجراء داخل الصفحة
 *   ui.<module>.<page>.section.<section>.view    → عرض قسم/تبويب
 *   ui.<module>.<page>.section.<section>.manage  → إدارة قسم/تبويب
 *   ui.<module>.<page>.section.<section>.export  → تصدير قسم/تبويب
 *
 * كل صلاحية تحمل `legacy` وهو الكود القديم الذي كان يمنح نفس القدرة،
 * ويُستخدم عند الترقية حتى لا تفقد الأدوار القائمة قدراتها.
 */

export type PermissionKind = 'page' | 'action' | 'section' | 'field';

export interface GranularPermissionDef {
  code: string;
  name: string;
  module: string;
  group: string;
  kind: PermissionKind;
  /** الكود القديم المكافئ — يُستخدم في الترقية والـ backfill. */
  legacy?: string;
  /** أكواد قديمة إضافية مكافئة (مثل الأكواد العامة crm.create للأقسام الفرعية). */
  legacyAliases?: string[];
  route?: string;
  destructive?: boolean;
  granular: true;
}

interface SectionSpec {
  key: string;
  label: string;
  actions?: string[];
}

interface PageSpec {
  key: string;
  label: string;
  module: string;
  route?: string;
  legacyView: string;
  actions: string[];
  sections?: SectionSpec[];
}

const ACTION_LABELS: Record<string, string> = {
  view: 'عرض',
  refresh: 'تحديث',
  search: 'بحث',
  filter: 'تصفية',
  sort: 'ترتيب',
  columns: 'تخصيص الأعمدة',
  saved_views: 'العروض المحفوظة',
  export: 'تصدير',
  export_excel: 'تصدير Excel',
  export_pdf: 'تصدير PDF',
  export_csv: 'تصدير CSV',
  print: 'طباعة',
  print_label: 'طباعة ملصقات',
  bulk_print: 'طباعة جماعية',
  import: 'استيراد',
  import_excel: 'استيراد Excel',
  import_csv: 'استيراد CSV',
  bulk_update: 'تحديث جماعي',
  bulk_delete: 'حذف جماعي',
  bulk_export: 'تصدير جماعي',
  bulk_approve: 'اعتماد جماعي',
  create: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
  duplicate: 'نسخ',
  clone: 'استنساخ',
  archive: 'أرشفة',
  restore: 'استعادة',
  restore_backup: 'استعادة نسخة احتياطية',
  backup: 'نسخ احتياطي',
  purge: 'تنظيف نهائي',
  submit: 'إرسال',
  approve: 'اعتماد',
  reject: 'رفض',
  review: 'مراجعة',
  cancel: 'إلغاء',
  void: 'إبطال',
  refund: 'مرتجع/استرداد',
  reverse: 'عكس',
  post: 'ترحيل',
  settle: 'تسوية',
  reconcile: 'مطابقة',
  close: 'إقفال',
  reopen: 'إعادة فتح',
  collect: 'تحصيل',
  pay: 'سداد',
  receive: 'استلام',
  transfer: 'تحويل',
  adjust: 'تسوية',
  count: 'جرد',
  finalize: 'اعتماد نهائي',
  start: 'بدء',
  complete: 'إكمال',
  pause: 'إيقاف مؤقت',
  execute: 'تنفيذ',
  assign: 'إسناد',
  manage: 'إدارة',
  configure: 'تهيئة',
  settings: 'إعدادات',
  reset: 'إعادة تعيين',
  sync: 'مزامنة',
  publish: 'نشر',
  activate: 'تفعيل',
  deactivate: 'تعطيل',
  enable: 'تمكين',
  disable: 'تعطيل',
  hire: 'تعيين',
  terminate: 'إنهاء',
  renew: 'تجديد',
  upload: 'رفع',
  download: 'تنزيل',
  share: 'مشاركة',
  email: 'إرسال بريد',
  whatsapp: 'مشاركة واتساب',
  attach: 'إرفاق',
  comment: 'تعليق',
  timeline: 'عرض السجل الزمني',
  history: 'سجل التغييرات',
  statistics: 'إحصائيات',
  kpi: 'مؤشرات الأداء',
  alerts: 'تنبيهات',
  discount: 'خصم',
  hold: 'تعليق',
  resume: 'استئناف',
  print_receipt: 'طباعة إيصال',
  credit: 'بيع آجل',
  open_shift: 'فتح وردية',
  close_shift: 'إغلاق وردية',
  cash_drawer: 'إدارة درج النقدية',
  customer_add: 'إضافة عميل سريع',
  product_search: 'بحث المنتجات',
  convert: 'تحويل',
  deliver: 'تسليم',
  mark_paid: 'تحديد كمدفوع',
  mark_unpaid: 'تحديد كغير مدفوع',
  refund_payment: 'استرداد دفعة',
  merge: 'دمج',
  split: 'تقسيم',
  link: 'ربط',
  unlink: 'فك ربط',
  lock: 'قفل',
  unlock: 'فتح',
  flag: 'تمييز',
  priority: 'تغيير الأولوية',
  barcode: 'باركود',
  price_update: 'تعديل الأسعار',
  bulk_price: 'تعديل أسعار جماعي',
  cost_view: 'عرض التكلفة',
  stock_view: 'عرض المخزون',
  image_manage: 'إدارة الصور',
  variant_manage: 'إدارة المتغيرات',
  attribute_manage: 'إدارة الخصائص',
  document_manage: 'إدارة المستندات',
  price_manage: 'إدارة الأسعار',
  apply: 'تطبيق',
  generate: 'توليد',
  send: 'إرسال',
  send_to_tax: 'إرسال للهيئة الضريبية',
  accept: 'قبول',
  sign: 'توقيع',
  stamp: 'ختم',
  template: 'إدارة القوالب',
  test: 'اختبار',
  recalculate: 'إعادة حساب',
  verify: 'تحقق',
  remind: 'تذكير',
  follow_up: 'متابعة',
  handover: 'تسليم وردية',
  kitchen: 'شاشة المطبخ',
  tables: 'إدارة الطاولات',
  menu: 'إدارة القائمة',
  close_bill: 'إقفال الفاتورة',
  split_bill: 'تقسيم الفاتورة',
  transfer_table: 'نقل الطاولة',
  warranty: 'إدارة الضمان',
  repairs: 'إدارة الإصلاحات',
  claims: 'إدارة المطالبات',
  register: 'تسجيل',
  open: 'فتح',
  copy: 'نسخ',
  move: 'نقل',
  share_link: 'مشاركة رابط',
  permissions: 'إدارة الصلاحيات',
  audit_log: 'سجل التدقيق',
  preview: 'معاينة',
  calendar: 'التقويم',
  analytics: 'تحليلات',
  dashboard: 'لوحة معلومات',
  details: 'التفاصيل',
};

const moduleOf = (legacyView: string): string => {
  const [head] = legacyView.split('.');
  const map: Record<string, string> = {
    dashboard: 'DASHBOARD',
    products: 'PRODUCTS',
    categories: 'CATEGORIES',
    brands: 'BRANDS',
    inventory: 'INVENTORY',
    sales: 'SALES',
    quotations: 'QUOTATIONS',
    orders: 'ORDERS',
    returns: 'RETURNS',
    purchases: 'PURCHASES',
    customers: 'CUSTOMERS',
    suppliers: 'SUPPLIERS',
    partners: 'PARTNERS',
    cashier: 'CASHIER',
    finance: 'FINANCE',
    reports: 'REPORTS',
    crm: 'CRM',
    manufacturing: 'MANUFACTURING',
    projects: 'PROJECTS',
    pricing: 'PRICING',
    promotions: 'PROMOTIONS',
    operations: 'OPERATIONS',
    branches: 'BRANCHES',
    warehouses: 'WAREHOUSES',
    employees: 'EMPLOYEES',
    deliveries: 'DELIVERIES',
    drivers: 'DRIVERS',
    vehicles: 'VEHICLES',
    approvals: 'APPROVALS',
    notifications: 'NOTIFICATIONS',
    users: 'USERS',
    roles: 'ROLES',
    sessions: 'SESSIONS',
    security: 'SECURITY',
    settings: 'SETTINGS',
    audit: 'AUDIT',
    admin: 'ADMIN',
    electronic_invoices: 'E_INVOICING',
    loyalty: 'LOYALTY',
    analytics: 'ANALYTICS',
    modules: 'MODULES',
    companies: 'COMPANIES',
    documents: 'DOCUMENTS',
    contracts: 'CONTRACTS',
    hr: 'HR',
    restaurant: 'SALES',
  };
  return map[head] ?? head.toUpperCase();
};

// ─── مجموعات الإجراءات القياسية ──────────────────────────────────────────────
const READ = ['refresh', 'search', 'filter', 'columns', 'export', 'print'];
const READ_PLUS = [...READ, 'export_excel', 'export_pdf', 'saved_views'];
const WRITE = [...READ_PLUS, 'create', 'update', 'delete', 'duplicate', 'archive', 'restore', 'import', 'bulk_update', 'bulk_delete', 'bulk_export', 'bulk_print'];
const APPROVE = [...WRITE, 'submit', 'approve', 'reject', 'review', 'cancel', 'void', 'reverse'];
const FINANCE = [...WRITE, 'submit', 'approve', 'post', 'settle', 'reconcile', 'close', 'reopen', 'collect', 'pay', 'receive', 'mark_paid', 'mark_unpaid', 'reverse'];
const CONFIG = [...WRITE, 'manage', 'configure', 'settings', 'reset', 'sync', 'activate', 'deactivate', 'test'];
const DOCS = [...WRITE, 'upload', 'download', 'share', 'attach', 'timeline', 'history'];
const ANALYTICS = [...READ, 'export_excel', 'export_pdf', 'export_csv'];

const section = (key: string, label: string, actions: string[] = ['view', 'export', 'print']): SectionSpec => ({ key, label, actions });

// ─── تعريف الصفحات ────────────────────────────────────────────────────────────
const PAGES: PageSpec[] = [
  // لوحة المعلومات
  { key: 'overview', label: 'لوحة المعلومات', module: 'DASHBOARD', route: '/dashboard', legacyView: 'dashboard.view',
    actions: [...ANALYTICS, 'refresh', 'kpi', 'alerts', 'export_excel', 'export_pdf'],
    sections: [section('kpis', 'مؤشرات الأداء'), section('sales_chart', 'مخطط المبيعات'), section('low_stock', 'تنبيهات نقص المخزون'), section('top_products', 'أفضل المنتجات'), section('cash_summary', 'ملخص الخزينة'), section('recent_activity', 'النشاط الأخير')] },
  { key: 'executive', label: 'اللوحة التنفيذية', module: 'DASHBOARD', route: '/dashboard/executive', legacyView: 'dashboard.executive.view',
    actions: [...ANALYTICS, 'refresh', 'kpi'],
    sections: [section('revenue', 'الإيرادات'), section('profit', 'الأرباح'), section('cashflow', 'التدفقات النقدية'), section('inventory', 'المخزون'), section('hr', 'الموارد البشرية')] },

  // المبيعات
  { key: 'invoices', label: 'فواتير المبيعات', module: 'SALES', route: '/sales', legacyView: 'sales.view',
    actions: [...APPROVE, 'refund', 'share', 'email', 'whatsapp', 'discount', 'credit', 'print_receipt', 'timeline', 'attach', 'history'],
    sections: [section('list', 'قائمة الفواتير'), section('items', 'بنود الفاتورة', ['view', 'manage']), section('totals', 'الإجماليات والضريبة'), section('payments', 'المدفوعات'), section('notes', 'الملاحظات'), section('attachments', 'المرفقات'), section('timeline', 'السجل الزمني')] },
  { key: 'pos', label: 'نقطة البيع', module: 'SALES', route: '/pos', legacyView: 'sales.pos.view',
    actions: ['view', 'refresh', 'search', 'filter', 'create', 'update', 'delete', 'discount', 'hold', 'resume', 'void', 'refund', 'credit', 'print', 'print_receipt', 'open_shift', 'close_shift', 'cash_drawer', 'customer_add', 'product_search', 'export'],
    sections: [section('cart', 'سلة البيع', ['view', 'manage']), section('payment', 'الدفع', ['view', 'manage']), section('customers', 'العملاء'), section('held_orders', 'الفواتير المعلقة'), section('shift', 'الوردية')] },
  { key: 'quotations', label: 'عروض الأسعار', module: 'QUOTATIONS', route: '/quotations', legacyView: 'quotations.view',
    actions: [...APPROVE, 'print', 'share', 'email', 'whatsapp', 'convert', 'timeline'],
    sections: [section('list', 'قائمة العروض'), section('items', 'البنود', ['view', 'manage']), section('totals', 'الإجماليات'), section('terms', 'الشروط'), section('approvals', 'الموافقات')] },
  { key: 'orders', label: 'طلبات البيع', module: 'ORDERS', route: '/orders', legacyView: 'orders.view',
    actions: [...APPROVE, 'convert', 'assign', 'deliver', 'print', 'share', 'timeline', 'attach'],
    sections: [section('list', 'قائمة الطلبات'), section('items', 'البنود', ['view', 'manage']), section('timeline', 'السجل الزمني'), section('deliveries', 'التسليم'), section('payments', 'المدفوعات')] },
  { key: 'returns', label: 'مرتجعات البيع', module: 'RETURNS', route: '/returns', legacyView: 'returns.view',
    actions: [...APPROVE, 'refund', 'print', 'share', 'timeline'],
    sections: [section('list', 'قائمة المرتجعات'), section('items', 'البنود', ['view', 'manage']), section('refunds', 'المبالغ المستردة')] },
  { key: 'analytics', label: 'تحليلات المبيعات', module: 'SALES', route: '/sales/analytics', legacyView: 'sales.analytics.view',
    actions: [...ANALYTICS, 'filter', 'kpi'],
    sections: [section('kpis', 'المؤشرات'), section('charts', 'الرسوم البيانية'), section('top_products', 'أفضل المنتجات'), section('salespeople', 'أداء الموظفين'), section('branches', 'أداء الفروع')] },
  { key: 'cycle', label: 'دورة الفاتورة الشاملة', module: 'SALES', route: '/sales/cycle', legacyView: 'sales.cycle.view',
    actions: [...READ, 'timeline', 'export_excel'],
    sections: [section('steps', 'مراحل الدورة'), section('timeline', 'السجل الزمني')] },
  { key: 'statement', label: 'كشف حساب العميل', module: 'SALES', route: '/sales/statement', legacyView: 'sales.statement.view',
    actions: [...READ, 'share', 'email', 'whatsapp', 'print', 'export_excel', 'export_pdf'] },
  { key: 'orders_deposits', label: 'الطلبات والعربونات', module: 'SALES', route: '/sales/orders-deposits', legacyView: 'sales.orders_deposits.view',
    actions: [...APPROVE, 'refund', 'convert', 'print', 'share', 'timeline'],
    sections: [section('orders', 'الطلبات'), section('deposits', 'العربونات'), section('refunds', 'المسترد')] },
  { key: 'after_sales', label: 'خدمة ما بعد البيع والضمان', module: 'SALES', route: '/sales/after-sales', legacyView: 'sales.after_sales.view',
    actions: [...WRITE, 'submit', 'approve', 'reject', 'warranty', 'repairs', 'claims', 'print', 'timeline'],
    sections: [section('warranties', 'الضمانات'), section('repairs', 'الإصلاحات'), section('claims', 'المطالبات')] },
  { key: 'reservations', label: 'حجوزات المبيعات', module: 'SALES', route: '/sales/reservations', legacyView: 'sales.reservations.view',
    actions: [...WRITE, 'submit', 'approve', 'reject', 'cancel', 'refund', 'convert', 'print', 'timeline'],
    sections: [section('reservations', 'الحجوزات'), section('deposits', 'العربونات')] },
  { key: 'restaurant', label: 'إدارة المطعم', module: 'SALES', route: '/restaurant', legacyView: 'restaurant.view',
    actions: [...WRITE, 'kitchen', 'tables', 'menu', 'close_bill', 'split_bill', 'transfer_table', 'print', 'print_receipt'],
    sections: [section('orders', 'طلبات المطعم'), section('tables', 'الطاولات'), section('menu', 'قائمة الطعام'), section('kitchen', 'شاشة المطبخ')] },
  { key: 'daily_sales', label: 'مبيعات اليوم', module: 'SALES', route: '/daily/sales', legacyView: 'sales.view',
    actions: [...READ, 'export_excel', 'print', 'details'] },

  // المنتجات والتسعير
  { key: 'catalog', label: 'كتالوج المنتجات', module: 'PRODUCTS', route: '/products', legacyView: 'products.view',
    actions: [...APPROVE, 'barcode', 'price_update', 'bulk_price', 'cost_view', 'stock_view', 'image_manage', 'variant_manage', 'attribute_manage', 'document_manage', 'price_manage', 'print_label', 'timeline'],
    sections: [section('list', 'قائمة المنتجات'), section('details', 'بيانات المنتج'), section('pricing', 'التسعير'), section('stock', 'المخزون'), section('images', 'الصور', ['view', 'manage']), section('variants', 'المتغيرات', ['view', 'manage']), section('attributes', 'الخصائص', ['view', 'manage']), section('documents', 'المستندات', ['view', 'manage']), section('batches', 'الدفعات'), section('purchases', 'المشتريات'), section('sales', 'المبيعات'), section('activity', 'النشاط')] },
  { key: 'detail', label: 'تفاصيل المنتج', module: 'PRODUCTS', route: '/products/:id', legacyView: 'products.view',
    actions: [...READ, 'update', 'delete', 'duplicate', 'print', 'share', 'cost_view', 'stock_view', 'image_manage', 'variant_manage', 'attribute_manage', 'document_manage', 'price_manage', 'barcode', 'archive'] },
  { key: 'categories', label: 'التصنيفات', module: 'CATEGORIES', route: '/categories', legacyView: 'categories.view',
    actions: [...WRITE, 'merge', 'print'] },
  { key: 'brands', label: 'الماركات', module: 'BRANDS', route: '/brands', legacyView: 'brands.view',
    actions: [...WRITE, 'merge', 'print'] },
  { key: 'attributes', label: 'الخصائص الديناميكية', module: 'PRODUCTS', route: '/products/attributes', legacyView: 'products.attributes.view',
    actions: [...WRITE, 'manage', 'print'] },
  { key: 'barcodes', label: 'طباعة الباركود', module: 'PRODUCTS', route: '/products/barcodes', legacyView: 'products.barcodes.print',
    actions: ['view', 'print', 'print_label', 'export', 'barcode'] },
  { key: 'pricing', label: 'قوائم الأسعار', module: 'PRICING', route: '/pricing', legacyView: 'pricing.view',
    actions: [...APPROVE, 'apply', 'bulk_price', 'price_update', 'history'],
    sections: [section('lists', 'قوائم الأسعار'), section('rules', 'قواعد التسعير'), section('history', 'سجل التغييرات')] },
  { key: 'promotions', label: 'العروض والخصومات', module: 'PROMOTIONS', route: '/promotions', legacyView: 'promotions.view',
    actions: [...APPROVE, 'manage', 'apply', 'publish', 'timeline'],
    sections: [section('campaigns', 'الحملات'), section('coupons', 'الكوبونات'), section('rules', 'القواعد')] },

  // المخزون
  { key: 'hub', label: 'مركز المخزون', module: 'INVENTORY', route: '/inventory/hub', legacyView: 'inventory.view',
    actions: [...ANALYTICS, 'adjust', 'transfer', 'count', 'alerts', 'reorder'],
    sections: [section('stock', 'الأرصدة'), section('transfers', 'التحويلات'), section('counts', 'الجرد'), section('valuation', 'التقييم'), section('reorder', 'إعادة الطلب'), section('alerts', 'التنبيهات')] },
  { key: 'warehouse_stock', label: 'أرصدة المخازن', module: 'INVENTORY', route: '/inventory/warehouse-stock', legacyView: 'inventory.warehouse_stock.view',
    actions: [...ANALYTICS, 'adjust', 'transfer'] },
  { key: 'showroom_stock', label: 'أرصدة المعارض', module: 'INVENTORY', route: '/inventory/showroom-stock', legacyView: 'inventory.showroom_stock.view',
    actions: [...ANALYTICS, 'adjust', 'transfer'] },
  { key: 'ledger', label: 'سجل حركة المخزون', module: 'INVENTORY', route: '/inventory/ledger', legacyView: 'inventory.ledger.view',
    actions: [...ANALYTICS, 'details', 'history'] },
  { key: 'transfers', label: 'التحويلات المخزنية', module: 'INVENTORY', route: '/inventory/transfers', legacyView: 'inventory.transfer',
    actions: [...APPROVE, 'transfer', 'print', 'timeline'],
    sections: [section('list', 'قائمة التحويلات'), section('items', 'الأصناف', ['view', 'manage']), section('approvals', 'الموافقات')] },
  { key: 'counts', label: 'جرد المخزون', module: 'INVENTORY', route: '/inventory/counts', legacyView: 'inventory.count',
    actions: [...APPROVE, 'count', 'start', 'finalize', 'print', 'timeline'],
    sections: [section('sessions', 'جلسات الجرد'), section('items', 'أصناف الجرد', ['view', 'manage']), section('differences', 'الفروقات')] },
  { key: 'valuation', label: 'تقييم المخزون', module: 'INVENTORY', route: '/inventory/valuation', legacyView: 'inventory.valuation.view',
    actions: [...ANALYTICS, 'recalculate', 'cost_view'] },
  { key: 'adjustments', label: 'تسويات المخزون', module: 'INVENTORY', route: '/inventory/adjustments', legacyView: 'inventory.adjust',
    actions: [...APPROVE, 'adjust', 'print', 'timeline'],
    sections: [section('list', 'قائمة التسويات'), section('items', 'الأصناف', ['view', 'manage']), section('approvals', 'الموافقات')] },
  { key: 'reservations', label: 'حجوزات المخزون', module: 'INVENTORY', route: '/inventory/stock-reservations', legacyView: 'inventory.reservations.view',
    actions: [...WRITE, 'approve', 'reject', 'cancel', 'print'] },
  { key: 'reorder', label: 'إعادة الطلب', module: 'INVENTORY', route: '/inventory/reorder-planning', legacyView: 'inventory.reorder.view',
    actions: [...ANALYTICS, 'manage', 'reorder', 'generate', 'export_excel'] },
  { key: 'locations', label: 'مواقع الرفوف', module: 'INVENTORY', route: '/inventory/locations', legacyView: 'inventory.locations.view',
    actions: [...WRITE, 'manage', 'print_label', 'barcode'] },
  { key: 'damage', label: 'التالف والحجر', module: 'INVENTORY', route: '/inventory/damage-quarantine', legacyView: 'inventory.damage.view',
    actions: [...APPROVE, 'adjust', 'print', 'timeline'] },
  { key: 'reconciliation', label: 'مطابقة المخزون', module: 'INVENTORY', route: '/inventory/reconciliation', legacyView: 'inventory.reconciliation.view',
    actions: [...APPROVE, 'reconcile', 'adjust', 'print', 'export_excel'] },

  // المشتريات
  { key: 'invoices', label: 'فواتير الشراء', module: 'PURCHASES', route: '/purchases', legacyView: 'purchases.view',
    actions: [...APPROVE, 'pay', 'print', 'share', 'attach', 'timeline', 'history'],
    sections: [section('list', 'قائمة الفواتير'), section('items', 'البنود', ['view', 'manage']), section('totals', 'الإجماليات'), section('payments', 'المدفوعات'), section('attachments', 'المرفقات'), section('timeline', 'السجل الزمني')] },
  { key: 'requests', label: 'طلبات الشراء', module: 'PURCHASES', route: '/purchases/requests', legacyView: 'purchases.requests.view',
    actions: [...APPROVE, 'cancel_request', 'convert', 'print', 'timeline'],
    sections: [section('list', 'الطلبات'), section('items', 'البنود', ['view', 'manage']), section('approvals', 'الموافقات')] },
  { key: 'quotations', label: 'عروض الموردين', module: 'PURCHASES', route: '/purchases/quotations', legacyView: 'purchases.quotations.view',
    actions: [...APPROVE, 'convert', 'print', 'compare'] },
  { key: 'orders', label: 'أوامر الشراء', module: 'PURCHASES', route: '/purchases/orders', legacyView: 'purchases.orders.view',
    actions: [...APPROVE, 'convert', 'receive', 'print', 'timeline'],
    sections: [section('list', 'الأوامر'), section('items', 'البنود', ['view', 'manage']), section('receipts', 'الاستلامات')] },
  { key: 'receipts', label: 'استلامات المشتريات', module: 'PURCHASES', route: '/purchases/receipts', legacyView: 'purchases.receipts.view',
    actions: [...WRITE, 'approve', 'reject', 'receive', 'print', 'timeline'] },
  { key: 'incoming', label: 'الواردات', module: 'PURCHASES', route: '/purchases/incoming', legacyView: 'purchases.incoming.view',
    actions: [...READ, 'update', 'receive', 'details'] },
  { key: 'returns', label: 'مرتجعات المشتريات', module: 'PURCHASES', route: '/purchases/returns', legacyView: 'purchases.return',
    actions: [...APPROVE, 'return', 'refund', 'print', 'timeline'] },
  { key: 'claims', label: 'مطالبات الموردين', module: 'PURCHASES', route: '/purchases/claims', legacyView: 'purchases.claims.view',
    actions: [...APPROVE, 'manage', 'settle', 'print', 'timeline'] },
  { key: 'statement', label: 'كشف حساب المورد', module: 'PURCHASES', route: '/purchases/statement', legacyView: 'purchases.statement.view',
    actions: [...READ, 'share', 'email', 'print'] },
  { key: 'suppliers', label: 'الموردون', module: 'SUPPLIERS', route: '/suppliers', legacyView: 'suppliers.view',
    actions: [...WRITE, 'pay', 'payment', 'statement', 'scorecard', 'contacts', 'print', 'timeline'] },
  { key: 'supplier_detail', label: 'ملف المورد', module: 'SUPPLIERS', route: '/suppliers/:id', legacyView: 'suppliers.view',
    actions: [...READ, 'update', 'delete', 'pay', 'payment', 'statement', 'scorecard', 'print', 'share'] },
  { key: 'daily_purchases', label: 'مشتريات اليوم', module: 'PURCHASES', route: '/daily/purchases', legacyView: 'purchases.view',
    actions: [...READ, 'export_excel', 'print', 'details'] },

  // العملاء والشركاء
  { key: 'list', label: 'العملاء', module: 'CUSTOMERS', route: '/customers', legacyView: 'customers.view',
    actions: [...WRITE, 'pay', 'payment', 'reverse', 'statement', 'credit', 'assign', 'print', 'timeline'],
    sections: [section('list', 'قائمة العملاء'), section('balances', 'الأرصدة'), section('contacts', 'جهات الاتصال')] },
  { key: 'detail', label: 'ملف العميل', module: 'CUSTOMERS', route: '/customers/:id', legacyView: 'customers.view',
    actions: [...READ, 'update', 'delete', 'pay', 'payment', 'reverse', 'statement', 'credit', 'print', 'share', 'timeline', 'history'],
    sections: [section('overview', 'نظرة عامة'), section('sales', 'المبيعات'), section('quotations', 'عروض الأسعار'), section('orders', 'الطلبات'), section('payments', 'المدفوعات'), section('returns', 'المرتجعات'), section('debts', 'الديون'), section('projects', 'المشاريع'), section('activities', 'الأنشطة'), section('timeline', 'السجل الزمني'), section('prices', 'الأسعار الخاصة')] },
  { key: 'imported_products', label: 'منتجات العملاء الخارجية', module: 'CUSTOMERS', route: '/customers/imported-products', legacyView: 'sales.view',
    actions: [...READ, 'details'] },
  { key: 'ready_deliveries', label: 'طلبات جاهزة للتسليم', module: 'CUSTOMERS', route: '/customers/ready-deliveries', legacyView: 'sales.view',
    actions: [...READ, 'deliver', 'details'] },
  { key: 'partners', label: 'الشركاء وحساباتهم', module: 'PARTNERS', route: '/partners', legacyView: 'partners.view',
    actions: [...WRITE, 'manage', 'transactions', 'profits', 'adjust', 'reverse', 'print', 'share'],
    sections: [
      section('accounts', 'حسابات الشركاء'),
      section('transactions', 'المساهمات والمسحوبات'),
      section('profits', 'توزيع الأرباح'),
      section('reports', 'الأرصدة والتقارير'),
    ] },
  { key: 'daily_debts', label: 'ديون اليوم', module: 'FINANCE', route: '/daily/debts', legacyView: 'finance.debts.view',
    actions: [...READ, 'collect', 'details'] },

  // علاقات العملاء
  { key: 'dashboard', label: 'لوحة علاقات العملاء', module: 'CRM', route: '/crm/dashboard', legacyView: 'crm.dashboard.view',
    actions: [...ANALYTICS, 'kpi'] },
  { key: 'leads', label: 'العملاء المحتملون', module: 'CRM', route: '/crm/leads', legacyView: 'crm.leads.view',
    actions: [...WRITE, 'assign', 'convert', 'follow_up', 'print', 'timeline'],
    sections: [section('list', 'القائمة'), section('details', 'التفاصيل'), section('activities', 'المتابعات')] },
  { key: 'pipeline', label: 'خط المبيعات', module: 'CRM', route: '/crm/pipeline', legacyView: 'crm.pipeline.view',
    actions: [...READ, 'update', 'assign', 'move', 'timeline'] },
  { key: 'activities', label: 'الأنشطة والمتابعات', module: 'CRM', route: '/crm/activities', legacyView: 'crm.activities.view',
    actions: [...WRITE, 'complete', 'remind', 'calendar', 'print'] },
  { key: 'campaigns', label: 'الحملات التسويقية', module: 'CRM', route: '/crm/campaigns', legacyView: 'crm.campaigns.view',
    actions: [...WRITE, 'approve', 'publish', 'send', 'analytics', 'print'] },

  // المالية
  { key: 'overview', label: 'نظرة عامة على المالية', module: 'FINANCE', route: '/finance', legacyView: 'finance.view',
    actions: [...ANALYTICS, 'kpi', 'alerts'],
    sections: [section('kpis', 'المؤشرات'), section('cash', 'الخزينة'), section('receivables', 'الذمم'), section('expenses', 'المصروفات'), section('charts', 'الرسوم البيانية')] },
  { key: 'calendar', label: 'التقويم المالي', module: 'FINANCE', route: '/finance/calendar', legacyView: 'finance.view',
    actions: [...READ, 'calendar', 'create', 'update', 'delete', 'approve', 'remind'] },
  { key: 'receivables', label: 'مركز الذمم والتحصيل', module: 'FINANCE', route: '/finance/receivables', legacyView: 'finance.debts.view',
    actions: [...FINANCE, 'collect', 'remind', 'assign'],
    sections: [section('debts', 'الديون'), section('other', 'ذمم أخرى'), section('installments', 'الأقساط'), section('follow_up', 'المتابعة')] },
  { key: 'other_receivables', label: 'ذمم أخرى', module: 'FINANCE', route: '/finance/other-receivables', legacyView: 'finance.receivables.view',
    actions: [...FINANCE, 'collect', 'print'] },
  { key: 'installments', label: 'الأقساط', module: 'FINANCE', route: '/finance/installments', legacyView: 'finance.installments.view',
    actions: [...FINANCE, 'manage', 'collect', 'remind', 'print', 'generate'] },
  { key: 'expenses', label: 'المصروفات', module: 'CASHIER', route: '/finance/expenses', legacyView: 'cashier.expense',
    actions: [...FINANCE, 'expense', 'approve', 'attach', 'print'],
    sections: [section('list', 'قائمة المصروفات'), section('categories', 'التصنيفات'), section('approvals', 'الموافقات')] },
  { key: 'daily_expenses', label: 'منصرف اليوم', module: 'CASHIER', route: '/daily/expenses', legacyView: 'cashier.expense',
    actions: [...READ, 'create', 'update', 'delete', 'print'] },
  { key: 'accounts', label: 'دليل الحسابات', module: 'FINANCE', route: '/finance/accounts', legacyView: 'finance.accounts.view',
    actions: [...CONFIG, 'approve', 'merge', 'print', 'export_excel'] },
  { key: 'journal', label: 'القيود اليومية', module: 'FINANCE', route: '/finance/journal', legacyView: 'finance.journal.view',
    actions: [...FINANCE, 'post', 'reverse', 'print', 'attach', 'timeline'],
    sections: [section('list', 'القيود'), section('lines', 'بنود القيد', ['view', 'manage']), section('attachments', 'المرفقات')] },
  { key: 'cheques', label: 'الشيكات', module: 'FINANCE', route: '/finance/cheques', legacyView: 'finance.cheques.view',
    actions: [...FINANCE, 'manage', 'collect', 'pay', 'settle', 'print', 'timeline'] },
  { key: 'fiscal_closing', label: 'السنة المالية والإقفال', module: 'FINANCE', route: '/finance/fiscal-closing', legacyView: 'finance.view',
    actions: [...READ, 'close', 'reopen', 'approve', 'print', 'export_excel'],
    sections: [section('periods', 'الفترات المالية'), section('closing', 'الإقفال'), section('history', 'سجل الإقفال')] },
  { key: 'bank_reconciliation', label: 'مطابقة البنك والصندوق', module: 'FINANCE', route: '/finance/bank-reconciliation', legacyView: 'finance.bank_reconciliation.view',
    actions: [...FINANCE, 'reconcile', 'manage', 'print', 'export_excel'] },
  { key: 'budgets', label: 'الموازنات ومراكز التكلفة', module: 'FINANCE', route: '/finance/budgets-cost-centers', legacyView: 'finance.budgets.view',
    actions: [...FINANCE, 'manage', 'approve', 'print', 'export_excel'] },
  { key: 'cash_forecast', label: 'توقع التدفقات النقدية', module: 'FINANCE', route: '/finance/cash-forecast', legacyView: 'finance.cash_forecast.view',
    actions: [...ANALYTICS, 'manage', 'kpi'] },
  { key: 'epayments', label: 'الدفع الإلكتروني والتسويات', module: 'FINANCE', route: '/finance/epayment-settlements', legacyView: 'finance.epayments.view',
    actions: [...FINANCE, 'settle', 'reconcile', 'print', 'export_excel'] },
  { key: 'assets', label: 'الأصول الثابتة', module: 'FINANCE', route: '/finance/assets', legacyView: 'finance.assets.view',
    actions: [...FINANCE, 'manage', 'depreciate', 'dispose', 'print', 'timeline'] },
  { key: 'cashier', label: 'الخزائن والورديات', module: 'CASHIER', route: '/cashboxes', legacyView: 'cashier.view',
    actions: [...FINANCE, 'manage', 'open_shift', 'close_shift', 'handover', 'cash_drawer', 'expense', 'print', 'timeline'],
    sections: [section('cashboxes', 'الخزائن'), section('shifts', 'الورديات'), section('expenses', 'المصروفات'), section('movements', 'الحركات')] },

  // العمليات والموارد البشرية
  { key: 'branches', label: 'الفروع', module: 'BRANCHES', route: '/branches', legacyView: 'branches.view',
    actions: [...CONFIG, 'manage_users', 'access_all', 'print'] },
  { key: 'warehouses', label: 'المخازن', module: 'WAREHOUSES', route: '/warehouses', legacyView: 'warehouses.view',
    actions: [...CONFIG, 'print'] },
  { key: 'employees', label: 'الموظفون', module: 'EMPLOYEES', route: '/employees', legacyView: 'employees.view',
    actions: [...WRITE, 'manage', 'payroll', 'transactions', 'attendance', 'commissions', 'print', 'timeline', 'history'],
    sections: [section('directory', 'دليل الموظفين'), section('finance', 'المالية'), section('attendance', 'الحضور'), section('analytics', 'التحليلات')] },
  { key: 'attendance', label: 'الحضور والانصراف', module: 'EMPLOYEES', route: '/employees/attendance', legacyView: 'employees.attendance.view',
    actions: [...WRITE, 'manage', 'approve', 'print', 'export_excel'] },
  { key: 'payroll', label: 'الرواتب والمسحوبات', module: 'EMPLOYEES', route: '/employees/payroll', legacyView: 'employees.payroll.view',
    actions: [...FINANCE, 'manage', 'approve', 'pay', 'print', 'export_excel'],
    sections: [section('payroll', 'الرواتب'), section('transactions', 'المسحوبات'), section('approvals', 'الموافقات')] },
  { key: 'commissions', label: 'عمولات المبيعات', module: 'EMPLOYEES', route: '/employees/commissions', legacyView: 'employees.commissions.view',
    actions: [...FINANCE, 'manage', 'approve', 'pay', 'print'] },
  { key: 'leave', label: 'الإجازات', module: 'HR', route: '/employees/leave', legacyView: 'hr.leave.view',
    actions: [...WRITE, 'submit', 'approve', 'reject', 'cancel', 'print', 'calendar'] },
  { key: 'contracts', label: 'عقود الموظفين', module: 'HR', route: '/employees/contracts', legacyView: 'hr.contracts.view',
    actions: [...WRITE, 'renew', 'terminate', 'approve', 'print', 'attach', 'timeline'] },
  { key: 'documents', label: 'مستندات الموظفين', module: 'HR', route: '/employees/documents', legacyView: 'hr.documents.view',
    actions: [...DOCS, 'manage', 'verify'] },
  { key: 'recruitment', label: 'التوظيف والمرشحون', module: 'HR', route: '/employees/recruitment', legacyView: 'hr.recruitment.view',
    actions: [...WRITE, 'hire', 'review', 'approve', 'reject', 'print', 'timeline'],
    sections: [section('jobs', 'الوظائف'), section('candidates', 'المرشحون'), section('stages', 'مراحل التوظيف')] },
  { key: 'hr_dashboard', label: 'لوحة الموارد البشرية', module: 'HR', route: '/hr/dashboard', legacyView: 'hr.dashboard.view',
    actions: [...ANALYTICS, 'kpi'] },
  { key: 'deliveries', label: 'التوصيل', module: 'DELIVERIES', route: '/deliveries', legacyView: 'deliveries.view',
    actions: [...WRITE, 'manage', 'assign', 'start', 'complete', 'cancel', 'print', 'timeline'] },
  { key: 'drivers', label: 'السائقون', module: 'DRIVERS', route: '/drivers', legacyView: 'drivers.view',
    actions: [...WRITE, 'manage', 'assign', 'print'] },
  { key: 'vehicles', label: 'المركبات', module: 'VEHICLES', route: '/vehicles', legacyView: 'vehicles.view',
    actions: [...WRITE, 'manage', 'assign', 'maintenance', 'print'] },
  { key: 'fleet', label: 'لوحة الأسطول', module: 'OPERATIONS', route: '/fleet/dashboard', legacyView: 'operations.fleet.view',
    actions: [...ANALYTICS, 'kpi', 'alerts'] },
  { key: 'operations_shifts', label: 'ورديات التشغيل', module: 'OPERATIONS', route: '/operations/shifts', legacyView: 'operations.view',
    actions: [...WRITE, 'assign', 'approve', 'close', 'handover', 'timeline'] },

  // التصنيع
  { key: 'overview', label: 'التصنيع', module: 'MANUFACTURING', route: '/manufacturing', legacyView: 'manufacturing.view',
    actions: [...CONFIG, 'orders', 'bom', 'quality', 'maintenance', 'wip', 'disposition', 'print', 'export_excel'],
    sections: [section('orders', 'أوامر التصنيع'), section('bom', 'قوائم المواد'), section('quality', 'الجودة'), section('maintenance', 'الصيانة'), section('wip', 'تحت التشغيل'), section('disposition', 'المخلفات')] },
  { key: 'orders', label: 'أوامر التصنيع', module: 'MANUFACTURING', route: '/manufacturing', legacyView: 'manufacturing.orders.view',
    actions: [...APPROVE, 'start', 'complete', 'pause', 'execute', 'print', 'timeline'] },
  { key: 'bom', label: 'قوائم المواد', module: 'MANUFACTURING', route: '/manufacturing', legacyView: 'manufacturing.bom.view',
    actions: [...WRITE, 'manage', 'approve', 'print'] },
  { key: 'quality', label: 'مراقبة الجودة', module: 'MANUFACTURING', route: '/manufacturing', legacyView: 'manufacturing.quality.view',
    actions: [...WRITE, 'manage', 'approve', 'reject', 'print'] },
  { key: 'maintenance', label: 'الصيانة', module: 'MANUFACTURING', route: '/manufacturing', legacyView: 'manufacturing.maintenance.view',
    actions: [...WRITE, 'manage', 'start', 'complete', 'print'] },
  { key: 'wip', label: 'الإنتاج تحت التشغيل', module: 'MANUFACTURING', route: '/manufacturing', legacyView: 'manufacturing.wip.view',
    actions: [...WRITE, 'manage', 'complete', 'print'] },
  { key: 'disposition', label: 'التصرف في المخلفات', module: 'MANUFACTURING', route: '/manufacturing', legacyView: 'manufacturing.disposition.view',
    actions: [...WRITE, 'manage', 'approve', 'print'] },

  // المشاريع
  { key: 'list', label: 'المشاريع', module: 'PROJECTS', route: '/projects', legacyView: 'projects.view',
    actions: [...WRITE, 'approve', 'assign', 'print', 'timeline', 'analytics'] },
  { key: 'detail', label: 'تفاصيل المشروع', module: 'PROJECTS', route: '/projects/:id', legacyView: 'projects.view',
    actions: [...READ, 'update', 'delete', 'approve', 'assign', 'print', 'share', 'timeline', 'history'] },
  { key: 'tasks', label: 'مهام المشروع', module: 'PROJECTS', route: '/projects/:id', legacyView: 'projects.tasks.view',
    actions: [...WRITE, 'manage', 'assign', 'start', 'complete', 'priority', 'print'] },
  { key: 'controls', label: 'ضوابط المشروع', module: 'PROJECTS', route: '/projects/:id', legacyView: 'projects.controls.view',
    actions: [...WRITE, 'manage', 'approve', 'print'] },
  { key: 'financials', label: 'مالية المشروع', module: 'PROJECTS', route: '/projects/:id', legacyView: 'projects.financials.view',
    actions: [...FINANCE, 'print', 'export_excel'] },
  { key: 'documents', label: 'مستندات المشروع', module: 'PROJECTS', route: '/projects/:id', legacyView: 'projects.documents.view',
    actions: [...DOCS, 'manage'] },

  // التقارير
  { key: 'hub', label: 'مركز التقارير', module: 'REPORTS', route: '/reports', legacyView: 'reports.view',
    actions: [...ANALYTICS, 'print', 'export_excel', 'export_pdf', 'saved_views'] },
  { key: 'financial', label: 'التقارير المالية', module: 'REPORTS', route: '/reports/category/finance', legacyView: 'reports.financial.view',
    actions: [...ANALYTICS, 'print'] },
  { key: 'sales', label: 'تقارير المبيعات', module: 'REPORTS', route: '/reports/category/sales', legacyView: 'reports.sales.view',
    actions: [...ANALYTICS, 'print'] },
  { key: 'purchases', label: 'تقارير المشتريات', module: 'REPORTS', route: '/reports/category/inventory', legacyView: 'reports.purchases.view',
    actions: [...ANALYTICS, 'print'] },
  { key: 'inventory', label: 'تقارير المخزون', module: 'REPORTS', route: '/reports/category/inventory', legacyView: 'reports.inventory.view',
    actions: [...ANALYTICS, 'print'] },
  { key: 'tax', label: 'التقارير الضريبية', module: 'REPORTS', route: '/reports/tax', legacyView: 'reports.tax.view',
    actions: [...ANALYTICS, 'print', 'export_pdf'] },
  { key: 'pos', label: 'تقارير نقطة البيع', module: 'REPORTS', route: '/reports/pos', legacyView: 'reports.pos.view',
    actions: [...ANALYTICS, 'print'] },
  { key: 'profit_loss', label: 'الأرباح والخسائر', module: 'REPORTS', route: '/reports/profit-loss', legacyView: 'reports.profit_loss.view',
    actions: [...ANALYTICS, 'print'] },
  { key: 'custom', label: 'التقارير المخصصة', module: 'REPORTS', route: '/reports/category/core', legacyView: 'reports.custom.view',
    actions: [...WRITE, 'manage', 'generate', 'apply', 'print'] },
  { key: 'statements', label: 'كشوف الحسابات', module: 'REPORTS', route: '/reports/statements', legacyView: 'reports.view',
    actions: [...ANALYTICS, 'print', 'share'] },

  // الموافقات والمستندات
  { key: 'inbox', label: 'صندوق الموافقات', module: 'APPROVALS', route: '/approvals', legacyView: 'approvals.view',
    actions: [...READ, 'create', 'submit', 'approve', 'reject', 'review', 'cancel', 'assign', 'print', 'timeline', 'bulk_approve'],
    sections: [section('pending', 'قيد الانتظار'), section('approved', 'المعتمدة'), section('rejected', 'المرفوضة')] },
  { key: 'documents', label: 'المستندات', module: 'DOCUMENTS', route: '/documents', legacyView: 'documents.view',
    actions: [...DOCS, 'manage', 'types', 'verify', 'print'] },
  { key: 'contracts', label: 'العقود', module: 'CONTRACTS', route: '/contracts', legacyView: 'contracts.view',
    actions: [...DOCS, 'renew', 'terminate', 'approve', 'sign', 'print', 'timeline'] },

  // الإشعارات والتدقيق والأمان
  { key: 'list', label: 'الإشعارات', module: 'NOTIFICATIONS', route: '/notifications', legacyView: 'notifications.view',
    actions: [...READ, 'manage', 'send', 'delete', 'mark_paid', 'settings'] },
  { key: 'log', label: 'سجل التدقيق', module: 'AUDIT', route: '/audit', legacyView: 'audit.view',
    actions: [...READ, 'export_excel', 'export_csv', 'filter', 'details'] },
  { key: 'center', label: 'مركز الأمان', module: 'SECURITY', route: '/security', legacyView: 'security.view',
    actions: [...CONFIG, 'manage', 'audit_log', 'lock', 'unlock', 'print'] },
  { key: 'sessions', label: 'الجلسات وسجل الدخول', module: 'SESSIONS', route: '/security', legacyView: 'sessions.view',
    actions: [...READ, 'manage', 'terminate', 'lock', 'print'] },

  // المستخدمون والأدوار
  { key: 'users', label: 'المستخدمون', module: 'USERS', route: '/users', legacyView: 'users.view',
    actions: [...WRITE, 'reset_password', 'permissions', 'activate', 'deactivate', 'assign', 'print', 'timeline'],
    sections: [section('list', 'قائمة المستخدمين'), section('permissions', 'الصلاحيات'), section('sessions', 'الجلسات')] },
  { key: 'roles', label: 'الأدوار والصلاحيات', module: 'ROLES', route: '/users', legacyView: 'roles.view',
    actions: [...WRITE, 'manage', 'permissions', 'clone', 'print', 'audit_log'],
    sections: [section('roles', 'الأدوار'), section('matrix', 'مصفوفة الصلاحيات')] },
  { key: 'permissions', label: 'تخصيص صلاحيات المستخدم', module: 'USERS', route: '/users', legacyView: 'users.permissions',
    actions: ['view', 'manage', 'grant', 'deny', 'reset', 'audit_log', 'print'] },

  // الإعدادات
  { key: 'hub', label: 'الإعدادات', module: 'SETTINGS', route: '/settings', legacyView: 'settings.view',
    actions: [...CONFIG, 'backup', 'import', 'export', 'print'],
    sections: [section('general', 'عام'), section('financial', 'مالي'), section('inventory', 'مخزون'), section('sales', 'مبيعات'), section('printing', 'طباعة'), section('backup', 'نسخ احتياطي')] },
  { key: 'app_configuration', label: 'محرك التكوين الديناميكي', module: 'SETTINGS', route: '/settings/app-configuration', legacyView: 'settings.app_config.view',
    actions: [...CONFIG, 'manage', 'publish', 'reset'] },
  { key: 'configuration_studio', label: 'استوديو التكوين', module: 'SETTINGS', route: '/settings/configuration-studio', legacyView: 'settings.config_studio.view',
    actions: [...CONFIG, 'manage', 'publish', 'test'] },
  { key: 'data_import', label: 'مركز استيراد البيانات', module: 'SETTINGS', route: '/data-import', legacyView: 'settings.import.view',
    actions: ['view', 'execute', 'import', 'import_excel', 'import_csv', 'preview', 'validate', 'rollback', 'export', 'print'] },
  { key: 'dynamic_data', label: 'أنواع البيانات الديناميكية', module: 'SETTINGS', route: '/data-import/types', legacyView: 'settings.dynamic_data.view',
    actions: [...CONFIG, 'manage'] },
  { key: 'license_mode', label: 'وضع الترخيص', module: 'SETTINGS', route: '/settings', legacyView: 'settings.license_mode.view',
    actions: [...CONFIG, 'manage', 'activate', 'deactivate'] },
  { key: 'backup', label: 'النسخ الاحتياطي', module: 'SETTINGS', route: '/backup', legacyView: 'settings.backup',
    actions: ['view', 'backup', 'restore', 'restore_backup', 'download', 'upload', 'delete', 'schedule', 'verify', 'print'] },
  { key: 'system_health', label: 'صحة النظام', module: 'SETTINGS', route: '/system-health', legacyView: 'settings.health.view',
    actions: ['view', 'manage', 'refresh', 'export', 'test', 'purge', 'recalculate'] },
  { key: 'appearance', label: 'الهوية والمظهر', module: 'SETTINGS', route: '/settings', legacyView: 'settings.appearance.manage',
    actions: [...CONFIG, 'manage', 'upload', 'reset'] },
  { key: 'taxes', label: 'إعدادات الضرائب', module: 'SETTINGS', route: '/settings', legacyView: 'settings.taxes.manage',
    actions: [...CONFIG, 'manage'] },
  { key: 'numbering', label: 'ترقيم المستندات', module: 'SETTINGS', route: '/settings', legacyView: 'settings.numbering.manage',
    actions: [...CONFIG, 'manage', 'reset'] },
  { key: 'printers', label: 'الطابعات والطباعة', module: 'SETTINGS', route: '/settings', legacyView: 'settings.printers.manage',
    actions: [...CONFIG, 'manage', 'test', 'print', 'print_label'] },

  // الإدارة والنظام
  { key: 'control_center', label: 'مركز التحكم', module: 'ADMIN', route: '/admin', legacyView: 'admin.view',
    actions: [...CONFIG, 'manage', 'audit_log', 'print'] },
  { key: 'navigation', label: 'تخصيص قوائم التنقل', module: 'ADMIN', route: '/admin', legacyView: 'admin.navigation',
    actions: [...CONFIG, 'manage', 'reset', 'publish'] },
  { key: 'data_admin', label: 'أدوات البيانات والصيانة', module: 'ADMIN', route: '/admin', legacyView: 'admin.data',
    actions: [...CONFIG, 'manage', 'export', 'import', 'purge', 'verify', 'backup'] },
  { key: 'data_deletion', label: 'حذف البيانات', module: 'ADMIN', route: '/admin/data-deletion', legacyView: 'admin.data.delete',
    actions: ['view', 'delete', 'purge', 'backup', 'verify', 'audit_log'] },
  { key: 'sync_conflicts', label: 'تعارضات مزامنة الفروع', module: 'ADMIN', route: '/admin/sync-conflicts', legacyView: 'admin.view',
    actions: [...CONFIG, 'manage', 'sync', 'resolve', 'print'] },
  { key: 'license', label: 'ترخيص المنصة المركزية', module: 'ADMIN', route: '/central-activation', legacyView: 'admin.license.manage',
    actions: [...CONFIG, 'manage', 'activate', 'deactivate', 'sync', 'verify'] },

  // وحدات إضافية
  { key: 'invoices', label: 'الفواتير الإلكترونية', module: 'E_INVOICING', route: '/sales', legacyView: 'electronic_invoices.view',
    actions: [...APPROVE, 'send_to_tax', 'accept', 'reject', 'cancel', 'sign', 'print', 'share', 'timeline'] },
  { key: 'program', label: 'برنامج الولاء', module: 'LOYALTY', route: '/customers', legacyView: 'loyalty.view',
    actions: [...CONFIG, 'manage', 'earn', 'redeem', 'adjust', 'print', 'analytics'] },
  { key: 'overview', label: 'التحليلات المتقدمة', module: 'ANALYTICS', route: '/dashboard', legacyView: 'analytics.view',
    actions: [...ANALYTICS, 'write', 'kpi', 'charts', 'group_by'] },
  { key: 'registry', label: 'وحدات الأعمال', module: 'MODULES', route: '/settings', legacyView: 'modules.view',
    actions: [...CONFIG, 'manage', 'activate', 'deactivate', 'configure'] },
  { key: 'list', label: 'الشركات والكيانات القانونية', module: 'COMPANIES', route: '/settings', legacyView: 'companies.view',
    actions: [...WRITE, 'manage', 'activate', 'deactivate', 'print'] },
];

function buildPermissions(): GranularPermissionDef[] {
  const result: GranularPermissionDef[] = [];
  const seen = new Set<string>();
  const actionLabel = (action: string) => ACTION_LABELS[action] ?? action;

  const push = (def: GranularPermissionDef) => {
    if (seen.has(def.code)) return;
    seen.add(def.code);
    result.push(def);
  };

  for (const page of PAGES) {
    const module = page.module || moduleOf(page.legacyView);
    const base = `ui.${module.toLowerCase()}.${page.key}`;
    // معظم الصفحات تُعرَّف بصلاحية عرض بصيغة `module.page.view`، ويُشتق كود
    // الإجراء منها بإزالة `.view`. بعض الصفحات القديمة تُعرَّف بكود إجراء مباشر
    // (مثل `inventory.count` أو `cashier.expense`)، وفي هذه الحالة يجب أن يكون
    // أساس الإجراء هو الكود نفسه لا آخر مقطع منه، وإلا تُفقد صلاحيات مثل
    // `inventory.count.approve` عند الترحيل إلى الصلاحيات الدقيقة.
    const legacyPrefix = page.legacyView.endsWith('.view')
      ? page.legacyView.slice(0, -'.view'.length)
      : page.legacyView;

    // صلاحية الدخول إلى الصفحة
    const viewHead = page.legacyView.split('.')[0];
    const viewAliases = viewHead && `${viewHead}.view` !== page.legacyView
      ? [`${viewHead}.view`]
      : undefined;
    push({
      code: `${base}.view`,
      name: `عرض صفحة ${page.label}`,
      module,
      group: page.label,
      kind: 'page',
      legacy: page.legacyView,
      legacyAliases: viewAliases,
      route: page.route,
      granular: true,
    });

    // أزرار وإجراءات الصفحة
    for (const action of page.actions) {
      if (action === 'view') continue;
      const legacy = `${legacyPrefix}.${action}`;
      // الأكواد القديمة العامة (مثل crm.create أو inventory.export) كانت تُستخدم
      // لهذه الصفحة قبل الترقية، لذا تُحفظ كأكواد مكافئة حتى لا تفقد الأدوار قدراتها.
      const legacyAliases = [`${page.legacyView.split('.')[0]}.${action}`]
        .filter((alias) => alias !== legacy);
      const destructive = ['delete', 'bulk_delete', 'purge', 'void', 'reverse', 'cancel', 'reject', 'terminate', 'close', 'reopen', 'restore_backup', 'mark_unpaid', 'dispose'].includes(action);
      push({
        code: `${base}.${action}`,
        name: `${actionLabel(action)} — ${page.label}`,
        module,
        group: page.label,
        kind: 'action',
        legacy,
        legacyAliases: legacyAliases.length ? legacyAliases : undefined,
        route: page.route,
        destructive,
        granular: true,
      });
    }

    // أقسام/تبويبات الصفحة
    for (const sec of page.sections ?? []) {
      const secBase = `${base}.section.${sec.key}`;
      const secViewHead = page.legacyView.split('.')[0];
      const secViewAliases = secViewHead && `${secViewHead}.view` !== page.legacyView
        ? [`${secViewHead}.view`]
        : undefined;
      push({
        code: `${secBase}.view`,
        name: `عرض قسم ${sec.label} — ${page.label}`,
        module,
        group: page.label,
        kind: 'section',
        legacy: page.legacyView,
        legacyAliases: secViewAliases,
        route: page.route,
        granular: true,
      });
      for (const action of sec.actions ?? []) {
        if (action === 'view') continue;
        push({
          code: `${secBase}.${action}`,
          name: `${actionLabel(action)} قسم ${sec.label} — ${page.label}`,
          module,
          group: page.label,
          kind: 'section',
          legacy: `${legacyPrefix}.${action}`,
          route: page.route,
          destructive: ['delete', 'bulk_delete', 'purge'].includes(action),
          granular: true,
        });
      }
    }
  }

  return result;
}

export const GRANULAR_PERMISSIONS: readonly GranularPermissionDef[] = buildPermissions();

/** خريطة سريعة: كود الصلاحية الدقيقة → الكود القديم المكافئ. */
export const GRANULAR_LEGACY_MAP: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(GRANULAR_PERMISSIONS.filter((p) => p.legacy).map((p) => [p.code, p.legacy!]))
);

/** خريطة أكواد قديمة إضافية مكافئة: كود الصلاحية الدقيقة → قائمة أكواد قديمة. */
export const GRANULAR_LEGACY_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(
    GRANULAR_PERMISSIONS
      .filter((p) => p.legacyAliases?.length)
      .map((p) => [p.code, Object.freeze([...(p.legacyAliases ?? [])])])
  )
);

/** خريطة المسار → صلاحية عرض الصفحة (أول صلاحية صفحة لكل مسار). */
export const PAGE_VIEW_PERMISSIONS: Readonly<Record<string, string>> = Object.freeze(
  {
    ...GRANULAR_PERMISSIONS
      .filter((p) => p.kind === 'page' && p.route)
      .reduce<Record<string, string>>((acc, p) => {
        if (!acc[p.route!]) acc[p.route!] = p.code;
        return acc;
      }, {}),
    '/tools': 'ui.dashboard.overview.view',
    '/inventory': 'ui.inventory.hub.view',
    '/inventory/reservations': 'ui.inventory.reservations.view',
    '/crm/hub': 'ui.crm.dashboard.view',
  }
);
