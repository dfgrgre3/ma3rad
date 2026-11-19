import type { OrderStatus } from '../services/domains/sales/OrderService/types';

/**
 * Sector-specific display labels for the order lifecycle
 * (PENDING → CONFIRMED → PROCESSING → PARTIAL/READY → COMPLETED / CANCELLED,
 * with ON_HOLD as a shared pause state).
 * The underlying state machine is shared; only the wording adapts to the
 * activity — e.g. PROCESSING reads "في المطبخ" for restaurants and
 * "قيد الإنتاج" for manufacturers.
 */
export const ACTIVITY_ORDER_STATUS_LABELS: Record<
  string,
  Partial<Record<OrderStatus, string>>
> = {
  restaurant: {
    PENDING: 'طلب جديد',
    CONFIRMED: 'مؤكد',
    PROCESSING: 'في المطبخ',
    PARTIAL: 'يُقدم جزئيًا',
    READY: 'جاهز للتقديم',
    ON_HOLD: 'معلّق',
    COMPLETED: 'مغلق / مفوتر',
  },
  hospitality: {
    PENDING: 'حجز وارد',
    CONFIRMED: 'حجز مؤكد',
    PROCESSING: 'تجهيز الإقامة',
    PARTIAL: 'تسليم جزئي',
    READY: 'جاهز لإتمام الإقامة',
    ON_HOLD: 'حجز معلّق',
    COMPLETED: 'تمت الإقامة / مفوتر',
  },
  logistics: {
    PENDING: 'طلب شحنة',
    CONFIRMED: 'شحنة مؤكدة',
    PROCESSING: 'قيد الشحن',
    PARTIAL: 'تسليم جزئي',
    READY: 'جاهز للشحن',
    ON_HOLD: 'شحنة معلّقة',
    COMPLETED: 'تم التسليم',
  },
  ecommerce: {
    PENDING: 'طلب جديد',
    CONFIRMED: 'مؤكد',
    PROCESSING: 'قيد التجهيز للشحن',
    PARTIAL: 'شحن جزئي',
    READY: 'جاهز للشحن',
    ON_HOLD: 'طلب معلّق',
    COMPLETED: 'تم التسليم',
  },
  construction: {
    PENDING: 'أمر عمل',
    CONFIRMED: 'أمر مؤكد',
    PROCESSING: 'قيد التنفيذ',
    PARTIAL: 'تسليم دفعات',
    READY: 'جاهز للتسليم',
    ON_HOLD: 'أمر عمل معلّق',
    COMPLETED: 'تم التسليم / مستخلص',
  },
  manufacturing: {
    PENDING: 'أمر إنتاج',
    CONFIRMED: 'مؤكد للإنتاج',
    PROCESSING: 'قيد الإنتاج',
    PARTIAL: 'إنتاج جزئي',
    READY: 'جاهز للتسليم',
    ON_HOLD: 'أمر إنتاج معلّق',
    COMPLETED: 'تم التسليم',
  },
  workshop: {
    PENDING: 'سيارة واردة',
    CONFIRMED: 'موعد مؤكد',
    PROCESSING: 'قيد التنفيذ بالفنيين',
    PARTIAL: 'تسليم جزئي',
    READY: 'جاهز للتسليم',
    ON_HOLD: 'سيارة معلّقة',
    COMPLETED: 'تم التسليم',
  },
  services: {
    PENDING: 'طلب خدمة',
    CONFIRMED: 'موعد مؤكد',
    PROCESSING: 'قيد التنفيذ',
    PARTIAL: 'تسليم جزئي',
    READY: 'جاهز للتسليم',
    ON_HOLD: 'خدمة معلّقة',
    COMPLETED: 'تم الإغلاق',
  },
  professional_services: {
    PENDING: 'ملف عمل',
    CONFIRMED: 'مؤكد',
    PROCESSING: 'قيد التنفيذ',
    PARTIAL: 'تسليم جزئي',
    READY: 'جاهز للتسليم',
    ON_HOLD: 'ملف معلّق',
    COMPLETED: 'تم التسليم',
  },
  healthcare_admin: {
    PENDING: 'طلب كشف',
    CONFIRMED: 'موعد مؤكد',
    PROCESSING: 'قيد الكشف',
    PARTIAL: 'تسليم جزئي',
    READY: 'جاهز للكشف',
    ON_HOLD: 'موعد معلّق',
    COMPLETED: 'تم الإغلاق',
  },
  education: {
    PENDING: 'طلب التحاق',
    CONFIRMED: 'مؤكد',
    PROCESSING: 'قيد التجهيز',
    PARTIAL: 'تسليم جزئي',
    READY: 'جاهز للتسليم',
    ON_HOLD: 'طلب معلّق',
    COMPLETED: 'مكتمل',
  },
  automotive: {
    PENDING: 'طلب قطع',
    CONFIRMED: 'مؤكد',
    PROCESSING: 'قيد التجهيز',
    PARTIAL: 'تسليم جزئي',
    READY: 'جاهز للتسليم',
    ON_HOLD: 'طلب معلّق',
    COMPLETED: 'تم التسليم',
  },
  food: {
    PENDING: 'طلب جديد',
    CONFIRMED: 'مؤكد',
    PROCESSING: 'قيد التجهيز',
    PARTIAL: 'تسليم جزئي',
    READY: 'جاهز للتسليم',
    ON_HOLD: 'طلب معلّق',
    COMPLETED: 'تم التسليم',
  },
};

/** Sector wording for the primary order actions (confirm / start work). */
export const ACTIVITY_ORDER_ACTION_LABELS: Record<
  string,
  { confirm?: string; start?: string }
> = {
  restaurant: { confirm: 'تأكيد الطلب', start: 'إرسال للمطبخ' },
  hospitality: { confirm: 'تأكيد الحجز', start: 'تجهيز الإقامة' },
  logistics: { confirm: 'تأكيد الشحنة', start: 'بدء الشحن' },
  ecommerce: { confirm: 'تأكيد الطلب', start: 'بدء التجهيز' },
  construction: { confirm: 'اعتماد أمر العمل', start: 'بدء التنفيذ' },
  manufacturing: { confirm: 'اعتماد أمر الإنتاج', start: 'بدء الإنتاج' },
  workshop: { confirm: 'تأكيد الموعد', start: 'بدء التنفيذ' },
  services: { confirm: 'تأكيد الموعد', start: 'بدء التنفيذ' },
  professional_services: { confirm: 'اعتماد الملف', start: 'بدء التنفيذ' },
  healthcare_admin: { confirm: 'تأكيد الموعد', start: 'بدء الكشف' },
  education: { confirm: 'تأكيد الالتحاق', start: 'بدء التجهيز' },
  automotive: { confirm: 'تأكيد الطلب', start: 'بدء التجهيز' },
  food: { confirm: 'تأكيد الطلب', start: 'بدء التجهيز' },
};
