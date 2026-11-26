import {
  Briefcase, Clock, Factory, FileText, GraduationCap,
  HardHat, Hotel, LayoutGrid, Package, ShoppingBag, ShoppingCart, Truck, Users,
  Wallet, Wrench,
} from 'lucide-react';
import type { SectionId, QuickActionItem } from '../types/dashboard/components';
import { getActivityDashboardKind, type ActivityDashboardKind } from './activityDashboard';
import { getProfileDashboard } from './businessProfiles';
import { getEffectiveBusinessType } from '../services/domains/config/BusinessTypeService';

/**
 * Activity-driven dashboard layout.
 *
 * Every dashboard kind resolves to a layout that decides:
 *  - which section tabs exist and in which order (`sectionOrder`),
 *  - which sections are hidden entirely (`hiddenSections`),
 *  - which tab opens by default (`defaultSection`),
 *  - which generic "pulse" widgets render (`pulseWidgets`),
 *  - which quick actions are offered (`quickActions`).
 *
 * Resolution is by dashboard kind (activity → family → generic), so all
 * activities inside a family share the same layout unless the kind differs.
 */

export type PulseWidgetId =
  | 'attention'
  | 'quickActions'
  | 'profileKpis'
  | 'kpiGrid'
  | 'purchases'
  | 'salesTrend'
  | 'topProducts'
  | 'categoryDist'
  | 'paymentMix'
  | 'topCustomers'
  | 'recentFeed';

export interface ActivityDashboardLayout {
  /** Tab shown when /dashboard opens without an explicit ?sec= param. */
  defaultSection: SectionId;
  /** Tab bar order; ids not listed are appended in SECTIONS_CONFIG order. */
  sectionOrder: SectionId[];
  /** Sections hidden for this kind even when permission/module checks pass. */
  hiddenSections: SectionId[];
  /** Generic overview widgets rendered inside the "pulse" section. */
  pulseWidgets: PulseWidgetId[];
  /** Quick action shortcuts rendered inside the "pulse" section. */
  quickActions: QuickActionItem[];
}

/** Per-user dashboard preferences (persisted by DashboardPreferencesService). */
export interface DashboardPrefsLike {
  /** Sections the user hid on top of the activity layout. */
  hiddenSections?: SectionId[];
  /** User-arranged order for the visible sections. */
  sectionOrder?: SectionId[];
  /** Enabled pulse widgets (order is fixed by the overview layout). */
  pulseWidgets?: PulseWidgetId[];
  /** Selected KPI ids, in display order. */
  kpis?: string[];
  /** Selected quick-action paths (`to`), in display order. */
  quickActions?: string[];
}

/** Arabic labels for the customizable pulse widgets (customize dialog). */
export const PULSE_WIDGETS_META: Array<{ id: PulseWidgetId; label: string }> = [
  { id: 'attention', label: 'التنبيهات وما يحتاج انتباهك' },
  { id: 'quickActions', label: 'الإجراءات السريعة' },
  { id: 'profileKpis', label: 'مؤشرات النشاط' },
  { id: 'kpiGrid', label: 'البطاقات المالية الرئيسية' },
  { id: 'purchases', label: 'مشتريات اليوم' },
  { id: 'salesTrend', label: 'رسم اتجاه المبيعات' },
  { id: 'topProducts', label: 'الأصناف الأكثر مبيعًا' },
  { id: 'categoryDist', label: 'توزيع المبيعات حسب التصنيف' },
  { id: 'paymentMix', label: 'وسائل الدفع' },
  { id: 'topCustomers', label: 'أكثر العملاء' },
  { id: 'recentFeed', label: 'آخر النشاطات' },
];

const PULSE_WIDGET_IDS = new Set<PulseWidgetId>(PULSE_WIDGETS_META.map((w) => w.id));

const ALL_PULSE_WIDGETS: PulseWidgetId[] = [
  'attention', 'quickActions', 'profileKpis', 'kpiGrid', 'purchases',
  'salesTrend', 'topProducts', 'categoryDist', 'paymentMix', 'topCustomers', 'recentFeed',
];

/** Product businesses keep every generic widget. */
const PRODUCT_PULSE = ALL_PULSE_WIDGETS;

/**
 * Manufacturing businesses: show production-relevant widgets.
 * - Hides: topProducts (irrelevant — they track orders not POS items),
 *   categoryDist (retail metric), topCustomers (B2B not volume-driven).
 * - Keeps: attention, quickActions, profileKpis, kpiGrid, purchases (raw materials),
 *   salesTrend (output volume), paymentMix (B2B payments), recentFeed.
 */
