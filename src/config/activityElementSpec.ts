import { getEffectiveBusinessType } from '../services/domains/config/BusinessTypeService';
import { getBusinessProfile } from './businessProfiles';
import { isActivityPathHidden } from './activityPageVisibility';

/**
 * Per-page element spec.
 *
 * Page-level hiding lives in `activityPageVisibility.ts` and whole-section
 * copy in `activityPageCopy*`; this registry controls the elements *inside* a
 * visible page: action buttons, tabs, panels and inline controls.
 *
 * Keys of `PAGE_ELEMENT_RULES` are route paths. A rule set applies to its
 * exact path and, when no exact entry exists, to descendant paths (so
 * `/customers/:id` inherits `/customers` element rules).
 *
 * Each element rule supports:
 * - `hiddenFor`: activity ids or family ids for which the element is hidden.
 * - `hiddenPath` / `hiddenPaths`: the element is hidden whenever the
 *   referenced route is hidden for the activity — keeps button visibility
 *   automatically in sync with page visibility (e.g. a "POS checkout"
 *   button disappears exactly when `/pos` is hidden).
 * - `labels`: activity id or family id → label override (activity wins over
 *   family). Used for button/tab wording that differs per sector.
 */

export interface ActivityElementRule {
  hiddenFor?: string[];
  /** Element is hidden unless the activity or its family is listed here. */
  onlyFor?: string[];
  hiddenPath?: string;
  hiddenPaths?: string[];
  labels?: Record<string, string>;
}

export type ActivityPageElementRules = Record<string, ActivityElementRule>;

/** Activity/family groups reused across rules. */
const SERVICE_OFFICES = ['professional_services', 'healthcare', 'education', 'construction'];
const NO_MARKETING = ['professional_services', 'healthcare', 'education'];

