/**
 * Point-of-sale copy that adapts to the selected business activity.
 *
 * Mirrors the activity page/path copy layers: each selectable activity (and
 * each family as a fallback) can override the wording the cashier sees —
 * invoice vs order, delivery vs shipping, service fee vs extra charges.
 * Anything not overridden falls back to POS_DEFAULT_COPY.
 */

export interface PosActivityCopy {
  /** اسم المستند الرئيسي: فاتورة / طلب */
  invoiceLabel: string;
  /** عنوان قسم تعديلات الفاتورة */
  adjustmentsTitle: string;
  /** عنوان حقل خصم الفاتورة */
  invoiceDiscountLabel: string;
  /** عنوان حقل النقل/الشحن */
  shippingLabel: string;
  /** سطر النقل داخل ملخص الإجماليات */
  shippingTotalLabel: string;
  /** عنوان حقل المصاريف الإضافية */
  extraFeesLabel: string;
  /** عنوان قسم طريقة السداد */
  paymentTitle: string;
  /** عنوان وبديل حقل الملاحظات */
  notesAriaLabel: string;
  notesPlaceholder: string;
  /** زر الاعتماد */
  checkoutLabel: string;
  checkoutBusyLabel: string;
  /** زر الحاسبة / المقايسة */
  calculatorLabel: string;
  /** عنوان سلة البيع */
  cartTitle: string;
  /** زر/عنوان الطلبات المعلقة */
  heldLabel: string;
  holdLabel: string;
  /** عميل نقدي / زبون نقدي */
  walkInLabel: string;
  /** شارة البيع المباشر بدون عميل */
  directSaleBadge: string;
  /** عنوان مودال نجاح الإصدار */
  successTitle: string;
  /** سطر رقم المستند في مودال النجاح */
  invoiceNumberLabel: string;
  /** زر إلغاء المستند في مودال النجاح */
  voidInvoiceLabel: string;
  /** عنوان نافذة شاشة عرض العميل */
  displayTitle: string;
  /** رسالة الانتظار قبل إضافة أصناف */
  displayWaiting: string;
  /** سطر المجموع الفرعي في شاشة العرض */
  displaySubtotal: string;
  /** سطر الخصم */
  displayDiscount: string;
  /** سطر الضريبة */
  displayTax: string;
  /** سطر الإجمالي */
  displayTotal: string;
  /** سطر المدفوع */
  displayPaid: string;
  /** سطر الباقي للعميل */
  displayChange: string;
}

export const POS_DEFAULT_COPY: PosActivityCopy = {
  invoiceLabel: 'الفاتورة',
  adjustmentsTitle: 'تعديلات الفاتورة',
  invoiceDiscountLabel: 'خصم الفاتورة',
  shippingLabel: 'نقل / شحن',
  shippingTotalLabel: 'النقل والشحن',
  extraFeesLabel: 'مصاريف إضافية',
  paymentTitle: 'طريقة السداد',
  notesAriaLabel: 'ملاحظات الفاتورة',
  notesPlaceholder: 'ملاحظات على الفاتورة (اختياري)...',
  checkoutLabel: 'اعتماد وحفظ الفاتورة (F9)',
  checkoutBusyLabel: 'جاري الحفظ والخصم من المخزن...',
  calculatorLabel: 'مقايسة',
  cartTitle: 'سلة البيع',
  heldLabel: 'المعلّقة',
  holdLabel: 'تعليق',
  walkInLabel: 'عميل نقدي',
  directSaleBadge: 'بيع نقدي مباشر',
  successTitle: 'تم إصدار الفاتورة بنجاح',
  invoiceNumberLabel: 'رقم الفاتورة',
  voidInvoiceLabel: 'إلغاء هذه الفاتورة',
  displayTitle: 'عرض العميل',
  displayWaiting: 'في انتظار عناصر...',
  displaySubtotal: 'المجموع الفرعي',
  displayDiscount: 'خصم',
  displayTax: 'ضريبة',
  displayTotal: 'الإجمالي',
  displayPaid: 'المدفوع',
  displayChange: 'الباقي',
};

/** Fallback wording per activity family. */
export const POS_FAMILY_COPY: Record<string, Partial<PosActivityCopy>> = {
  retail: {
    shippingLabel: 'توصيل',
    shippingTotalLabel: 'التوصيل',
  },
  distribution: {
    shippingLabel: 'شحن',
    shippingTotalLabel: 'الشحن',
    extraFeesLabel: 'مصاريف شحن',
  },
  hospitality: {
    shippingLabel: 'توصيل',
    shippingTotalLabel: 'التوصيل',
    extraFeesLabel: 'رسوم خدمة',
    paymentTitle: 'طريقة الدفع',
    displayTitle: 'عرض الضيف',
    displayWaiting: 'في انتظار طلبك...',
    displayChange: 'الباقي للعميل',
  },
};

/** Per-activity overrides on top of the family wording. */
export const POS_ACTIVITY_COPY: Record<string, Partial<PosActivityCopy>> = {
  ceramics: {
    shippingLabel: 'توصيل / تركيب',
    shippingTotalLabel: 'تركيب وتوصيل',
    extraFeesLabel: 'رسوم خدمة',
  },
  sanitary: {
    shippingLabel: 'توصيل',
    extraFeesLabel: 'رسوم تركيب',
  },
  furniture: {
    shippingLabel: 'توصيل / تركيب',
    shippingTotalLabel: 'تركيب وتوصيل',
    extraFeesLabel: 'رسوم تركيب',
  },
  home_appliances: {
    shippingLabel: 'توصيل',
    extraFeesLabel: 'رسوم تركيب',
  },
  automotive: {
    extraFeesLabel: 'رسوم خدمة',
  },
  building_materials: {
    shippingLabel: 'توصيل',
    extraFeesLabel: 'نقل / تركيب',
  },
  ecommerce: {
    shippingLabel: 'شحن',
    shippingTotalLabel: 'الشحن',
    extraFeesLabel: 'رسوم معالجة',
  },
  food: {
    extraFeesLabel: 'أكياس ورسوم',
  },
  restaurant: {
    invoiceLabel: 'الطلب',
    adjustmentsTitle: 'تعديلات الطلب',
    invoiceDiscountLabel: 'خصم الطلب',
    shippingLabel: 'توصيل',
    shippingTotalLabel: 'رسوم التوصيل',
    extraFeesLabel: 'رسوم خدمة',
    paymentTitle: 'طريقة الدفع',
    notesAriaLabel: 'ملاحظات الطلب',
    notesPlaceholder: 'ملاحظات على الطلب (مثال: بدون بصل)...',
    checkoutLabel: 'اعتماد الطلب (F9)',
    checkoutBusyLabel: 'جاري إرسال الطلب...',
    cartTitle: 'سلة الطلب',
    heldLabel: 'طلبات معلقة',
    holdLabel: 'تعليق',
    walkInLabel: 'زبون نقدي',
    directSaleBadge: 'طلب مباشر',
    successTitle: 'تم إصدار الطلب بنجاح',
    invoiceNumberLabel: 'رقم الطلب',
    voidInvoiceLabel: 'إلغاء هذا الطلب',
    displayTitle: 'عرض الطلب',
    displayWaiting: 'في انتظار طلبك...',
    displaySubtotal: 'مجموع الأصناف',
    displayTotal: 'الإجمالي',
    displayPaid: 'المدفوع',
    displayChange: 'الباقي للعميل',
  },
};