const MANUFACTURING_PULSE: PulseWidgetId[] = [
  'attention', 'quickActions', 'profileKpis', 'kpiGrid', 'purchases',
  'salesTrend', 'paymentMix', 'recentFeed',
];

/** Service/ops businesses: no product-mix or purchase-invoice widgets. */
const OPS_PULSE: PulseWidgetId[] = [
  'attention', 'quickActions', 'profileKpis', 'kpiGrid',
  'salesTrend', 'paymentMix', 'recentFeed',
];

/** Project/service businesses: keep customers & trend, drop product widgets. */
const PROJECT_PULSE: PulseWidgetId[] = [
  'attention', 'quickActions', 'profileKpis', 'kpiGrid', 'purchases',
  'salesTrend', 'paymentMix', 'topCustomers', 'recentFeed',
];

const action = (
  to: string,
  label: string,
  detail: string,
  icon: QuickActionItem['icon'],
): QuickActionItem => ({ to, label, detail, icon, tone: '' });

const QUICK_ACTIONS: Record<ActivityDashboardKind, QuickActionItem[]> = {
  ceramics: [
    action('/pos', 'فاتورة بيع جديدة', 'بيع مباشر من الصالة', ShoppingCart),
    action('/ceramics', 'صالة السيراميك', 'التصاميم والمقاسات', LayoutGrid),
    action('/quotations', 'عرض سعر', 'مساحة أو مشروع', FileText),
    action('/finance/receivables', 'الذمم والتحصيل', 'مستحقات العملاء', Wallet),
  ],
  hospitality: [
    action('/hospitality', 'لوحة الفندق', 'الغرف والإشغال', Hotel),
    action('/customers', 'النزلاء', 'ملفات العملاء', Users),
    action('/finance/receivables', 'الفوليو والأرصدة', 'مستحقات النزلاء', Wallet),
    action('/employees/attendance', 'الحضور', 'فريق العمل', Clock),
  ],
  education: [
    action('/education', 'المدرسة', 'فصول وحضور وأقساط', GraduationCap),
    action('/employees/attendance', 'الحضور', 'تسجيل اليوم', Clock),
    action('/finance/receivables', 'أقساط الرسوم', 'مستحقات أولياء الأمور', Wallet),
    action('/customers', 'أولياء الأمور', 'ملفات العائلات', Users),
  ],
  workshop: [
    action('/workshop', 'الورشة', 'أوامر العمل', Wrench),
    action('/pos', 'فاتورة بيع', 'خدمات وقطع غيار', ShoppingCart),
    action('/customers', 'العملاء', 'ملفات العملاء', Users),
    action('/finance/receivables', 'الذمم', 'مستحقات العملاء', Wallet),
  ],
  manufacturing: [
    action('/manufacturing', 'الإنتاج', 'أوامر التصنيع', Factory),
    action('/inventory', 'المخزون', 'خامات وأصناف', Package),
    action('/purchases', 'المشتريات', 'توريد الخامات', ShoppingBag),
    action('/finance/receivables', 'الذمم', 'مستحقات العملاء', Wallet),
  ],
  construction: [
    action('/projects', 'المشاريع', 'العقود والمستخلصات', HardHat),
    action('/projects/execution', 'تنفيذ المشاريع', 'متابعة المواقع', Truck),
    action('/pos', 'فاتورة', 'مستخلص أو بيع', FileText),
    action('/finance/receivables', 'التحصيل', 'فجوة التحصيل', Wallet),
  ],
  professional: [
    action('/time-billing', 'الفوترة الزمنية', 'ساعات العملاء', Clock),
    action('/customers', 'العملاء', 'ملفات العملاء', Users),
    action('/finance/receivables', 'الفواتير', 'مستحقات العملاء', Wallet),
    action('/employees', 'الفريق', 'الموظفون', Briefcase),
  ],
  retail: [
    action('/pos', 'فاتورة بيع', 'بيع مباشر', ShoppingCart),
    action('/retail', 'مساحة العمل', 'طلبات وعروض أسعار', LayoutGrid),
    action('/products', 'المنتجات', 'الأصناف والأسعار', Package),
    action('/finance/receivables', 'الذمم', 'تحصيل العملاء', Wallet),
  ],
  distribution: [
    action('/sales', 'المبيعات', 'فواتير العملاء', ShoppingCart),
    action('/purchases', 'المشتريات', 'فواتير الموردين', ShoppingBag),
    action('/inventory', 'المخزون', 'أرصدة المستودع', Package),
    action('/finance/receivables', 'الذمم', 'تحصيل الموردين والعملاء', Wallet),
  ],
  import_export: [
    action('/purchases', 'مستندات الشراء والاستيراد', 'فواتير الموردين الأجانب', ShoppingBag),
    action('/deliveries', 'شحنات التصدير', 'أوامر الشحن والتوصيل', Truck),
    action('/inventory', 'المخزون', 'أرصدة المستودع', Package),
    action('/finance/receivables', 'الذمم', 'مستحقات العملاء والموردين', Wallet),
  ],
  logistics: [
    action('/deliveries', 'أوامر التوصيل', 'متابعة الشحنات', Truck),
    action('/fleet/dashboard', 'لوحة الأسطول', 'المركبات والسائقون', Truck),
    action('/purchases', 'المشتريات', 'مستلزمات التشغيل', ShoppingBag),
    action('/finance/receivables', 'الذمم', 'مستحقات العملاء', Wallet),
  ],
  generic: [
    action('/pos', 'فاتورة بيع جديدة', 'ابدأ عملية بيع', ShoppingCart),
    action('/products', 'المنتجات', 'الأصناف والأسعار', Package),
    action('/purchases', 'المشتريات', 'فواتير الموردين', ShoppingBag),
    action('/finance/receivables', 'الذمم المدينة', 'متابعة التحصيل', Wallet),
  ],
};