export const PAGE_ELEMENT_RULES: Record<string, ActivityPageElementRules> = {
  // ── Daily workspace ────────────────────────────────────────────────
  '/daily/sales': {
    'quick-sale': { hiddenPath: '/pos', labels: { hospitality: 'حجز سريع', education: 'تسجيل قسط', workshop: 'أمر شغل سريع', healthcare: 'موعد كشف', construction: 'مستخلص سريع' } },
    'new-sale': { labels: { hospitality: 'حجز إقامة', education: 'تسجيل قسط', workshop: 'أمر شغل جديد', healthcare: 'موعد كشف', construction: 'مستخلص جديد' } },
    'payment': {},
    'void': {},
  },
  '/daily/purchases': {
    'quick-purchase': { labels: { manufacturing: 'فاتورة خامات', construction: 'فاتورة مورد', import_export: 'فاتورة استيراد', logistics: 'فاتورة تشغيل', hospitality: 'توريد مستلزمات', healthcare: 'فاتورة مستلزمات', education: 'فاتورة مشتريات', workshop: 'فاتورة قطع غيار', professional_services: 'فاتورة مكتب' } },
    'payment': {},
    'void': {},
    'print': {},
    'details': {},
  },
  '/daily/expenses': {
    'new-expense': {},
  },
  '/daily/debts': {
    'collect': { labels: { hospitality: 'تحصيل نزيل', healthcare: 'تحصيل مريض', education: 'تحصيل ولي أمر' } },
    'installments': { hiddenPath: '/finance/installments' },
  },

  // ── Sales hub ──────────────────────────────────────────────────────
  '/sales': {
    'pos-checkout': { hiddenPath: '/pos' },
    'new-invoice': { labels: { hospitality: 'فاتورة إقامة', education: 'قسط جديد', workshop: 'فاتورة صيانة', healthcare: 'فاتورة كشف', construction: 'مستخلص جديد', import_export: 'فاتورة تصدير', logistics: 'بوليصة شحن', manufacturing: 'أمر تسليم' } },
    'new-order': { hiddenPath: '/orders', labels: { workshop: 'أمر شغل', healthcare: 'موعد كشف', education: 'تسجيل طالب', hospitality: 'حجز غرفة', construction: 'أمر تنفيذ' } },
    'new-quotation': { hiddenPath: '/quotations', labels: { workshop: 'تقدير صيانة', healthcare: 'عرض باقة', education: 'عرض دورة', hospitality: 'عرض إقامة', construction: 'مقايسة' } },
    'new-return': { hiddenPath: '/returns' },
    'after-sales': { hiddenPath: '/sales/after-sales', labels: { workshop: 'ضمانات الصيانة', home_appliances: 'الضمانات', electronics: 'الضمانات', automotive: 'الضمانات' } },
    'promotions': { hiddenPath: '/promotions' },
    'installments': { hiddenPath: '/finance/installments' },
    'statement': { hiddenPath: '/sales/statement', labels: { hospitality: 'كشف حساب النزيل', healthcare: 'كشف حساب المريض', education: 'كشف حساب ولي الأمر' } },
    'electronic-invoicing': { hiddenPath: '/sales/e-invoicing' },
    'export': {},
    'print': {},
    'collect-payment': {},
    'sales-return': { hiddenPath: '/returns' },
    'warranty': { hiddenPath: '/sales/after-sales' },
  },
  '/sales/analytics': {
    'pos-checkout': { hiddenPath: '/pos' },
    'export': {},
    'print': {},
  },
  '/sales/cycle': {},
  '/sales/statement': {
    'print': {},
    'export': {},
    'send': {},
  },
  '/sales/orders-deposits': {
    'new-reservation': { labels: { hospitality: 'حجز غرفة', education: 'حجز مقعد', ceramics: 'حجز مساحة', furniture: 'حجز قطعة' } },
    'new-order': { hiddenPath: '/orders' },
    'deposit': {},
    'print': {},
  },
  '/sales/after-sales': {
    'new-warranty': {},
    'new-claim': { labels: { hospitality: 'بلاغ نزيل' } },
  },
  '/quotations': {
    'new-quotation': { labels: { workshop: 'تقدير صيانة', healthcare: 'عرض باقة', education: 'عرض دورة', hospitality: 'عرض إقامة', construction: 'مقايسة جديدة' } },
    'convert': {},
    'print': {},
    'export': {},
  },
  '/orders': {
    'new-order': { labels: { workshop: 'أمر شغل', healthcare: 'موعد كشف', education: 'تسجيل طالب', hospitality: 'حجز', construction: 'أمر تنفيذ', logistics: 'طلب توصيل', manufacturing: 'أمر إنتاج' } },
    'convert': {},
    'print': {},
    'export': {},
  },
  '/returns': {
    'new-return': {},
    'print': {},
    'export': {},
  },
  '/pos': {
    'hold': {},
    'discount': { hiddenFor: NO_MARKETING },
    'promotions': { hiddenPath: '/promotions', hiddenFor: NO_MARKETING },
    'loyalty': { hiddenFor: NO_MARKETING },
    'customer': {},
    'sales-rep': {},
    'split-payment': {},
    'receipt': { labels: { hospitality: 'فاتورة الإقامة' } },
    'receipt-print': {},
  },
  '/ceramics': {
    'calculator': { onlyFor: ['ceramics'] },
    'save-design': {},
  },
  '/retail': {},
  '/construction-estimate': {
    'print': {},
    'export': {},
    'convert-quotation': { hiddenPath: '/quotations' },
  },

  // ── Inventory hub ──────────────────────────────────────────────────
  '/inventory': {
    'new-transfer': { hiddenPath: '/inventory/transfers' },
    'new-count': { hiddenPath: '/inventory/counts' },
    'new-adjustment': { hiddenPath: '/inventory/adjustments' },
    'expiry': { hiddenPath: '/inventory/expiry' },
    'ledger': { hiddenPath: '/inventory/ledger' },
    'export': {},
    'print': {},
  },
  '/inventory/hub': {},
  '/inventory/warehouse-stock': {
    'new-transfer': { hiddenPath: '/inventory/transfers' },
    'new-count': { hiddenPath: '/inventory/counts' },
    'new-adjustment': { hiddenPath: '/inventory/adjustments' },
    'expiry': { hiddenPath: '/inventory/expiry' },
    'export': {},
    'print': {},
  },
  '/inventory/showroom-stock': {
    'new-transfer': { hiddenPath: '/inventory/transfers' },
    'export': {},
    'print': {},
  },
  '/inventory/ledger': {
    'export': {},
    'print': {},
  },
  '/inventory/transfers': {
    'new-transfer': {},
    'approve': {},
    'execute': {},
    'receive': {},
    'print': {},
    'export': {},
  },
  '/inventory/counts': {
    'new-count': {},
    'approve': {},
    'post': {},
    'print': {},
  },
  '/inventory/valuation': {
    'export': {},
    'print': {},
  },
  '/inventory/adjustments': {
    'new-adjustment': {},
    'approve': {},
    'post': {},
    'print': {},
  },
  '/inventory/stock-reservations': {
    'new-reservation': {},
    'release': {},
  },
  '/inventory/reorder-planning': {
    'create-po': { hiddenPath: '/purchases/orders' },
    'export': {},
  },
  '/inventory/locations': {
    'new-location': {},
  },
  '/inventory/damage-quarantine': {
    'quarantine': {},
    'release': {},
    'write-off': {},
  },
  '/inventory/reconciliation': {
    'run': {},
    'export': {},
    'print': {},
  },
  '/inventory/alerts': {
    'export': {},
  },
  '/inventory/expiry': {
    'new-batch': {},
    'print-labels': { hiddenFor: SERVICE_OFFICES },
  },

  // ── Products ───────────────────────────────────────────────────────
  '/products': {
    'new-product': { labels: { ceramics: 'بلاطة / تصميم جديد', sanitary: 'أداة صحية جديدة', furniture: 'قطعة أثاث', home_appliances: 'جهاز كهربائي', electronics: 'جهاز / إكسسوار', clothing: 'قطعة ملابس', food: 'صنف غذائي', cosmetics: 'منتج تجميل', automotive: 'قطعة غيار', building_materials: 'مادة بناء', lighting: 'منتج إضاءة', ecommerce: 'منتج متجر', hospitality: 'غرفة / خدمة', healthcare: 'خدمة طبية', education: 'دورة / خدمة', workshop: 'قطعة غيار', manufacturing: 'منتج مصنّع', construction: 'بند تنفيذ', import_export: 'بضاعة', logistics: 'خدمة شحن', professional_services: 'ملف خدمة', services: 'خدمة', custom: 'منتج / خدمة' } },
    'import': {},
    'export': {},
    'print-barcodes': { hiddenPath: '/products/barcodes', hiddenFor: ['professional_services', 'healthcare', 'education', 'construction', 'logistics'] },
    'categories': { hiddenPath: '/categories' },
    'brands': { hiddenPath: '/brands' },
    'attributes': { hiddenPath: '/products/attributes' },
    'pricing': { hiddenPath: '/pricing' },
    'promotions': { hiddenPath: '/promotions' },
  },
  '/products/attributes': {
    'new-attribute': {},
  },
  '/products/barcodes': {
    'tab': { hiddenFor: ['professional_services', 'healthcare', 'education', 'logistics'] },
    'print': {},
    'export': {},
  },
  '/categories': {
    'new-category': {},
  },
  '/brands': {
    'new-brand': {},
  },
  '/pricing': {
    'new-price-list': {},
    'tiers': {},
    'export': {},
  },
  '/promotions': {
    'new-promotion': { labels: { hospitality: 'عرض فندقي', ecommerce: 'كوبون متجر', education: 'عرض تسجيل' } },
    'export': {},
  },

  // ── Purchasing hub ────────────────────────────────────────────────
  '/purchases': {
    'new-invoice': { labels: { manufacturing: 'فاتورة خامات', construction: 'فاتورة مورد', import_export: 'فاتورة استيراد', logistics: 'فاتورة تشغيل', hospitality: 'توريد مستلزمات', healthcare: 'فاتورة مستلزمات', education: 'فاتورة مشتريات', workshop: 'فاتورة قطع غيار', professional_services: 'فاتورة مكتب' } },
    'new-request': { hiddenPath: '/purchases/requests' },
    'new-quotation': { hiddenPath: '/purchases/quotations' },
    'new-order': { hiddenPath: '/purchases/orders' },
    'new-receipt': { hiddenPath: '/purchases/receipts' },
    'new-return': { hiddenPath: '/purchases/returns' },
    'claims': { hiddenPath: '/purchases/claims', labels: { import_export: 'مطالبات جمارك', logistics: 'مطالبات شحن', manufacturing: 'مطالبات جودة' } },
    'statement': { hiddenPath: '/purchases/statement' },
    'export': {},
    'print': {},
    'pay-supplier': {},
  },
  '/purchases/requests': {
    'new-request': {},
    'approve': {},
    'convert': {},
  },
  '/purchases/quotations': {
    'new-quotation': {},
    'compare': {},
    'convert': {},
    'print': {},
  },
  '/purchases/orders': {
    'new-order': {},
    'receive': {},
    'close': {},
    'print': {},
    'export': {},
  },
  '/purchases/receipts': {
    'new-receipt': {},
    'print': {},
    'export': {},
  },
  '/purchases/incoming': {
    'new-receipt': { hiddenPath: '/purchases/receipts' },
    'export': {},
    'print': {},
  },
  '/purchases/returns': {
    'new-return': {},
    'print': {},
    'export': {},
  },
  '/purchases/claims': {
    'new-claim': { labels: { import_export: 'مطالبة جمارك', logistics: 'مطالبة شحن', manufacturing: 'مطالبة جودة' } },
    'resolve': {},
    'print': {},
  },
  '/purchases/statement': {
    'print': {},
    'export': {},
  },
  '/suppliers': {
    'new-supplier': { labels: { construction: 'مقاول مواد', import_export: 'مورد / مصدر', logistics: 'شركة شحن', manufacturing: 'مورد خامات', hospitality: 'مورد مستلزمات', healthcare: 'مورد مستلزمات', education: 'مورد مؤسسة', workshop: 'مورد قطع غيار', professional_services: 'مكتب / شريك' } },
    'statement': { hiddenPath: '/purchases/statement' },
    'import': {},
    'export': {},
    'print': {},
  },

  // ── CRM hub ────────────────────────────────────────────────────────
  '/crm/dashboard': {
    'lead': { hiddenPath: '/crm/leads' },
    'pipeline': { hiddenPath: '/crm/pipeline' },
    'campaign': { hiddenPath: '/crm/campaigns' },
  },
  '/crm/leads': {
    'new-lead': { labels: { hospitality: 'نزيل محتمل', healthcare: 'مريض جديد', education: 'طالب محتمل', workshop: 'سيارة جديدة', construction: 'مشروع محتمل', ecommerce: 'عميل متجر' } },
    'convert': {},
  },
  '/crm/pipeline': {
    'new-lead': { hiddenPath: '/crm/leads' },
    'lead': { hiddenPath: '/crm/leads' },
    'move-stage': {},
  },
  '/crm/activities': {
    'new-activity': {},
    'complete': {},
  },
  '/crm/campaigns': {
    'new-campaign': { labels: { hospitality: 'عرض فندقي', education: 'حملة تسجيل', healthcare: 'حملة فحوصات', ecommerce: 'حملة متجر' } },
    'send': {},
  },
  '/customers': {
    'new-customer': { labels: { hospitality: 'نزيل', healthcare: 'مريض', education: 'طالب / ولي أمر', workshop: 'عميل / سيارة', construction: 'صاحب مشروع', import_export: 'عميل / موزع', logistics: 'عميل شحن' } },
    'imported-products': { hiddenPath: '/customers/imported-products' },
    'ready-deliveries': { hiddenPath: '/customers/ready-deliveries' },
    'statement': { hiddenPath: '/sales/statement' },
    'projects': { hiddenPath: '/projects' },
    'contracts': { hiddenPath: '/contracts' },
    'documents': { hiddenPath: '/documents' },
    'import': {},
    'export': {},
    'print': {},
    'collect-payment': { labels: { hospitality: 'تحصيل نزيل', healthcare: 'تحصيل مريض', education: 'تحصيل ولي أمر' } },
  },
  '/customers/imported-products': {
    'new-imported-product': {},
    'link-order': { hiddenPath: '/orders' },
    'export': {},
  },
  '/customers/ready-deliveries': {
    'deliver': { hiddenPath: '/deliveries' },
    'print': {},
  },
  '/partners': {
    'new-partner': {},
    'statement': {},
    'import': {},
    'export': {},
  },

  // ── Projects / operations ──────────────────────────────────────────
  '/projects': {
    'new-project': { labels: { construction: 'مشروع جديد', hospitality: 'فعالية', education: 'دفعة / عام دراسي', manufacturing: 'أمر إنتاج', logistics: 'عقد نقل', import_export: 'صفقة استيراد', healthcare: 'حملة طبية', workshop: 'مشروع صيانة' } },
    'execution': { hiddenPath: '/projects/execution' },
    'sites': { hiddenPath: '/projects/sites' },
    'boq': { hiddenPath: '/projects/boq' },
    'export': {},
  },
  '/projects/execution': {
    'new-milestone': {},
    'certificate': {},
    'print': {},
  },
  '/projects/sites': {
    'new-site': {},
    'daily-report': {},
  },
  '/projects/boq': {
    'new-item': {},
    'export': {},
    'print': {},
  },
  '/education': {
    'new-course': {},
    'new-student': { hiddenPath: '/customers' },
    'installments': { hiddenPath: '/finance/installments' },
    'attendance': {},
    'tab-fees': { hiddenPath: '/finance/installments' },
  },
  '/time-billing': {
    'new-matter': {},
    'new-time-entry': {},
    'invoice': { hiddenPath: '/sales' },
    'print': {},
  },

  // ── Fleet / operations ─────────────────────────────────────────────
  '/fleet/dashboard': {
    'delivery': { hiddenPath: '/deliveries' },
    'driver': { hiddenPath: '/drivers' },
    'vehicle': { hiddenPath: '/vehicles' },
  },
  '/vehicles': {
    'new-vehicle': {},
    'assign-driver': {},
    'maintenance': {},
    'export': {},
  },
  '/drivers': {
    'new-driver': {},
    'assign-vehicle': {},
    'trips': {},
  },
  '/deliveries': {
    'new-delivery': { labels: { logistics: 'شحنة جديدة', ecommerce: 'طلب متجر', import_export: 'شحنة تصدير' } },
    'assign': {},
    'track': {},
    'print': {},
  },
  '/workshop': {
    'new-work-order': { labels: { workshop: 'أمر شغل', automotive: 'أمر صيانة' } },
    'assign-technician': {},
    'parts': { hiddenPath: '/products' },
    'print': {},
  },
  '/manufacturing': {
    'new-production-order': {},
    'bom': {},
    'wip': {},
    'quality': {},
    'print': {},
  },
  '/operations/shifts': {
    'new-shift': {},
    'open': {},
    'close': {},
    'count-cash': {},
  },
  '/facility-management': {
    'new-site': {},
    'maintenance': {},
    'contract': {},
    'safety': {},
  },
  '/warehouses': {
    'new-warehouse': {},
  },
  '/branches': {
    'new-branch': {},
  },

  // ── Hospitality ────────────────────────────────────────────────
  '/hospitality': {
    'rooms': {},
    'new-room': {},
    'guests': {},
    'reservations': { hiddenPath: '/sales/orders-deposits' },
    'housekeeping': {},
    'folio': {},
  },

  // ── Finance hub ────────────────────────────────────────────────────
  '/finance': {},
  '/finance/calendar': {
    'new-event': {},
  },
  '/finance/fiscal-closing': {
    'run': {},
    'audit': {},
    'reopen': {},
  },
  '/cashboxes': {
    'new-cashbox': {},
    'open': {},
    'close': {},
    'transfer': {},
    'count': {},
  },
  '/finance/expenses': {
    'new-expense': { labels: { construction: 'مصروف موقع', hospitality: 'مصروف فندقي', healthcare: 'مصروف عيادة', education: 'مصروف مؤسسة', workshop: 'مصروف ورشة', manufacturing: 'مصروف إنتاج' } },
    'approve': {},
    'print': {},
    'export': {},
  },
  '/finance/accounts': {
    'new-account': {},
    'tree': {},
  },
  '/finance/journal': {
    'new-entry': { labels: { construction: 'قيد مشروع', hospitality: 'قيد فندقي', healthcare: 'قيد عيادة', education: 'قيد مؤسسي', workshop: 'قيد ورشة', manufacturing: 'قيد إنتاج' } },
    'post': {},
    'reverse': {},
    'print': {},
    'export': {},
  },
  '/finance/cheques': {
    'new-cheque': {},
    'deposit': {},
    'collect': {},
    'return': {},
    'print': {},
  },
  '/finance/bank-reconciliation': {
    'new-bank-account': {},
    'import-statement': {},
    'match': {},
    'post': {},
  },
  '/finance/consistency-audit': {
    'run': {},
    'export': {},
  },
  '/finance/budgets-cost-centers': {
    'new-budget': {},
    'new-cost-center': { labels: { construction: 'مركز تكلفة موقع', hospitality: 'مركز تكلفة فندقي', education: 'مركز تكلفة أكاديمي' } },
    'variance': {},
  },
  '/finance/cash-forecast': {
    'export': {},
    'print': {},
  },
  '/finance/epayment-settlements': {
    'new-gateway': {},
    'settle': {},
    'export': {},
  },
  '/finance/assets': {
    'new-asset': { labels: { construction: 'أصل موقع', hospitality: 'أصل فندقي', healthcare: 'جهاز عيادة', education: 'أصل مؤسسة', workshop: 'معدات ورشة', manufacturing: 'آلة إنتاج' } },
    'depreciate': {},
    'dispose': {},
    'print': {},
  },
  '/finance/receivables': {},
  '/finance/other-receivables': {
    'new-receivable': { labels: { import_export: 'مطالبة عميل', logistics: 'مطالبة شحن', construction: 'مطالبة مشروع', hospitality: 'مطالبة نزيل', healthcare: 'مطالبة تأمين' } },
    'collect': {},
    'print': {},
  },
  '/finance/installments': {
    'new-plan': { labels: { education: 'خطة أقساط طلابية', hospitality: 'تقسيط إقامة', healthcare: 'تقسيط رسوم', ecommerce: 'تقسيط طلب', construction: 'دفعات مشروع', workshop: 'تقسيط صيانة' } },
    'collect': {},
    'remind': {},
    'print': {},
    'export': {},
  },

  // ── HR ─────────────────────────────────────────────────────────────
  '/hr/dashboard': {},
  '/hr/alerts': {},
  '/employees': {
    'new-employee': { labels: { construction: 'عامل / مهندس موقع', hospitality: 'موظف فندقي', healthcare: 'موظف عيادة', education: 'موظف مدرسة', workshop: 'فني / موظف', manufacturing: 'عامل إنتاج', logistics: 'موظف تشغيل', import_export: 'موظف', professional_services: 'محاسب / مستشار' } },
    'contracts': { hiddenPath: '/employees/contracts' },
    'documents': { hiddenPath: '/employees/documents' },
    'attendance': { hiddenPath: '/employees/attendance' },
    'payroll': { hiddenPath: '/employees/payroll' },
    'leave': { hiddenPath: '/employees/leave' },
    'recruitment': { hiddenPath: '/employees/recruitment' },
    'import': {},
    'export': {},
  },
  '/employees/attendance': {
    'check-in': {},
    'check-out': {},
    'adjust': {},
    'overtime': {},
    'export': {},
    'print': {},
  },
  '/employees/payroll': {
    'new-run': {},
    'calculate': {},
    'approve': {},
    'pay': {},
    'payslip': {},
    'export': {},
    'print': {},
  },
  '/employees/payroll/payslips': {
    'print': {},
    'email': {},
    'export': {},
  },
  '/employees/payroll/calendar': {},
  '/employees/payroll/notification-settings': {},
  '/employees/commissions': {
    'new-rule': {},
    'calculate': {},
    'pay': {},
    'export': {},
  },
  '/employees/leave': {
    'new-request': {},
    'approve': {},
    'balance': {},
  },
  '/hr/organization': {
    'new-department': {},
    'new-position': {},
    // Asset-custody tracking only matters for businesses holding physical
    // stock/equipment — offices, clinics and schools don't need it.
    'tab-custody': { onlyFor: ['retail', 'distribution', 'manufacturing', 'construction', 'transport', 'hospitality'] },
  },
  '/hr/performance': {
    'new-review': {},
    'kpi': {},
  },
  '/hr/training': {
    'new-course': {},
    'enroll': {},
    'certificate': {},
  },
  '/hr/discipline': {
    'new-incident': {},
    'warn': {},
    'terminate': {},
  },
  '/hr/benefits': {
    'new-benefit': {},
    'enroll': {},
  },
  '/hr/workforce-planning': {
    'plan': {},
    'forecast': {},
  },
  '/hr/clearance': {
    'start': {},
    'complete': {},
    'print': {},
  },
  '/hr/social-insurance': {
    'new-file': {},
    'submit': {},
    'export': {},
  },
  '/hr/attendance-devices': {
    'sync': {},
    'logs': {},
  },
  '/employees/contracts': {
    'new-contract': { labels: { construction: 'عقد مقاولة', hospitality: 'عقد توريد', healthcare: 'عقد خدمة طبية', education: 'عقد ولي أمر', workshop: 'عقد صيانة', logistics: 'عقد نقل', import_export: 'عقد توريد' } },
    'renew': {},
    'terminate': {},
    'print': {},
  },
  '/employees/documents': {
    'upload': {},
    'expire': {},
    'print': {},
  },
  '/employees/recruitment': {
    'new-vacancy': {},
    'new-candidate': {},
    'interview': {},
    'hire': {},
  },
  '/hr/self-service': {},

  // ── Reports ────────────────────────────────────────────────────────
  '/reports': {},
  '/reports/category/core': {},
  '/reports/category/operations': {},
  '/reports/category/sales': {},
  '/reports/category/credit': {},
  '/reports/category/inventory': {},
  '/reports/category/finance': {},
  '/reports/category/forecast': {},

  // ── Documents / approvals ──────────────────────────────────────────
  '/documents': {
    'upload': {},
    'new-folder': {},
    'share': {},
    'print': {},
    'export': {},
  },
  '/contracts': {
    'new-contract': {},
    'sign': {},
    'renew': {},
    'print': {},
    'export': {},
  },
  '/approvals': {
    'approve': {},
    'reject': {},
    'delegate': {},
  },

  // ── Settings / admin ───────────────────────────────────────────────
  '/settings': {},
  '/admin': {},
  '/notifications': {},
};

