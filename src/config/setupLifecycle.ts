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

/**
 * وضع التشغيل المحلي (مؤقت — لا يُحذف أي كود إنتاجي):
 *
 * تعطيل "التهيئة لمرة واحدة" بالكامل، أي:
 * - لا تظهر صفحة «تفعيل سيراميسيس» عند بدء التشغيل.
 * - لا يظهر معالج التهيئة الأولية بعد تسجيل الدخول.
 * - لا يُطلب تغيير كلمة مرور المدير الافتراضية.
 * - لا يتم أي تفاعل مع المنصة المركزية (ترخيص/تكوين/تحديثات).
 *
 * أعِد القيمة إلى false لاستعادة السلوك الإنتاجي الكامل.
 */
export const BYPASS_FIRST_RUN_SETUP = false;

/**
 * فتح كل الصفحات بعد تسجيل الدخول: تجاوز بوابات الوحدات المفعّلة، وإعدادات
 * المظهر، والقوائم/الصفحات المخفية من المنصة المركزية.
 * أعِد القيمة إلى false لاستعادة التقييد الطبيعي.
 */
export const OPEN_ALL_PAGES = false;