const DEDICATED_ORDER: SectionId[] = [
  'activity', 'pulse', 'executive', 'sales', 'purchases', 'debts', 'crm', 'fleet', 'hr', 'all',
];

const KIND_LAYOUT: Record<ActivityDashboardKind, ActivityDashboardLayout> = {
  // Showroom: full product dashboard, activity panel first.
  ceramics: {
    defaultSection: 'activity',
    sectionOrder: DEDICATED_ORDER,
    hiddenSections: ['fleet'],
    pulseWidgets: PRODUCT_PULSE,
    quickActions: QUICK_ACTIONS.ceramics,
  },
  hospitality: {
    defaultSection: 'activity',
    sectionOrder: ['activity', 'pulse', 'executive', 'purchases', 'debts', 'hr', 'all'],
    hiddenSections: ['sales', 'crm', 'fleet'],
    pulseWidgets: PROJECT_PULSE,
    quickActions: QUICK_ACTIONS.hospitality,
  },
  education: {
    defaultSection: 'activity',
    sectionOrder: ['activity', 'pulse', 'executive', 'purchases', 'debts', 'hr', 'all'],
    hiddenSections: ['sales', 'crm', 'fleet'],
    pulseWidgets: OPS_PULSE,
    quickActions: QUICK_ACTIONS.education,
  },
  workshop: {
    defaultSection: 'activity',
    sectionOrder: DEDICATED_ORDER,
    hiddenSections: ['fleet'],
    pulseWidgets: PRODUCT_PULSE,
    quickActions: QUICK_ACTIONS.workshop,
  },
  manufacturing: {
    defaultSection: 'activity',
    sectionOrder: DEDICATED_ORDER,
    hiddenSections: ['fleet'],
    pulseWidgets: MANUFACTURING_PULSE,
    quickActions: QUICK_ACTIONS.manufacturing,
  },
  construction: {
    defaultSection: 'activity',
    sectionOrder: DEDICATED_ORDER,
    hiddenSections: ['fleet'],
    pulseWidgets: PROJECT_PULSE,
    quickActions: QUICK_ACTIONS.construction,
  },
  professional: {
    defaultSection: 'activity',
    sectionOrder: ['activity', 'pulse', 'executive', 'sales', 'debts', 'hr', 'all'],
    hiddenSections: ['purchases', 'crm', 'fleet'],
    pulseWidgets: OPS_PULSE,
    quickActions: QUICK_ACTIONS.professional,
  },
  retail: {
    defaultSection: 'activity',
    sectionOrder: ['pulse', 'activity', 'executive', 'sales', 'purchases', 'debts', 'crm', 'hr', 'all'],
    hiddenSections: ['fleet'],
    pulseWidgets: PRODUCT_PULSE,
    quickActions: QUICK_ACTIONS.retail,
  },
  distribution: {
    defaultSection: 'pulse',
    // Logistics companies run their own fleet — keep the fleet section.
    sectionOrder: ['pulse', 'activity', 'executive', 'sales', 'purchases', 'debts', 'crm', 'fleet', 'hr', 'all'],
    hiddenSections: [],
    pulseWidgets: PRODUCT_PULSE,
    quickActions: QUICK_ACTIONS.distribution,
  },
  // Import/export and logistics share the distribution family layout —
  // they ship goods and run fleets, so no sections are hidden.
  import_export: {
    defaultSection: 'pulse',
    sectionOrder: ['pulse', 'activity', 'executive', 'sales', 'purchases', 'debts', 'crm', 'fleet', 'hr', 'all'],
    hiddenSections: [],
    pulseWidgets: PRODUCT_PULSE,
    quickActions: QUICK_ACTIONS.import_export,
  },
  logistics: {
    defaultSection: 'pulse',
    sectionOrder: ['pulse', 'activity', 'executive', 'sales', 'purchases', 'debts', 'crm', 'fleet', 'hr', 'all'],
    hiddenSections: [],
    pulseWidgets: PRODUCT_PULSE,
    quickActions: QUICK_ACTIONS.logistics,
  },
  generic: {
    defaultSection: 'executive',
    sectionOrder: ['all', 'pulse', 'activity', 'executive', 'sales', 'purchases', 'debts', 'crm', 'fleet', 'hr'],
    hiddenSections: [],
    pulseWidgets: PRODUCT_PULSE,
    quickActions: QUICK_ACTIONS.generic,
  },
};