/** Element rules applying to a path: exact match, else nearest ancestor. */
function resolveElementRules(
  pathname: string,
  businessType: string,
): { path: string; rules: ActivityPageElementRules } | undefined {
  void businessType;
  if (PAGE_ELEMENT_RULES[pathname]) {
    return { path: pathname, rules: PAGE_ELEMENT_RULES[pathname] };
  }
  const segments = pathname.split('/').filter(Boolean);
  for (let end = segments.length - 1; end > 0; end -= 1) {
    const candidate = `/${segments.slice(0, end).join('/')}`;
    if (PAGE_ELEMENT_RULES[candidate]) {
      return { path: candidate, rules: PAGE_ELEMENT_RULES[candidate] };
    }
  }
  return undefined;
}

function ruleHidesFor(rule: ActivityElementRule, businessType: string): boolean {
  const familyId = getBusinessProfile(businessType).familyId;
  const matches = (id: string) => id === businessType || (familyId ? id === familyId : false);
  if (rule.onlyFor?.length) {
    if (!rule.onlyFor.some(matches)) return true;
  }
  if (rule.hiddenFor?.length && rule.hiddenFor.some(matches)) {
    return true;
  }
  if (rule.hiddenPath && isActivityPathHidden(rule.hiddenPath, businessType)) return true;
  if (rule.hiddenPaths?.some((path) => isActivityPathHidden(path, businessType))) return true;
  return false;
}

