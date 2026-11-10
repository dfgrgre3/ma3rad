export interface FirstRunSetupEvidence {
  completed: boolean;
  hasBusinessData: boolean;
  hasLegacyConfiguration: boolean;
}

export function shouldShowFirstRunSetup(evidence: FirstRunSetupEvidence): boolean {
  return !evidence.completed
    && !evidence.hasBusinessData
    && !evidence.hasLegacyConfiguration;
}

// يُحقن من بنية النكهة المحلية (vite.config: serve → 'local'). تحت node --test
// لا يوجد define، لذا القيمة الافتراضية false (التقييد الطبيعي).
declare const __BYPASS_FIRST_RUN_ACTIVATION__: boolean | undefined;
export const BYPASS_FIRST_RUN_ACTIVATION =
  typeof __BYPASS_FIRST_RUN_ACTIVATION__ === 'boolean' ? __BYPASS_FIRST_RUN_ACTIVATION__ : false;

/**
 * وضع التشغيل المحلي الشامل، عند الحاجة:
 *
 * - لا يظهر معالج التهيئة الأولية بعد تسجيل الدخول.
 * - لا يُطلب تغيير كلمة مرور المدير الافتراضية.
 * - لا يتم أي تفاعل مع المنصة المركزية (ترخيص/تكوين/تحديثات).
 *
 * يُترك معطلًا افتراضيًا.
 */
export const BYPASS_FIRST_RUN_SETUP = false;

/**
 * فتح كل الصفحات بعد تسجيل الدخول: تجاوز بوابات الوحدات المفعّلة، وإعدادات
 * المظهر، والقوائم/الصفحات المخفية من المنصة المركزية.
 * أعِد القيمة إلى false لاستعادة التقييد الطبيعي.
 */
export const OPEN_ALL_PAGES = false;