/** Resolves the dashboard layout for the effective (or given) business type. */
export function getActivityDashboardLayout(
  businessType?: string,
): ActivityDashboardLayout {
  return KIND_LAYOUT[getActivityDashboardKind(businessType)];
}

export function getActivityDashboardQuickActions(
  businessType?: string,
): QuickActionItem[] {
  return getActivityDashboardLayout(businessType).quickActions;
}

export function getActivityPulseWidgets(
  businessType?: string,
): PulseWidgetId[] {
  return getActivityDashboardLayout(businessType).pulseWidgets;
}

/** Every quick action offered by any activity kind, deduped by target path. */
export function getQuickActionCatalog(): QuickActionItem[] {
  const seen = new Map<string, QuickActionItem>();
  for (const kind of Object.keys(QUICK_ACTIONS) as ActivityDashboardKind[]) {
    for (const item of QUICK_ACTIONS[kind]) {
      if (!seen.has(item.to)) seen.set(item.to, item);
    }
  }
  return [...seen.values()];
}

const SECTION_IDS = new Set<SectionId>([
  'all', 'pulse', 'activity', 'executive', 'sales', 'purchases', 'debts', 'crm', 'fleet', 'hr',
]);

/**
 * Merges the per-activity layout with the current user's saved preferences.
 * User choices only ever narrow/reorder what the activity allows — activity
 * `hiddenSections` and permission checks still apply on top.
 */
export function resolveDashboardLayout(
  businessType: string | undefined,
  prefs?: DashboardPrefsLike | null,
): ActivityDashboardLayout {
  const base = getActivityDashboardLayout(businessType);
  // Default widgets only: when the profile declares no custom dashboard KPIs,
  // ProfileKpiPanel falls back to DEFAULT_PROFILE_KPIS which repeats the same
  // numbers kpiGrid already shows — drop it to avoid duplicated values. An
  // explicit user pick in prefs.pulseWidgets is always respected.
  const profileHasOwnKpis = (getProfileDashboard(businessType ?? getEffectiveBusinessType())?.kpis?.length ?? 0) > 0;
  const defaultPulseWidgets = () =>
    base.pulseWidgets.filter((id) => id !== 'profileKpis' || profileHasOwnKpis);
  if (!prefs) return { ...base, pulseWidgets: defaultPulseWidgets() };

  const hiddenSections = [...new Set([...base.hiddenSections, ...(prefs.hiddenSections ?? [])])];

  let sectionOrder = base.sectionOrder;
  if (prefs.sectionOrder?.length) {
    const userOrder = prefs.sectionOrder.filter((id) => SECTION_IDS.has(id));
    const rest = base.sectionOrder.filter((id) => !userOrder.includes(id));
    sectionOrder = [...userOrder, ...rest];
  }

  const pulseWidgets = prefs.pulseWidgets !== undefined
    ? prefs.pulseWidgets.filter((id) => PULSE_WIDGET_IDS.has(id))
    : defaultPulseWidgets();

  let quickActions = base.quickActions;
  if (prefs.quickActions !== undefined) {
    // Restrict saved picks to this activity's own actions — links belonging
    // to other activities are dropped instead of leaking into the dashboard.
    const catalog = new Map(base.quickActions.map((item) => [item.to, item]));
    quickActions = prefs.quickActions
      .map((to) => catalog.get(to))
      .filter((item): item is QuickActionItem => Boolean(item));
  }

  return { ...base, sectionOrder, hiddenSections, pulseWidgets, quickActions };
}

export default getActivityDashboardLayout;