function ruleLabelFor(rule: ActivityElementRule, businessType: string): string | undefined {
  if (!rule.labels) return undefined;
  const familyId = getBusinessProfile(businessType).familyId;
  return rule.labels[businessType] ?? (familyId ? rule.labels[familyId] : undefined);
}

/** Resolved visibility + label for one element on the given path. */
export interface ActivityElementState {
  visible: boolean;
  label?: string;
}

export function resolveActivityElement(
  pathname: string,
  elementId: string,
  businessType: string = getEffectiveBusinessType(),
): ActivityElementState {
  const resolved = resolveElementRules(pathname, businessType);
  const rule = resolved?.rules[elementId];
  if (!rule) return { visible: true };
  return {
    visible: !ruleHidesFor(rule, businessType),
    label: ruleLabelFor(rule, businessType),
  };
}

/** True when `elementId` is hidden for the activity on `pathname`. */
export function isActivityElementHidden(
  pathname: string,
  elementId: string,
  businessType: string = getEffectiveBusinessType(),
): boolean {
  return !resolveActivityElement(pathname, elementId, businessType).visible;
}

/** Label override for `elementId`, or undefined to keep the default text. */
export function getActivityElementLabel(
  pathname: string,
  elementId: string,
  businessType: string = getEffectiveBusinessType(),
): string | undefined {
  return resolveActivityElement(pathname, elementId, businessType).label;
}

