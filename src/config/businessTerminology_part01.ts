import arabicTerms from './terminology/ar.json';

export type BusinessLanguage = 'ar';

export const BUSINESS_TERMINOLOGY = {
  'entities.customers.singular': {
    label: 'عميل',
    description: 'اسم العميل الفردي في النماذج والواجهات.',
  },
  'entities.customers.plural': {
    label: 'العملاء',
    description: 'اسم مجموعة العملاء في القوائم والواجهات.',
  },
  'entities.products.singular': {
    label: 'منتج',
    description: 'اسم المنتج الفردي في النماذج والواجهات.',
  },
  'entities.products.plural': {
    label: 'المنتجات',
    description: 'اسم مجموعة المنتجات أو الخدمات القابلة للبيع.',
  },
  'entities.suppliers.singular': {
    label: 'مورد',
    description: 'اسم المورد الفردي في النماذج والواجهات.',
  },
  'entities.suppliers.plural': {
    label: 'الموردون',
    description: 'اسم مجموعة الموردين في القوائم والواجهات.',
  },
  'entities.projects.singular': {
    label: 'مشروع',
    description: 'اسم المشروع الفردي في النماذج والواجهات.',
  },
  'entities.projects.plural': {
    label: 'المشاريع',
    description: 'اسم مجموعة المشاريع أو العقود في القوائم والواجهات.',
  },
  'modules.inventory': {
    label: 'المخزون',
    description: 'اسم وحدة إدارة المخزون.',
  },
  'modules.sales': {
    label: 'المبيعات',
    description: 'اسم وحدة المبيعات ونقطة البيع.',
  },
  'modules.purchasing': {
    label: 'المشتريات',
    description: 'اسم وحدة المشتريات.',
  },
  'modules.operations': {
    label: 'العمليات',
    description: 'اسم مجموعة العمليات التشغيلية.',
  },
  'modules.reports': {
    label: 'التقارير',
    description: 'اسم وحدة التقارير.',
  },
  'documents.salesInvoices': {
    label: 'فواتير المبيعات',
    description: 'اسم قائمة فواتير المبيعات.',
  },
  'documents.quotations': {
    label: 'عروض الأسعار',
    description: 'اسم عروض الأسعار والمقايسات.',
  },
  'documents.orders': {
    label: 'الطلبات',
    description: 'اسم طلبات العملاء وأوامر العمل.',
  },
  'documents.purchaseOrders': {
    label: 'أوامر الشراء',
    description: 'اسم أوامر الشراء للموردين.',
  },
  'documents.purchaseInvoices': {
    label: 'فواتير الشراء',
    description: 'اسم فواتير ومشتريات الموردين.',
  },
  'entities.employees.singular': {
    label: 'موظف',
    description: 'اسم الموظف الفردي في النماذج والواجهات.',
  },
  'entities.employees.plural': {
    label: 'الموظفون',
    description: 'اسم مجموعة الموظفين في القوائم والواجهات.',
  },
  'modules.crm': {
    label: 'إدارة العملاء',
    description: 'اسم وحدة إدارة علاقات العملاء.',
  },
  'modules.finance': {
    label: 'المالية',
    description: 'اسم وحدة المالية والحسابات.',
  },
  'modules.hr': {
    label: 'الموارد البشرية',
    description: 'اسم وحدة الموارد البشرية والرواتب.',
  },
  'modules.projects': {
    label: 'المشروعات',
    description: 'اسم وحدة إدارة المشروعات والعقود.',
  },
  'actions.newInvoice': {
    label: 'فاتورة جديدة',
    description: 'نص زر إنشاء فاتورة مبيعات جديدة.',
  },
  'actions.newQuotation': {
    label: 'عرض سعر جديد',
    description: 'نص زر إنشاء عرض سعر أو مقايسة جديد.',
  },
  'actions.newOrder': {
    label: 'طلب جديد',
    description: 'نص زر إنشاء طلب أو حجز عميل جديد.',
  },
  'actions.newReturn': {
    label: 'مرتجع جديد',
    description: 'نص زر تسجيل مرتجع مبيعات جديد.',
  },
  'actions.newReservation': {
    label: 'حجز جديد',
    description: 'نص زر إنشاء حجز أو دفعة عميل جديدة.',
  },
  'actions.newPurchaseInvoice': {
    label: 'فاتورة مشتريات جديدة',
    description: 'نص زر تسجيل فاتورة شراء أو توريد جديدة.',
  },
  'actions.newTransfer': {
    label: 'تحويل جديد',
    description: 'نص زر إنشاء تحويل مخزني جديد بين المخازن.',
  },
  'actions.newAdjustment': {
    label: 'تسوية جديدة',
    description: 'نص زر إنشاء تسوية جردية جديدة.',
  },
  'actions.newPurchaseOrder': {
    label: 'أمر شراء جديد',
    description: 'نص زر إنشاء أمر شراء أو توريد جديد.',
  },
  'actions.newGoodsReceipt': {
    label: 'إذن استلام جديد',
    description: 'نص زر تسجيل إذن استلام بضاعة جديد.',
  },
  'actions.newPurchaseRequest': {
    label: 'طلب توريد جديد',
    description: 'نص زر إنشاء طلب شراء داخلي جديد.',
  },
  'actions.newRfq': {
    label: 'طلب عروض أسعار',
    description: 'نص زر إنشاء طلب عروض أسعار من الموردين.',
  },
  'actions.newSupplierClaim': {
    label: 'مطالبة مورد جديدة',
    description: 'نص زر تسجيل مطالبة على مورد جديد.',
  },
  'actions.newLead': {
    label: 'عميل محتمل جديد',
    description: 'نص زر إضافة عميل محتمل أو جهة جديدة في CRM.',
  },
  'actions.newCampaign': {
    label: 'حملة جديدة',
    description: 'نص زر إنشاء حملة تسويقية جديدة.',
  },
  'actions.newCrmActivity': {
    label: 'نشاط متابعة جديد',
    description: 'نص زر جدولة نشاط أو متابعة عميل جديدة في CRM.',
  },
  'actions.newInstallmentPlan': {
    label: 'خطة تقسيط جديدة',
    description: 'نص زر إنشاء خطة تقسيط جديدة لعميل.',
  },
  'actions.newReceivable': {
    label: 'مستحق جديد',
    description: 'نص زر تسجيل مطالبة أو مستحق جديد على عميل.',
  },
  'actions.newExpense': {
    label: 'مصروف جديد',
    description: 'نص زر تسجيل مصروف تشغيلي جديد.',
  },
  'actions.newJournalEntry': {
    label: 'قيد يومية جديد',
    description: 'نص زر إنشاء قيد محاسبي جديد.',
  },
  'actions.newCheque': {
    label: 'شيك جديد',
    description: 'نص زر تسجيل شيك وارد أو صادر جديد.',
  },
  'actions.newFixedAsset': {
    label: 'أصل ثابت جديد',
    description: 'نص زر إضافة أصل ثابت جديد.',
  },
  'actions.newBankAccount': {
    label: 'حساب بنكي جديد',
    description: 'نص زر إضافة حساب بنكي أو خزينة جديدة.',
  },
  'actions.newPaymentGateway': {
    label: 'بوابة دفع جديدة',
    description: 'نص زر إضافة بوابة أو ماكينة دفع إلكتروني.',
  },
  'actions.newCostCenter': {
    label: 'مركز تكلفة جديد',
    description: 'نص زر إضافة مركز تكلفة جديد.',
  },
  'actions.newBudget': {
    label: 'موازنة تقديرية جديدة',
    description: 'نص زر إنشاء موازنة تقديرية جديدة.',
  },
  'actions.newAccount': {
    label: 'حساب جديد',
    description: 'نص زر إضافة حساب في شجرة الحسابات.',
  },
} as const;

export type BusinessTermKey = keyof typeof BUSINESS_TERMINOLOGY;

export const BUSINESS_TERM_DEFAULTS: Record<BusinessLanguage, Record<BusinessTermKey, string>> = {
  ar: arabicTerms,
};