/** All element states declared for `pathname` (empty object when none). */
export function resolveActivityElements(
  pathname: string,
  businessType: string = getEffectiveBusinessType(),
): Record<string, ActivityElementState> {
  const resolved = resolveElementRules(pathname, businessType);
  if (!resolved) return {};
  const out: Record<string, ActivityElementState> = {};
  for (const elementId of Object.keys(resolved.rules)) {
    out[elementId] = resolveActivityElement(pathname, elementId, businessType);
  }
  return out;
}

export interface ActivitySubTabLike {
  id: string;
  label: string;
}

/**
 * Activity-aware filter/labeler for in-page tab strips whose tabs are not
 * routes (e.g. HR section tabs). A tab is hidden when the `tab-<id>` element
 * is hidden on `pathname`; `tab-<id>` `labels` rename the tab.
 */
export function resolveActivitySubTabs<T extends ActivitySubTabLike>(
  tabs: T[],
  pathname: string,
  businessType: string = getEffectiveBusinessType(),
): T[] {
  return tabs
    .filter((tab) => !isActivityElementHidden(pathname, `tab-${tab.id}`, businessType))
    .map((tab) => {
      const label = getActivityElementLabel(pathname, `tab-${tab.id}`, businessType);
      return label ? { ...tab, label } : tab;
    });
}

export interface ActivityTabLike {
  id: string;
  label: string;
  path: string;
}

/**
 * Generic activity-aware tab filter/labeler for any tab strip (hub pages,
 * in-page tabs, workspace sections). A tab is hidden when its destination
 * path is activity-hidden OR when the destination page declares its `tab`
 * element hidden. The `tab` element's `labels` map renames the tab.
 */
export function resolveActivityTabs<T extends ActivityTabLike>(
  tabs: T[],
  businessType: string = getEffectiveBusinessType(),
): T[] {
  return tabs
    .filter((tab) => !isActivityPathHidden(tab.path, businessType))
    .filter((tab) => !isActivityElementHidden(tab.path, 'tab', businessType))
    .map((tab) => {
      const label = getActivityElementLabel(tab.path, 'tab', businessType);
      return label && label !== tab.label ? { ...tab, label } : tab;
    });
}

export default PAGE_ELEMENT_RULES;
